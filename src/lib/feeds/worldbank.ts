// World Bank Open Data feed — the global layer of the dashboard.
//
// Three education indicators are pulled as full country series and reduced to
// latest + previous values per country. Responses are cached by the Next.js
// data cache (revalidate hourly); a failed revalidation serves the last good
// copy. A missing first fetch throws and the page renders a degraded state.

import type { CountryPoint, CountryRow, GlobalDataset } from "@/lib/types";

const WB = "https://api.worldbank.org/v2";
const REVALIDATE_SECONDS = 3600;
const FIRST_YEAR = 2015;

export const WB_INDICATORS = {
  lp: "SE.LPV.PRIM", // Learning poverty: % of children at end-of-primary age below minimum reading proficiency
  completion: "SE.PRM.CUAT.ZS", // Primary completion rate, total (% of relevant age group)
  oos: "SE.PRM.UNER.ZS", // Children out of school, primary (% of primary school age)
} as const;

interface WbCountryMeta {
  id: string;
  name: string;
  region: { id: string; value: string };
}

interface WbPoint {
  countryiso3code: string;
  date: string;
  value: number | string | null;
}

interface WbMeta {
  pages: number;
  total: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) throw new Error(`World Bank API responded ${res.status}`);
  return (await res.json()) as T;
}

/** Fetches all pages of a World Bank v2 endpoint (responses are [meta, rows]). */
async function fetchPaged<T>(base: string, maxPages = 10): Promise<T[]> {
  const first = await fetchJson<[WbMeta, T[]]>(`${base}&page=1`);
  const rows: T[] = [...(first[1] ?? [])];
  const pages = Math.min(first[0]?.pages ?? 1, maxPages);
  for (let page = 2; page <= pages; page++) {
    const next = await fetchJson<[WbMeta, T[]]>(`${base}&page=${page}`);
    rows.push(...(next[1] ?? []));
  }
  return rows;
}

function toNumber(v: number | string | null): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Builds a year -> value map for one indicator and one country. */
function seriesFor(points: WbPoint[], iso3: string, firstYear: number, lastYear: number): CountryPoint[] {
  const byYear = new Map<number, number | null>();
  for (const p of points) {
    if (p.countryiso3code !== iso3) continue;
    const year = Number(p.date);
    if (year >= firstYear && year <= lastYear) byYear.set(year, toNumber(p.value));
  }
  const out: CountryPoint[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    out.push({ year, value: byYear.get(year) ?? null });
  }
  return out;
}

function latestNonNull(series: CountryPoint[]): { latest: number | null; prev: number | null } {
  const values = series.filter((p) => p.value != null).map((p) => p.value as number);
  return {
    latest: values.length ? values[values.length - 1] : null,
    prev: values.length > 1 ? values[values.length - 2] : null,
  };
}

export async function getGlobalDataset(): Promise<GlobalDataset> {
  if (process.env.STRESS_FAIL_FEEDS?.includes("global")) {
    throw new Error("Forced failure (STRESS_FAIL_FEEDS=global)");
  }

  const lastYear = new Date().getFullYear();
  const yearRange = `date=${FIRST_YEAR}:${lastYear}`;

  const [countryMeta, lpPoints, completionPoints, oosPoints] = await Promise.all([
    fetchPaged<WbCountryMeta>(`${WB}/country?format=json&per_page=1000`),
    fetchPaged<WbPoint>(`${WB}/country/all/indicator/${WB_INDICATORS.lp}?format=json&per_page=2000&${yearRange}`),
    fetchPaged<WbPoint>(`${WB}/country/all/indicator/${WB_INDICATORS.completion}?format=json&per_page=2000&${yearRange}`),
    fetchPaged<WbPoint>(`${WB}/country/all/indicator/${WB_INDICATORS.oos}?format=json&per_page=2000&${yearRange}`),
  ]);

  // Keep only real countries: WB aggregates carry region id "NA".
  const real = countryMeta.filter(
    (c) => c.id && c.id.length === 3 && c.region && c.region.id !== "NA",
  );

  const rows: CountryRow[] = real
    .map((c) => {
      const lp = seriesFor(lpPoints, c.id, FIRST_YEAR, lastYear);
      const completion = seriesFor(completionPoints, c.id, FIRST_YEAR, lastYear);
      const oos = seriesFor(oosPoints, c.id, FIRST_YEAR, lastYear);
      const { latest, prev } = latestNonNull(lp);
      return {
        iso3: c.id,
        name: c.name,
        region: c.region.value,
        learningPoverty: latest,
        learningPovertyPrev: prev,
        completion: latestNonNull(completion).latest,
        outOfSchool: latestNonNull(oos).latest,
        series: { lp, completion, oos },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const years: number[] = [];
  for (let y = FIRST_YEAR; y <= lastYear; y++) years.push(y);

  return {
    rows,
    years,
    meta: {
      source: "World Bank Open Data (EdStats / WDI)",
      sourceUrl: "https://data.worldbank.org",
      fetchedAt: new Date().toISOString(),
      mode: "live",
    },
  };
}
