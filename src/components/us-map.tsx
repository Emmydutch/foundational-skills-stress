import Link from "next/link";
import { geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import usTopo from "us-atlas/states-albers-10m.json";
import type { MapBand } from "@/components/world-map";

export interface UsMapRow {
  fips: number;
  name: string;
  value: number | null;
  /** District drill-down target, e.g. `/us/ga`. States outside the snapshot stay unlinked. */
  href?: string;
}

/** Theme-aware no-data fill — resolves against the `.dark` token overrides. */
const NO_DATA = "var(--color-nodata)";
const WIDTH = 975;
const HEIGHT = 610;

function scaleFromBands(bands: MapBand[]) {
  return (v: number | null): string => {
    if (v == null || !Number.isFinite(v)) return NO_DATA;
    for (const band of bands) if (v <= band.upTo) return band.color;
    return bands[bands.length - 1]?.color ?? NO_DATA;
  };
}

/**
 * US states choropleth using the pre-projected Albers USA topology
 * (us-atlas states-albers-10m) — server-rendered SVG with per-state tooltips.
 */
export function UsMap({
  rows,
  bands,
  formatValue,
}: {
  rows: UsMapRow[];
  bands: MapBand[];
  formatValue: (v: number) => string;
}) {
  const topo = usTopo as unknown as Topology<{
    states: GeometryCollection<{ name: string }>;
  }>;
  const collection = feature(topo, topo.objects.states) as FeatureCollection<Geometry, { name: string }>;
  const features = collection.features;

  const valueByFips = new Map<string, UsMapRow>();
  for (const row of rows) valueByFips.set(String(row.fips).padStart(2, "0"), row);

  const path = geoPath();
  const colorFor = scaleFromBands(bands);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label="United States map of foundational skills stress by state"
    >
      <rect width={WIDTH} height={HEIGHT} className="fill-canvas" rx="8" />
      {features.map((f, i) => {
        const id = f.id == null ? null : String(f.id).padStart(2, "0");
        const entry = id ? valueByFips.get(id) : undefined;
        const fill = entry ? colorFor(entry.value) : NO_DATA;
        const tooltip = entry
          ? `${entry.name}: ${entry.value == null ? "no data" : formatValue(entry.value)}${
              entry.href ? " — click for the district drill-down" : ""
            }`
          : (f.properties?.name ?? "—");
        const shape = (
          <path
            d={path(f) ?? undefined}
            style={{ fill }}
            strokeWidth={0.6}
            strokeOpacity={0.9}
            className="stroke-card"
          >
            <title>{tooltip}</title>
          </path>
        );
        if (entry?.href) {
          return (
            <Link
              key={id ?? i}
              href={entry.href}
              aria-label={`${entry.name} — open the state district drill-down`}
              className="cursor-pointer transition-opacity hover:opacity-75"
            >
              {shape}
            </Link>
          );
        }
        return <g key={id ?? i}>{shape}</g>;
      })}
    </svg>
  );
}
