import Link from "next/link";
import type { ReactNode } from "react";

export interface RankBarItem {
  key: string;
  label: string;
  value: number;
  detail?: string;
  href?: string;
}

/**
 * Ranked horizontal bar list — used for "biggest movers" and "most stressed"
 * panels. Server-rendered; width scales to the max value in the set.
 */
export function RankBarList({
  items,
  formatValue,
  barColor = "var(--color-chart-math)",
  emptyText = "No data available.",
}: {
  items: RankBarItem[];
  formatValue: (v: number) => string;
  barColor?: string;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="text-[12px] text-muted">{emptyText}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item, idx) => {
        const widthPct = Math.max(2, (item.value / max) * 100);
        const inner: ReactNode = (
          <div className="flex w-full items-center gap-3">
            <span className="nums w-5 text-right text-[11px] font-semibold text-muted">{idx + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[12.5px] font-medium text-ink">{item.label}</span>
                <span className="nums shrink-0 text-[12px] font-semibold text-ink">{formatValue(item.value)}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPct}%`, backgroundColor: barColor }}
                />
              </div>
              {item.detail ? <div className="mt-0.5 text-[11px] text-muted">{item.detail}</div> : null}
            </div>
          </div>
        );
        return (
          <li key={item.key}>
            {item.href ? (
              <Link href={item.href} className="block rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-hover">
                {inner}
              </Link>
            ) : (
              <div className="px-1 py-0.5 -mx-1">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
