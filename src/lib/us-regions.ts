// U.S. Census Bureau regions — static mapping used by the state-league region
// filter. Territories (and any code outside the 50 states + DC) fall into the
// "Territories" bucket.
// Reference: https://www2.census.gov/geo/pdfs/maps-data/maps/reference/us_regdiv.pdf

export type CensusRegion = "Northeast" | "Midwest" | "South" | "West" | "Territories";

const BY_ABBR: Record<string, CensusRegion> = {
  // Northeast
  CT: "Northeast", ME: "Northeast", MA: "Northeast", NH: "Northeast", RI: "Northeast",
  VT: "Northeast", NJ: "Northeast", NY: "Northeast", PA: "Northeast",
  // Midwest
  IL: "Midwest", IN: "Midwest", MI: "Midwest", OH: "Midwest", WI: "Midwest",
  IA: "Midwest", KS: "Midwest", MN: "Midwest", MO: "Midwest", NE: "Midwest",
  ND: "Midwest", SD: "Midwest",
  // South
  DE: "South", DC: "South", FL: "South", GA: "South", MD: "South", NC: "South",
  SC: "South", VA: "South", WV: "South", AL: "South", KY: "South", MS: "South",
  TN: "South", AR: "South", LA: "South", OK: "South", TX: "South",
  // West
  AZ: "West", CO: "West", ID: "West", MT: "West", NV: "West", NM: "West",
  UT: "West", WY: "West", AK: "West", CA: "West", HI: "West", OR: "West", WA: "West",
};

export const CENSUS_REGIONS: CensusRegion[] = [
  "Northeast",
  "Midwest",
  "South",
  "West",
  "Territories",
];

export function censusRegion(abbr: string): CensusRegion {
  return BY_ABBR[abbr.toUpperCase()] ?? "Territories";
}
