// Number/date formatting. A data site lives or dies on this — keep it in one place.

/** 0.795 -> "79.5%". Whole numbers drop the decimal: 0.18 -> "18%". */
export function pct(value: number | null | undefined): string {
  if (value == null) return "—";
  const p = value * 100;
  const decimals = p >= 10 || p === 0 ? 0 : 1; // tiny odds keep one decimal
  return `${p.toFixed(p < 1 && p > 0 ? 1 : decimals)}%`;
}

/** A signed price move in percentage points: 0.009 -> "+0.9", -0.01 -> "-1.0". */
export function signedPoints(value: number | null | undefined): string {
  if (value == null) return "—";
  const pts = value * 100;
  const sign = pts > 0 ? "+" : pts < 0 ? "−" : "";
  return `${sign}${Math.abs(pts).toFixed(1)}`;
}

/** 1234567 -> "$1.2M", 12345 -> "$12.3K", 850 -> "$850". */
export function usdCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

/** "2026-07-29T00:00:00+00:00" -> "Jul 29, 2026". */
export function humanDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "2026-06-30T..." -> "today" / "5h ago" / "3d ago" / "2mo ago". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export type Direction = "up" | "down" | "flat";

export function direction(value: number | null | undefined): Direction {
  if (value == null || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}
