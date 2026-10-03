import { describe, expect, it } from "vitest";
import {
  bandForScore,
  cohortStats,
  compositeZ,
  computeStress,
  scoreFromZ,
  zScores,
} from "@/lib/stress-index";

describe("cohortStats", () => {
  it("computes mean and population sd", () => {
    const { mean, sd, n } = cohortStats([10, 20, 30]);
    expect(mean).toBeCloseTo(20);
    expect(sd).toBeCloseTo(Math.sqrt(200 / 3));
    expect(n).toBe(3);
  });

  it("ignores nulls and handles empty input", () => {
    expect(cohortStats([10, null, 30]).mean).toBeCloseTo(20);
    expect(cohortStats([]).n).toBe(0);
    expect(cohortStats([null, null]).sd).toBe(0);
  });
});

describe("zScores", () => {
  it("standardizes values and passes nulls through", () => {
    const z = zScores([10, 20, 30]);
    expect(z[0]).toBeCloseTo(-1.2247, 3);
    expect(z[1]).toBeCloseTo(0);
    expect(z[2]).toBeCloseTo(1.2247, 3);
    expect(zScores([10, null, 30])[1]).toBeNull();
  });

  it("returns 0 for zero-variance cohorts", () => {
    expect(zScores([5, 5, 5])).toEqual([0, 0, 0]);
  });
});

describe("compositeZ", () => {
  it("applies standard weights when all components are present", () => {
    const z = compositeZ({ gap: 1, absenteeism: -1, poverty: 0.5 });
    expect(z).toBeCloseTo(0.45 * 1 + 0.3 * -1 + 0.25 * 0.5);
  });

  it("renormalizes weights when components are missing", () => {
    const z = compositeZ({ gap: 1, absenteeism: -1, poverty: null });
    expect(z).toBeCloseTo((0.45 - 0.3) / 0.75);
  });

  it("returns null when nothing is present", () => {
    expect(compositeZ({ gap: null, absenteeism: null, poverty: null })).toBeNull();
  });

  it("accepts custom weights for other composites (global layer)", () => {
    const z = compositeZ({ gap: 2, absenteeism: -1, poverty: null }, { gap: 0.5, absenteeism: 0.5 });
    expect(z).toBeCloseTo(0.5);
  });
});

describe("scoreFromZ / bandForScore", () => {
  it("maps z to the 0-100 scale and clamps", () => {
    expect(scoreFromZ(0)).toBeCloseTo(50);
    expect(scoreFromZ(2)).toBeCloseTo(80);
    expect(scoreFromZ(-2)).toBeCloseTo(20);
    expect(scoreFromZ(10)).toBe(100);
    expect(scoreFromZ(-10)).toBe(0);
  });

  it("assigns bands at the documented edges", () => {
    expect(bandForScore(0)).toBe("stable");
    expect(bandForScore(24.9)).toBe("stable");
    expect(bandForScore(25)).toBe("watch");
    expect(bandForScore(49.9)).toBe("watch");
    expect(bandForScore(50)).toBe("elevated");
    expect(bandForScore(74.9)).toBe("elevated");
    expect(bandForScore(75)).toBe("critical");
    expect(bandForScore(100)).toBe("critical");
    expect(bandForScore(null)).toBeNull();
  });
});

describe("computeStress", () => {
  it("produces score, band, and effective weights for a full input", () => {
    const result = computeStress({
      gap: { value: 60, z: 1 },
      absenteeism: { value: 20, z: 1 },
      poverty: { value: 15, z: 1 },
    });
    expect(result.z).toBeCloseTo(1);
    expect(result.score).toBeCloseTo(65);
    expect(result.band).toBe("elevated");
    expect(result.components.map((c) => c.weight)).toEqual([0.45, 0.3, 0.25]);
    expect(result.missing).toEqual([]);
  });

  it("renormalizes when a component is missing", () => {
    const result = computeStress({
      gap: { value: null, z: null },
      absenteeism: { value: 20, z: 1 },
      poverty: { value: 15, z: 1 },
    });
    expect(result.missing).toEqual(["Proficiency gap"]);
    const [gap, abs, pov] = result.components;
    expect(gap.weight).toBe(0);
    expect(abs.weight).toBeCloseTo(0.3 / 0.55);
    expect(pov.weight).toBeCloseTo(0.25 / 0.55);
  });

  it("returns a null score when no component is available", () => {
    const result = computeStress({
      gap: { value: null, z: null },
      absenteeism: { value: null, z: null },
      poverty: { value: null, z: null },
    });
    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.missing).toHaveLength(3);
  });
});
