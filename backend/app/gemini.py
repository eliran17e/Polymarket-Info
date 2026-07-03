"""Gemini client for the explainer.

We call the REST API directly with httpx (same HTTP library as the Gamma client)
and use structured output (responseSchema) so the model returns clean JSON we can
trust — no fragile string parsing.

The prompt's one hard rule: ground the resolution explanation ONLY in the provided
description. The model must not invent finance facts; if the description is too thin
to be specific, it says so via `description_thin`.
"""
from __future__ import annotations

import httpx

from .config import GEMINI_API_KEY, GEMINI_MODEL

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"

# The shape we ask Gemini to return.
_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "yes_meaning": {"type": "string"},
        "no_meaning": {"type": "string"},
        "yes_resolves": {"type": "string"},
        "description_thin": {"type": "boolean"},
    },
    "required": [
        "summary",
        "yes_meaning",
        "no_meaning",
        "yes_resolves",
        "description_thin",
    ],
}

_INSTRUCTIONS = (
    "You explain prediction markets in plain language for someone unfamiliar with "
    "finance. Be concrete and concise.\n"
    "- summary: one sentence on what this market is about.\n"
    "- yes_meaning: what a 'Yes' outcome means, in plain words.\n"
    "- no_meaning: what a 'No' outcome means.\n"
    "- yes_resolves: exactly what must happen for 'Yes' to resolve true.\n"
    "Rules: base the resolution details ONLY on the official description provided. "
    "Do NOT invent finance facts, dates, sources, or thresholds that aren't in it. "
    "If the description is too thin to be specific, set description_thin to true and "
    "say plainly that the official text doesn't give enough detail."
)


class GeminiError(RuntimeError):
    pass


def generate_card(question: str, description: str) -> dict:
    """Call Gemini and return the parsed card dict. Raises GeminiError on failure."""
    if not GEMINI_API_KEY:
        raise GeminiError("GEMINI_API_KEY is not set on the backend.")

    prompt = (
        f"{_INSTRUCTIONS}\n\n"
        f"Market question:\n{question or '(none)'}\n\n"
        f"Official resolution description:\n{description or '(empty)'}"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
            "temperature": 0.2,
        },
    }
    url = f"{API_ROOT}/models/{GEMINI_MODEL}:generateContent"

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, params={"key": GEMINI_API_KEY}, json=body)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise GeminiError(
            f"Gemini returned {exc.response.status_code}: {exc.response.text[:200]}"
        ) from exc
    except httpx.HTTPError as exc:
        raise GeminiError(f"Gemini request failed: {exc}") from exc

    try:
        # Structured output still arrives as JSON text in the first part.
        import json

        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, ValueError) as exc:
        raise GeminiError(f"Could not parse Gemini response: {exc}") from exc
