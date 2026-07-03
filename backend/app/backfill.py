"""Price-history backfill from the CLOB.

The poller only accumulates snapshots from the moment you follow, so sparklines and
charts would start out flat. On follow (and once at startup for the whole watchlist)
we pull each open market's hourly price history from CLOB /prices-history and insert
it as historical snapshots — instantly giving boards real trend data.

Runs in a background thread: a 60-market event would otherwise block the follow
request for many seconds. Backfilled rows carry only ts + yes_price (no volume);
they're always older than the poll snapshot taken on follow, so "latest snapshot"
logic is unaffected.
"""
from __future__ import annotations

import logging
import threading

from sqlalchemy import func, select

from . import polymarket as pm
from .db import get_session
from .models import Event, Market, Snapshot

log = logging.getLogger("backfill")

# If a market already has this many snapshots, assume it's been tracked (or
# backfilled) already and skip — avoids duplicating history on re-follow.
SKIP_IF_SNAPSHOTS_OVER = 50


def _backfill_market(market_id: str, token_id: str) -> int:
    with get_session() as session:
        existing = session.scalar(
            select(func.count()).select_from(Snapshot).where(Snapshot.market_id == market_id)
        )
        if existing and existing > SKIP_IF_SNAPSHOTS_OVER:
            return 0
    try:
        history = pm.fetch_price_history(token_id)
    except Exception as exc:
        log.warning("history fetch failed for market %s: %s", market_id, exc)
        return 0
    if not history:
        return 0
    with get_session() as session:
        for ts, price in history:
            session.add(Snapshot(market_id=market_id, ts=ts, yes_price=price))
    return len(history)


def backfill_slugs(slugs: list[str]) -> None:
    """Backfill history for every open market of the given (already-polled) events."""
    with get_session() as session:
        rows = session.execute(
            select(Market.id, Market.clob_token_ids)
            .join(Event, Market.event_id == Event.id)
            .where(Event.slug.in_(slugs), Market.closed.is_(False))
        ).all()
    total = 0
    for market_id, token_ids in rows:
        if not token_ids:
            continue
        total += _backfill_market(market_id, str(token_ids[0]))  # [0] = Yes token
    log.info("backfilled %d history points across %d markets (%s)", total, len(rows), slugs)


def backfill_async(slugs: list[str]) -> None:
    """Fire-and-forget backfill so follow requests return immediately."""
    threading.Thread(target=backfill_slugs, args=(slugs,), daemon=True).start()
