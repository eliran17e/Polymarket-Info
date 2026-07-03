// Browse the live Polymarket catalog by category. Every card links to a live
// preview board; follow up to a dozen events to deep-track them. The filter box
// also accepts a pasted Polymarket link, since the API has no text search.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ApiError,
  CatalogEvent,
  Category,
  fetchCatalog,
  fetchCategories,
  fetchWatchlist,
  follow,
  unfollow,
} from "../api";
import { EmptyState, ErrorState } from "../components/states";
import { EventCard } from "../components/EventCard";
import { toast } from "../lib/toast";

const PAGE = 20;

/** Extract an event slug from a pasted Polymarket URL (or a bare "/event/x" path). */
function slugFromInput(input: string): string | null {
  const m = input.match(/polymarket\.com\/event\/([^/?#\s]+)/i) ?? input.match(/^\/?event\/([^/?#\s]+)/i);
  return m ? m[1] : null;
}

export function BrowsePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState("trending");
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [followCount, setFollowCount] = useState<number | null>(null);
  const [followMax, setFollowMax] = useState(12);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
    fetchWatchlist()
      .then((d) => {
        setFollowCount(d.items.length);
        setFollowMax(d.max);
      })
      .catch(() => setFollowCount(null));
  }, []);

  const loadCategory = useCallback(async (cat: string) => {
    setStatus("loading");
    setExhausted(false);
    try {
      const page = await fetchCatalog(cat, 0, PAGE);
      setEvents(page.events);
      setExhausted(page.events.length < PAGE);
      setStatus("ready");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    loadCategory(active);
  }, [active, loadCategory]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await fetchCatalog(active, events.length, PAGE);
      setEvents((prev) => [...prev, ...page.events]);
      if (page.events.length < PAGE) setExhausted(true);
    } catch {
      setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = async (slug: string, next: boolean, title?: string | null) => {
    setBusySlug(slug);
    setEvents((prev) => prev.map((e) => (e.slug === slug ? { ...e, following: next } : e)));
    try {
      if (next) {
        await follow(slug);
        toast(`Following ${title ?? slug}`);
        setFollowCount((c) => (c === null ? c : c + 1));
      } else {
        await unfollow(slug);
        toast(`Unfollowed ${title ?? slug}`);
        setFollowCount((c) => (c === null ? c : Math.max(0, c - 1)));
      }
    } catch (e) {
      setEvents((prev) => prev.map((ev) => (ev.slug === slug ? { ...ev, following: !next } : ev)));
      toast(e instanceof ApiError ? e.message : "Couldn't update follow — try again");
    } finally {
      setBusySlug(null);
    }
  };

  const pastedSlug = slugFromInput(query.trim());
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || pastedSlug) return events;
    return events.filter((e) => (e.title ?? e.slug).toLowerCase().includes(q));
  }, [events, query, pastedSlug]);

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Browse markets</h1>
          <p className="mt-2 text-sm text-ink-600">
            Live odds across Polymarket. Follow the ones you care about to track their
            history, get plain-language explanations, and screen them.
          </p>
        </div>
        {followCount !== null && (
          <span className="tnum shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-600">
            {followCount}/{followMax}
          </span>
        )}
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter these markets, or paste a polymarket.com/event link…"
        aria-label="Filter markets or paste a Polymarket link"
        className="mb-4 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm
                   text-ink-900 placeholder:text-ink-400 focus:border-accent focus:outline-none"
      />

      {pastedSlug && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent bg-accent-soft px-4 py-3">
          <p className="min-w-0 truncate text-sm text-ink-900">
            Polymarket link detected: <span className="font-medium">{pastedSlug}</span>
          </p>
          <span className="flex shrink-0 gap-2">
            <Link
              to={`/event/${pastedSlug}`}
              className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-medium text-ink-900 transition-colors hover:bg-page"
            >
              Preview
            </Link>
            <button
              onClick={() => {
                toggle(pastedSlug, true, pastedSlug);
                setQuery("");
              }}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              Follow
            </button>
          </span>
        </div>
      )}

      <nav className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <button
            key={c.slug}
            onClick={() => setActive(c.slug)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              c.slug === active
                ? "border-accent-soft bg-accent-soft font-medium text-accent"
                : "border-transparent text-ink-600 hover:bg-surface hover:text-ink-900"
            }`}
          >
            {c.label}
          </button>
        ))}
      </nav>

      {status === "loading" && <BrowseSkeleton />}
      {status === "error" && <ErrorState message={errorMsg} onRetry={() => loadCategory(active)} />}
      {status === "ready" &&
        (filtered.length === 0 ? (
          <EmptyState
            title={query ? "No matches in the loaded markets" : "Nothing here"}
            body={
              query
                ? "The filter only searches loaded pages — try Load more, another category, or paste the market's Polymarket link."
                : "No open markets in this category right now."
            }
          />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((e) => (
                <EventCard
                  key={e.slug}
                  event={e}
                  busy={busySlug === e.slug}
                  onToggle={(slug, next) => toggle(slug, next, e.title)}
                />
              ))}
            </div>
            {!exhausted && !query && (
              <div className="mt-6 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-page disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ))}
    </div>
  );
}

function BrowseSkeleton() {
  return (
    <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-card border border-line bg-surface p-4">
          <div className="h-4 w-3/4 rounded bg-line" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-line" />
            <div className="h-3 w-5/6 rounded bg-line" />
          </div>
          <div className="mt-4 h-7 w-20 rounded-full bg-line" />
        </div>
      ))}
    </div>
  );
}
