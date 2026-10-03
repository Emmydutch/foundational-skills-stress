import type { Metadata } from "next";
import { BAND_META, BAND_ORDER } from "@/lib/stress-index";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FreshnessChip } from "@/components/freshness-chip";
import { KpiCard } from "@/components/kpi-card";
import { MapLegend, WorldMap, type MapBand } from "@/components/world-map";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { SourceLine } from "@/components/source-line";
import { TrendChart } from "@/components/trend-chart";
import { getGlobalDataset } from "@/lib/feeds/worldbank";
import {
  buildCountryMetrics,
  globalKpis,
  regionAggregates,
  type CountryStressRow,
} from "@/lib/global-metrics";
import { pct } from "@/lib/format";
import type { CountryRow, GlobalDataset } from "@/lib/types";

export const metadata: Metadata = {
  title: "Global Lens — Foundational Skills Stress",
};

const STRESS_BANDS: MapBand[] = [
  { upTo: 25, color: "var(--color-stable)" },
  { upTo: 50, color: "var(--color-chart-green)" },
  { upTo: 75, color: "var(--color-watch)" },
  { upTo: Infinity, color: "var(--color-critical)" },
];

const BAND_FILTER_OPTIONS = BAND_ORDER.map((b) => ({
  value: b as string,
  label: `${BAND_META[b].label} (${BAND_META[b].range})`,
}));

function meanSeries(rows: CountryRow[], years: number[], key: "lp" | "completion" | "oos"): (number | null)[] {
  return years.map((year) => {
    const values = rows
      .map((r) => r.series[key].find((p) => p.year === year)?.value ?? null)
      .filter((v): v is number => v != null);
    return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
  });
}

export default async function GlobalPage() {
  let data: GlobalDataset | null = null;
  try {
    data = await getGlobalDataset();
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Global Lens"
          title="World Bank education indicators"
          description="Learning poverty, primary completion, and out-of-school children for every country with a reporting value."
        />
        <EmptyState
          title="Live feed unavailable"
          detail="The World Bank Open Data API could not be reached from the server. This page recovers automatically when the feed works again — run `npm run verify-feeds` to diagnose the endpoint."
        />
      </div>
    );
  }

  const kpis = globalKpis(data);
  const metrics = buildCountryMetrics(data);
  const byIso3 = new Map(metrics.map((m) => [m.country.iso3, m]));
  const regions = regionAggregates(data);
  const years = data.years;

  const cohortSeries = [
    { name: "Learning poverty", color: "var(--color-chart-amber)", points: meanSeries(data.rows, years, "lp").map((v, i) => ({ label: String(years[i]), value: v })) },
    { name: "Primary completion", color: "var(--color-chart-math)", points: meanSeries(data.rows, years, "completion").map((v, i) => ({ label: String(years[i]), value: v })) },
    { name: "Out of school", color: "var(--color-chart-red)", points: meanSeries(data.rows, years, "oos").map((v, i) => ({ label: String(years[i]), value: v })) },
  ];

  const tableRows = [...data.rows]
    .sort((a, b) => (byIso3.get(b.iso3)?.score ?? -1) - (byIso3.get(a.iso3)?.score ?? -1))
    .map((country) => ({ country, metric: byIso3.get(country.iso3) as CountryStressRow }));

  const regionFilterOptions = [...new Set(data.rows.map((r) => r.region))]
    .filter(Boolean)
    .sort()
    .map((v) => ({ value: v, label: v }));

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Global Lens"
        title="World Bank education indicators"
        description="Learning poverty, primary completion, and out-of-school children for every country with a reporting value. The composite score is peer-relative across countries (50 = cohort average)."
        meta={<FreshnessChip meta={data.meta} label="World Bank" />}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          label="Learning poverty · mean"
          value={pct(kpis.meanLearningPoverty)}
          sub={`${kpis.withLearningPoverty} of ${kpis.countries} countries reporting`}
          footnote="Children past primary age below minimum reading proficiency"
        />
        <KpiCard
          label="Primary completion · mean"
          value={pct(kpis.meanCompletion)}
          sub="cohort average, latest year per country"
        />
        <KpiCard
          label="Out of school · mean"
          value={pct(kpis.meanOutOfSchool)}
          sub="primary-age children, cohort average"
        />
        <KpiCard
          label="Countries tracked"
          value={kpis.countries}
          sub="with at least one indicator series"
        />
      </section>

      <Section
        title="Cohort trend"
        subtitle="Unweighted country means per reporting year — gaps mean the cohort had no published values"
      >
        <div className="card p-4">
          <TrendChart series={cohortSeries} height={280} />
        </div>
      </Section>

      <Section
        title="Stress map"
        subtitle="Composite learning-stress score per country (0–100)"
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_1fr]">
          <div className="card p-3">
            <WorldMap
              rows={metrics.map((m) => ({ name: m.country.name, value: m.score }))}
              bands={STRESS_BANDS}
              formatValue={(v) => `${v.toFixed(0)} / 100`}
            />
            <div className="mt-2 px-1">
              <MapLegend bands={STRESS_BANDS} />
            </div>
          </div>
          <div className="card overflow-x-auto p-4">
            <h3 className="text-[13px] font-semibold text-ink">Regional picture</h3>
            <p className="mb-3 text-[11.5px] text-muted">Unweighted country means by region</p>
            <table className="w-full min-w-[280px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-muted uppercase">
                  <th className="py-1.5 pr-2 font-semibold">Region</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Learn. pov.</th>
                  <th className="py-1.5 pr-2 text-right font-semibold">Completion</th>
                  <th className="py-1.5 text-right font-semibold">Out of school</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.region} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-2 text-ink">{r.region}</td>
                    <td className="nums py-2 pr-2 text-right">{pct(r.learningPoverty)}</td>
                    <td className="nums py-2 pr-2 text-right">{pct(r.completion)}</td>
                    <td className="nums py-2 text-right">{pct(r.outOfSchool)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        title="Country league table"
        subtitle="Sort any column; filter by stress band or World Bank region"
        right={<SourceLine meta={data.meta} />}
      >
        <DataTable
          searchPlaceholder="Search countries or regions…"
          initialSortKey="stress"
          limit={60}
          filters={[
            { key: "band", label: "Band", options: BAND_FILTER_OPTIONS },
            { key: "region", label: "Region", options: regionFilterOptions },
          ]}
          columns={[
            { key: "name", label: "Country" },
            { key: "region", label: "Region" },
            { key: "lp", label: "Learning poverty", align: "right" },
            { key: "completion", label: "Completion", align: "right" },
            { key: "oos", label: "Out of school", align: "right" },
            { key: "stress", label: "Stress index", align: "right" },
            { key: "trend", label: "LP trend", sortable: false },
          ]}
          rows={tableRows.map((r) => ({
            key: r.country.iso3,
            search: `${r.country.name} ${r.country.region}`,
            facets: { band: r.metric.band ?? "", region: r.country.region },
            sort: [
              r.country.name,
              r.country.region,
              r.country.learningPoverty,
              r.country.completion,
              r.country.outOfSchool,
              r.metric.score,
            ],
            cells: [
              { kind: "text" as const, value: r.country.name, strong: true },
              { kind: "text" as const, value: r.country.region, tone: "muted" as const },
              { kind: "text" as const, value: pct(r.country.learningPoverty) },
              { kind: "text" as const, value: pct(r.country.completion) },
              { kind: "text" as const, value: pct(r.country.outOfSchool) },
              { kind: "stress" as const, score: r.metric.score, band: r.metric.band },
              { kind: "spark" as const, values: r.country.series.lp.map((p) => p.value), color: "var(--color-chart-amber)" },
            ],
          }))}
        />
      </Section>
    </div>
  );
}
