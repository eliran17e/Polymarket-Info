// A plain-language "what would $X do" calculator. Pure math on the price (which is
// the implied probability): stake S at price p buys S/p shares, each paying $1 if it
// resolves Yes. Note: green/red stay reserved for price movement, so gains/losses
// here use neutral + accent, not semantic colors.

import { useState } from "react";
import { pct } from "../lib/format";
import { annotate } from "../lib/glossary";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PayoutCalculator({ name, price }: { name: string | null; price: number | null }) {
  const [stake, setStake] = useState(10);

  if (price == null || price <= 0 || price >= 1) {
    return (
      <div>
        <p className="mb-1 text-micro uppercase text-ink-400">Payout calculator</p>
        <p className="text-sm text-ink-600">
          No live price to calculate a payout for this outcome.
        </p>
      </div>
    );
  }

  const payout = stake / price; // shares × $1
  const profit = payout - stake;
  const returnPct = ((1 - price) / price) * 100;

  return (
    <div>
      <p className="mb-2 text-micro uppercase text-ink-400">Payout calculator</p>

      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-600">
        <span>If</span>
        <span className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-400">
            $
          </span>
          <input
            type="number"
            min={0}
            step={1}
            value={stake}
            onChange={(e) => setStake(Math.max(0, Number(e.target.value) || 0))}
            aria-label="Stake in dollars"
            className="tnum w-24 rounded-md border border-line-strong bg-surface py-1.5 pl-5 pr-2 text-ink-900 focus:border-accent focus:outline-none"
          />
        </span>
        <span>
          resolves <span className="font-medium text-ink-900">Yes</span> on{" "}
          <span className="font-medium text-ink-900">{name}</span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
        <Stat label="You'd have" value={money(payout)} />
        <Stat label="Profit" value={`${profit >= 0 ? "+" : "−"}${money(Math.abs(profit))}`} accent />
        <Stat label="Return" value={`+${returnPct.toFixed(returnPct < 10 ? 1 : 0)}%`} />
        <Stat label="If No, you lose" value={money(stake)} muted />
      </div>

      <p className="mt-3 text-micro text-ink-400">
        The price implies about {pct(price)} chance.{" "}
        {annotate("Before fees and spread — this is an analytics tool, not advice.")}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-micro uppercase text-ink-400">{label}</p>
      <p
        className={`tnum text-lg font-semibold ${
          accent ? "text-accent" : muted ? "text-ink-600" : "text-ink-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
