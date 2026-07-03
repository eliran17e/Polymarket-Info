// A minimal trend line. No axes, no fill — just the shape of recent movement.

interface Props {
  points: number[]; // yes_price values, oldest -> newest
  direction: "up" | "down" | "flat";
  width?: number;
  height?: number;
}

const COLOR = { up: "#1A8754", down: "#D64545", flat: "#9B9BA3" } as const;

export function Sparkline({ points, direction, width = 72, height = 24 }: Props) {
  const usable = points.filter((p) => p != null);
  if (usable.length < 2) {
    // Not enough history yet — a quiet baseline, never a broken chart.
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#ECECEC"
          strokeWidth={1.5}
        />
      </svg>
    );
  }

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const span = max - min || 1; // avoid divide-by-zero on a flat series
  const pad = 2;
  const stepX = (width - pad * 2) / (usable.length - 1);

  const d = usable
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={COLOR[direction]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
