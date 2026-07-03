// App shell: brand + primary nav (Following / Browse / Screener) and, on board
// routes, a quick switcher across your followed markets. The brand links home.

import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { WatchItem, fetchWatchlist } from "../api";
import { TopicSwitcher } from "../components/TopicSwitcher";
import { Toaster } from "../components/Toaster";

export function Layout() {
  const [follows, setFollows] = useState<WatchItem[]>([]);
  const { pathname } = useLocation();
  const onBoard = pathname.startsWith("/event/");

  // Refetch on navigation so the switcher reflects newly followed/unfollowed markets.
  useEffect(() => {
    fetchWatchlist()
      .then((d) => setFollows(d.items))
      .catch(() => setFollows([]));
  }, [pathname]);

  const section = pathname.startsWith("/browse")
    ? "browse"
    : pathname.startsWith("/screener")
      ? "screener"
      : pathname.startsWith("/following") || onBoard
        ? "following"
        : "home";

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-6 flex items-baseline justify-between">
          <Link
            to="/"
            className="text-micro font-medium uppercase tracking-wider text-accent hover:opacity-80"
          >
            Polymarket Insight
          </Link>
          <nav className="flex gap-1 text-sm">
            <PrimaryLink to="/following" active={section === "following"}>
              Following
            </PrimaryLink>
            <PrimaryLink to="/browse" active={section === "browse"}>
              Browse
            </PrimaryLink>
            <PrimaryLink to="/screener" active={section === "screener"}>
              Screener
            </PrimaryLink>
          </nav>
        </div>

        {onBoard && <TopicSwitcher items={follows} />}
        <Outlet />
      </div>
      <Toaster />
    </div>
  );
}

function PrimaryLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1 transition-colors ${
        active ? "bg-accent-soft font-medium text-accent" : "text-ink-400 hover:text-ink-900"
      }`}
    >
      {children}
    </Link>
  );
}
