import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DataTable } from "@/components/data-table";
import { DistrictComparator, type CompareDistrict } from "@/components/district-comparator";
import { EmptyState } from "@/components/empty-state";
import { FreshnessChip } from "@/components/freshness-chip";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { SourceLine } from "@/components/source-line";
import { StressBadge } from "@/components/stress-badge";
import { StressGauge } from "@/components/stress-gauge";
import { TrendChart } from "@/components/trend-chart";
import { getUsDataset } from "@/lib/data/us";
import { snapshotFeedMeta } from "@/lib/data/meta";
import { BAND_META, BAND_ORDER } from "@/lib/stress-index";
import { buildDistrictMetrics, buildStateMetrics, latestChange } from "@/lib/us-metrics";
import { num, pct, signed, schoolYearLabel } from "@/lib/format";

const BAND_FILTER_OPTIONS = BAND_ORDER.map((b) => ({
  value: b as string,
  label: `${BAND_META[b].label} (${BAND_META[b].range})`,
}));

const SIZE_TIER_OPTIONS = [
  { value: "lt1k", label: "Under 1,000" },
  { value: "1k-5k", label: "1,000–4,999" },
  { value: "5k-25k", label: "5,000–24,999" },
  { value: "gte25k", label: "25,000+" },
];

/** Enrollment-size bucket for the district league filter (students tested). */
function sizeTier(tested: number | null): string {
  if (tested == null) return "";
  if (tested < 1000) return "lt1k";
  if (tested < 5000) return "1k-5k";
  if (tested < 25000) return "5k-25k";
  return "gte25k";
}

export async function generateMetadata({ params }: PageProps<"/us/[state]">): Promise<Metadata> {
  const { state: slug } = await params;
  const data = await getUsDataset();
  const state = data?.states.find((s) => s.abbr.toLowerCase() === slug.toLowerCase());
  return { title: state ? `${state.name} — Foundational Skills Stress` : "State — Foundational Skills Stress" };
}

export default async function StatePage({ params }: PageProps<"/us/[state]">) {
  const { state: slug } = await params;
  const data = await getUsDataset();
  const state = data?.states.find((s) => s.abbr.toLowerCase() === slug.toLowerCase());

  if (!data || !state) {
    if (!data) {
      return (
        <EmptyState
          title="US snapshots not found"
          detail="The EDFacts achievement snapshot is missing. Run `npm run ingest` and refresh."
        />
      );
    }
    notFound();
  }

  const stateMetrics = buildStateMetrics(data);
  const ranked = [...stateMetrics]
    .filter((s) => s.stress.score != null)
    .sort((a, b) => (b.stress.score ?? 0) - (a.stress.score ?? 0));
  const nationalRank = ranked.findIndex((s) => s.state.fips === state.fips) + 1;

  const thisState = stateMetrics.find((s) => s.state.fips === state.fips)!;
  const districts = data.districtsByState.get(state.fips) ?? [];
  const districtMetrics = buildDistrictMetrics(districts).sort(
    (a, b) => (b.stress.score ?? -1) - (a.stress.score ?? -1),
  );
  const districtRank = new Map(districtMetrics.map((d, i) => [d.district.id, i + 1]));

  const readingDelta = latestChange(state.history, "reading");
  const mathDelta = latestChange(state.history, "math");

  const comparatorRows: CompareDistrict[] = districtMetrics
    .filter((d) => (d.district.tested ?? 0) >= 300)
    .slice(0, 400)
    .map((d) => ({
      id: d.district.id,
      name: d.district.name,
      reading: d.district.reading,
      math: d.district.math,
      tested: d.district.tested,
      score: d.stress.score,
      band: d.stress.band,
      spark: d.district.history.map((h) => h.reading),
    }));

  const trendSeries = [
    {
      name: "Reading",
      color: "var(--color-chart-reading)",
      points: state.history.map((h) => ({ label: h.year, value: h.reading })),
    },
    {
      name: "Math",
      color: "var(--color-chart-math)",
      points: state.history.map((h) => ({ label: h.year, value: h.math })),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs items={[{ label: "United States", href: "/us" }, { label: state.name }]} />
        <PageHeader
          eyebrow="State drill-down"
          title={state.name}
          description={`${state.name} ranks ${nationalRank} of ${ranked.length} states/territories by composite stress. ${
            districts.length
          } school districts in this snapshot; district scores are z-scored against in-state peers.`}
          meta={
            <>
              <FreshnessChip meta={snapshotFeedMeta(data.meta.achievement)} label="EDFacts" />
              {data.meta.absenteeism ? (
                <FreshnessChip meta={snapshotFeedMeta(data.meta.absenteeism)} label="CRDC" />
              ) : null}
            </>
          }
        />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Reading proficiency"
          value={pct(state.reading)}
          sub={schoolYearLabel(data.meta.achievement.schoolYear)}
          delta={readingDelta}
          deltaGoodWhen="up"
          spark={state.history.map((h) => h.reading)}
          sparkColor="var(--color-chart-reading)"
        />
        <KpiCard
          label="Math proficiency"
          value={pct(state.math)}
          sub={schoolYearLabel(data.meta.achievement.schoolYear)}
          delta={mathDelta}
          deltaGoodWhen="up"
          spark={state.history.map((h) => h.math)}
          sparkColor="var(--color-chart-math)"
        />
        <KpiCard
          label="Chronic absenteeism"
          value={pct(state.absenteeism)}
          sub={schoolYearLabel(data.meta.absenteeism?.schoolYear ?? "2015-16")}
          footnote="Absent 15+ days ÷ enrollment"
        />
        <KpiCard
          label="Poverty context"
          value={pct(state.poverty)}
          sub="ACS 1-year, all ages"
        />
        <KpiCard
          label="Students assessed"
          value={state.tested ? num(state.tested) : "—"}
          sub="all grades, all students"
        />
        <KpiCard
          label="Districts"
          value={num(districts.length)}
          sub={`${districtMetrics.filter((d) => d.stress.score != null).length} scored`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="card flex flex-col items-center p-4">
          <div className="label-xs self-start">Composite stress</div>
          <StressGauge score={thisState.stress.score} band={thisState.stress.band} />
          <div className="mt-2 w-full">
            <StressBadge score={thisState.stress.score} band={thisState.stress.band} />
          </div>
          <table className="mt-4 w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-muted uppercase">
                <th className="py-1.5 font-semibold">Component</th>
                <th className="py-1.5 text-right font-semibold">Value</th>
                <th className="py-1.5 text-right font-semibold">Weight</th>
              </tr>
            </thead>
            <tbody>
              {thisState.stress.components.map((c) => (
                <tr key={c.key} className="border-b border-line/60 last:border-0">
                  <td className="py-2 text-ink">{c.label}</td>
                  <td className="nums py-2 text-right text-ink">{pct(c.value)}</td>
                  <td className="nums py-2 text-right text-muted">
                    {c.weight > 0 ? `${(c.weight * 100).toFixed(0)}%` : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {thisState.stress.missing.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted">
              Not available for this state: {thisState.stress.missing.join(", ")} — remaining weights
              renormalized.
            </p>
          ) : null}
        </div>

        <div className="card p-4">
          <h3 className="text-[13px] font-semibold text-ink">Proficiency trajectory</h3>
          <p className="mb-2 text-[11.5px] text-muted">
            All students, all grades — snapshot school years {data.meta.achievement.schoolYears.join(", ")}
          </p>
          <TrendChart series={trendSeries} height={300} />
          <div className="mt-3 border-t border-line pt-3">
            <SourceLine meta={snapshotFeedMeta(data.meta.achievement)} />
          </div>
        </div>
      </section>

      <Section
        title="District league table"
        subtitle={`${districtMetrics.length} districts, most stressed first — filter by band or enrollment size, click through for a district brief`}
        right={<SourceLine meta={snapshotFeedMeta(data.meta.achievement)} />}
      >
        <DataTable
          searchPlaceholder="Search districts…"
          initialSortKey="stress"
          limit={60}
          filters={[
            { key: "band", label: "Band", options: BAND_FILTER_OPTIONS },
            { key: "size", label: "Tested", options: SIZE_TIER_OPTIONS },
          ]}
          columns={[
            { key: "rank", label: "#", align: "right" },
            { key: "name", label: "District" },
            { key: "reading", label: "Reading", align: "right" },
            { key: "math", label: "Math", align: "right" },
            { key: "tested", label: "Tested", align: "right" },
            { key: "stress", label: "Stress index", align: "right" },
          ]}
          rows={districtMetrics.map((r) => ({
            key: r.district.id,
            search: r.district.name,
            facets: { band: r.stress.band ?? "", size: sizeTier(r.district.tested) },
            sort: [
              districtRank.get(r.district.id) ?? null,
              r.district.name,
              r.district.reading,
              r.district.math,
              r.district.tested,
              r.stress.score,
            ],
            cells: [
              {
                kind: "text" as const,
                value: districtRank.get(r.district.id)?.toString() ?? "—",
                tone: "muted" as const,
              },
              {
                kind: "link" as const,
                value: r.district.name,
                href: `/us/${slug.toLowerCase()}/${r.district.id}`,
              },
              { kind: "text" as const, value: pct(r.district.reading) },
              { kind: "text" as const, value: pct(r.district.math) },
              { kind: "text" as const, value: num(r.district.tested) },
              { kind: "stress" as const, score: r.stress.score, band: r.stress.band },
            ],
          }))}
        />
      </Section>

      <Section
        title="Compare districts"
        subtitle="Pinned districts are compared on proficiency, scale, and reading trajectory"
      >
        {comparatorRows.length > 0 ? (
          <DistrictComparator districts={comparatorRows} stateAbbr={slug.toLowerCase()} />
        ) : (
          <EmptyState
            title="No comparable districts"
            detail="This state has no districts with sufficient tested counts in the current snapshot."
          />
        )}
      </Section>

      <p className="text-[11px] leading-5 text-muted">
        District stress scores use the proficiency gap against in-state peers; chronic absenteeism and
        poverty are not published at district level in the CRDC state tables, so weights renormalize to the
        gap component. See{" "}
        <Link href="/methodology" className="underline">
          Methodology
        </Link>
        . State year-over-year change: reading {signed(readingDelta)} pts, math {signed(mathDelta)} pts.
      </p>
    </div>
  );
}
