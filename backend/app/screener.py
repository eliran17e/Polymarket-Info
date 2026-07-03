"""The screener: surface *interesting* and *structurally odd* markets.

Two independent passes, both read-only over what the poller has already stored:

  contested()   — markets that are genuinely in play (price not near 0/1, real
                  volume, still open) — candidates a human might want to look at.
  consistency() — for negRisk multi-candidate events (mutually exclusive outcomes),
                  the Yes prices should sum to ~100%. We flag events where they
                  don't, as a structural anomaly.

Nothing here is advice. These are candidates to investigate; most apparent edges
vanish once you account for fees and the bid/ask spread.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import watchlist
from .models import Event, Market, Snapshot
from .polymarket import now_utc

# --- tunable thresholds (kept together so they're easy to reason about) -------
CONTESTED_MIN_PRICE = 0.15
CONTESTED_MAX_PRICE = 0.85
CONTESTED_MIN_VOL_24H = 10_000.0  # ignore thinly-traded noise
NOTABLE_MOVE = 0.03  # 3 percentage-point daily move counts as "moving"
CONSISTENCY_TOLERANCE = 0.03  # sum must be within 3pp of 100% to pass


def _latest(session: Session, market_id: str) -> Snapshot | None:
    return session.scalar(
        select(Snapshot)
        .where(Snapshot.market_id == market_id)
        .order_by(Snapshot.ts.desc())
        .limit(1)
    )


def contested(session: Session) -> list[dict]:
    """Open markets in play, ranked by a volume × recent-move score.

    Scoped to followed events only — the screener is a deep feature over your picks,
    not the whole catalog."""
    now = now_utc()
    followed = set(watchlist.list_slugs(session))
    rows: list[dict] = []

    for m in session.scalars(select(Market)).all():
        if m.closed:
            continue
        event = m.event
        if event is None or event.closed or event.slug not in followed:
            continue
        if m.end_date and m.end_date <= now:
            continue

        snap = _latest(session, m.id)
        if snap is None or snap.yes_price is None:
            continue

        price = float(snap.yes_price)
        if not (CONTESTED_MIN_PRICE <= price <= CONTESTED_MAX_PRICE):
            continue

        vol = float(snap.volume_24h) if snap.volume_24h is not None else 0.0
        if vol < CONTESTED_MIN_VOL_24H:
            continue

        move = float(snap.one_day_price_change) if snap.one_day_price_change is not None else 0.0
        # Rank: volume is the base, a notable move amplifies it.
        score = vol * (1.0 + min(abs(move), 0.5) * 10.0)

        rows.append(
            {
                "market_id": m.id,
                "event_slug": event.slug,
                "event_title": event.title,
                "name": m.candidate_name,
                "yes_price": price,
                "volume_24h": vol,
                "one_day_price_change": move,
                "moving": abs(move) >= NOTABLE_MOVE,
                "end_date": event.end_date.isoformat() if event.end_date else None,
                "score": score,
            }
        )

    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows


def consistency(session: Session) -> list[dict]:
    """For each negRisk multi-candidate event, sum Yes prices and flag off-100%.

    Returns every evaluated event (flagged or not) sorted by how far off it is, so
    the UI can show the check actually ran and passed when nothing's wrong.
    """
    followed = set(watchlist.list_slugs(session))
    results: list[dict] = []

    for event in session.scalars(select(Event)).all():
        if not event.neg_risk or event.closed or event.slug not in followed:
            continue

        open_markets = [m for m in event.markets if not m.closed]
        if len(open_markets) < 2:
            continue

        total = 0.0
        counted = 0
        for m in open_markets:
            snap = _latest(session, m.id)
            if snap and snap.yes_price is not None:
                total += float(snap.yes_price)
                counted += 1
        if counted < 2:
            continue

        deviation = total - 1.0  # positive = probabilities sum over 100%
        results.append(
            {
                "event_slug": event.slug,
                "event_title": event.title,
                "num_markets": counted,
                "prob_sum": total,
                "deviation": deviation,
                "flagged": abs(deviation) > CONSISTENCY_TOLERANCE,
            }
        )

    results.sort(key=lambda r: abs(r["deviation"]), reverse=True)
    return results


def thresholds() -> dict:
    return {
        "contested_price_range": [CONTESTED_MIN_PRICE, CONTESTED_MAX_PRICE],
        "contested_min_volume_24h": CONTESTED_MIN_VOL_24H,
        "notable_move": NOTABLE_MOVE,
        "consistency_tolerance": CONSISTENCY_TOLERANCE,
    }
