// US-layer analytics: turns raw snapshots into per-geography stress rows and
// national aggregates. All math is derived here so pages stay declarative.
//
// State cohort: all states (z-scores across the 50 states + DC + territories
// with data). District cohort: districts within the same state, so a district
// is scored against its in-state peers.

import { computeStress, zScores, type StressResult } from "@/lib/stress-index";
import type { DistrictAchRow, UsDataset, UsStateRecord, YearMetrics } from "@/lib/types";

/** Proficiency gap: 100 − mean(reading, math) — higher means more stress. */
export function gapOf(reading: number | null, math: number | null): number | null {
  const parts = [reading, math].filter((v): v is number => v != null && Number.isFinite(v));
  if (parts.length === 0) return null;
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  return Math.round((100 - avg) * 10) / 10;
}

/** Latest year-over-year change in a history series (last non-null minus prior). */
export function latestChange(history: YearMetrics[], key: "reading" | "math"): number | null {
  const values: number[] = [];
  for (const h of history) {
    const v = h[key];
    if (v != null && Number.isFinite(v)) values.push(v);
  }
  if (values.length < 2) return null;
  return Math.round((values[values.length - 1] - values[values.length - 2]) * 10) / 10;
}

export function weightedMean(items: { value: number | null; weight: number | null }[]): number | null {
  let num = 0;
  let den = 0;
  for (const { value, weight } of items) {
    if (value == null || weight == null || !Number.isFinite(value) || !(weight > 0)) continue;
    num += value * weight;
    den += weight;
  }
  return den > 0 ? Math.round((num / den) * 10) / 10 : null;
}

export interface StateStressRow {
  state: UsStateRecord;
  gap: number | null;
  stress: StressResult;
}

export function buildStateMetrics(dataset: UsDataset): StateStressRow[] {
  const states = dataset.states;
  const gaps = states.map((s) => gapOf(s.reading, s.math));
  const gapZ = zScores(gaps);
  const absZ = zScores(states.map((s) => s.absenteeism));
  const povZ = zScores(states.map((s) => s.poverty));

  return states.map((state, i) => ({
    state,
    gap: gaps[i],
    stress: computeStress({
      gap: { value: gaps[i], z: gapZ[i] },
      absenteeism: { value: state.absenteeism, z: absZ[i] },
      poverty: { value: state.poverty, z: povZ[i] },
    }),
  }));
}

export interface DistrictStressRow {
  district: DistrictAchRow;
  gap: number | null;
  stress: StressResult;
}

export function buildDistrictMetrics(districts: DistrictAchRow[]): DistrictStressRow[] {
  const gaps = districts.map((d) => gapOf(d.reading, d.math));
  const gapZ = zScores(gaps);
  return districts.map((district, i) => ({
    district,
    gap: gaps[i],
    stress: computeStress({
      gap: { value: gaps[i], z: gapZ[i] },
      absenteeism: { value: null, z: null },
      poverty: { value: null, z: null },
    }),
  }));
}

export interface NationalKpis {
  reading: number | null;
  math: number | null;
  absenteeism: number | null;
  poverty: number | null;
  tested: number | null;
  statesWithProficiency: number;
}

/** Enrollment-weighted national aggregates (weight = students tested). */
export function nationalKpis(dataset: UsDataset): NationalKpis {
  const states = dataset.states;
  return {
    reading: weightedMean(states.map((s) => ({ value: s.reading, weight: s.tested }))),
    math: weightedMean(states.map((s) => ({ value: s.math, weight: s.tested }))),
    absenteeism: weightedMean(states.map((s) => ({ value: s.absenteeism, weight: s.tested }))),
    poverty: weightedMean(states.map((s) => ({ value: s.poverty, weight: s.tested }))),
    tested: states.reduce((sum, s) => sum + (s.tested ?? 0), 0) || null,
    statesWithProficiency: states.filter((s) => s.reading != null || s.math != null).length,
  };
}
