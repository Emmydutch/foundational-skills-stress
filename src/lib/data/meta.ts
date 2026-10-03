import type { FeedMeta, SnapshotMeta } from "@/lib/types";

/** Adapts snapshot provenance to the freshness-chip meta shape. */
export function snapshotFeedMeta(meta: SnapshotMeta, degraded = false): FeedMeta {
  return {
    source: meta.source,
    sourceUrl: meta.sourceUrl,
    fetchedAt: meta.generatedAt,
    mode: "snapshot",
    schoolYear: meta.schoolYear,
    degraded,
    note: meta.license,
  };
}
