// Global-layer analytics: a "global learning stress" composite per country
// built from World Bank indicators, plus regional aggregates and movers.
//
// Component weights differ from the US index (which weights the domestic
// stressor set); the global composite is indicator-driven:
//   learning poverty 35% · out-of-school 35% · completion gap 30%.
// Weights renormalize over whatever is available per country.

import { bandForScore, compositeZ, scoreFromZ, zScores, type StressBand } from "@/lib/stress-index";
import type { CountryRow, GlobalDataset } from "@/lib/types";

export const GLOBAL_WEIGHTS = { lp: 0.35, oos: 0.35, completionGap: 0.3 } as const;

export interface CountryStressRow {
  country: CountryRow;
  completionGap: number | null;
  score: number | null;
  band: StressBand | null;
}

export function buildCountryMetrics(dataset: GlobalDataset): CountryStressRow[] {
  const lpZ = zScores(dataset.rows.map((r) => r.learningPoverty));
  const oosZ = zScores(dataset.rows.map((r) => r.outOfSchool));
  const gaps = dataset.rows.map((r) => (r.completion == null ? null : Math.round((100 - r.completion) * 10) / 10));
  const gapZ = zScores(gaps);

  return dataset.rows.map((country, i) => {
    const z = compositeZ({ lp: lpZ[i], oos: oosZ[i], completionGap: gapZ[i] }, GLOBAL_WEIGHTS);
    const score = z == null ? null : Math.round(scoreFromZ(z) * 10) / 10;
    return { country, completionGap: gaps[i], score, band: bandForScore(score) };
  });
}

export interface RegionAggregate {
  region: string;
  countries: number;
  learningPoverty: number | null;
  completion: number | null;
  outOfSchool: number | null;
}

function mean(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

/** Unweighted regional means (documented limitation on /methodology). */
export function regionAggregates(dataset: GlobalDataset): RegionAggregate[] {
  const byRegion = new Map<string, CountryRow[]>();
  for (const row of dataset.rows) {
    const list = byRegion.get(row.region);
    if (list) list.push(row);
    else byRegion.set(row.region, [row]);
  }
  return [...byRegion.entries()]
    .map(([region, rows]) => ({
      region,
      countries: rows.length,
      learningPoverty: mean(rows.map((r) => r.learningPoverty)),
      completion: mean(rows.map((r) => r.completion)),
      outOfSchool: mean(rows.map((r) => r.outOfSchool)),
    }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

export interface MoverRow {
  country: CountryRow;
  delta: number; // latest − previous (negative = improvement for all three indicators)
}

/** Countries with the largest movement in learning poverty (both directions). */
export function learningPovertyMovers(dataset: GlobalDataset, count = 5): { improvers: MoverRow[]; decliners: MoverRow[] } {
  const withDelta: MoverRow[] = [];
  for (const country of dataset.rows) {
    if (country.learningPoverty == null || country.learningPovertyPrev == null) continue;
    withDelta.push({ country, delta: Math.round((country.learningPoverty - country.learningPovertyPrev) * 10) / 10 });
  }
  const sorted = [...withDelta].sort((a, b) => a.delta - b.delta);
  return {
    improvers: sorted.filter((m) => m.delta < 0).slice(0, count),
    decliners: sorted.filter((m) => m.delta > 0).reverse().slice(0, count),
  };
}

export interface GlobalKpis {
  countries: number;
  withLearningPoverty: number;
  meanLearningPoverty: number | null;
  meanCompletion: number | null;
  meanOutOfSchool: number | null;
}

export function globalKpis(dataset: GlobalDataset): GlobalKpis {
  return {
    countries: dataset.rows.length,
    withLearningPoverty: dataset.rows.filter((r) => r.learningPoverty != null).length,
    meanLearningPoverty: mean(dataset.rows.map((r) => r.learningPoverty)),
    meanCompletion: mean(dataset.rows.map((r) => r.completion)),
    meanOutOfSchool: mean(dataset.rows.map((r) => r.outOfSchool)),
  };
}
