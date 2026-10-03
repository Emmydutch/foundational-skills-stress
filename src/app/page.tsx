import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { FreshnessChip } from "@/components/freshness-chip";
import { KpiCard } from "@/components/kpi-card";
import { MapLegend, WorldMap, type MapBand } from "@/components/world-map";
import { PageHeader } from "@/components/page-header";
import { RankBarList } from "@/components/rank-bar";
import { Section } from "@/components/section";
import { SourceLine } from "@/components/source-line";
import { getGlobalDataset } from "@/lib/feeds/worldbank";
import { getUsDataset } from "@/lib/data/us";
import { snapshotFeedMeta } from "@/lib/data/meta";
import { buildCountryMetrics, globalKpis, learningPovertyMovers } from "@/lib/global-metrics";
import { buildStateMetrics, latestChange, nationalKpis, weightedMean } from "@/lib/us-metrics";
import { num, pct, signed, schoolYearLabel } from "@/lib/format";
import type { CountryRow, GlobalDataset, UsDataset } from "@/lib/types";

export const metadata: Metadata = {
  title: "Executive Brief — Foundational Skills Stress",
};

const STRESS_BANDS: MapBand[] = [
  { upTo: 25, color: "var(--color-stable)" },
  { upTo: 50, color: "var(--color-chart-green)" },
  { upTo: 75, color: "var(--color-watch)" },
  { upTo: Infinity, color: "var(--color-critical)" },
];

function meanSeries(rows: CountryRow[], years: number[], key: "lp" | "completion" | "oos"): (number | null)[] {
  return years.map((year) => {
    const values = rows
      .map((r) => r.series[key].find((p) => p.year === year)?.value ?? null)
      .filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
}

export default async function ExecutiveBriefPage() {
  let globalData: GlobalDataset | null = null;
  try {
    globalData = await getGlobalDataset();
  } catch {
    globalData = null;
  }
  const usData: UsDataset | null = await getUsDataset();

  const globalKpi = globalData ? globalKpis(globalData) : null;
  const countryMetrics = globalData
    ? [...buildCountryMetrics(globalData)].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    : [];
  const movers = globalData ? learningPovertyMovers(globalData, 3) : null;

  const stateMetrics = usData ? buildStateMetrics(usData) : [];
  const usKpi = usData ? nationalKpis(usData) : null;
  const stressedStates = [...stateMetrics]
    .filter((s) => s.stress.score != null)
    .sort((a, b) => (b.stress.score ?? 0) - (a.stress.score ?? 0))
    .slice(0, 6);

  const usYears = usData?.meta.achievement.schoolYears ?? [];
  const usReadingSpark = usData
    ? usYears.map((y) =>
        weightedMean(
          usData.states.map((s) => ({
            value: s.history.find((h) => h.year === y)?.reading ?? null,
            weight: s.tested,
          })),
        ),
      )
    : [];
  const usReadingDelta =
    usReadingSpark.length >= 2
      ? (usReadingSpark[usReadingSpark.length - 1] ?? 0) - (usReadingSpark[usReadingSpark.length - 2] ?? 0)
      : null;

  const usMovers = stateMetrics
    .map((s) => ({ row: s, delta: latestChange(s.state.history, "reading") }))
    .filter((m): m is { row: (typeof stateMetrics)[number]; delta: number } => m.delta != null);
  const readingImprovers = [...usMovers].sort((a, b) => b.delta - a.delta).slice(0, 3);
  const readingDecliners = [...usMovers].sort((a, b) => a.delta - b.delta).slice(0, 3);

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="Executive Brief"
        title="Foundational skills, under pressure"
        description="One view of the health of core reading and math skills and the stressors around them — global learning poverty and out-of-school children, US proficiency and chronic absenteeism, and a composite Stress Index from nation to district."
        meta={
          <>
            {globalData ? <FreshnessChip meta={globalData.meta} label="World Bank" /> : null}
            {usData ? (
              <FreshnessChip meta={snapshotFeedMeta(usData.meta.achievement)} label="EDFacts" />
            ) : null}
            {usData?.meta.absenteeism ? (
              <FreshnessChip meta={snapshotFeedMeta(usData.meta.absenteeism)} label="CRDC" />
            ) : null}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Learning poverty · global"
          value={globalKpi ? pct(globalKpi.meanLearningPoverty) : "—"}
          sub={
            globalKpi
              ? `${globalKpi.withLearningPoverty} of ${globalKpi.countries} countries reporting`
              : "feed unavailable"
          }
          spark={globalData ? meanSeries(globalData.rows, globalData.years, "lp") : undefined}
          sparkColor="var(--color-chart-amber)"
          footnote="Country mean, most recent year"
        />
        <KpiCard
          label="Out of school · global"
          value={globalKpi ? pct(globalKpi.meanOutOfSchool) : "—"}
          sub="primary age, country mean"
          spark={globalData ? meanSeries(globalData.rows, globalData.years, "oos") : undefined}
        />
        <KpiCard
          label="Reading proficiency · US"
          value={usKpi ? pct(usKpi.reading) : "—"}
          sub={schoolYearLabel(usData?.meta.achievement.schoolYear)}
          delta={usReadingDelta}
          deltaGoodWhen="up"
          spark={usReadingSpark}
          sparkColor="var(--color-chart-reading)"
          footnote="Students tested-weighted state mean"
        />
        <KpiCard
          label="Math proficiency · US"
          value={usKpi ? pct(usKpi.math) : "—"}
          sub={schoolYearLabel(usData?.meta.achievement.schoolYear)}
          spark={
            usData
              ? usYears.map((y) =>
                  weightedMean(
                    usData.states.map((s) => ({
                      value: s.history.find((h) => h.year === y)?.math ?? null,
                      weight: s.tested,
                    })),
                  ),
                )
              : undefined
          }
          sparkColor="var(--color-chart-math)"
          footnote="Students tested-weighted state mean"
        />
        <KpiCard
          label="Chronic absenteeism · US"
          value={usKpi ? pct(usKpi.absenteeism) : "—"}
          sub={schoolYearLabel(usData?.meta.absenteeism?.schoolYear)}
          footnote="Absent 15+ days ÷ enrollment (CRDC)"
        />
        <KpiCard
          label="Child poverty context · US"
          value={usKpi ? pct(usKpi.poverty) : "—"}
          sub="ACS 1-year, income below poverty"
          footnote="Used as a stress input, not an outcome"
        />
      </section>

      <Section
        title="Global stress map"
        subtitle="Composite of learning poverty, out-of-school, and completion gap — peer-relative across countries"
        right={
          globalData ? (
            <Link href="/global" className="text-[12px] font-medium text-brand-600 hover:underline">
              Open global lens →
            </Link>
          ) : null
        }
      >
        {globalData ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="card p-3">
              <WorldMap
                rows={countryMetrics.map((m) => ({ name: m.country.name, value: m.score }))}
                bands={STRESS_BANDS}
                formatValue={(v) => `${v.toFixed(0)} / 100`}
              />
              <div className="mt-2 px-1">
                <MapLegend bands={STRESS_BANDS} />
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-[13px] font-semibold text-ink">Most stressed systems</h3>
              <p className="mb-3 text-[11.5px] text-muted">
                Composite learning-stress score, 0–100 (50 = country-cohort average)
              </p>
              <RankBarList
                items={countryMetrics.slice(0, 6).map((m) => ({
                  key: m.country.iso3,
                  label: m.country.name,
                  value: m.score ?? 0,
                  detail: `Learning poverty ${pct(m.country.learningPoverty)} · completion ${pct(m.country.completion)}`,
                }))}
                formatValue={(v) => `${v.toFixed(0)}`}
                barColor="var(--color-chart-red)"
              />
              <div className="mt-4 border-t border-line pt-3">
                <SourceLine meta={globalData.meta} extra="Live feed, refreshed hourly" />
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Global feed unavailable"
            detail="The World Bank API could not be reached. The dashboard will recover automatically on the next successful refresh — run `npm run verify-feeds` to diagnose."
          />
        )}
      </Section>

      <Section
        title="United States — where stress concentrates"
        subtitle={`State Stress Index: proficiency gap 45% · chronic absenteeism 30% · poverty context 25% (${schoolYearLabel(
          usData?.meta.achievement.schoolYear,
        )})`}
        right={
          usData ? (
            <Link href="/us" className="text-[12px] font-medium text-brand-600 hover:underline">
              Open US drill-down →
            </Link>
          ) : null
        }
      >
        {usData ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="card p-4">
              <h3 className="text-[13px] font-semibold text-ink">Largest movers — reading proficiency</h3>
              <p className="mb-3 text-[11.5px] text-muted">
                Latest year-over-year change in 4th–8th grade reading (all students)
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="label-xs mb-2 text-stable">Improving</div>
                  <RankBarList
                    items={readingImprovers.map((m) => ({
                      key: m.row.state.abbr,
                      label: m.row.state.name,
                      value: Math.abs(m.delta),
                      detail: `Reading ${pct(m.row.state.reading)} · ${signed(m.delta)} pts YoY`,
                      href: `/us/${m.row.state.abbr.toLowerCase()}`,
                    }))}
                    formatValue={(v) => `+${v.toFixed(1)}`}
                    barColor="var(--color-chart-reading)"
                  />
                </div>
                <div>
                  <div className="label-xs mb-2 text-critical">Declining</div>
                  <RankBarList
                    items={readingDecliners.map((m) => ({
                      key: m.row.state.abbr,
                      label: m.row.state.name,
                      value: Math.abs(m.delta),
                      detail: `Reading ${pct(m.row.state.reading)} · ${signed(m.delta)} pts YoY`,
                      href: `/us/${m.row.state.abbr.toLowerCase()}`,
                    }))}
                    formatValue={(v) => `−${v.toFixed(1)}`}
                    barColor="var(--color-chart-red)"
                  />
                </div>
              </div>
              <div className="mt-4 border-t border-line pt-3">
                <SourceLine
                  meta={snapshotFeedMeta(usData.meta.achievement)}
                  extra={`Snapshot school years: ${usYears.join(", ")}`}
                />
              </div>
            </div>
            <div className="card p-4">
              <h3 className="text-[13px] font-semibold text-ink">Highest state stress</h3>
              <p className="mb-3 text-[11.5px] text-muted">Top 6 states by composite Stress Index</p>
              <RankBarList
                items={stressedStates.map((s) => ({
                  key: s.state.abbr,
                  label: s.state.name,
                  value: s.stress.score ?? 0,
                  detail: `Proficiency ${pct(s.state.reading != null && s.state.math != null ? (s.state.reading + s.state.math) / 2 : (s.state.reading ?? s.state.math))} · absenteeism ${pct(s.state.absenteeism)}`,
                  href: `/us/${s.state.abbr.toLowerCase()}`,
                }))}
                formatValue={(v) => `${v.toFixed(0)}`}
                barColor="var(--color-chart-orange)"
              />
            </div>
          </div>
        ) : (
          <EmptyState
            title="US snapshots not found"
            detail="The EDFacts achievement snapshot is missing. Run `npm run ingest` (achievement pipeline) and refresh — the dashboard renders again as soon as data/snapshots is populated."
          />
        )}
      </Section>

      <Section
        title="Global movement — learning poverty"
        subtitle="Largest change between the two most recent reporting years per country"
      >
        {globalData && movers ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card p-4">
              <div className="label-xs mb-2 text-stable">Sharpest improvements</div>
              <RankBarList
                items={movers.improvers.map((m) => ({
                  key: m.country.iso3,
                  label: m.country.name,
                  value: Math.abs(m.delta),
                  detail: `Now ${pct(m.country.learningPoverty)} (${signed(m.delta)} pts)`,
                }))}
                formatValue={(v) => `−${v.toFixed(1)} pts`}
                barColor="var(--color-chart-reading)"
                emptyText="No country has two comparable reporting years yet."
              />
            </div>
            <div className="card p-4">
              <div className="label-xs mb-2 text-critical">Sharpest deteriorations</div>
              <RankBarList
                items={movers.decliners.map((m) => ({
                  key: m.country.iso3,
                  label: m.country.name,
                  value: Math.abs(m.delta),
                  detail: `Now ${pct(m.country.learningPoverty)} (${signed(m.delta)} pts)`,
                }))}
                formatValue={(v) => `+${v.toFixed(1)} pts`}
                barColor="var(--color-chart-red)"
                emptyText="No country has two comparable reporting years yet."
              />
            </div>
          </div>
        ) : (
          <EmptyState
            title="Movement analysis unavailable"
            detail="Learning-poverty movement needs the live World Bank feed. It returns automatically when the feed recovers."
          />
        )}
      </Section>

      <p className="text-[11px] leading-5 text-muted">
        Composite Stress Index is peer-relative: bands compare a geography with its cohort (countries,
        states, or in-state districts) — see{" "}
        <Link href="/methodology" className="underline">
          Methodology
        </Link>{" "}
        for the formula, weights, refresh cadence, and known limitations. Coverage:{" "}
        {globalKpi ? `${num(globalKpi.withLearningPoverty)} countries` : "—"} with learning-poverty data,{" "}
        {usKpi ? `${num(usKpi.statesWithProficiency)} US states/territories` : "—"} with proficiency data.
      </p>
    </div>
  );
}
