import { relativeTime } from "@/lib/format";
import type { FeedMeta } from "@/lib/types";

/**
 * Freshness contract: every panel that renders feed data carries one of these.
 * Three states: live (green), snapshot tied to a school year (neutral), or
 * degraded (amber) when a live feed failed and last-known-good data is shown.
 */
export function FreshnessChip({ meta, label }: { meta: FeedMeta; label?: string }) {
  const degraded = Boolean(meta.degraded);
  const live = meta.mode === "live" && !degraded;

  const text =
    meta.mode === "snapshot"
      ? `Snapshot · ${meta.schoolYear ? `SY ${meta.schoolYear}` : "latest release"}`
      : live
        ? `Live · updated ${relativeTime(meta.fetchedAt)}`
        : "Last good data";

  const classes = degraded
    ? "border-watch-soft bg-watch-soft text-watch"
    : live
      ? "border-stable-soft bg-stable-soft text-stable"
      : "border-line bg-canvas text-muted";

  const dot = degraded ? "bg-watch" : live ? "bg-stable" : "bg-brand-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes}`}
      title={meta.note ?? meta.source}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label ? <span className="font-semibold">{label} ·</span> : null}
      {text}
    </span>
  );
}
