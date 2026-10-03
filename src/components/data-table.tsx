"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Sparkline } from "@/components/sparkline";
import { StressBadge } from "@/components/stress-badge";
import type { StressBand } from "@/lib/stress-index";

/**
 * Serializable cell spec — server pages build plain data; this client
 * component renders and sorts it. (Functions cannot cross the RSC boundary.)
 */
export type TableCell =
  | { kind: "text"; value: string; tone?: "default" | "muted" | "stable" | "critical"; strong?: boolean }
  | { kind: "link"; value: string; href: string }
  | { kind: "stress"; score: number | null; band: StressBand | null }
  | { kind: "spark"; values: (number | null)[]; color?: string; width?: number; height?: number };

export interface TableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
}

/** Facet filter spec — server pages build plain option lists; the client filters. */
export interface TableFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface TableRow {
  key: string;
  cells: TableCell[];
  /** Sort values parallel to columns; null pushes the row last. */
  sort?: (number | string | null)[];
  /** Plain-text haystack for the search box. */
  search?: string;
  /** Facet values by filter key — a row matches when every active filter equals its facet value. */
  facets?: Record<string, string>;
}

const EMPTY_FILTERS: TableFilter[] = [];

const TONE_CLASS: Record<string, string> = {
  default: "text-ink",
  muted: "text-muted",
  stable: "text-stable",
  critical: "text-critical",
};

function Cell({ cell }: { cell: TableCell }) {
  switch (cell.kind) {
    case "text":
      return (
        <span
          className={`${TONE_CLASS[cell.tone ?? "default"] ?? "text-ink"} ${
            cell.strong ? "font-medium" : ""
          }`}
        >
          {cell.value}
        </span>
      );
    case "link":
      return (
        <Link href={cell.href} className="font-medium text-ink hover:text-brand-600 hover:underline">
          {cell.value}
        </Link>
      );
    case "stress":
      return <StressBadge score={cell.score} band={cell.band} />;
    case "spark":
      return (
        <Sparkline
          values={cell.values}
          color={cell.color}
          width={cell.width ?? 90}
          height={cell.height ?? 24}
        />
      );
  }
}

/**
 * Client-side sortable table for league tables. Search + sort run in the
 * browser so large district lists stay interactive without extra requests.
 */
export function DataTable({
  columns,
  rows,
  initialSortKey,
  initialSortDesc = true,
  searchPlaceholder = "Search…",
  filters,
  limit,
}: {
  columns: TableColumn[];
  rows: TableRow[];
  initialSortKey?: string;
  initialSortDesc?: boolean;
  searchPlaceholder?: string;
  filters?: TableFilter[];
  limit?: number;
}) {
  const searchable = rows.some((r) => r.search != null);
  const filterDefs = filters ?? EMPTY_FILTERS;

  const [sortKey, setSortKey] = useState<string | null>(initialSortKey ?? null);
  const [sortDesc, setSortDesc] = useState(initialSortDesc);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    let out = rows;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => (r.search ?? "").toLowerCase().includes(q));
    }
    const active = filterDefs.filter((f) => selected[f.key]);
    if (active.length > 0) {
      out = out.filter((r) => active.every((f) => r.facets?.[f.key] === selected[f.key]));
    }
    return out;
  }, [rows, query, selected, filterDefs]);

  const sorted = useMemo(() => {
    if (sortKey == null) return filtered;
    const idx = columns.findIndex((c) => c.key === sortKey);
    if (idx < 0) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const va = a.sort?.[idx] ?? null;
      const vb = b.sort?.[idx] ?? null;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "string" || typeof vb === "string"
          ? String(va).localeCompare(String(vb))
          : (va as number) - (vb as number);
      return sortDesc ? -cmp : cmp;
    });
    return copy;
  }, [filtered, columns, sortKey, sortDesc]);

  const visible = limit != null && sorted.length > limit ? sorted.slice(0, limit) : sorted;

  return (
    <div>
      {searchable || filterDefs.length > 0 ? (
        <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          {searchable ? (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full max-w-xs rounded-md border border-line bg-card px-3 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-brand-400"
            />
          ) : null}
          {filterDefs.map((f) => (
            <label key={f.key} className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold tracking-wider text-muted uppercase">
                {f.label}
              </span>
              <select
                value={selected[f.key] ?? ""}
                onChange={(e) => setSelected((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="rounded-md border border-line bg-card px-2 py-1.5 text-[12px] text-ink outline-none focus:border-brand-400"
              >
                <option value="">All</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {query.trim() || filterDefs.some((f) => selected[f.key]) ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelected({});
              }}
              className="text-[11.5px] font-medium text-brand-600 hover:underline"
            >
              Reset
            </button>
          ) : null}
          <span className="nums ml-auto shrink-0 text-[11px] text-muted">
            {filtered.length === rows.length ? `${rows.length} rows` : `${filtered.length} of ${rows.length}`}
          </span>
        </div>
      ) : null}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left">
              {columns.map((c) => {
                const active = c.key === sortKey;
                const sortable = c.sortable !== false;
                return (
                  <th
                    key={c.key}
                    className={`px-3 py-2 text-[11px] font-semibold tracking-wider text-muted uppercase ${
                      c.align === "right" ? "text-right" : ""
                    } ${sortable ? "cursor-pointer select-none hover:text-ink" : ""}`}
                    aria-sort={active ? (sortDesc ? "descending" : "ascending") : undefined}
                    onClick={
                      sortable
                        ? () => {
                            if (active) setSortDesc((d) => !d);
                            else {
                              setSortKey(c.key);
                              setSortDesc(true);
                            }
                          }
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sortable ? (
                        <span className={active ? "text-brand-600" : "text-line"}>
                          {active ? (sortDesc ? "▾" : "▴") : "▾"}
                        </span>
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-muted">
                  No rows match the current search or filters.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.key} className="border-b border-line/60 last:border-0 hover:bg-hover">
                  {row.cells.map((cell, i) => (
                    <td
                      key={columns[i]?.key ?? i}
                      className={`px-3 py-2 ${columns[i]?.align === "right" ? "text-right nums" : ""}`}
                    >
                      <Cell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {limit != null && sorted.length > limit ? (
        <p className="mt-2 text-[11px] text-muted">
          Showing top {limit} of {sorted.length} rows — refine with search or column sort.
        </p>
      ) : null}
    </div>
  );
}
