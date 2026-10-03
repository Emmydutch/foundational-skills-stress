import type { StressBand } from "@/lib/stress-index";

const ZONES: { band: StressBand; from: number; to: number }[] = [
  { band: "stable", from: 0, to: 25 },
  { band: "watch", from: 25, to: 50 },
  { band: "elevated", from: 50, to: 75 },
  { band: "critical", from: 75, to: 100 },
];

/** Band -> CSS variable so the gauge repaints with the active theme. */
const BAND_VAR: Record<StressBand, string> = {
  stable: "var(--color-stable)",
  watch: "var(--color-watch)",
  elevated: "var(--color-elevated)",
  critical: "var(--color-critical)",
};

/**
 * Semicircular 0–100 gauge with the four band zones and a needle at the score.
 * Pure SVG — server-renderable, no client JS.
 */
export function StressGauge({ score, band, size = 180 }: { score: number | null; band: StressBand | null; size?: number }) {
  const width = size;
  const height = size * 0.62;
  const cx = width / 2;
  const cy = height * 0.92;
  const r = width * 0.42;
  const stroke = width * 0.09;

  const angleFor = (value: number) => Math.PI * (1 - Math.min(100, Math.max(0, value)) / 100);

  const arcPath = (from: number, to: number) => {
    const a1 = angleFor(from);
    const a2 = angleFor(to);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2);
    const y2 = cy - r * Math.sin(a2);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const needleAngle = score == null ? null : angleFor(score);
  const nx = needleAngle == null ? null : cx + (r - stroke * 0.6) * Math.cos(needleAngle);
  const ny = needleAngle == null ? null : cy - (r - stroke * 0.6) * Math.sin(needleAngle);
  const color = band ? BAND_VAR[band] : "var(--color-muted)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stress index gauge">
      {ZONES.map((z) => (
        <path
          key={z.band}
          d={arcPath(z.from, z.to)}
          style={{ stroke: BAND_VAR[z.band] }}
          strokeOpacity={0.22}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="butt"
        />
      ))}
      {score != null && nx != null && ny != null ? (
        <>
          <path
            d={arcPath(0, Math.min(100, Math.max(0, score)))}
            style={{ stroke: color }}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
          />
          <line x1={cx} y1={cy} x2={nx} y2={ny} style={{ stroke: color }} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={4} style={{ fill: color }} />
          <text
            x={cx}
            y={cy - r * 0.28}
            textAnchor="middle"
            fontSize={width * 0.16}
            fontWeight={650}
            className="fill-ink nums"
          >
            {Math.round(score)}
          </text>
          <text x={cx} y={cy - r * 0.02} textAnchor="middle" fontSize={width * 0.062} className="fill-muted">
            of 100
          </text>
        </>
      ) : (
        <text x={cx} y={cy - r * 0.3} textAnchor="middle" fontSize={width * 0.08} className="fill-muted">
          Insufficient data
        </text>
      )}
    </svg>
  );
}
