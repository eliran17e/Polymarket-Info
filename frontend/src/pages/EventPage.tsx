// One event's board. Followed events come from our DB (with history); anything
// else falls back to a live preview straight from Polymarket. Data refreshes
// silently every 60s so "LIVE" actually means live.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, Topic, fetchPreview, fetchTopic, follow } from "../api";
import { Board } from "../components/Board";
import { BoardSkeleton, EmptyState, ErrorState } from "../components/states";
import { toast } from "../lib/toast";

const REFRESH_MS = 60_000;

type State =
  | { status: "loading" }
  | { status: "error"; error: ApiError | Error }
  | { status: "ready"; topic: Topic; preview: boolean };

export function EventPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: "loading" });
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const fetchBoard = useCallback(async (): Promise<{ topic: Topic; preview: boolean }> => {
    try {
      const topic = await fetchTopic(slug);
      if (topic.following === false) {
        // Stored data outlives an unfollow but goes stale — prefer the live preview.
        return { topic: await fetchPreview(slug), preview: true };
      }
      return { topic, preview: false };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Never tracked — show a live preview instead of a dead end.
        return { topic: await fetchPreview(slug), preview: true };
      }
      throw e;
    }
  }, [slug]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const { topic, preview } = await fetchBoard();
      setState({ status: "ready", topic, preview });
      setUpdatedAt(Date.now());
    } catch (error) {
      setState({ status: "error", error: error as Error });
    }
  }, [fetchBoard]);

  useEffect(() => {
    load();
  }, [load]);

  // Silent refresh: update data in place, no skeleton flicker.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const { topic, preview } = await fetchBoard();
        setState((prev) =>
          prev.status === "ready" ? { status: "ready", topic, preview } : prev,
        );
        setUpdatedAt(Date.now());
      } catch {
        /* keep showing the last good data */
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchBoard]);

  const onFollow = async () => {
    try {
      await follow(slug);
      toast("Following — history and explanations unlocked");
      const { topic, preview } = await fetchBoard();
      setState({ status: "ready", topic, preview });
      setUpdatedAt(Date.now());
      navigate(`/event/${slug}`, { replace: true }); // refresh switcher via Layout
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't follow — try again");
    }
  };

  if (state.status === "loading") return <BoardSkeleton />;

  if (state.status === "error") {
    return state.error instanceof ApiError && state.error.status === 404 ? (
      <EmptyState
        title="Market not found"
        body="This event doesn't seem to exist on Polymarket. Check the link and try again."
      />
    ) : (
      <ErrorState message={state.error.message} onRetry={load} />
    );
  }

  return (
    <div>
      <Board
        topic={state.topic}
        preview={state.preview}
        onFollow={state.preview ? onFollow : undefined}
      />
      {updatedAt && <UpdatedAgo at={updatedAt} />}
    </div>
  );
}

function UpdatedAgo({ at }: { at: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
  const label = secs < 15 ? "just now" : secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  return (
    <p className="tnum mt-2 text-caption text-ink-400">
      Updated {label} · refreshes automatically
    </p>
  );
}
