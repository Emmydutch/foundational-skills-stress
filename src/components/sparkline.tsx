/** Inline SVG sparkline — server-renderable, no client JS. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  color = "var(--color-chart-math)",
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length < 2) {
    return <div className="h-[32px] w-[120px] rounded bg-canvas" aria-hidden />;
  }
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const span = max - min || 1;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);
  const points = values
    .map((v, i) => {
      if (v == null) return null;
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((p): p is string => p != null)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-label="Trend sparkline"
    >
      <polyline points={points} fill="none" style={{ stroke: color }} strokeWidth={1.6} strokeLinejoin="round" />
      {values.length > 0 && values[values.length - 1] != null ? (
        <circle
          cx={width - pad}
          cy={
            pad +
            (1 -
              ((values[values.length - 1] as number) - min) / span) *
              (height - pad * 2)
          }
          r={2.2}
          style={{ fill: color }}
        />
      ) : null}
    </svg>
  );
}
