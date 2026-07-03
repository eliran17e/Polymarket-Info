"""Parser tests against the real Gamma payload quirks.

These quirks caused (or would cause) actual bugs, so each one is pinned here:
- outcomes/outcomePrices/clobTokenIds arrive as JSON-encoded STRINGS
- placeholder markets have null prices — must parse to None, not crash
- a sub-market can be closed inside an active event
- Yes price must be found by label, not position
"""
from datetime import datetime, timezone

from app.polymarket import ParsedEvent, parse_event, parse_market


def make_market(**overrides) -> dict:
    """A realistic open Gamma market (fields as the API actually sends them)."""
    base = {
        "id": "553813",
        "question": "Fed decreases interest rates by 25 bps?",
        "conditionId": "0xabc",
        "groupItemTitle": "25 bps decrease",
        "description": "Resolves based on the FOMC statement.",
        "outcomes": '["Yes", "No"]',
        "outcomePrices": '["0.0115", "0.9885"]',
        "clobTokenIds": '["111", "222"]',
        "endDate": "2026-07-29T12:00:00Z",
        "active": True,
        "closed": False,
        "volume24hr": 283391.47,
        "oneDayPriceChange": -0.003,
        "bestBid": 0.011,
        "bestAsk": 0.012,
        "spread": 0.001,
    }
    base.update(overrides)
    return base


def make_event(markets: list[dict]) -> dict:
    return {
        "id": "27824",
        "slug": "fed-decision",
        "title": "Fed decision?",
        "description": "desc",
        "negRisk": True,
        "endDate": "2026-07-29T12:00:00Z",
        "active": True,
        "closed": False,
        "image": "https://example.com/x.png",
        "volume24hr": 1234.5,
        "markets": markets,
    }


def test_json_string_fields_are_decoded():
    m = parse_market(make_market())
    assert m.outcomes == ["Yes", "No"]
    assert m.clob_token_ids == ["111", "222"]
    assert m.yes_price == 0.0115


def test_yes_price_found_by_label_not_position():
    m = parse_market(
        make_market(outcomes='["No", "Yes"]', outcomePrices='["0.7", "0.3"]')
    )
    assert m.yes_price == 0.3  # the Yes label sits second here


def test_placeholder_market_with_null_prices_does_not_crash():
    m = parse_market(
        make_market(
            outcomePrices=None,
            volume24hr=None,
            oneDayPriceChange=None,
            bestBid=None,
        )
    )
    assert m.yes_price is None
    assert m.volume_24h is None
    assert m.best_bid is None


def test_malformed_json_string_is_tolerated():
    m = parse_market(make_market(outcomePrices="not json at all"))
    assert m.yes_price is None


def test_closed_submarket_inside_active_event():
    ev = parse_event(
        make_event([make_market(), make_market(id="999", closed=True)])
    )
    assert isinstance(ev, ParsedEvent)
    assert ev.active and not ev.closed
    closed_flags = [m.closed for m in ev.markets]
    assert closed_flags == [False, True]


def test_event_dates_parse_to_utc():
    ev = parse_event(make_event([make_market()]))
    assert ev.end_date == datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)


def test_event_image_and_volume():
    ev = parse_event(make_event([make_market()]))
    assert ev.image == "https://example.com/x.png"
    assert ev.volume_24h == 1234.5


def test_null_volume_on_closed_market():
    m = parse_market(
        make_market(closed=True, outcomePrices='["0", "1"]', volume24hr=None)
    )
    assert m.closed is True
    assert m.yes_price == 0.0
    assert m.volume_24h is None
