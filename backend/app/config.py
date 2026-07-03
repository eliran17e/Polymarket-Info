"""Configuration: environment variables + the tracked-events list.

Everything the app needs to be told from the outside lives here, so the rest of
the code never reads os.environ or parses YAML directly.
"""
from __future__ import annotations

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv

# backend/ directory (this file is backend/app/config.py -> parents[1] == backend/)
BACKEND_DIR = Path(__file__).resolve().parents[1]

# Load backend/.env if present. Real secrets live here; .env is gitignored.
load_dotenv(BACKEND_DIR / ".env")
# Also try repo-root .env, so a single top-level .env works too.
load_dotenv(BACKEND_DIR.parent / ".env")

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://polymarket:polymarket@localhost:5434/polymarket",
)

POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "60"))

# Comma-separated list of browser origins allowed to call the API. In production set
# this to your deployed frontend URL (e.g. https://polymarket-info.vercel.app).
# Defaults cover the local dev servers.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5181,http://127.0.0.1:5181,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Optional: GNews key (free tier) upgrades related-news items with real article
# photos. Without it we fall back to Google News RSS + source favicons.
GNEWS_API_KEY = os.getenv("GNEWS_API_KEY", "")
# A free-tier Flash/Flash-Lite model. The "-latest" alias auto-tracks the newest
# Flash-Lite so it doesn't go stale; override with GEMINI_MODEL if you want a pin.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-lite-latest")

TRACKED_FILE = BACKEND_DIR / "tracked.yaml"


def load_tracked() -> dict:
    """Return {'slugs': [...], 'tag_ids': [...]} from tracked.yaml.

    Re-read on each poll so you can edit the file without restarting.
    """
    if not TRACKED_FILE.exists():
        return {"slugs": [], "tag_ids": []}
    data = yaml.safe_load(TRACKED_FILE.read_text(encoding="utf-8")) or {}
    return {
        "slugs": list(data.get("slugs") or []),
        "tag_ids": [str(t) for t in (data.get("tag_ids") or [])],
    }
