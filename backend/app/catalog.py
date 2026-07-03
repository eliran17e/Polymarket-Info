"""Catalog: the browsable Polymarket categories + a compact card summary.

Categories are a curated set of Polymarket's top-level tags (ids resolved from the
live /tags/slug/{slug} endpoint). "trending" has no tag — it's the whole catalog by
volume.
"""
from __future__ import annotations

from . import polymarket as pm

CATEGORIES: list[dict] = [
    {"slug": "trending", "label": "Trending", "tag_id": None},
    {"slug": "politics", "label": "Politics", "tag_id": 2},
    {"slug": "economy", "label": "Economy", "tag_id": 100328},
    {"slug": "crypto", "label": "Crypto", "tag_id": 21},
    {"slug": "sports", "label": "Sports", "tag_id": 1},
    {"slug": "tech", "label": "Tech", "tag_id": 1401},
    {"slug": "culture", "label": "Culture", "tag_id": 596},
    {"slug": "world", "label": "World", "tag_id": 101970},
    {"slug": "geopolitics", "label": "Geopolitics", "tag_id": 100265},
]

_BY_SLUG = {c["slug"]: c for c in CATEGORIES}


def resolve_tag_id(category_slug: str) -> str | int | None:
    """Return the tag_id for a category slug. Unknown slug -> trending (None)."""
    return _BY_SLUG.get(category_slug, _BY_SLUG["trending"])["tag_id"]


def summarize(ev: pm.ParsedEvent, following: bool) -> dict:
    """Compact card for the browse grid: top few outcomes + headline stats."""
    priced = [
        m for m in ev.markets if not m.closed and m.yes_price is not None
    ]
    priced.sort(key=lambda m: m.yes_price or 0.0, reverse=True)
    top = [{"name": m.candidate_name, "yes_price": m.yes_price} for m in priced[:3]]

    return {
        "slug": ev.slug,
        "title": ev.title,
        "image": ev.image,
        "volume_24h": ev.volume_24h,
        "end_date": ev.end_date.isoformat() if ev.end_date else None,
        "num_outcomes": len(priced),
        "top_outcomes": top,
        "following": following,
    }
