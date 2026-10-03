// U.S. Census Bureau ACS feed — state poverty context for the stress index.
//
// Keyless queries work (rate-limited); set CENSUS_API_KEY to raise limits.
// Tries the most recent ACS 1-year releases in order and returns the first
// that is published. Cached daily; returns null when fully unavailable.

import type { FeedMeta } from "@/lib/types";

const REVALIDATE_SECONDS = 86400;
const YEARS = [2024, 2023, 2022, 2021];
let warnedAboutKey = false;

export interface PovertyDataset {
  byFips: Map<string, number>; // "06" -> 12.3
  year: number;
  meta: FeedMeta;
}

interface YearResult {
  byFips: Map<string, number>;
  year: number;
}

async function tryYear(year: number): Promise<YearResult | null> {
  const key = process.env.CENSUS_API_KEY ? `&key=${process.env.CENSUS_API_KEY}` : "";
  const url = `https://api.census.gov/data/${year}/acs/acs1?get=NAME,B17001_001E,B17001_002E&for=state:*${key}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!res.ok) return null;
  const text = await res.text();
  // The gateway serves an HTML page (status 200) when a key is required from
  // this network — treat it as unavailable rather than a JSON parse crash.
  if (text.trimStart().startsWith("<")) {
    if (!warnedAboutKey) {
      warnedAboutKey = true;
      console.warn(
        "[census] API gateway returned an HTML page (Missing Key) — set CENSUS_API_KEY to enable the poverty context feed.",
      );
    }
    return null;
  }
  const json = JSON.parse(text) as string[][];
  if (!Array.isArray(json) || json.length < 2) return null;
  const [head, ...rows] = json;
  const iTotal = head.indexOf("B17001_001E");
  const iPov = head.indexOf("B17001_002E");
  const iState = head.indexOf("state");
  if (iTotal < 0 || iPov < 0 || iState < 0) return null;
  const byFips = new Map<string, number>();
  for (const r of rows) {
    const total = Number(r[iTotal]);
    const pov = Number(r[iPov]);
    if (Number.isFinite(total) && total > 0 && Number.isFinite(pov)) {
      byFips.set(String(r[iState]).padStart(2, "0"), Math.round((pov / total) * 1000) / 10);
    }
  }
  return byFips.size > 0 ? { byFips, year } : null;
}

export async function getStatePoverty(): Promise<PovertyDataset | null> {
  if (process.env.STRESS_FAIL_FEEDS?.includes("census")) return null;

  for (const year of YEARS) {
    try {
      const result = await tryYear(year);
      if (result) {
        return {
          ...result,
          meta: {
            source: `U.S. Census Bureau, ACS 1-year estimates (B17001, ${result.year})`,
            sourceUrl: "https://data.census.gov",
            fetchedAt: new Date().toISOString(),
            mode: "live",
          },
        };
      }
    } catch {
      // Network or shape failure — fall through to the next candidate year.
    }
  }
  return null;
}
