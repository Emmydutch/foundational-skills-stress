import { geoNaturalEarth1, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldTopo from "world-atlas/countries-110m.json";
import { buildCountryIdMap, matchCountryId } from "@/lib/geo/country-map";

export interface WorldMapRow {
  name: string;
  value: number | null;
}

export interface MapBand {
  /** Inclusive upper bound of the band; use Infinity for the final band. */
  upTo: number;
  color: string;
}

/** Theme-aware no-data fill — resolves against the `.dark` token overrides. */
const NO_DATA = "var(--color-nodata)";

function scaleFromBands(bands: MapBand[]) {
  return (v: number | null): string => {
    if (v == null || !Number.isFinite(v)) return NO_DATA;
    for (const band of bands) if (v <= band.upTo) return band.color;
    return bands[bands.length - 1]?.color ?? NO_DATA;
  };
}

const WIDTH = 960;
const HEIGHT = 470;

/**
 * World choropleth (Natural Earth projection) — server-rendered SVG, no
 * client-side map framework. Country names are matched to topology ids via
 * `lib/geo/country-map` (alias table included).
 */
export function WorldMap({
  rows,
  bands,
  formatValue,
}: {
  rows: WorldMapRow[];
  bands: MapBand[];
  formatValue: (v: number) => string;
}) {
  const topo = worldTopo as unknown as Topology<{
    countries: GeometryCollection<{ name: string }>;
  }>;
  const collection = feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  const features = collection.features;

  const idMap = buildCountryIdMap(features.map((f) => ({ id: f.id, properties: { name: f.properties?.name } })));
  const valueById = new Map<string, { name: string; value: number | null }>();
  for (const row of rows) {
    const id = matchCountryId(row.name, idMap);
    if (id) valueById.set(id, { name: row.name, value: row.value });
  }

  const path = geoPath(geoNaturalEarth1().fitSize([WIDTH, HEIGHT], collection));
  const colorFor = scaleFromBands(bands);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label="World map of foundational skills stress by country"
    >
      <rect width={WIDTH} height={HEIGHT} className="fill-canvas" rx="8" />
      {features.map((f, i) => {
        const id = f.id == null ? null : String(f.id);
        const entry = id ? valueById.get(id) : undefined;
        const fill = entry ? colorFor(entry.value) : NO_DATA;
        return (
          <path
            key={id ?? i}
            d={path(f) ?? undefined}
            style={{ fill }}
            strokeWidth={0.4}
            strokeOpacity={0.9}
            className="stroke-card"
          >
            <title>
              {entry
                ? `${entry.name}: ${entry.value == null ? "no data" : formatValue(entry.value)}`
                : (f.properties?.name ?? "—")}
            </title>
          </path>
        );
      })}
    </svg>
  );
}

export function MapLegend({ bands, noDataLabel = "No data" }: { bands: MapBand[]; noDataLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
      {bands.map((band, i) => {
        const lower = i === 0 ? null : bands[i - 1].upTo;
        const label =
          band.upTo === Infinity
            ? `${lower != null ? `${lower}+` : "—"}`
            : lower == null
              ? `<${band.upTo}`
              : `${lower}–${band.upTo}`;
        return (
          <span key={band.color + i} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: band.color }} aria-hidden />
            {label}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: NO_DATA }} aria-hidden />
        {noDataLabel}
      </span>
    </div>
  );
}
