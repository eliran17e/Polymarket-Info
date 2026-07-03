// The homepage: explains what prediction markets are for people who've never seen
// one, using LIVE data as the teaching material — the hero translates a real
// trending market into plain English.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CatalogEvent, fetchCatalog } from "../api";
import { pct, usdCompact } from "../lib/format";

export function LandingPage() {
  const [trending, setTrending] = useState<CatalogEvent[]>([]);

  useEffect(() => {
    fetchCatalog("trending", 0, 12)
      .then((page) => setTrending(page.events))
      .catch(() => setTrending([])); // hero falls back to a static example
  }, []);

  const example = trending.find((e) => (e.top_outcomes[0]?.yes_price ?? 0) < 0.9);
  const leader = example?.top_outcomes[0];
  const totalVol = trending.reduce((s, e) => s + (e.volume_24h ?? 0), 0);

  return (
    <div>
      {/* Hero */}
      <section className="py-10 sm:py-16">
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-4xl">
          Prediction markets, made legible.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-ink-600">
          Thousands of people bet real money on real-world questions — elections, Fed
          decisions, world cups. Their prices are probability estimates, updated by
          the second. This site translates them into plain English.
        </p>

        {/* Live translation — the point of the product, demonstrated */}
        <div className="mt-8 max-w-xl rounded-card border border-line bg-surface p-5">
          <p className="text-micro uppercase tracking-wider text-ink-400">
            Live right now
          </p>
          {example && leader ? (
            <>
              <p className="mt-2 text-lg text-ink-900">
                The market gives <span className="font-semibold">{leader.name}</span> a{" "}
                <span className="tnum font-semibold text-accent">{pct(leader.yes_price)}</span>{" "}
                chance in “{example.title}”.
              </p>
              <p className="mt-2 text-sm text-ink-600">
                Not a pundit's opinion — the consensus of{" "}
                <span className="tnum">{usdCompact(example.volume_24h)}</span> traded in
                the last 24 hours.{" "}
                <Link
                  to={`/event/${example.slug}`}
                  className="font-medium text-accent hover:underline"
                >
                  See the full board →
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-2 text-lg text-ink-900">
              A market priced at 32¢ is saying: “about a 32% chance this happens.”
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/browse"
            className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Browse live markets
          </Link>
          <Link
            to="/following"
            className="rounded-md border border-line-strong px-5 py-2.5 text-sm font-medium text-ink-900 transition-colors hover:bg-surface"
          >
            Your watchlist
          </Link>
        </div>
        {totalVol > 0 && (
          <p className="mt-4 text-caption text-ink-400 tnum">
            {usdCompact(totalVol)} traded across today's top markets alone.
          </p>
        )}
      </section>

      {/* How to read a market — a real sequence, so numbering carries meaning */}
      <section className="border-t border-line py-10 sm:py-14">
        <h2 className="text-xl font-semibold text-ink-900">How to read a market</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          <Step n="1" title="The price is the probability">
            Every outcome trades between 0¢ and $1. A “Yes” share at 32¢ means the
            crowd puts roughly a 32% chance on it happening.
          </Step>
          <Step n="2" title="Right answers pay $1">
            If your outcome happens, each share pays exactly $1. Buy at 32¢ and you
            roughly triple your stake — low prices pay big precisely because they're
            unlikely.
          </Step>
          <Step n="3" title="Rivals should sum to 100%">
            When outcomes are mutually exclusive — one winner — their chances should
            add up to about 100%. When they don't, something's off. We flag those.
          </Step>
        </div>
      </section>

      {/* What this site adds */}
      <section className="border-t border-line py-10 sm:py-14">
        <h2 className="text-xl font-semibold text-ink-900">What this site adds</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Feature
            to="/browse"
            title="Follow what matters to you"
            body="Browse the whole catalog, follow up to a dozen markets, and get price history, charts, and related news on just those."
          />
          <Feature
            to="/following"
            title="Plain-language explanations"
            body="Every outcome gets an AI-written card: what it means, what makes “Yes” come true — grounded only in the market's official rules."
          />
          <Feature
            to="/screener"
            title="A screener for oddities"
            body="Contested markets worth watching, and structural anomalies — like rival outcomes that don't sum to 100%."
          />
        </div>
      </section>

      {/* Worth knowing */}
      <section className="border-t border-line py-10 sm:py-14">
        <h2 className="text-xl font-semibold text-ink-900">Worth knowing</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Fact title="Markets have a track record.">
            Research on prediction markets — like the Iowa Electronic Markets, run
            since 1988 — found their election forecasts often matched or beat major
            polls.
          </Fact>
          <Fact title="They react in minutes, not weeks.">
            Polls take days to run. Market prices absorb breaking news almost
            instantly — you can literally watch a probability move during an event.
          </Fact>
          <Fact title="The price isn't magic.">
            It's just the point where buyers and sellers agree. Thin markets with
            little volume can be noisy — that's why volume is shown next to every
            price here.
          </Fact>
        </div>
      </section>

      <p className="border-t border-line py-8 text-caption text-ink-400">
        Polymarket Insight is an independent analytics and explainer tool. It is not
        affiliated with Polymarket and nothing here is financial advice.
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="tnum text-2xl font-semibold text-accent">{n}</p>
      <p className="mt-2 text-base font-medium text-ink-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}

function Feature({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link
      to={to}
      className="rounded-card border border-line bg-surface p-4 transition-colors hover:border-accent"
    >
      <p className="text-base font-medium text-ink-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{body}</p>
    </Link>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-base font-medium text-ink-900">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{children}</p>
    </div>
  );
}
