import type { FeedMeta } from "@/lib/types";
import { dateTime } from "@/lib/format";

/** One-line provenance footnote for data panels. */
export function SourceLine({ meta, extra }: { meta: FeedMeta; extra?: string }) {
  return (
    <p className="text-[11px] leading-4 text-muted">
      Source: {meta.source} · retrieved {dateTime(meta.fetchedAt)}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}
