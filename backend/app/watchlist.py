"""Watchlist: the events the user follows.

This table is the poller's work list. Add/remove here changes what gets deep-tracked
(snapshots + explainer + screener). Capped so the tool stays focused and the expensive
work stays bounded.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import WatchlistItem

MAX_FOLLOWS = 12


class WatchlistFull(RuntimeError):
    pass


def list_items(session: Session) -> list[WatchlistItem]:
    return list(
        session.scalars(select(WatchlistItem).order_by(WatchlistItem.added_at)).all()
    )


def list_slugs(session: Session) -> list[str]:
    return list(session.scalars(select(WatchlistItem.slug)).all())


def is_following(session: Session, slug: str) -> bool:
    return session.get(WatchlistItem, slug) is not None


def add(session: Session, slug: str, title: str | None) -> WatchlistItem:
    existing = session.get(WatchlistItem, slug)
    if existing is not None:
        return existing  # idempotent
    if len(list_slugs(session)) >= MAX_FOLLOWS:
        raise WatchlistFull()
    item = WatchlistItem(slug=slug, title=title)
    session.add(item)
    session.flush()
    return item


def remove(session: Session, slug: str) -> bool:
    item = session.get(WatchlistItem, slug)
    if item is None:
        return False
    session.delete(item)
    return True


def seed_if_empty(session: Session, slugs: list[str], titles: dict[str, str] | None = None) -> None:
    """One-time bootstrap so we don't start with an empty board on first run."""
    if list_slugs(session):
        return
    titles = titles or {}
    for slug in slugs:
        session.add(WatchlistItem(slug=slug, title=titles.get(slug)))
