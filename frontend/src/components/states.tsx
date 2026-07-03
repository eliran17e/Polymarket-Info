// Loading skeleton, empty state, error state — the places amateur data sites fall
// apart. The skeleton matches the real board's layout so nothing jumps on load.

export function BoardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-6 w-2/3 rounded bg-line" />
        <div className="mt-3 h-4 w-1/2 rounded bg-line" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="h-3 w-16 rounded bg-line" />
          <div className="h-3 w-10 rounded bg-line" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border-t border-line px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-40 rounded bg-line" />
              <div className="h-4 w-12 rounded bg-line" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-6 py-16 text-center">
      <p className="text-lg font-medium text-ink-900">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">{body}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-card border border-line bg-surface px-6 py-16 text-center">
      <p className="text-lg font-medium text-ink-900">Couldn't load this market</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 rounded-md border border-line-strong px-4 py-2 text-sm font-medium
                     text-ink-900 transition-colors hover:bg-page"
        >
          Try again
        </button>
      )}
    </div>
  );
}
