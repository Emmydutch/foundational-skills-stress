import type { Metadata } from "next";
import { BAND_META, BAND_ORDER } from "@/lib/stress-index";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FreshnessChip } from "@/components/freshness-chip";
import { KpiCard } from "@/components/kpi-card";
import { MapLegend, type MapBand } from "@/components/world-map";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { SourceLine } from "@/components/source-line";
import { UsMap } from "@/components/us-map";
import { getUsDataset } from "@/lib/data/us";
import { snapshotFeedMeta } from "@/lib/data/meta";
import { buildStateMetrics, latestChange, nationalKpis, weightedMean } from "@/lib/us-metrics";
import { CENSUS_REGIONS, censusRegion } from "@/lib/us-regions";
import { num, pct, signed, schoolYearLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "United States — Foundational Skills Stress",
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

export default async function UsPage() {
  const data = await getUsDataset();

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="United States"
          title="State stress league"
          description="Proficiency, chronic absenteeism, and poverty context for every state, scored with the composite Stress Index."
        />
        <EmptyState
          title="US snapshots not found"
          detail="The EDFacts achievement snapshot is missing or unreadable. Run `npm run ingest` and refresh — the dashboard renders again as soon as data/snapshots is populated."
        />
      </div>
    );
  }

  const stateMetrics = buildStateMetrics(data);
  const kpis = nationalKpis(data);
  const years = data.meta.achievement.schoolYears;

  const ranked = [...stateMetrics]
    .filter((s) => s.stress.score != null)
    .sort((a, b) => (b.stress.score ?? 0) - (a.stress.score ?? 0));
  const rankByFips = new Map(ranked.map((row, i) => [row.state.fips, i + 1]));

  const tableRows = [...stateMetrics].sort((a, b) => (b.stress.score ?? -1) - (a.stress.score ?? -1));

  const readingSpark = years.map((y) =>
    weightedMean(data.states.map((s) => ({ value: s.history.find((h) => h.year === y)?.reading ?? null, weight: s.tested }))),
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="United States"
        title="State stress league"
        description={`All-students reading and math proficiency (grades tested, ${schoolYearLabel(
          data.meta.achievement.schoolYear,
        )}), chronic absenteeism (${schoolYearLabel(
          data.meta.absenteeism?.schoolYear ?? "2015-16",
        )}), and poverty context — combined into a peer-relative Stress Index.`}
        meta={
          <>
            <FreshnessChip meta={snapshotFeedMeta(data.meta.achievement)} label="EDFacts" />
            {data.meta.absenteeism ? (
              <FreshnessChip meta={snapshotFeedMeta(data.meta.absenteeism)} label="CRDC" />
            ) : null}
            {data.meta.poverty ? <FreshnessChip meta={data.meta.poverty} label="Census" /> : null}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Reading proficiency"
          value={pct(kpis.reading)}
          sub={schoolYearLabel(data.meta.achievement.schoolYear)}
          delta={
            readingSpark.length >= 2
              ? (readingSpark[readingSpark.length - 1] ?? 0) - (readingSpark[readingSpark.length - 2] ?? 0)
              : null
          }
          deltaGoodWhen="up"
          spark={readingSpark}
          sparkColor="var(--color-chart-reading)"
          footnote="Students tested-weighted state mean"
        />
        <KpiCard
          label="Math proficiency"
          value={pct(kpis.math)}
          sub={schoolYearLabel(data.meta.achievement.schoolYear)}
          spark={years.map((y) =>
            weightedMean(data.states.map((s) => ({ value: s.history.find((h) => h.year === y)?.math ?? null, weight: s.tested }))),
          )}
          sparkColor="var(--color-chart-math)"
          footnote="Students tested-weighted state mean"
        />
        <KpiCard
          label="Chronic absenteeism"
          value={pct(kpis.absenteeism)}
          sub={schoolYearLabel(data.meta.absenteeism?.schoolYear ?? "2015-16")}
          footnote="Absent 15+ school days ÷ enrollment"
        />
        <KpiCard
          label="Poverty context"
          value={pct(kpis.poverty)}
          sub="ACS 1-year, income below poverty"
          footnote="Stress input — not a school outcome"
        />
        <KpiCard
          label="Students assessed"
          value={kpis.tested ? num(kpis.tested) : "—"}
          sub="all grades, all students"
        />
        <KpiCard
          label="Districts covered"
          value={num(data.allDistricts.length)}
          sub={`${kpis.statesWithProficiency} states/territories reporting`}
        />
      </section>

      <Section
        title="Stress map"
        subtitle="State Stress Index — proficiency gap 45% · absenteeism 30% · poverty context 25% · click a state for the local drill-down"
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[3fr_1fr]">
          <div className="card p-3">
            <UsMap
              rows={stateMetrics.map((s) => ({
                fips: s.state.fips,
                name: s.state.name,
                value: s.stress.score,
                href: `/us/${s.state.abbr.toLowerCase()}`,
              }))}
              bands={STRESS_BANDS}
              formatValue={(v) => `${v.toFixed(0)} / 100`}
            />
            <div className="mt-2 px-1">
              <MapLegend bands={STRESS_BANDS} />
            </div>
          </div>
          <div className="card p-4">
            <h3 className="text-[13px] font-semibold text-ink">What the map measures</h3>
            <ul className="mt-2 flex flex-col gap-2 text-[12px] leading-5 text-muted">
              <li>
                <span className="font-semibold text-ink">Proficiency gap</span> — distance from full
                proficiency in reading and math, the largest weighted driver.
              </li>
              <li>
                <span className="font-semibold text-ink">Chronic absenteeism</span> — share of students
                absent 15+ days; the strongest leading indicator of dropout risk.
              </li>
              <li>
                <span className="font-semibold text-ink">Poverty context</span> — household income below
                poverty, capturing the headwind schools do not control.
              </li>
            </ul>
            <div className="mt-4 border-t border-line pt-3">
              <SourceLine
                meta={snapshotFeedMeta(data.meta.achievement)}
                extra={`Snapshot school years: ${years.join(", ")}`}
              />
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="State league table"
        subtitle="Click a state for the district drill-down · sort any column, filter by band or region"
        right={<SourceLine meta={snapshotFeedMeta(data.meta.achievement)} />}
      >
        <DataTable
          searchPlaceholder="Search states…"
          initialSortKey="stress"
          filters={[
            { key: "band", label: "Band", options: BAND_FILTER_OPTIONS },
            {
              key: "region",
              label: "Region",
              options: CENSUS_REGIONS.map((r) => ({ value: r, label: r })),
            },
          ]}
          columns={[
            { key: "rank", label: "#", align: "right" },
            { key: "name", label: "State" },
            { key: "reading", label: "Reading", align: "right" },
            { key: "math", label: "Math", align: "right" },
            { key: "yoy", label: "Reading YoY", align: "right" },
            { key: "absenteeism", label: "Absent 15+", align: "right" },
            { key: "poverty", label: "Poverty", align: "right" },
            { key: "stress", label: "Stress index", align: "right" },
          ]}
          rows={tableRows.map((r) => {
            const yoy = latestChange(r.state.history, "reading");
            return {
              key: r.state.abbr,
              search: r.state.name,
              facets: { band: r.stress.band ?? "", region: censusRegion(r.state.abbr) },
              sort: [
                rankByFips.get(r.state.fips) ?? null,
                r.state.name,
                r.state.reading,
                r.state.math,
                yoy,
                r.state.absenteeism,
                r.state.poverty,
                r.stress.score,
              ],
              cells: [
                {
                  kind: "text" as const,
                  value: rankByFips.get(r.state.fips)?.toString() ?? "—",
                  tone: "muted" as const,
                },
                { kind: "link" as const, value: r.state.name, href: `/us/${r.state.abbr.toLowerCase()}` },
                { kind: "text" as const, value: pct(r.state.reading) },
                { kind: "text" as const, value: pct(r.state.math) },
                yoy == null
                  ? ({ kind: "text", value: "—", tone: "muted" } as const)
                  : ({
                      kind: "text",
                      value: signed(yoy),
                      tone: yoy >= 0 ? ("stable" as const) : ("critical" as const),
                    } as const),
                { kind: "text" as const, value: pct(r.state.absenteeism) },
                { kind: "text" as const, value: pct(r.state.poverty) },
                { kind: "stress" as const, score: r.stress.score, band: r.stress.band },
              ],
            };
          })}
        />
      </Section>
    </div>
  );
}
