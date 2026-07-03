"""Gamma API client + parser.

This is the one module that knows about Polymarket's JSON quirks. Everything
upstream (poller, endpoints) deals in the clean dataclasses defined here, never
the raw payload.

Quirks handled (all verified against real payloads):
  - `outcomes`, `outcomePrices`, `clobTokenIds` arrive as JSON-encoded STRINGS,
    so they must be json.loads'd, not used directly.
  - A sub-market can be closed even inside an active event (eliminated candidate).
  - Placeholder/junk markets exist with null prices (bid=0, ask=1) — tolerate them.
  - volume24hr is null on closed markets.
  - Gamma has no reliable free-text search; we fetch by slug or tag_id only.

Caching: an in-process TTL cache keyed on the full URL, so polling the same slug
every 60s does not hammer Gamma (which itself caches 30-60s).
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from cachetools import TTLCache

GAMMA_BASE = "https://gamma-api.polymarket.com"

# Cache up to 256 distinct URLs for 30s each.
_cache: TTLCache = TTLCache(maxsize=256, ttl=30)


# --------------------------------------------------------------------------- #
# Clean shapes the rest of the app works with
# --------------------------------------------------------------------------- #
@dataclass
class ParsedMarket:
    id: str
    condition_id: str | None
    question: str | None
    candidate_name: str | None
    description: str | None
    outcomes: list[str]
    clob_token_ids: list[str]
    end_date: datetime | None
    active: bool
    closed: bool
    # live readings (None when market not tradeable / closed)
    yes_price: float | None
    best_bid: float | None
    best_ask: float | None
    spread: float | None
    volume_24h: float | None
    one_day_price_change: float | None


@dataclass
class ParsedEvent:
    id: str
    slug: str
    title: str | None
    description: str | None
    neg_risk: bool | None
    end_date: datetime | None
    active: bool
    closed: bool
    image: str | None = None
    volume_24h: float | None = None  # event-level 24h volume (for browse cards)
    markets: list[ParsedMarket] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Small parsing helpers — defensive on purpose
# --------------------------------------------------------------------------- #
def _loads_list(value) -> list:
    """Decode a field that Gamma sends as a JSON-encoded string list."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, ValueError):
            return []
    return []


def _to_float(value) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_dt(value) -> datetime | None:
    if not value:
        return None
    try:
        # Gamma uses ISO 8601 with a trailing Z.
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _yes_price(outcomes: list[str], prices: list) -> float | None:
    """Yes-price IS the implied probability. Find it by label, robustly."""
    if not prices:
        return None
    for i, label in enumerate(outcomes):
        if str(label).strip().lower() == "yes" and i < len(prices):
            return _to_float(prices[i])
    # Fallback: a plain 2-outcome market with [yes, no] ordering.
    return _to_float(prices[0]) if prices else None


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def parse_market(raw: dict) -> ParsedMarket:
    outcomes = [str(o) for o in _loads_list(raw.get("outcomes"))]
    prices = _loads_list(raw.get("outcomePrices"))
    token_ids = [str(t) for t in _loads_list(raw.get("clobTokenIds"))]

    return ParsedMarket(
        id=str(raw["id"]),
        condition_id=raw.get("conditionId"),
        question=raw.get("question"),
        candidate_name=raw.get("groupItemTitle") or raw.get("question"),
        description=raw.get("description"),
        outcomes=outcomes,
        clob_token_ids=token_ids,
        end_date=_to_dt(raw.get("endDate")),
        active=bool(raw.get("active")),
        closed=bool(raw.get("closed")),
        yes_price=_yes_price(outcomes, prices),
        best_bid=_to_float(raw.get("bestBid")),
        best_ask=_to_float(raw.get("bestAsk")),
        spread=_to_float(raw.get("spread")),
        volume_24h=_to_float(raw.get("volume24hr")),
        one_day_price_change=_to_float(raw.get("oneDayPriceChange")),
    )


def parse_event(raw: dict) -> ParsedEvent:
    return ParsedEvent(
        id=str(raw["id"]),
        slug=raw["slug"],
        title=raw.get("title"),
        description=raw.get("description"),
        neg_risk=raw.get("negRisk"),
        end_date=_to_dt(raw.get("endDate")),
        active=bool(raw.get("active")),
        closed=bool(raw.get("closed")),
        image=raw.get("image") or raw.get("icon"),
        volume_24h=_to_float(raw.get("volume24hr")),
        markets=[parse_market(m) for m in (raw.get("markets") or [])],
    )


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
def _get(path: str, params: dict) -> list[dict]:
    """GET against Gamma with an in-process TTL cache keyed on the full URL."""
    request = httpx.Request("GET", f"{GAMMA_BASE}{path}", params=params)
    url = str(request.url)
    if url in _cache:
        return _cache[url]

    with httpx.Client(timeout=15.0) as client:
        resp = client.send(request)
        resp.raise_for_status()
        data = resp.json()
    data = data if isinstance(data, list) else [data]
    _cache[url] = data
    return data


def fetch_events_by_slug(slug: str) -> list[ParsedEvent]:
    return [parse_event(e) for e in _get("/events", {"slug": slug})]


def fetch_events_by_tag(tag_id: str, limit: int = 50) -> list[ParsedEvent]:
    raw = _get(
        "/events",
        {"tag_id": tag_id, "active": "true", "closed": "false", "limit": limit},
    )
    return [parse_event(e) for e in raw]


def fetch_catalog(
    tag_id: str | int | None = None, offset: int = 0, limit: int = 20
) -> list[ParsedEvent]:
    """Browse the live catalog: active, open events ordered by 24h volume.

    This is a thin, TTL-cached pass-through to Gamma — nothing here is stored. Only
    events the user follows get snapshotted (see the poller)."""
    params: dict = {
        "active": "true",
        "closed": "false",
        "order": "volume24hr",
        "ascending": "false",
        "limit": limit,
        "offset": offset,
    }
    if tag_id is not None:
        params["tag_id"] = tag_id
    return [parse_event(e) for e in _get("/events", params)]


CLOB_BASE = "https://clob.polymarket.com"


def fetch_price_history(
    token_id: str, interval: str = "max", fidelity: int = 60
) -> list[tuple[datetime, float]]:
    """Historical prices for a CLOB token: [(utc datetime, price), ...] oldest first.

    Payload shape (verified): {"history": [{"t": <unix sec>, "p": <price>}, ...]}.
    fidelity is the sample spacing in minutes; 60 = hourly."""
    with httpx.Client(timeout=20.0) as client:
        resp = client.get(
            f"{CLOB_BASE}/prices-history",
            params={"market": token_id, "interval": interval, "fidelity": fidelity},
        )
        resp.raise_for_status()
        history = resp.json().get("history") or []
    out: list[tuple[datetime, float]] = []
    for pt in history:
        try:
            out.append(
                (datetime.fromtimestamp(int(pt["t"]), tz=timezone.utc), float(pt["p"]))
            )
        except (KeyError, TypeError, ValueError):
            continue
    return out


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
