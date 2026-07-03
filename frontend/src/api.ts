// Types mirror the backend's /topics/{slug} response, plus the fetch helper.
//
// In dev, requests go to /api/* and Vite proxies them to the backend (vite.config.ts).
// In production there's no proxy, so set VITE_API_BASE to the backend's URL at build
// time (e.g. https://your-backend.onrender.com) and requests go straight there.
const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export interface HistoryPoint {
  ts: string;
  yes_price: number | null;
}

export interface Candidate {
  market_id: string;
  name: string | null;
  question: string | null;
  closed: boolean | null;
  yes_price: number | null;
  volume_24h: number | null;
  one_day_price_change: number | null;
  spread: number | null;
  history: HistoryPoint[];
}

export interface Topic {
  slug: string;
  title: string | null;
  image: string | null;
  description: string | null;
  active: boolean | null;
  closed: boolean | null;
  neg_risk: boolean | null;
  end_date: string | null;
  candidates: Candidate[];
  preview?: boolean;
  following?: boolean;
}

/** Live board for an event you don't follow yet (no history, nothing stored). */
export async function fetchPreview(slug: string): Promise<Topic> {
  const res = await fetch(`${API_BASE}/preview/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    let detail = `The server returned ${res.status}.`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

export type HistoryRange = "1d" | "1w" | "1m" | "all";

export async function fetchHistory(
  marketId: string,
  range: HistoryRange,
): Promise<HistoryPoint[]> {
  const res = await fetch(
    `${API_BASE}/markets/${encodeURIComponent(marketId)}/history?range=${range}`,
  );
  if (!res.ok) throw new ApiError(`The server returned ${res.status}.`, res.status);
  return (await res.json()).points;
}

export interface TopicSummary {
  slug: string;
  title: string | null;
  active: boolean | null;
  closed: boolean | null;
  end_date: string | null;
  num_markets: number;
}

export interface TopicsList {
  tracked: { slugs: string[]; tag_ids: string[] };
  events: TopicSummary[];
}

export async function fetchTopics(): Promise<TopicsList> {
  const res = await fetch(`${API_BASE}/topics`);
  if (!res.ok) throw new ApiError(`The server returned ${res.status}.`, res.status);
  return res.json();
}

export async function fetchTopic(slug: string): Promise<Topic> {
  const res = await fetch(`${API_BASE}/topics/${encodeURIComponent(slug)}`);
  if (res.status === 404) {
    throw new ApiError(`This market isn't being tracked yet.`, 404);
  }
  if (!res.ok) {
    throw new ApiError(`The server returned ${res.status}.`, res.status);
  }
  return res.json();
}

// --- catalog (browse) + watchlist (follow) -------------------------------- //
export interface Category {
  slug: string;
  label: string;
}

export interface OutcomePreview {
  name: string | null;
  yes_price: number | null;
}

export interface CatalogEvent {
  slug: string;
  title: string | null;
  image: string | null;
  volume_24h: number | null;
  end_date: string | null;
  num_outcomes: number;
  top_outcomes: OutcomePreview[];
  following: boolean;
}

export interface CatalogPage {
  category: string;
  offset: number;
  limit: number;
  events: CatalogEvent[];
}

export interface WatchLeader {
  market_id: string;
  name: string | null;
  yes_price: number | null;
  one_day_price_change: number | null;
  spark: (number | null)[];
}

export interface WatchItem {
  slug: string;
  title: string | null;
  image: string | null;
  closed: boolean;
  end_date: string | null;
  following: boolean;
  leader: WatchLeader | null;
  volume_24h: number | null;
  top_mover: { name: string | null; change: number | null } | null;
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE}/catalog/categories`);
  if (!res.ok) throw new ApiError(`The server returned ${res.status}.`, res.status);
  return (await res.json()).categories;
}

export async function fetchCatalog(
  category: string,
  offset = 0,
  limit = 20,
): Promise<CatalogPage> {
  const res = await fetch(
    `${API_BASE}/catalog?category=${encodeURIComponent(category)}&offset=${offset}&limit=${limit}`,
  );
  if (!res.ok) throw new ApiError(`The server returned ${res.status}.`, res.status);
  return res.json();
}

export async function fetchWatchlist(): Promise<{ items: WatchItem[]; max: number }> {
  const res = await fetch(`${API_BASE}/watchlist`);
  if (!res.ok) throw new ApiError(`The server returned ${res.status}.`, res.status);
  return res.json();
}

export async function follow(slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(slug)}`, { method: "POST" });
  if (!res.ok) {
    let detail = `The server returned ${res.status}.`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(detail, res.status);
  }
}

export async function unfollow(slug: string): Promise<void> {
  const res = await fetch(`${API_BASE}/watchlist/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!res.ok) throw new ApiError(`The server returned ${res.status}.`, res.status);
}

export interface ContestedRow {
  market_id: string;
  event_slug: string;
  event_title: string | null;
  name: string | null;
  yes_price: number;
  volume_24h: number;
  one_day_price_change: number;
  moving: boolean;
  end_date: string | null;
}

export interface ConsistencyRow {
  event_slug: string;
  event_title: string | null;
  num_markets: number;
  prob_sum: number;
  deviation: number;
  flagged: boolean;
}

export interface ScreenerData {
  contested: ContestedRow[];
  consistency: ConsistencyRow[];
  thresholds: {
    contested_price_range: [number, number];
    contested_min_volume_24h: number;
    notable_move: number;
    consistency_tolerance: number;
  };
}

export async function fetchScreener(): Promise<ScreenerData> {
  const res = await fetch(`${API_BASE}/screener`);
  if (!res.ok) throw new ApiError(`The server returned ${res.status}.`, res.status);
  return res.json();
}

export interface Article {
  title: string;
  source: string | null;
  favicon: string | null;
  image: string | null; // real article photo (GNews) — null on the RSS fallback
  link: string;
  published: string | null;
}

export async function fetchNews(slug: string): Promise<Article[]> {
  // Best-effort: on any failure return [] so the news strip simply hides.
  try {
    const res = await fetch(`${API_BASE}/topics/${encodeURIComponent(slug)}/news`);
    if (!res.ok) return [];
    return (await res.json()).articles ?? [];
  } catch {
    return [];
  }
}

export interface Explanation {
  market_id: string;
  summary: string;
  yes_meaning: string;
  no_meaning: string;
  yes_resolves: string;
  description_thin: boolean;
  model: string;
  generated_at: string | null;
}

export async function fetchExplanation(marketId: string): Promise<Explanation> {
  const res = await fetch(`${API_BASE}/markets/${encodeURIComponent(marketId)}/explanation`);
  if (!res.ok) {
    let detail = `The server returned ${res.status}.`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* keep default */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
