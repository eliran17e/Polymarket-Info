"""Related-news lookup via Google News RSS.

Free, no API key, broad coverage (politics/econ/crypto/sports). We only surface
headline + source + date + a link out — we never reproduce article text (that's the
publishers'). Cached hard (results don't change minute to minute) and fully
defensive: any failure returns an empty list so the UI just hides the strip.
"""
from __future__ import annotations

import logging
from datetime import timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

import httpx
from cachetools import TTLCache

from .config import GNEWS_API_KEY

log = logging.getLogger("news")

RSS_URL = "https://news.google.com/rss/search"
GNEWS_URL = "https://gnews.io/api/v4/search"
_cache: TTLCache = TTLCache(maxsize=128, ttl=1200)  # 20 minutes


def _humanize_slug(slug: str) -> str:
    return slug.replace("-", " ").strip()


def build_query(title: str | None, slug: str) -> str:
    """A search query from the event title (preferred) or a humanized slug."""
    base = (title or _humanize_slug(slug)).strip().rstrip("?.!")
    return base


def _parse_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return None


def _clean_title(title: str, source: str | None) -> str:
    # Google appends " - Source" to titles; drop it since we show source separately.
    if source and title.endswith(f" - {source}"):
        return title[: -(len(source) + 3)]
    return title


def _favicon(source_url: str | None) -> str | None:
    """A small source logo via Google's favicon service, from the outlet homepage."""
    if not source_url:
        return None
    host = urlparse(source_url).netloc
    if not host:
        return None
    return f"https://www.google.com/s2/favicons?domain={host}&sz=64"


def _fetch_gnews(query: str) -> list[dict]:
    """GNews (keyed, free tier): same shape as the RSS path but with real article
    photos in `image`. Raises on failure so the caller can fall back to RSS."""
    with httpx.Client(timeout=12.0) as client:
        resp = client.get(
            GNEWS_URL,
            params={"q": query, "lang": "en", "max": 10, "apikey": GNEWS_API_KEY},
        )
        resp.raise_for_status()
        raw = resp.json().get("articles") or []
    articles: list[dict] = []
    for a in raw:
        title, link = a.get("title"), a.get("url")
        if not title or not link:
            continue
        source = (a.get("source") or {}).get("name")
        articles.append(
            {
                "title": title,
                "source": source,
                "favicon": _favicon((a.get("source") or {}).get("url")),
                "image": a.get("image"),
                "link": link,
                "published": a.get("publishedAt"),
            }
        )
    return articles


def fetch_news(query: str, limit: int = 6) -> list[dict]:
    """Return up to `limit` recent articles for the query. Never raises."""
    if not query:
        return []
    if query in _cache:
        return _cache[query][:limit]

    if GNEWS_API_KEY:
        try:
            articles = _fetch_gnews(query)
            if articles:
                _cache[query] = articles
                return articles[:limit]
        except Exception as exc:  # quota, outage, bad key — fall back to RSS
            log.warning("gnews failed for %r (%s); falling back to RSS", query, exc)

    try:
        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            resp = client.get(
                RSS_URL,
                params={"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"},
                headers={"User-Agent": "Mozilla/5.0 (compatible; PolymarketInsight/1.0)"},
            )
            resp.raise_for_status()
            root = ET.fromstring(resp.content)
    except (httpx.HTTPError, ET.ParseError) as exc:
        log.warning("news fetch failed for %r: %s", query, exc)
        return []

    articles: list[dict] = []
    for item in root.findall(".//item"):
        title = item.findtext("title") or ""
        link = item.findtext("link") or ""
        src_el = item.find("{*}source")
        source = src_el.text if src_el is not None else None
        source_url = src_el.get("url") if src_el is not None else None
        if not title or not link:
            continue
        articles.append(
            {
                "title": _clean_title(title, source),
                "source": source,
                "favicon": _favicon(source_url),
                "image": None,  # RSS carries no article photo; GNews path fills this
                "link": link,
                "published": _parse_date(item.findtext("pubDate")),
            }
        )

    _cache[query] = articles
    return articles[:limit]
