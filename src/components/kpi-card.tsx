import type { ReactNode } from "react";
import { Sparkline } from "@/components/sparkline";

export function KpiCard({
  label,
  value,
  sub,
  delta,
  deltaGoodWhen,
  spark,
  sparkColor,
  footnote,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: number | null;
  /** Which direction of change is "good" — colors the delta accordingly. */
  deltaGoodWhen?: "up" | "down";
  spark?: (number | null)[];
  sparkColor?: string;
  footnote?: ReactNode;
}) {
  const deltaPositive =
    delta != null && (deltaGoodWhen === "down" ? delta < 0 : delta > 0);
  const deltaColor =
    delta == null ? "text-muted" : deltaPositive ? "text-stable" : "text-critical";
  const deltaSign = delta != null && delta > 0 ? "+" : "";

  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="label-xs">{label}</div>
      <div className="flex items-end justify-between gap-3">
        <div className="nums text-[26px] leading-8 font-semibold tracking-tight text-ink">
          {value}
        </div>
        {spark ? <Sparkline values={spark} color={sparkColor} /> : null}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        {delta != null ? (
          <span className={`nums font-semibold ${deltaColor}`}>
            {deltaSign}
            {delta.toFixed(1)} pts
          </span>
        ) : null}
        {sub ? <span>{sub}</span> : null}
      </div>
      {footnote ? <div className="text-[11px] text-muted">{footnote}</div> : null}
    </div>
  );
}
