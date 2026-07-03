// "Related news" sidebar for an event: source favicon + headline + source·date,
// linking out to the original. Best-effort — if there's nothing (or the feed fails),
// the whole strip hides.

import { useEffect, useState } from "react";
import { Article, fetchNews } from "../api";
import { relativeTime } from "../lib/format";
import { SectionHeader } from "./SectionHeader";

export function NewsStrip({ slug }: { slug: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchNews(slug).then((a) => {
      if (live) {
        setArticles(a);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [slug]);

  if (!loading && articles.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Related news" />

      {loading ? (
        <ul className="animate-pulse space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-card border border-line bg-surface p-3">
              <div className="h-3 w-full rounded bg-line" />
              <div className="mt-2 h-3 w-2/3 rounded bg-line" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {articles.map((a, i) => (
            <li key={i}>
              <a
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-3 rounded-card border border-line bg-surface p-3 transition-colors hover:border-accent"
              >
                {/* Real article photo when the GNews key is set; source favicon otherwise. */}
                {a.image ? (
                  <img
                    src={a.image}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 shrink-0 rounded-md object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : a.favicon ? (
                  <img
                    src={a.favicon}
                    alt=""
                    width={20}
                    height={20}
                    loading="lazy"
                    className="mt-0.5 h-5 w-5 shrink-0 rounded"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="line-clamp-3 text-sm text-ink-900 transition-colors group-hover:text-accent">
                    {a.title}
                  </p>
                  <p className="mt-1 text-caption text-ink-400">
                    {a.source}
                    {a.published ? ` · ${relativeTime(a.published)}` : ""}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-micro text-ink-400">
        Headlines via Google News — links open the original source.
      </p>
    </section>
  );
}
