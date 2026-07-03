// A browse-catalog card: live odds preview + a Follow toggle. Following an event is
// what unlocks the deep board (history, explainer, screener) for it.

import { Link } from "react-router-dom";
import { CatalogEvent } from "../api";
import { pct, usdCompact, humanDate } from "../lib/format";

export function EventCard({
  event,
  busy,
  onToggle,
}: {
  event: CatalogEvent;
  busy: boolean;
  onToggle: (slug: string, next: boolean) => void;
}) {
  const title = event.title ?? event.slug;

  return (
    <div className="flex flex-col rounded-card border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        {event.image ? (
          <img
            src={event.image}
            alt=""
            className="h-9 w-9 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {/* Every card links to a board — unfollowed events get a live preview. */}
          <Link
            to={`/event/${event.slug}`}
            className="line-clamp-2 text-base font-medium text-ink-900 hover:text-accent"
          >
            {title}
          </Link>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {event.top_outcomes.map((o, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-ink-600">{o.name}</span>
            <span className="tnum shrink-0 font-medium text-ink-900">{pct(o.yes_price)}</span>
          </div>
        ))}
        {event.top_outcomes.length === 0 && (
          <p className="text-sm text-ink-400">No open outcomes.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-caption text-ink-400">
          {event.volume_24h ? `${usdCompact(event.volume_24h)} 24h` : humanDate(event.end_date)}
        </span>
        <FollowButton following={event.following} busy={busy} onClick={() => onToggle(event.slug, !event.following)} />
      </div>
    </div>
  );
}

export function FollowButton({
  following,
  busy,
  onClick,
}: {
  following: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-pressed={following}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors disabled:opacity-50 ${
        following
          ? "border-line-strong text-ink-600 hover:bg-page"
          : "border-accent bg-accent-soft text-accent hover:bg-accent hover:text-white"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
