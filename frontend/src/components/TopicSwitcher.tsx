// Horizontal switcher across the followed markets, shown on board pages. Scrolls
// sideways on narrow screens so it never wraps or crowds the board.

import { NavLink } from "react-router-dom";

interface Item {
  slug: string;
  title: string | null;
}

export function TopicSwitcher({ items }: { items: Item[] }) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Followed markets"
      className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0
                 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((t) => (
        <NavLink
          key={t.slug}
          to={`/event/${t.slug}`}
          className={({ isActive }) =>
            `block max-w-[240px] shrink-0 truncate rounded-full border px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "border-accent-soft bg-accent-soft font-medium text-accent"
                : "border-transparent text-ink-600 hover:bg-surface hover:text-ink-900"
            }`
          }
        >
          {t.title ?? t.slug}
        </NavLink>
      ))}
    </nav>
  );
}
