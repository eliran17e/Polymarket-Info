"""SQLAlchemy models — the source of truth for the schema.

Three tables:
  - events:    one Polymarket event (a question that groups candidates)
  - markets:   one candidate (Yes/No market) inside an event   [upserted]
  - snapshots: append-only price/volume readings over time      [the time series]

events/markets hold mutable metadata and are upserted each poll.
snapshots are never updated — every poll appends a row, which is what lets us
draw trend sparklines and detect recent moves later.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # Gamma event id
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    title: Mapped[str | None] = mapped_column(Text)
    image: Mapped[str | None] = mapped_column(Text)  # event thumbnail
    description: Mapped[str | None] = mapped_column(Text)  # resolution text
    neg_risk: Mapped[bool | None] = mapped_column(Boolean)  # matters for consistency check
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool | None] = mapped_column(Boolean)
    closed: Mapped[bool | None] = mapped_column(Boolean)
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    markets: Mapped[list["Market"]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )


class Market(Base):
    __tablename__ = "markets"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # Gamma market id
    event_id: Mapped[str] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), index=True
    )
    condition_id: Mapped[str | None] = mapped_column(String)
    question: Mapped[str | None] = mapped_column(Text)
    candidate_name: Mapped[str | None] = mapped_column(Text)  # groupItemTitle
    description: Mapped[str | None] = mapped_column(Text)  # resolution text (for explainer)
    outcomes: Mapped[list | None] = mapped_column(JSONB)  # ["Yes","No"]
    clob_token_ids: Mapped[list | None] = mapped_column(JSONB)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool | None] = mapped_column(Boolean)
    closed: Mapped[bool | None] = mapped_column(Boolean)
    first_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    event: Mapped["Event"] = relationship(back_populates="markets")
    snapshots: Mapped[list["Snapshot"]] = relationship(
        back_populates="market", cascade="all, delete-orphan"
    )


class Snapshot(Base):
    __tablename__ = "snapshots"

    # BIGSERIAL via autoincrementing big int primary key
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    market_id: Mapped[str] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"), index=True
    )
    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    yes_price: Mapped[float | None] = mapped_column(Numeric)  # implied probability
    best_bid: Mapped[float | None] = mapped_column(Numeric)
    best_ask: Mapped[float | None] = mapped_column(Numeric)
    spread: Mapped[float | None] = mapped_column(Numeric)
    volume_24h: Mapped[float | None] = mapped_column(Numeric)
    one_day_price_change: Mapped[float | None] = mapped_column(Numeric)

    market: Mapped["Market"] = relationship(back_populates="snapshots")


class WatchlistItem(Base):
    """An event the user has chosen to follow. This table IS the poller's work list
    (it replaces the static tracked.yaml, which now only seeds it on first run).
    Only followed events get the deep treatment: snapshot history + explainer +
    screener. Browsing the wider catalog stays live/cached and un-stored."""

    __tablename__ = "watchlist"

    slug: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str | None] = mapped_column(Text)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Explanation(Base):
    """Cached plain-language card for a market. Generated once per market id (the
    official description rarely changes), then served from here forever — which
    keeps total LLM calls tiny and well within Gemini's free tier."""

    __tablename__ = "explanations"

    market_id: Mapped[str] = mapped_column(
        ForeignKey("markets.id", ondelete="CASCADE"), primary_key=True
    )
    summary: Mapped[str] = mapped_column(Text)  # one sentence: what it's about
    yes_meaning: Mapped[str] = mapped_column(Text)  # what "Yes" means
    no_meaning: Mapped[str] = mapped_column(Text)  # what "No" means
    yes_resolves: Mapped[str] = mapped_column(Text)  # what must happen for Yes
    description_thin: Mapped[bool] = mapped_column(Boolean, default=False)
    model: Mapped[str] = mapped_column(String)  # which model produced this
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    market: Mapped["Market"] = relationship()


# Composite index for "latest N snapshots of this market" — the hot read path.
Index("ix_snapshots_market_ts", Snapshot.market_id, Snapshot.ts.desc())
