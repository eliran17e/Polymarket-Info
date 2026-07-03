// One candidate row. The signature element: a faint probability bar fills behind
// the name + chance cells, so the whole table reads as a horizontal bar chart you
// can also scan as a table. Clicking a row expands a plain-language explanation.

import { useEffect, useRef, useState } from "react";
import { Candidate } from "../api";
import { pct, signedPoints, usdCompact, direction } from "../lib/format";
import { Sparkline } from "./Sparkline";
import { ExplanationPanel } from "./ExplanationPanel";
import { PayoutCalculator } from "./PayoutCalculator";
import { HistoryChart } from "./HistoryChart";
import { annotate } from "../lib/glossary";

const moveClass = { up: "text-up", down: "text-down", flat: "text-ink-400" };
const arrow = { up: "▲", down: "▼", flat: "" };

export function OutcomeRow({ c, preview = false }: { c: Candidate; preview?: boolean }) {
  const [open, setOpen] = useState(false);
  const fill = Math.max(0, Math.min(1, c.yes_price ?? 0)) * 100;
  const dir = direction(c.one_day_price_change);
  const history = c.history.map((h) => h.yes_price ?? 0);
  const panelId = `exp-${c.market_id}`;

  // Flash briefly when the live price changes under us (60s silent refresh).
  const [flash, setFlash] = useState(false);
  const prevPrice = useRef<number | null>(c.yes_price);
  useEffect(() => {
    if (prevPrice.current !== null && c.yes_price !== null && prevPrice.current !== c.yes_price) {
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 1400);
      return () => clearTimeout(id);
    }
    prevPrice.current = c.yes_price;
  }, [c.yes_price]);
  useEffect(() => {
    prevPrice.current = c.yes_price;
  });

  return (
    <div className="border-t border-line">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`relative grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-6
                   gap-y-2 px-4 py-3 transition-colors hover:bg-page
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent
                   sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_72px_72px_80px]
                   ${flash ? "row-flash" : ""}`}
      >
        {/* Probability bar — the quiet accent fill behind the leading columns. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 bg-accent-soft"
          style={{ width: `${fill}%` }}
        />

        {/* Outcome name + expand chevron */}
        <div className="relative z-10 flex min-w-0 items-center gap-2">
          <Chevron open={open} />
          <span className="truncate text-base font-medium text-ink-900">
            {annotate(c.name ?? c.question)}
          </span>
          {c.closed ? (
            <span className="text-micro uppercase text-ink-400">Resolved</span>
          ) : null}
        </div>

        {/* Chance */}
        <div className="relative z-10 justify-self-end text-right sm:justify-self-stretch">
          <span className="tnum text-lg font-semibold text-ink-900">
            {pct(c.yes_price)}
          </span>
        </div>

        {/* 24h move — green/red ONLY here */}
        <div
          className={`relative z-10 hidden justify-self-end text-right text-sm tnum sm:block ${moveClass[dir]}`}
        >
          {dir !== "flat" && <span className="mr-0.5 text-[10px]">{arrow[dir]}</span>}
          {signedPoints(c.one_day_price_change)}
        </div>

        {/* 24h volume */}
        <div className="relative z-10 hidden justify-self-end text-right text-sm tnum text-ink-600 sm:block">
          {usdCompact(c.volume_24h)}
        </div>

        {/* Trend */}
        <div className="relative z-10 hidden justify-self-end sm:block">
          <Sparkline points={history} direction={dir} />
        </div>

        {/* Mobile-only secondary line: move + volume under the name */}
        <div className="relative z-10 col-span-2 -mt-1 flex items-center gap-4 text-sm tnum sm:hidden">
          <span className={moveClass[dir]}>
            {dir !== "flat" && <span className="mr-0.5 text-[10px]">{arrow[dir]}</span>}
            {signedPoints(c.one_day_price_change)}
          </span>
          <span className="text-ink-600">{usdCompact(c.volume_24h)} 24h</span>
        </div>
      </div>

      {open && (
        <div id={panelId} className="space-y-4 bg-page px-4 py-4 sm:px-5">
          {!preview && <HistoryChart marketId={c.market_id} />}
          <div className={preview ? "" : "border-t border-line pt-4"}>
            <PayoutCalculator name={c.name} price={c.yes_price} />
          </div>
          {preview ? (
            <p className="border-t border-line pt-4 text-sm text-ink-600">
              Follow this market to unlock price charts and a plain-language
              explanation of what each outcome means.
            </p>
          ) : (
            <div className="border-t border-line pt-4">
              <ExplanationPanel marketId={c.market_id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-90" : ""}`}
    >
      <path
        d="M4 2.5L7.5 6L4 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
