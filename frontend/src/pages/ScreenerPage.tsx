// The screener: a contested-markets feed and a probability-consistency check.
// Everything here is framed as candidates to investigate — never advice.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

const EXPLAINER_KEY = "screener-explainer-dismissed";
import { ContestedRow, ConsistencyRow, ScreenerData, fetchScreener } from "../api";
import { pct, signedPoints, usdCompact, direction } from "../lib/format";
import { EmptyState, ErrorState } from "../components/states";
import { SectionHeader } from "../components/SectionHeader";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ScreenerData };

export function ScreenerPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", data: await fetchScreener() });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Screener</h1>
        <p className="mt-2 text-sm text-ink-600">
          Markets in play and structural oddities across everything we track.
        </p>
      </header>

      <NewHereExplainer />

      <p className="mb-8 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-600">
        These are candidates to investigate, not recommendations. Most apparent edges
        vanish once you account for fees and the bid/ask spread. Not financial advice.
      </p>

      {state.status === "loading" && <ScreenerSkeleton />}
      {state.status === "error" && <ErrorState message={state.message} onRetry={load} />}
      {state.status === "ready" && (
        <div className="space-y-10">
          <Contested rows={state.data.contested} />
          <Consistency
            rows={state.data.consistency}
            tolerance={state.data.thresholds.consistency_tolerance}
          />
        </div>
      )}
    </div>
  );
}

function NewHereExplainer() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(EXPLAINER_KEY) === "1",
  );
  if (dismissed) return null;

  return (
    <div className="mb-4 rounded-card border border-accent bg-accent-soft px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-ink-900">
          <p className="font-medium">New here? What this page shows</p>
          <p className="mt-1.5 text-ink-600">
            <span className="font-medium text-ink-900">Contested markets</span> are the
            ones the crowd genuinely disagrees about — priced between 15% and 85%, with
            real money moving. Near 99% or 1%, a market is basically decided; these
            aren't.
          </p>
          <p className="mt-1.5 text-ink-600">
            The <span className="font-medium text-ink-900">consistency check</span> adds
            up rival outcomes that can only have one winner. Together they should total
            about 100% — when they're meaningfully off, someone's price is likely wrong,
            which is worth understanding even if you never trade.
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem(EXPLAINER_KEY, "1");
            setDismissed(true);
          }}
          className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-1 text-sm font-medium text-ink-900 transition-colors hover:bg-page"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function Contested({ rows }: { rows: ContestedRow[] }) {
  return (
    <section>
      <SectionHeader
        title="Contested markets"
        hint="Open, actively traded, and priced between 15% and 85% — genuinely in play."
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing contested right now"
          body="No tracked market is both actively traded and priced away from near-certain. Check back as prices move."
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {rows.map((r) => (
            <ContestedItem key={r.market_id} r={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function ContestedItem({ r }: { r: ContestedRow }) {
  const dir = direction(r.one_day_price_change);
  const moveClass = { up: "text-up", down: "text-down", flat: "text-ink-400" }[dir];
  const arrow = { up: "▲", down: "▼", flat: "" }[dir];

  return (
    <Link
      to={`/event/${r.event_slug}`}
      className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 border-t border-line
                 px-4 py-3 transition-colors first:border-t-0 hover:bg-page
                 sm:grid-cols-[minmax(0,1fr)_88px_96px]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-ink-900">{r.name}</span>
          {r.moving && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-micro uppercase text-accent">
              Moving
            </span>
          )}
        </div>
        <span className="truncate text-caption text-ink-400">{r.event_title}</span>
      </div>

      <div className="justify-self-end text-right sm:justify-self-stretch">
        <span className="tnum text-lg font-semibold text-ink-900">{pct(r.yes_price)}</span>
      </div>

      <div className="col-span-2 flex items-center gap-4 text-sm tnum sm:col-span-1 sm:justify-end">
        <span className={moveClass}>
          {dir !== "flat" && <span className="mr-0.5 text-[10px]">{arrow}</span>}
          {signedPoints(r.one_day_price_change)}
        </span>
        <span className="text-ink-600">{usdCompact(r.volume_24h)}</span>
      </div>
    </Link>
  );
}

function Consistency({ rows, tolerance }: { rows: ConsistencyRow[]; tolerance: number }) {
  const flagged = rows.filter((r) => r.flagged);

  return (
    <section>
      <SectionHeader
        title="Consistency check"
        hint={`Mutually-exclusive outcomes should sum to 100%. Flagged when off by more than ${Math.round(
          tolerance * 100,
        )} points.`}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to check"
          body="No multi-candidate (negRisk) event is being tracked yet."
        />
      ) : (
        <>
          {flagged.length === 0 && (
            <p className="mb-3 text-sm text-ink-600">
              All {rows.length} checked events sum to within tolerance.
            </p>
          )}
          <div className="space-y-2">
            {rows.map((r) => (
              <ConsistencyItem key={r.event_slug} r={r} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ConsistencyItem({ r }: { r: ConsistencyRow }) {
  const sum = `${(r.prob_sum * 100).toFixed(1)}%`;
  const dev = `${signedPoints(r.deviation)} pts`;

  return (
    <Link
      to={`/event/${r.event_slug}`}
      className={`flex items-center justify-between gap-4 rounded-card border bg-surface px-4 py-3
                  transition-colors hover:bg-page ${
                    r.flagged ? "border-accent" : "border-line"
                  }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-ink-900">{r.event_title}</span>
          {r.flagged && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-micro uppercase text-accent">
              Anomaly
            </span>
          )}
        </div>
        <span className="text-caption text-ink-400">{r.num_markets} outcomes</span>
      </div>
      <div className="shrink-0 text-right">
        <div className="tnum text-lg font-semibold text-ink-900">{sum}</div>
        <div className="tnum text-caption text-ink-400">{dev} off 100%</div>
      </div>
    </Link>
  );
}

function ScreenerSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-5 w-40 rounded bg-line" />
      <div className="rounded-card border border-line bg-surface">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border-t border-line px-4 py-4 first:border-t-0">
            <div className="h-4 w-56 rounded bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
