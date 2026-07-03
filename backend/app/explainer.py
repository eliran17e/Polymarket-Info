"""Cache-once explainer service.

get_or_create() returns the cached Explanation for a market, generating it via
Gemini only on the first request. After that it's served straight from Postgres,
so each market costs at most one LLM call ever.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from . import gemini
from .config import GEMINI_MODEL
from .models import Explanation, Market

log = logging.getLogger("explainer")


def get_cached(session: Session, market_id: str) -> Explanation | None:
    return session.get(Explanation, market_id)


def get_or_create(session: Session, market_id: str) -> Explanation:
    """Return the explanation for a market, generating + caching if missing.

    Raises KeyError if the market doesn't exist, gemini.GeminiError on LLM failure.
    """
    existing = session.get(Explanation, market_id)
    if existing is not None:
        return existing

    market = session.get(Market, market_id)
    if market is None:
        raise KeyError(market_id)

    log.info("generating explanation for market %s", market_id)
    card = gemini.generate_card(market.question or "", market.description or "")

    explanation = Explanation(
        market_id=market_id,
        summary=card["summary"],
        yes_meaning=card["yes_meaning"],
        no_meaning=card["no_meaning"],
        yes_resolves=card["yes_resolves"],
        description_thin=bool(card.get("description_thin", False)),
        model=GEMINI_MODEL,
    )
    session.add(explanation)
    session.flush()  # surface any DB error here, inside the caller's transaction
    return explanation
