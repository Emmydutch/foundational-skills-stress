import { BAND_META, type StressBand } from "@/lib/stress-index";

export function StressBadge({
  score,
  band,
  showScore = true,
}: {
  score: number | null;
  band: StressBand | null;
  showScore?: boolean;
}) {
  if (band == null) {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-medium text-muted">
        Insufficient data
      </span>
    );
  }
  const meta = BAND_META[band];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold nums"
      style={{
        backgroundColor: `var(--color-${band}-soft)`,
        color: `var(--color-${band})`,
      }}
      title={`Stress score ${score?.toFixed(0) ?? "—"} · ${meta.label} (${meta.range})`}
    >
      {showScore && score != null ? `${Math.round(score)} · ` : null}
      {meta.label}
    </span>
  );
}
