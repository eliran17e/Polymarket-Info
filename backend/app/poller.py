"""The poller: fetch tracked events on a schedule and persist them.

Per tick:
  1. read tracked.yaml (slugs + tag_ids)
  2. fetch each event from Gamma
  3. UPSERT events + markets (mutable metadata)
  4. APPEND one snapshot row per market that has a real price

Markets are upserted so metadata stays current; snapshots are append-only so we
keep history. We snapshot any market with a non-null yes_price (including newly
resolved ones at 0/1) but skip placeholder markets that have no price at all.
"""
from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from . import polymarket as pm
from . import watchlist
from .config import POLL_INTERVAL_SECONDS
from .db import get_session
from .models import Event, Market, Snapshot

log = logging.getLogger("poller")


def _upsert_event(session, e: pm.ParsedEvent) -> None:
    row = session.get(Event, e.id)
    if row is None:
        row = Event(id=e.id)
        session.add(row)
    row.slug = e.slug
    row.title = e.title
    row.image = e.image
    row.description = e.description
    row.neg_risk = e.neg_risk
    row.end_date = e.end_date
    row.active = e.active
    row.closed = e.closed


def _upsert_market(session, event_id: str, m: pm.ParsedMarket) -> None:
    row = session.get(Market, m.id)
    if row is None:
        row = Market(id=m.id)
        session.add(row)
    row.event_id = event_id
    row.condition_id = m.condition_id
    row.question = m.question
    row.candidate_name = m.candidate_name
    row.description = m.description
    row.outcomes = m.outcomes
    row.clob_token_ids = m.clob_token_ids
    row.end_date = m.end_date
    row.active = m.active
    row.closed = m.closed


def _append_snapshot(session, m: pm.ParsedMarket) -> bool:
    """Append a snapshot if the market has a usable price. Returns True if added."""
    if m.yes_price is None:
        return False  # placeholder/non-tradeable market — nothing to record
    session.add(
        Snapshot(
            market_id=m.id,
            yes_price=m.yes_price,
            best_bid=m.best_bid,
            best_ask=m.best_ask,
            spread=m.spread,
            volume_24h=m.volume_24h,
            one_day_price_change=m.one_day_price_change,
        )
    )
    return True


def _collect_events(slugs: list[str]) -> list[pm.ParsedEvent]:
    """Fetch + de-duplicate events for the given slugs."""
    by_id: dict[str, pm.ParsedEvent] = {}
    for slug in slugs:
        try:
            for e in pm.fetch_events_by_slug(slug):
                by_id[e.id] = e
        except Exception as exc:  # one bad slug shouldn't kill the whole tick
            log.warning("fetch slug %s failed: %s", slug, exc)
    return list(by_id.values())


def _persist(session, events: list[pm.ParsedEvent]) -> dict:
    n_markets = n_snapshots = 0
    for e in events:
        _upsert_event(session, e)
        session.flush()  # ensure event row exists before markets FK it
        for m in e.markets:
            _upsert_market(session, e.id, m)
            n_markets += 1
        session.flush()  # markets exist before snapshots FK them
        for m in e.markets:
            if _append_snapshot(session, m):
                n_snapshots += 1
    return {"events": len(events), "markets": n_markets, "snapshots": n_snapshots}


def poll_slugs(slugs: list[str]) -> dict:
    """Fetch + persist a specific set of event slugs (used on follow, and per tick)."""
    if not slugs:
        return {"events": 0, "markets": 0, "snapshots": 0}
    events = _collect_events(slugs)
    with get_session() as session:
        summary = _persist(session, events)
    log.info("polled %d slug(s): %s", len(slugs), summary)
    return summary


def poll_once() -> dict:
    """Poll everything currently on the watchlist."""
    with get_session() as session:
        slugs = watchlist.list_slugs(session)
    return poll_slugs(slugs)


def start_scheduler() -> BackgroundScheduler:
    """Run poll_once now, then every POLL_INTERVAL_SECONDS."""
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        poll_once,
        "interval",
        seconds=POLL_INTERVAL_SECONDS,
        id="poll",
        max_instances=1,       # never overlap ticks
        coalesce=True,         # if we fall behind, run once not N times
        next_run_time=None,    # we trigger the first run manually below
    )
    scheduler.start()
    # Kick off an immediate first poll so there's data right away.
    try:
        poll_once()
    except Exception as exc:
        log.warning("initial poll failed: %s", exc)
    return scheduler
