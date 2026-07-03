// Your followed markets as a real dashboard: leader, odds, 24h move, sparkline and
// volume on every row — you shouldn't need to open a board to know what happened.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WatchItem, fetchWatchlist, unfollow } from "../api";
import { ErrorState } from "../components/states";
import { Sparkline } from "../components/Sparkline";
import { direction, pct, signedPoints, usdCompact } from "../lib/format";
import { toast } from "../lib/toast";

export function FollowingPage() {
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [max, setMax] = useState(12);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await fetchWatchlist();
      setItems(d.items);
      setMax(d.max);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (slug: string, title: string | null) => {
    setBusy(slug);
    try {
      await unfollow(slug);
      setItems((prev) => (prev ? prev.filter((i) => i.slug !== slug) : prev));
      toast(`Unfollowed ${title ?? slug}`);
    } catch {
      toast("Couldn't unfollow — try again");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Following</h1>
          <p className="mt-2 text-sm text-ink-600">
            Your deep-tracked markets — history, explanations, news, and the screener
            run on these.
          </p>
        </div>
        {items && (
          <span className="tnum shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink-600">
            {items.length}/{max}
          </span>
        )}
      </header>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && items === null && <FollowingSkeleton />}

      {!error && items && items.length === 0 && (
        <div className="rounded-card border border-line bg-surface px-6 py-16 text-center">
          <p className="text-lg font-medium text-ink-900">You're not following anything yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">
            Browse Polymarket and follow the markets you care about to start tracking them.
          </p>
          <Link
            to="/browse"
            className="mt-5 inline-block rounded-md border border-accent bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white"
          >
            Browse markets
          </Link>
        </div>
      )}

      {!error && items && items.length > 0 && (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {items.map((it) => (
            <FollowRow
              key={it.slug}
              item={it}
              busy={busy === it.slug}
              onUnfollow={() => remove(it.slug, it.title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FollowRow({
  item,
  busy,
  onUnfollow,
}: {
  item: WatchItem;
  busy: boolean;
  onUnfollow: () => void;
}) {
  const l = item.leader;
  const dir = direction(l?.one_day_price_change);
  const moveClass = { up: "text-up", down: "text-down", flat: "text-ink-400" }[dir];
  const arrow = { up: "▲", down: "▼", flat: "" }[dir];
  const spark = (l?.spark ?? []).filter((p): p is number => p != null);

  return (
    <div className="border-t border-line first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-3">
        {item.image ? (
          <img
            src={item.image}
            alt=""
            className="h-10 w-10 shrink-0 rounded-md object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/event/${item.slug}`}
              className="truncate text-base font-medium text-ink-900 hover:text-accent"
            >
              {item.title ?? item.slug}
            </Link>
            {item.closed && (
              <span className="shrink-0 rounded-full bg-page px-2 py-0.5 text-micro uppercase text-ink-400">
                Resolved
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-caption text-ink-400">
            {l?.name ? (
              <>
                {item.closed ? "Winner" : "Leader"}: {l.name}
                {item.volume_24h ? (
                  <span className="tnum"> · {usdCompact(item.volume_24h)} 24h</span>
                ) : null}
                {item.top_mover?.name && item.top_mover.change ? (
                  <span className="tnum">
                    {" "}
                    · biggest move: {item.top_mover.name}{" "}
                    {signedPoints(item.top_mover.change)}
                  </span>
                ) : null}
              </>
            ) : (
              "Collecting data…"
            )}
          </p>
        </div>

        {/* Leader odds + move + spark */}
        {l && (
          <div className="hidden shrink-0 items-center gap-4 sm:flex">
            <Sparkline points={spark} direction={dir} />
            <span className={`tnum w-14 text-right text-sm ${moveClass}`}>
              {dir !== "flat" && <span className="mr-0.5 text-[10px]">{arrow}</span>}
              {signedPoints(l.one_day_price_change)}
            </span>
            <span className="tnum w-16 text-right text-lg font-semibold text-ink-900">
              {pct(l.yes_price)}
            </span>
          </div>
        )}

        <button
          onClick={onUnfollow}
          disabled={busy}
          className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-sm text-ink-600 transition-colors hover:bg-page disabled:opacity-50"
        >
          Unfollow
        </button>
      </div>

      {/* Mobile: odds line under the title */}
      {l && (
        <div className="flex items-center gap-4 px-4 pb-3 pl-[68px] sm:hidden">
          <span className="tnum text-lg font-semibold text-ink-900">{pct(l.yes_price)}</span>
          <span className={`tnum text-sm ${moveClass}`}>
            {dir !== "flat" && <span className="mr-0.5 text-[10px]">{arrow}</span>}
            {signedPoints(l.one_day_price_change)}
          </span>
          <Sparkline points={spark} direction={dir} width={56} height={20} />
        </div>
      )}
    </div>
  );
}

function FollowingSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-card border border-line bg-surface">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-t border-line px-4 py-4 first:border-t-0">
          <div className="h-10 w-10 rounded-md bg-line" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 rounded bg-line" />
            <div className="h-3 w-1/2 rounded bg-line" />
          </div>
          <div className="h-5 w-14 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}
