// The one section-header style used everywhere (screener, news, following sections)
// so sections read consistently across pages.

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      {hint && <p className="mt-0.5 text-caption text-ink-400">{hint}</p>}
    </div>
  );
}
