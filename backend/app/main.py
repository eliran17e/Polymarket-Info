"""FastAPI app: read endpoints the frontend will consume, plus the poller lifecycle.

The poller runs in-process via APScheduler, started on app startup and stopped on
shutdown. Endpoints only READ from Postgres — they never call Gamma directly, so
the API stays fast and the external rate limit is owned entirely by the poller.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .config import ALLOWED_ORIGINS, POLL_INTERVAL_SECONDS, load_tracked
from .db import get_session
from .models import Base, Event, Market, Snapshot
from .db import engine
from . import poller
from .poller import start_scheduler
from . import backfill, explainer, gemini, screener, catalog, watchlist, news
from . import polymarket as pm
from datetime import datetime, timedelta, timezone

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("api")

# How many recent snapshots to return per market (for the sparkline).
HISTORY_LIMIT = 60


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure tables exist, seed the watchlist from tracked.yaml on first run,
    # then start polling.
    Base.metadata.create_all(engine)
    # Lightweight, idempotent migration for columns added after a table already
    # existed (create_all won't alter existing tables). Fine without Alembic here.
    with engine.begin() as conn:
        conn.exec_driver_sql("ALTER TABLE events ADD COLUMN IF NOT EXISTS image TEXT")
    with get_session() as session:
        watchlist.seed_if_empty(session, load_tracked()["slugs"])
    scheduler = start_scheduler()
    # Backfill price history for anything on the watchlist that lacks it (runs in
    # a background thread; new follows trigger their own backfill).
    with get_session() as session:
        slugs = watchlist.list_slugs(session)
    if slugs:
        backfill.backfill_async(slugs)
    log.info("poller started (interval=%ss)", POLL_INTERVAL_SECONDS)
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Polymarket Insight API", lifespan=lifespan)

# Allow the configured frontend origins (dev servers by default; set ALLOWED_ORIGINS
# to your deployed frontend URL in production). Follow/unfollow use POST/DELETE.
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
    return {"service": "Polymarket Insight API", "docs": "/docs", "health": "/health"}


def _market_history(session, market_id: str) -> list[dict]:
    rows = session.scalars(
        select(Snapshot)
        .where(Snapshot.market_id == market_id)
        .order_by(Snapshot.ts.desc())
        .limit(HISTORY_LIMIT)
    ).all()
    # Return oldest -> newest so the frontend can plot left-to-right.
    return [
        {"ts": s.ts.isoformat(), "yes_price": _f(s.yes_price)}
        for s in reversed(rows)
    ]


def _f(v):
    """Numeric columns come back as Decimal; make them JSON-friendly floats."""
    return float(v) if v is not None else None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/topics")
def list_topics() -> dict:
    """List the events we currently track, with basic metadata."""
    with get_session() as session:
        events = session.scalars(select(Event).order_by(Event.slug)).all()
        return {
            "tracked": load_tracked(),
            "events": [
                {
                    "slug": e.slug,
                    "title": e.title,
                    "active": e.active,
                    "closed": e.closed,
                    "end_date": e.end_date.isoformat() if e.end_date else None,
                    "num_markets": len(e.markets),
                }
                for e in events
            ],
        }


@app.get("/catalog/categories")
def catalog_categories() -> dict:
    """The browsable top-level categories."""
    return {"categories": [{"slug": c["slug"], "label": c["label"]} for c in catalog.CATEGORIES]}


@app.get("/catalog")
def get_catalog(category: str = "trending", offset: int = 0, limit: int = 20) -> dict:
    """Browse the live Polymarket catalog (cached pass-through), with a `following`
    flag per event. Nothing here is stored — only followed events get snapshotted."""
    limit = max(1, min(limit, 40))
    offset = max(0, offset)
    tag_id = catalog.resolve_tag_id(category)
    try:
        events = pm.fetch_catalog(tag_id, offset, limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Catalog fetch failed: {exc}")
    with get_session() as session:
        followed = set(watchlist.list_slugs(session))
    return {
        "category": category,
        "offset": offset,
        "limit": limit,
        "events": [catalog.summarize(e, e.slug in followed) for e in events],
    }


def _downsample(points: list, max_points: int) -> list:
    """Evenly thin a series to at most max_points, always keeping the last point."""
    if len(points) <= max_points:
        return points
    step = len(points) / max_points
    picked = [points[int(i * step)] for i in range(max_points)]
    picked[-1] = points[-1]
    return picked


def _series(session, market_id: str, since: datetime | None, max_points: int) -> list[dict]:
    q = select(Snapshot).where(Snapshot.market_id == market_id)
    if since is not None:
        q = q.where(Snapshot.ts >= since)
    rows = session.scalars(q.order_by(Snapshot.ts.asc())).all()
    return _downsample(
        [{"ts": s.ts.isoformat(), "yes_price": _f(s.yes_price)} for s in rows],
        max_points,
    )


HISTORY_RANGES = {"1d": 1, "1w": 7, "1m": 30, "all": None}


@app.get("/markets/{market_id}/history")
def get_history(market_id: str, range: str = "1w") -> dict:
    """Price history for one market (poller snapshots + CLOB backfill), downsampled."""
    days = HISTORY_RANGES.get(range, 7)
    since = datetime.now(timezone.utc) - timedelta(days=days) if days else None
    with get_session() as session:
        if session.get(Market, market_id) is None:
            raise HTTPException(status_code=404, detail="Market not found.")
        points = _series(session, market_id, since, max_points=300)
    return {"market_id": market_id, "range": range if range in HISTORY_RANGES else "1w", "points": points}


@app.get("/watchlist")
def get_watchlist() -> dict:
    """The events the user follows, enriched so the Following page is a dashboard:
    leader + odds + 24h move + sparkline + volume, without opening each board."""
    day_ago = datetime.now(timezone.utc) - timedelta(days=1)
    with get_session() as session:
        items = watchlist.list_items(session)
        out = []
        for it in items:
            ev = session.scalar(select(Event).where(Event.slug == it.slug))
            entry: dict = {
                "slug": it.slug,
                "title": it.title or (ev.title if ev else it.slug),
                "image": ev.image if ev else None,
                "closed": bool(ev.closed) if ev else False,
                "end_date": ev.end_date.isoformat() if ev and ev.end_date else None,
                "following": True,
                "leader": None,
                "volume_24h": None,
                "top_mover": None,
            }
            if ev is not None:
                open_markets = [m for m in ev.markets if not m.closed] or list(ev.markets)
                latest: list[tuple] = []  # (market, snapshot)
                for m in open_markets:
                    snap = session.scalar(
                        select(Snapshot)
                        .where(Snapshot.market_id == m.id)
                        .order_by(Snapshot.ts.desc())
                        .limit(1)
                    )
                    if snap is not None and snap.yes_price is not None:
                        latest.append((m, snap))
                if latest:
                    lead_m, lead_s = max(latest, key=lambda t: float(t[1].yes_price))
                    entry["leader"] = {
                        "market_id": lead_m.id,
                        "name": lead_m.candidate_name,
                        "yes_price": _f(lead_s.yes_price),
                        "one_day_price_change": _f(lead_s.one_day_price_change),
                        "spark": [
                            p["yes_price"]
                            for p in _series(session, lead_m.id, day_ago, max_points=30)
                        ],
                    }
                    vols = [float(s.volume_24h) for _, s in latest if s.volume_24h is not None]
                    entry["volume_24h"] = sum(vols) if vols else None
                    movers = [
                        (m, s) for m, s in latest if s.one_day_price_change is not None
                    ]
                    if movers:
                        mov_m, mov_s = max(
                            movers, key=lambda t: abs(float(t[1].one_day_price_change))
                        )
                        if abs(float(mov_s.one_day_price_change)) > 0:
                            entry["top_mover"] = {
                                "name": mov_m.candidate_name,
                                "change": _f(mov_s.one_day_price_change),
                            }
            out.append(entry)
    return {"items": out, "max": watchlist.MAX_FOLLOWS}


@app.get("/preview/{slug}")
def preview_topic(slug: str) -> dict:
    """A live, ephemeral board for an event you DON'T follow yet — fetched straight
    from Gamma, nothing stored. No history/explanations until you follow."""
    try:
        events = pm.fetch_events_by_slug(slug)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Lookup failed: {exc}")
    if not events:
        raise HTTPException(status_code=404, detail="No such event on Polymarket.")
    e = events[0]
    candidates = [
        {
            "market_id": m.id,
            "name": m.candidate_name,
            "question": m.question,
            "closed": m.closed,
            "yes_price": m.yes_price,
            "volume_24h": m.volume_24h,
            "one_day_price_change": m.one_day_price_change,
            "spread": m.spread,
            "history": [],
        }
        for m in e.markets
        if m.yes_price is not None
    ]
    candidates.sort(key=lambda c: -(c["yes_price"] or 0))
    return {
        "slug": e.slug,
        "title": e.title,
        "image": e.image,
        "description": e.description,
        "active": e.active,
        "closed": e.closed,
        "neg_risk": e.neg_risk,
        "end_date": e.end_date.isoformat() if e.end_date else None,
        "candidates": candidates,
        "preview": True,
    }


@app.post("/watchlist/{slug}")
def follow(slug: str) -> dict:
    """Follow an event: validate it, store it, and poll it once so the board fills in."""
    try:
        events = pm.fetch_events_by_slug(slug)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Lookup failed: {exc}")
    if not events:
        raise HTTPException(status_code=404, detail="No such event.")

    title = events[0].title
    with get_session() as session:
        try:
            watchlist.add(session, slug, title)
        except watchlist.WatchlistFull:
            raise HTTPException(
                status_code=409,
                detail=f"You can follow at most {watchlist.MAX_FOLLOWS} markets. Unfollow one first.",
            )
    try:
        poller.poll_slugs([slug])  # instant data so the board isn't empty
    except Exception as exc:
        log.warning("instant poll for %s failed: %s", slug, exc)
    backfill.backfill_async([slug])  # real trend history, fetched off-request
    return {"slug": slug, "title": title, "following": True}


@app.delete("/watchlist/{slug}")
def unfollow(slug: str) -> dict:
    with get_session() as session:
        removed = watchlist.remove(session, slug)
    return {"slug": slug, "following": False, "removed": removed}


@app.get("/screener")
def get_screener() -> dict:
    """Contested-market feed + probability-consistency flags. Candidates to look at,
    never advice — most apparent edges vanish after fees and spread."""
    with get_session() as session:
        return {
            "contested": screener.contested(session),
            "consistency": screener.consistency(session),
            "thresholds": screener.thresholds(),
        }


@app.get("/topics/{event_slug}/news")
def get_news(event_slug: str) -> dict:
    """Related news headlines for an event (link-out only, cached, best-effort)."""
    with get_session() as session:
        event = session.scalar(select(Event).where(Event.slug == event_slug))
        title = event.title if event else None
    query = news.build_query(title, event_slug)
    return {"slug": event_slug, "query": query, "articles": news.fetch_news(query)}


@app.get("/markets/{market_id}/explanation")
def get_explanation(market_id: str) -> dict:
    """Plain-language card for one market. Generated once via Gemini, then cached."""
    with get_session() as session:
        try:
            e = explainer.get_or_create(session, market_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="Market not found.")
        except gemini.GeminiError as exc:
            # Don't cache failures — surface so the client can retry later.
            raise HTTPException(status_code=502, detail=str(exc))
        return {
            "market_id": e.market_id,
            "summary": e.summary,
            "yes_meaning": e.yes_meaning,
            "no_meaning": e.no_meaning,
            "yes_resolves": e.yes_resolves,
            "description_thin": e.description_thin,
            "model": e.model,
            "generated_at": e.created_at.isoformat() if e.created_at else None,
        }


@app.get("/topics/{event_slug}")
def get_topic(event_slug: str) -> dict:
    """One event as a board: each candidate with current odds + recent history."""
    with get_session() as session:
        event = session.scalar(select(Event).where(Event.slug == event_slug))
        if event is None:
            raise HTTPException(
                status_code=404,
                detail=f"Event '{event_slug}' not tracked yet. Add it to tracked.yaml.",
            )

        candidates = []
        for m in event.markets:
            latest = session.scalar(
                select(Snapshot)
                .where(Snapshot.market_id == m.id)
                .order_by(Snapshot.ts.desc())
                .limit(1)
            )
            candidates.append(
                {
                    "market_id": m.id,
                    "name": m.candidate_name,
                    "question": m.question,
                    "closed": m.closed,
                    "yes_price": _f(latest.yes_price) if latest else None,
                    "volume_24h": _f(latest.volume_24h) if latest else None,
                    "one_day_price_change": _f(latest.one_day_price_change)
                    if latest
                    else None,
                    "spread": _f(latest.spread) if latest else None,
                    "history": _market_history(session, m.id),
                }
            )

        # Highest implied-probability first; None prices sink to the bottom.
        candidates.sort(key=lambda c: (c["yes_price"] is None, -(c["yes_price"] or 0)))

        return {
            "slug": event.slug,
            "title": event.title,
            "image": event.image,
            # Stored data can outlive a follow (unfollow keeps history). The client
            # uses this to fall back to a live preview when not followed.
            "following": watchlist.is_following(session, event_slug),
            "description": event.description,
            "active": event.active,
            "closed": event.closed,
            "neg_risk": event.neg_risk,
            "end_date": event.end_date.isoformat() if event.end_date else None,
            "candidates": candidates,
        }
