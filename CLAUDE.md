# Polymarket Insight Site — project notes for Claude

A web app that makes Polymarket prediction markets legible to normal people.
**Not** a betting tool. Treat the market's own price as the probability estimate;
our value-add is context, plain-language explanation, and structural anomaly flags.

## Stack
- Backend: Python + FastAPI (runs **inside WSL/Ubuntu**, venv at `backend/.venv`)
- DB: PostgreSQL 16 via Docker Compose — **host port 5434** (5432/5433 taken by other projects)
- Frontend (Phase 2): React + TypeScript + Vite + Tailwind
- Explainer (Phase 3): Google Gemini, **free tier**, a Flash / Flash-Lite model (never Pro). Key in backend env only.
- Scheduler: APScheduler, polls ~every 60s

## Product model (two tiers) — important
- **Browse** the whole Polymarket catalog: a live, TTL-cached pass-through to Gamma
  (`/catalog`), organized by curated category tags. Shallow — current odds only, nothing stored.
- **Follow** up to `MAX_FOLLOWS` (12) events → a `watchlist` table that **is the poller's
  work list** (it replaced `tracked.yaml`, which now only seeds the watchlist on first run).
- **Deep features run on follows only**: snapshot history, the Gemini explainer, and the
  screener are all scoped to watchlisted events. This keeps snapshotting + LLM usage bounded.
- Following an event triggers an immediate `poll_slugs([slug])` so its board has data at once.
  Unfollowing leaves prior data in the DB (board still viewable but goes stale; screener excludes it).

## Repo layout
```
docker-compose.yml         # Postgres 16 on host:5434
.env.example               # copy to .env (and/or backend/.env)
backend/
  requirements.txt
  tracked.yaml             # SEED ONLY now — bootstraps the watchlist on first run
  app/
    config.py              # env + tracked.yaml loader
    db.py                  # engine + get_session()
    models.py              # Event, Market, Snapshot, Explanation, WatchlistItem
    polymarket.py          # Gamma client + parser (owns JSON quirks); fetch_catalog()
    catalog.py             # curated category tags + browse-card summary
    watchlist.py           # follow/unfollow/list/seed (cap = MAX_FOLLOWS)
    screener.py            # contested + consistency (scoped to followed events)
    news.py                # related news: GNews (photos) when GNEWS_API_KEY set, else Google News RSS (favicons)
    backfill.py            # CLOB /prices-history backfill (thread; on follow + startup)
    gemini.py, explainer.py# Phase 3 explainer
    poller.py              # poll_once() polls the watchlist; poll_slugs() targeted
    main.py                # FastAPI endpoints
  tests/                   # pytest: parser quirks + news helpers (run: .venv/bin/python -m pytest tests)
.github/workflows/ci.yml   # CI: backend pytest + frontend build
```

## Endpoints
- `GET /catalog/categories`, `GET /catalog?category=&offset=&limit=` — browse (live, cached)
- `GET /watchlist`, `POST /watchlist/{slug}`, `DELETE /watchlist/{slug}` — follow/unfollow
- `GET /topics/{slug}` — a followed event's board (candidates + history; has `following` flag)
- `GET /preview/{slug}` — live ephemeral board for unfollowed events (nothing stored)
- `GET /markets/{id}/history?range=1d|1w|1m|all` — chart series (snapshots + CLOB backfill, ≤300 pts)
- `GET /topics/{slug}/news` — related headlines (cached 20min, link-out only)
- `GET /markets/{id}/explanation` — cached Gemini card
- `GET /screener` — contested feed + consistency flags (followed events only)
- `/watchlist` GET is ENRICHED: per item leader{name,yes_price,move,spark}, volume_24h, top_mover

## Run (inside WSL)
```bash
cd "/home/eliran17/projects/polymarket fun"
docker compose up -d                                   # Postgres on :5434
cd backend && cp ../.env.example .env                  # first time only
.venv/bin/python -m uvicorn app.main:app --port 8011   # starts API + poller
```

## Working agreement
- Build in small phases; finish one, let the user run it, then continue.
- The user is a junior dev — explain trade-offs, no black boxes.
- **Never trust Gamma field names from memory** — inspect the real payload first.
- Cache aggressively; never hammer the Polymarket API.
- No financial-advice framing anywhere in the UI.

---

## Polymarket API Reference (verified against real payloads)

**Base URLs**
- Gamma (catalog/metadata, public): `https://gamma-api.polymarket.com`
- CLOB (order book + price history): `https://clob.polymarket.com`
- Data (positions, trades, leaderboards): `https://data-api.polymarket.com`

**Mental model**
- An **event** groups one or more **markets**. A multi-candidate question is ONE
  event with MANY Yes/No markets (one per candidate).
- A market's **Yes price IS the implied probability** (0.32 ⇒ ~32%).

**Gamma endpoints we use**
- By slug: `GET /events?slug=<slug>`
- By tag: `GET /events?tag_id=<id>&active=true&closed=false`
- Tags: `GET /tags` (`?order=volume_24hr&ascending=false&limit=N`)
- Pagination: `limit` + `offset`

**Confirmed field map (Gamma event -> markets[])**
| Concept | Field | Notes |
|---|---|---|
| Candidate name | `groupItemTitle` | cleaner than `question` |
| Probability | `outcomePrices` -> `[yes, no]` | **JSON-string**, must `json.loads`; Yes = prob |
| Outcome labels | `outcomes` | JSON-string `["Yes","No"]` |
| Token ids | `clobTokenIds` | JSON-string; needed for CLOB history |
| 24h volume | `volume24hr` | **null on closed markets** |
| Recent move | `oneDayPriceChange` | drives screener |
| Spread | `bestBid`, `bestAsk`, `spread` | "edge vanishes after spread" caveat |
| Resolution text | `description` | ground truth for the explainer |
| State | `active`, `closed`, `endDate` | |
| Multi-candidate flag | event `negRisk` | relevant to consistency check |

**Gotchas (cause most bugs)**
- `outcomes` / `outcomePrices` / `clobTokenIds` are **JSON-encoded strings inside the JSON** — decode them.
- A sub-market can be `closed:true` inside an `active` event (eliminated candidate).
- Placeholder/junk markets exist with null prices (`bid:0, ask:1`) — tolerate, don't snapshot them.
- **No reliable free-text search** — `?q=` is ignored. Filter by slug or tag.
- Gamma is **eventually consistent** — a just-closed market may show `closed:false` briefly.
- Rate limit ~30 req/sec/IP; respect `Cache-Control` (30–60s). We use an in-process TTL cache keyed on full URL.

**CLOB (optional, Phase 2+ richer charts)**
- `GET /prices-history` returns historical prices for a market token.

---

## Frontend (Phase 2) — run notes
- `frontend/` is Vite 5 + React 18 + Tailwind 3 + react-router 6, Inter self-hosted via `@fontsource`.
- **Use the WSL nvm Node 24 toolchain**, not `/usr/bin/node` (18) and NOT Windows npm (WSL PATH
  interop pulls in `/mnt/c/.../npm` — always `export PATH="$HOME/.nvm/versions/node/v24.11.0/bin:$PATH"`).
- Dev server: `npm run dev` → http://localhost:5180 (fixed, strictPort). Proxies `/api/*` → backend :8011.
- Routes: `/` = LANDING (explainer homepage w/ live example), `/following` = watchlist dashboard,
  `/browse` = catalog, `/event/:slug` = board (falls back to live PREVIEW when not followed),
  `/screener`. Nav: Following / Browse / Screener; topic switcher (follows) shows on boards.
- Boards auto-refresh every 60s (silent), show "Updated Xs ago", flash changed prices (row-flash css).
- Expanded outcome row: HistoryChart (range tabs 1D/1W/1M/All) + PayoutCalculator + ExplanationPanel
  (chart/explanation gated behind following; preview shows calculator + follow nudge).
- Browse: filter box doubles as paste-a-polymarket-link (slugFromInput) → Preview/Follow; n/12 counter.
- Toasts via lib/toast.ts + Toaster in Layout. Shared SectionHeader component for all section titles.
- Newcomer layer: lib/glossary.tsx (GLOSSARY dict + <Term> CSS tooltip + annotate() that wraps
  jargon like bps/Fed/FOMC in any string — used on outcome names + column headers + disclaimers);
  "Open on Polymarket ↗" link-out on every board header; dismissible "New here?" explainer on
  /screener (localStorage key screener-explainer-dismissed). Positioning: the site is a GUIDE
  people read BEFORE Polymarket — plain language always beats trader shorthand.
- Frontend dev port is 5181 (5180 belongs to the user's HiBiz project).
- Preview tooling (`.claude/launch.json`) launches Vite **inside WSL** (`runtimeExecutable: "wsl"`) so it
  uses the Linux esbuild binary. `preview_screenshot` times out in this sandbox — use `preview_inspect`
  / `preview_eval` to verify rendering instead.

## Explainer (Phase 3) — notes
- `GET /markets/{id}/explanation` lazily generates a plain-language card via Gemini on
  first request, caches it in the `explanations` table, and serves cached forever
  (≤1 LLM call per market, tiny free-tier usage).
- Model via `GEMINI_MODEL` env, default `gemini-flash-lite-latest` (free Flash-Lite, never Pro).
  Key is backend-only (`GEMINI_API_KEY`).
- Structured output (responseSchema) → JSON: summary, yes_meaning, no_meaning,
  yes_resolves, description_thin. Prompt rule: ground resolution ONLY in the official
  `description`; never invent facts; flag thin descriptions.
- Frontend: expanding an outcome row shows a `PayoutCalculator` (pure in-house math:
  stake/price → payout, profit, return %; no green/red — reserved for price moves) plus
  the `ExplanationPanel`. Boards show a `NewsStrip` as a sticky right sidebar (source
  favicon + headline + link-out) on `lg`, stacking below on mobile.
- Color: `events.image` (thumbnail) stored + shown on board header, Following list, browse
  cards; the indigo accent is used for nav/tab/switcher active states and link hovers.
  News favicons via Google's favicon service (`s2/favicons?domain=`). Container is max-w-5xl.

## Screener (Phase 4) — notes
- `GET /screener` → `{contested, consistency, thresholds}` (`screener.py`, read-only over stored snapshots).
- contested: open markets priced 0.15–0.85, 24h volume ≥ $10k, future resolution, ranked by
  volume × recent-move. consistency: for **negRisk** events only (mutually exclusive outcomes),
  sum latest Yes prices across open markets; flag when off 100% by > 3pp.
- Frontend `/screener` page: contested feed + consistency flags, each links to the event board.
  Anomaly flag uses the **accent** (not green/red — those stay reserved for price moves).
- Framed as candidates to investigate, with a "not advice, edges vanish after fees/spread" note.

## Phase status
- [x] Phase 1 — data layer (poller + Postgres + read endpoints)
- [x] Phase 2 — frontend board (routing, topic switcher, states, mobile)
- [x] Phase 3 — Gemini auto-explainer (cache-once per market id)
- [x] Phase 4 — screener (contested feed + negRisk consistency check)
- [ ] Phase 3 — Gemini auto-explainer (cache once per market id)
- [ ] Phase 4 — screener + consistency check
