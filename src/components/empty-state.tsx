import type { ReactNode } from "react";

/**
 * Panel-level fallback. Rendered whenever a dataset is unavailable so the
 * dashboard never shows a blank hole — mirrors the freshness contract.
 */
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-start gap-1.5 border-dashed p-5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-watch" aria-hidden />
        <span className="text-[13px] font-semibold text-ink">{title}</span>
      </div>
      <p className="max-w-xl text-[12px] leading-5 text-muted">{detail}</p>
      {action}
    </div>
  );
}
