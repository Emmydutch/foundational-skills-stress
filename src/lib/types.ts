// Shared types across feeds, snapshots, and the stress index.

export type FeedMode = "live" | "snapshot";

/** Provenance + freshness metadata attached to every dataset the UI renders. */
export interface FeedMeta {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  mode: FeedMode;
  /** Present for snapshot feeds tied to a school year, e.g. "2022-23". */
  schoolYear?: string;
  /** True when a live feed failed and last-known-good data is shown. */
  degraded?: boolean;
  note?: string;
}

export interface CountryPoint {
  year: number;
  value: number | null;
}

/** One country in the World Bank global layer. */
export interface CountryRow {
  iso3: string;
  name: string;
  region: string;
  learningPoverty: number | null;
  learningPovertyPrev: number | null;
  completion: number | null;
  outOfSchool: number | null;
  series: {
    lp: CountryPoint[];
    completion: CountryPoint[];
    oos: CountryPoint[];
  };
}

export interface GlobalDataset {
  rows: CountryRow[];
  meta: FeedMeta;
  years: number[];
}

/** Per-year reading/math proficiency percentages for a geography. */
export interface YearMetrics {
  year: string;
  reading: number | null;
  math: number | null;
}

export interface SnapshotMeta {
  source: string;
  sourceUrl: string;
  schoolYear: string;
  schoolYears: string[];
  generatedAt: string;
  license: string;
}

export interface StateAchRow {
  fips: number;
  abbr: string;
  name: string;
  reading: number | null;
  math: number | null;
  tested: number | null;
  participation: number | null;
  history: YearMetrics[];
}

export interface DistrictAchRow {
  id: string;
  name: string;
  state: number;
  reading: number | null;
  math: number | null;
  tested: number | null;
  participation: number | null;
  history: YearMetrics[];
}

export interface AchievementSnapshot {
  meta: SnapshotMeta;
  states: StateAchRow[];
  districts: DistrictAchRow[];
}

export interface AbsenteeismStateRow {
  fips: number;
  abbr: string;
  name: string;
  rate: number | null;
  enrolled: number | null;
}

export interface AbsenteeismSnapshot {
  meta: SnapshotMeta;
  states: AbsenteeismStateRow[];
  districts: { id: string; rate: number | null; enrolled: number | null }[];
}

/** Merged view of all US feeds used by the pages. */
export interface UsStateRecord {
  fips: number;
  abbr: string;
  name: string;
  reading: number | null;
  math: number | null;
  tested: number | null;
  absenteeism: number | null;
  poverty: number | null;
  history: YearMetrics[];
}

export interface UsDataset {
  states: UsStateRecord[];
  districtsByState: Map<number, DistrictAchRow[]>;
  allDistricts: DistrictAchRow[];
  absenteeismByDistrict: Map<string, number>;
  meta: {
    achievement: SnapshotMeta;
    absenteeism: SnapshotMeta | null;
    poverty: FeedMeta | null;
  };
}
