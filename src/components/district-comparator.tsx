"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkline } from "@/components/sparkline";
import { StressBadge } from "@/components/stress-badge";
import { pct } from "@/lib/format";
import type { StressBand } from "@/lib/stress-index";

export interface CompareDistrict {
  id: string;
  name: string;
  reading: number | null;
  math: number | null;
  tested: number | null;
  score: number | null;
  band: StressBand | null;
  spark: (number | null)[];
}

const MAX_PINS = 3;

/**
 * Pin up to three districts for a side-by-side comparison. Pinning starts
 * from the most-stressed districts; the search box reaches any district.
 */
export function DistrictComparator({
  districts,
  stateAbbr,
}: {
  districts: CompareDistrict[];
  stateAbbr: string;
}) {
  const defaultPins = useMemo(
    () => districts.filter((d) => d.score != null).slice(0, MAX_PINS).map((d) => d.id),
    [districts],
  );
  const [pinned, setPinned] = useState<string[]>(defaultPins);
  const [query, setQuery] = useState("");

  const pinnedRows = pinned
    .map((id) => districts.find((d) => d.id === id))
    .filter((d): d is CompareDistrict => d != null);

  const suggestions = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return districts.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 8);
  }, [districts, query]);

  const toggle = (id: string) => {
    setPinned((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= MAX_PINS) return [...prev.slice(1), id];
      return [...prev, id];
    });
    setQuery("");
  };

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">District comparator</h3>
          <p className="text-[11.5px] text-muted">
            Pin up to {MAX_PINS} districts to compare proficiency, scale, and trajectory.
          </p>
        </div>
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a district…"
            className="w-56 rounded-md border border-line bg-card px-3 py-1.5 text-[12px] text-ink outline-none placeholder:text-muted focus:border-brand-400"
          />
          {suggestions.length > 0 ? (
            <ul className="absolute right-0 z-10 mt-1 w-72 overflow-hidden rounded-lg border border-line bg-card shadow-lg">
              {suggestions.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => toggle(d.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-hover"
                  >
                    <span className="truncate">{d.name}</span>
                    <span className="nums shrink-0 text-[11px] text-muted">
                      {pinned.includes(d.id) ? "pinned" : d.score != null ? `${Math.round(d.score)}` : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {pinnedRows.length === 0 ? (
        <p className="mt-3 text-[12px] text-muted">
          No districts pinned — use the search box to add one.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {pinnedRows.map((d) => (
            <div key={d.id} className="rounded-lg border border-line bg-canvas/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/us/${stateAbbr}/${d.id}`}
                  className="text-[12.5px] leading-4 font-semibold text-ink hover:text-brand-600"
                >
                  {d.name}
                </Link>
                <button
                  type="button"
                  onClick={() => toggle(d.id)}
                  className="text-[11px] text-muted hover:text-critical"
                  aria-label={`Remove ${d.name}`}
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <StressBadge score={d.score} band={d.band} />
                <Sparkline values={d.spark} width={90} height={26} />
              </div>
              <dl className="mt-2.5 grid grid-cols-3 gap-1 text-[11px]">
                <div>
                  <dt className="text-muted">Reading</dt>
                  <dd className="nums font-semibold text-ink">{pct(d.reading)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Math</dt>
                  <dd className="nums font-semibold text-ink">{pct(d.math)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Tested</dt>
                  <dd className="nums font-semibold text-ink">
                    {d.tested != null ? d.tested.toLocaleString("en-US") : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
