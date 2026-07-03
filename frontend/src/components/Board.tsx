// The board: an event header + the outcome table. Reads top-to-bottom, leading
// outcome first (the backend already sorts by probability).

import { Topic } from "../api";
import { humanDate, usdCompact } from "../lib/format";
import { LABEL_TIPS, Term, annotate } from "../lib/glossary";
import { OutcomeRow } from "./OutcomeRow";
import { EmptyState } from "./states";
import { NewsStrip } from "./NewsStrip";

export function Board({
  topic,
  preview = false,
  onFollow,
}: {
  topic: Topic;
  preview?: boolean;
  onFollow?: () => void;
}) {
  const live = topic.active && !topic.closed;
  const totalVol = topic.candidates.reduce(
    (sum, c) => sum + (c.volume_24h ?? 0),
    0,
  );

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
      {/* Main column */}
      <div className="min-w-0">
        <header className="mb-6">
          <div className="flex items-start gap-3">
            {topic.image ? (
              <img
                src={topic.image}
                alt=""
                className="h-11 w-11 shrink-0 rounded-lg object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
                  {topic.title ?? topic.slug}
                </h1>
                <StatusPill live={!!live} />
              </div>
              <p className="mt-2 text-sm text-ink-600">
                <span>
                  <Term tip={LABEL_TIPS.resolves}>Resolves</Term> {humanDate(topic.end_date)}
                </span>
                <Dot />
                <span>{topic.candidates.length} outcomes</span>
                {totalVol > 0 && (
                  <>
                    <Dot />
                    <span className="tnum">{usdCompact(totalVol)} 24h volume</span>
                  </>
                )}
                <Dot />
                <a
                  href={`https://polymarket.com/event/${topic.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-600 underline-offset-2 hover:text-accent hover:underline"
                >
                  Open on Polymarket ↗
                </a>
              </p>
            </div>
          </div>
        </header>

        {preview && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent bg-accent-soft px-4 py-3">
            <p className="text-sm text-ink-900">
              You're previewing live odds. Follow to unlock price history, charts, and
              plain-language explanations.
            </p>
            {onFollow && (
              <button
                onClick={onFollow}
                className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                Follow
              </button>
            )}
          </div>
        )}

        {topic.candidates.length > 0 && (
          <p className="mb-2 text-caption text-ink-400">
            Select an outcome for charts, a payout calculator, and a plain-language
            explanation.
          </p>
        )}

        {topic.candidates.length === 0 ? (
          <EmptyState
            title="No outcomes yet"
            body="We're tracking this event but haven't recorded any prices. Check back in a minute."
          />
        ) : (
          <section className="overflow-hidden rounded-card border border-line bg-surface">
            {/* Column header — utility caption, not loud */}
            <div className="grid grid-cols-[1fr_auto] gap-x-6 px-4 py-2.5 text-micro uppercase text-ink-400 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_72px_72px_80px]">
              <span>Outcome</span>
              <span className="justify-self-end sm:justify-self-stretch">
                <Term tip={LABEL_TIPS.chance}>Chance</Term>
              </span>
              <span className="hidden justify-self-end sm:block">
                <Term tip={LABEL_TIPS.move24h}>24h</Term>
              </span>
              <span className="hidden justify-self-end sm:block">
                <Term tip={LABEL_TIPS.volume}>Volume</Term>
              </span>
              <span className="hidden justify-self-end sm:block">Trend</span>
            </div>
            {topic.candidates.map((c) => (
              <OutcomeRow key={c.market_id} c={c} preview={preview} />
            ))}
          </section>
        )}

        <p className="mt-4 text-caption text-ink-400">
          {annotate(
            "Prices are the market's own implied probabilities, before fees and spread. This is an analytics tool, not financial advice.",
          )}
        </p>
      </div>

      {/* News sidebar — sticky on desktop, stacks below on mobile */}
      <aside className="mt-10 lg:mt-0 lg:sticky lg:top-8">
        <NewsStrip slug={topic.slug} />
      </aside>
    </div>
  );
}

function StatusPill({ live }: { live: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-micro uppercase ${
        live
          ? "border-line text-ink-600"
          : "border-line bg-page text-ink-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "bg-up" : "bg-ink-400"}`}
      />
      {live ? "Live" : "Resolved"}
    </span>
  );
}

function Dot() {
  return <span className="mx-2 text-ink-400">·</span>;
}
