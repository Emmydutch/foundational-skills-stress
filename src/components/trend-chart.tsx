"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendSeries {
  name: string;
  color: string;
  points: { label: string; value: number | null }[];
}

/** Multi-series trend chart used across global / US / district pages. */
export function TrendChart({
  series,
  height = 260,
  unit = "%",
  digits = 1,
  connectNulls = false,
}: {
  series: TrendSeries[];
  height?: number;
  unit?: string;
  digits?: number;
  connectNulls?: boolean;
}) {
  const labels = series[0]?.points.map((p) => p.label) ?? [];
  const data = labels.map((label, i) => {
    const row: Record<string, number | string | null> = { label };
    for (const s of series) row[s.name] = s.points[i]?.value ?? null;
    return row;
  });

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          {/* Chrome (grid, axes, ticks, cursor) is themed via CSS rules in globals.css. */}
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
            tickFormatter={(v: number) => `${v}${unit}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-card)",
              border: "1px solid var(--color-line)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--color-ink)",
              boxShadow: "0 4px 16px rgba(16,31,46,0.08)",
            }}
            labelStyle={{ color: "var(--color-muted)" }}
            formatter={(value) => [
              typeof value === "number" ? `${value.toFixed(digits)}${unit}` : "—",
            ]}
          />
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" /> : null}
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              style={{ stroke: s.color }}
              strokeWidth={2}
              dot={({ cx, cy }) => <circle cx={cx} cy={cy} r={2.5} style={{ fill: s.color }} />}
              activeDot={({ cx, cy }) => <circle cx={cx} cy={cy} r={4} style={{ fill: s.color }} />}
              connectNulls={connectNulls}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
