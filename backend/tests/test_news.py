"""Tests for the pure helpers in the news module (no network)."""

from app.news import _clean_title, _favicon, _parse_date, build_query


def test_build_query_prefers_title_and_strips_punctuation():
    assert build_query("Fed Decision in July?", "fed-decision-in-july-181") == (
        "Fed Decision in July"
    )


def test_build_query_falls_back_to_humanized_slug():
    assert build_query(None, "next-prime-minister-of-ethiopia") == (
        "next prime minister of ethiopia"
    )


def test_clean_title_drops_source_suffix():
    assert _clean_title("Fed holds rates - WSJ", "WSJ") == "Fed holds rates"
    assert _clean_title("No suffix here", "WSJ") == "No suffix here"


def test_favicon_extracts_host():
    assert _favicon("https://www.investopedia.com") == (
        "https://www.google.com/s2/favicons?domain=www.investopedia.com&sz=64"
    )
    assert _favicon(None) is None
    assert _favicon("not a url") is None


def test_parse_date_rfc822_to_iso():
    iso = _parse_date("Mon, 29 Jun 2026 12:40:00 GMT")
    assert iso is not None and iso.startswith("2026-06-29T12:40:00")
    assert _parse_date("garbage") is None
    assert _parse_date(None) is None
