// Composite Stress Index — shared by the executive brief, state pages, and
// district pages. Pure functions, unit-tested in stress-index.test.ts.
//
// Methodology: three peer-relative z-score components are combined with fixed
// weights (proficiency gap 45%, chronic absenteeism 30%, poverty 25%). Missing
// components are dropped and the remaining weights are renormalized. The final
// score is 50 + 15·z, clamped to 0–100, so 50 is the peer-set average.

export type StressBand = "stable" | "watch" | "elevated" | "critical";

export const STRESS_WEIGHTS = {
  gap: 0.45,
  absenteeism: 0.3,
  poverty: 0.25,
} as const;

export const BAND_META: Record<
  StressBand,
  { label: string; range: string; hex: string; softHex: string }
> = {
  stable: { label: "Stable", range: "0–24", hex: "#15803d", softHex: "#e7f3ea" },
  watch: { label: "Watch", range: "25–49", hex: "#b45309", softHex: "#f9efdf" },
  elevated: { label: "Elevated", range: "50–74", hex: "#c2410c", softHex: "#fbe9e0" },
  critical: { label: "Critical", range: "75–100", hex: "#b91c1c", softHex: "#fae5e5" },
};

/** Band order for filter menus, most → least stressed. */
export const BAND_ORDER: StressBand[] = ["critical", "elevated", "watch", "stable"];

export interface StressComponentInput {
  value: number | null;
  z: number | null;
}

export interface StressInputs {
  gap: StressComponentInput;
  absenteeism: StressComponentInput;
  poverty: StressComponentInput;
}

export interface StressComponentDetail {
  key: keyof StressInputs;
  label: string;
  value: number | null;
  z: number | null;
  /** Effective weight after renormalization over present components. */
  weight: number;
}

export interface StressResult {
  score: number | null;
  band: StressBand | null;
  z: number | null;
  components: StressComponentDetail[];
  missing: string[];
}

const COMPONENT_LABELS: Record<keyof StressInputs, string> = {
  gap: "Proficiency gap",
  absenteeism: "Chronic absenteeism",
  poverty: "Poverty context",
};

export function bandForScore(score: number | null): StressBand | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score < 25) return "stable";
  if (score < 50) return "watch";
  if (score < 75) return "elevated";
  return "critical";
}

/** Mean and population standard deviation over non-null values. */
export function cohortStats(values: (number | null)[]): { mean: number; sd: number; n: number } {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (xs.length === 0) return { mean: 0, sd: 0, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return { mean, sd: Math.sqrt(variance), n: xs.length };
}

/** Z-scores of each value against its cohort. null in -> null out; sd 0 -> z 0. */
export function zScores(values: (number | null)[]): (number | null)[] {
  const { mean, sd } = cohortStats(values);
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    return sd > 0 ? (v - mean) / sd : 0;
  });
}

/** Weighted composite z with weights renormalized over present components. */
export function compositeZ(
  components: Partial<Record<string, number | null>>,
  weights: Record<string, number> = STRESS_WEIGHTS,
): number | null {
  let numerator = 0;
  let weightSum = 0;
  for (const key of Object.keys(weights)) {
    const z = components[key];
    if (z == null || !Number.isFinite(z)) continue;
    numerator += z * weights[key];
    weightSum += weights[key];
  }
  return weightSum > 0 ? numerator / weightSum : null;
}

/** Maps a composite z to the 0–100 executive score (50 = cohort average). */
export function scoreFromZ(z: number): number {
  const raw = 50 + 15 * z;
  return Math.min(100, Math.max(0, raw));
}

export function computeStress(inputs: StressInputs): StressResult {
  const keys = Object.keys(STRESS_WEIGHTS) as (keyof StressInputs)[];
  const present = keys.filter((k) => inputs[k].z != null && Number.isFinite(inputs[k].z));
  const weightSum = present.reduce((s, k) => s + STRESS_WEIGHTS[k], 0);

  const z = compositeZ(
    Object.fromEntries(present.map((k) => [k, inputs[k].z])) as Partial<
      Record<keyof StressInputs, number | null>
    >,
  );
  const score = z == null ? null : scoreFromZ(z);

  return {
    z,
    score,
    band: bandForScore(score),
    components: keys.map((k) => ({
      key: k,
      label: COMPONENT_LABELS[k],
      value: inputs[k].value,
      z: inputs[k].z,
      weight: present.includes(k) && weightSum > 0 ? STRESS_WEIGHTS[k] / weightSum : 0,
    })),
    missing: keys.filter((k) => !present.includes(k)).map((k) => COMPONENT_LABELS[k]),
  };
}
