# Polymarket Insight Site

![CI](https://github.com/eliran17e/Polymarket-Info/actions/workflows/ci.yml/badge.svg)

Makes Polymarket prediction markets legible: live odds + price-history charts +
plain-language AI explanations + a payout calculator + related news + a screener
that flags *interesting* and *structurally odd* markets.
It is an analytics/explainer tool, **not** a betting tool and not financial advice.

## Status
Fully working. **Browse** the live Polymarket catalog by category, **follow** up to a
dozen events, and get deep tracking on just those: a board with live odds, a probability
bar, trend sparklines, and 24h volume; a plain-language Gemini explanation on any outcome
(generated once, cached); and a screener that surfaces contested markets and flags
probability-consistency anomalies. Browsing is a live, cached pass-through to Polymarket;
snapshotting, explanations, and the screener run only on the events you follow, so the
work (and API/LLM usage) stays bounded.

## Prerequisites
- WSL / Ubuntu, Python 3.12
- Docker (for Postgres)

## Setup & run (inside WSL)
```bash
cd "/home/eliran17/projects/polymarket fun"

# 1. Start Postgres (host port 5434)
docker compose up -d

# 2. One-time backend setup
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp ../.env.example .env          # adjust if needed

# 3. Run the API (also starts the poller in-process)
.venv/bin/python -m uvicorn app.main:app --reload --port 8011
```

## Run the frontend (inside WSL)
Use the nvm Node 24 toolchain (not the system Node 18, and avoid Windows npm):
```bash
export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"
cd "/home/eliran17/projects/polymarket fun/frontend"
npm install        # first time only
npm run dev        # http://localhost:5180  (proxies /api -> backend :8011)
```
Routes: `/` = homepage (what prediction markets are, with a live example),
`/following` = your watchlist dashboard, `/browse` = catalog by category,
`/event/<slug>` = a board (live preview if you don't follow it), `/screener`.
Boards refresh automatically every 60s. Needs the backend running.

## Tests
```bash
cd backend && .venv/bin/python -m pytest tests -v
```
Covers the Gamma payload quirks (JSON-string fields, placeholder markets, closed
sub-markets, Yes-by-label) and the news helpers. CI (`.github/workflows/ci.yml`)
runs the tests plus a frontend type-check/build on every push.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness check |
| GET | `/catalog/categories` | browsable top-level categories |
| GET | `/catalog?category=&offset=&limit=` | live catalog (cached pass-through) with a `following` flag |
| GET | `/watchlist` | events you follow |
| POST | `/watchlist/{slug}` | follow an event (also polls it once so its board fills in) |
| DELETE | `/watchlist/{slug}` | unfollow |
| GET | `/topics/{event_slug}` | a followed event's board: candidates with current odds + recent history |
| GET | `/preview/{event_slug}` | live board for an event you don't follow (nothing stored) |
| GET | `/markets/{market_id}/history?range=` | chart series: poller snapshots + CLOB backfill (`1d/1w/1m/all`) |
| GET | `/topics/{event_slug}/news` | related headlines (GNews photos with a key, Google News RSS otherwise) |
| GET | `/markets/{market_id}/explanation` | plain-language card (generated once via Gemini, then cached) |
| GET | `/screener` | contested feed + consistency flags (followed events only) |

Try it:
```bash
curl "http://127.0.0.1:8011/catalog?category=politics"
curl -X POST http://127.0.0.1:8011/watchlist/fed-decision-in-july-181
curl http://127.0.0.1:8011/screener
```

## What to track
Follow events from the **Browse** page in the UI (or `POST /watchlist/{slug}`). The
watchlist is the poller's work list. `backend/tracked.yaml` now only **seeds** the
watchlist on first run — after that, manage follows in the app.

## How it fits together
```
Browse ──(live, cached)──> Gamma catalog        (shallow: current odds only, unstored)
   │ follow
   ▼
watchlist table ──drives──> poller (every 60s) ──> Gamma API
                                 │
                                 ├─ upsert  events, markets   (mutable metadata)
                                 └─ append  snapshots         (price/volume time series)
                                                 │
                        FastAPI ──> board + explainer + screener   (followed events only)
```

## Data model
- **events** — a question that groups candidates (upserted)
- **markets** — one candidate / Yes-No market (upserted)
- **snapshots** — append-only price + volume readings over time (the trend data)
- **explanations** — cached Gemini card, one per market id
- **watchlist** — the events you follow (drives the poller)

## Notes
- The poller owns all calls to Polymarket and caches responses (30s TTL) so we never
  hammer their API. Endpoints only read from Postgres.
- Polymarket's JSON has quirks (JSON-encoded strings, closed sub-markets, placeholder
  markets) — all handled in `backend/app/polymarket.py`. See `CLAUDE.md` for the
  verified API reference.

## Deploy
Three pieces: a static **frontend**, an always-on **backend** (FastAPI + the 60s
poller), and **Postgres**.

- **Postgres** — any managed Postgres; put its connection string in the backend's
  `DATABASE_URL` (`postgresql+psycopg://…`).
- **Backend** — build the container in `backend/` (`backend/Dockerfile`). Env vars:
  `DATABASE_URL`, `GEMINI_API_KEY`, optional `GEMINI_MODEL` / `GNEWS_API_KEY`, and
  `ALLOWED_ORIGINS` = your frontend URL. The host injects `$PORT`. On first boot it
  creates tables and seeds the watchlist from `tracked.yaml`.
- **Frontend** — build `frontend/` with `VITE_API_BASE` set to the backend's public
  URL; deploy the static `dist/` (Vite framework preset on most static hosts).

Keep `GEMINI_API_KEY` on the backend only — it never ships to the browser.

## Roadmap
- ~~**Phase 2** — React + Tailwind board (odds, sparklines, 24h volume)~~ ✅
- ~~**Phase 3** — Gemini auto-explainer (plain-language market cards, cached per market)~~ ✅
- ~~**Phase 4** — screener (contested/hot feed + probability-consistency check)~~ ✅
