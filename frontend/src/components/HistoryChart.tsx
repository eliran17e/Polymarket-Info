// A proper price chart for one market: CLOB-backfilled history + live snapshots,
// with time-range tabs. Hand-rolled SVG — no chart library, keeps the bundle lean
// and the look consistent with the sparklines.

import { useEffect, useState } from "react";
import { HistoryPoint, HistoryRange, fetchHistory } from "../api";
import { pct } from "../lib/format";

const RANGES: { key: HistoryRange; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "1w", label: "1W" },
  { key: "1m", label: "1M" },
  { key: "all", label: "All" },
];

const W = 560;
const H = 150;
const PAD = 6;

export function HistoryChart({ marketId }: { marketId: string }) {
  const [range, setRange] = useState<HistoryRange>("1w");
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    let live = true;
    setPoints(null);
    fetchHistory(marketId, range)
      .then((p) => live && setPoints(p))
      .catch(() => live && setPoints([]));
    return () => {
      live = false;
    };
  }, [marketId, range]);

  const usable = (points ?? []).filter((p) => p.yes_price != null) as {
    ts: string;
    yes_price: number;
  }[];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-micro uppercase text-ink-400">Price history</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2 py-0.5 text-caption transition-colors ${
                r.key === range
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-400 hover:text-ink-900"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {points === null ? (
        <div className="h-[150px] animate-pulse rounded-md bg-line/50" />
      ) : usable.length < 2 ? (
        <div className="flex h-[150px] items-center justify-center rounded-md border border-line text-sm text-ink-400">
          Not enough history yet — check back soon.
        </div>
      ) : (
        <Chart points={usable} />
      )}
    </div>
  );
}

function Chart({ points }: { points: { ts: string; yes_price: number }[] }) {
  const values = points.map((p) => p.yes_price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 0.01;

  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  const last = values[values.length - 1];
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Price history chart">
        <path d={area} fill="#EDEDFB" />
        <path d={line} fill="none" stroke="#5B5BD6" strokeWidth={1.75} strokeLinejoin="round" />
        <circle cx={x(values.length - 1)} cy={y(last)} r={3} fill="#5B5BD6" />
      </svg>
      <div className="tnum mt-1 flex justify-between text-caption text-ink-400">
        <span>{fmtDate(points[0].ts)}</span>
        <span>
          low {pct(min)} · high {pct(max)} · now{" "}
          <span className="font-medium text-ink-900">{pct(last)}</span>
        </span>
        <span>{fmtDate(points[points.length - 1].ts)}</span>
      </div>
    </div>
  );
}
