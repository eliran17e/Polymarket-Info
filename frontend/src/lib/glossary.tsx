// The jargon dictionary. A first-time visitor hits "bps" or "FOMC" within thirty
// seconds of opening a finance market — every definition here is one plain-English
// sentence, shown as a CSS tooltip (see .term in index.css).

import React from "react";

export const GLOSSARY: Record<string, string> = {
  bps: "Basis points — 100 bps = 1 percentage point. A 25 bps rate cut lowers rates by 0.25%.",
  Fed: "The US Federal Reserve — America's central bank. It sets interest rates.",
  FOMC: "The Fed's rate-setting committee. Its meetings decide US interest rates.",
  CPI: "Consumer Price Index — the main measure of US inflation.",
  GDP: "Gross domestic product — the total size of an economy's output.",
  spread: "The gap between the best buy and sell prices. Wide spreads eat into any apparent edge.",
};

// Reusable tooltips for our own UI labels (not auto-detected, applied by hand).
export const LABEL_TIPS = {
  chance: "The market's Yes price — the crowd's implied probability.",
  move24h: "How the chance changed over the last 24 hours, in percentage points.",
  volume: "Dollars traded in the last 24 hours. More volume = more people backing the price.",
  resolves: "When the outcome gets officially decided and correct shares pay $1.",
} as const;

/** A term with a dotted underline and a plain-English tooltip. */
export function Term({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <span className="term" tabIndex={0} data-tip={tip}>
      {children}
    </span>
  );
}

const TERM_RE = new RegExp(`\\b(${Object.keys(GLOSSARY).join("|")})\\b`, "g");

/** Wrap known jargon inside a plain string with <Term> tooltips. */
export function annotate(text: string | null | undefined): React.ReactNode {
  if (!text) return text;
  const parts = text.split(TERM_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    GLOSSARY[part] ? (
      <Term key={i} tip={GLOSSARY[part]}>
        {part}
      </Term>
    ) : (
      part
    ),
  );
}
