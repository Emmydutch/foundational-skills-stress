import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmptyState } from "@/components/empty-state";
import { FreshnessChip } from "@/components/freshness-chip";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { SourceLine } from "@/components/source-line";
import { StressBadge } from "@/components/stress-badge";
import { StressGauge } from "@/components/stress-gauge";
import { TrendChart } from "@/components/trend-chart";
import { getUsDataset } from "@/lib/data/us";
import { snapshotFeedMeta } from "@/lib/data/meta";
import { buildDistrictMetrics, latestChange, type DistrictStressRow } from "@/lib/us-metrics";
import { num, pct, signed, schoolYearLabel } from "@/lib/format";
import type { DistrictAchRow, UsStateRecord } from "@/lib/types";

export async function generateMetadata({
  params,
}: PageProps<"/us/[state]/[district]">): Promise<Metadata> {
  const { state: stateSlug, district: districtId } = await params;
  const data = await getUsDataset();
  const state = data?.states.find((s) => s.abbr.toLowerCase() === stateSlug.toLowerCase());
  const district = state ? data?.districtsByState.get(state.fips)?.find((d) => d.id === districtId) : null;
  return {
    title: district
      ? `${district.name} — Foundational Skills Stress`
      : "District — Foundational Skills Stress",
  };
}

function percentileOfBetter(values: (number | null)[], mine: number | null): number | null {
  if (mine == null) return null;
  const xs = values.filter((v): v is number => v != null);
  if (xs.length === 0) return null;
  const better = xs.filter((v) => v < mine).length;
  return Math.round((better / xs.length) * 100);
}

export default async function DistrictPage({ params }: PageProps<"/us/[state]/[district]">) {
  const { state: stateSlug, district: districtId } = await params;
  const data = await getUsDataset();
  const state: UsStateRecord | undefined = data?.states.find(
    (s) => s.abbr.toLowerCase() === stateSlug.toLowerCase(),
  );
  const district: DistrictAchRow | undefined = state
    ? data?.districtsByState.get(state.fips)?.find((d) => d.id === districtId)
    : undefined;

  if (!data || !state || !district) {
    if (!data || !state) {
      return (
        <EmptyState
          title="US snapshots not found"
          detail="The EDFacts achievement snapshot is missing. Run `npm run ingest` and refresh."
        />
      );
    }
    notFound();
  }

  const peers: DistrictStressRow[] = buildDistrictMetrics(data.districtsByState.get(state.fips) ?? []).sort(
    (a, b) => (b.stress.score ?? -1) - (a.stress.score ?? -1),
  );
  const mine = peers.find((p) => p.district.id === district.id);
  const rank = peers.findIndex((p) => p.district.id === district.id) + 1;

  const readingPercentile = percentileOfBetter(
    peers.map((p) => p.district.reading),
    district.reading,
  );
  const mathPercentile = percentileOfBetter(
    peers.map((p) => p.district.math),
    district.math,
  );

  const readingDelta = latestChange(district.history, "reading");
  const mathDelta = latestChange(district.history, "math");

  const trendSeries = [
    {
      name: "Reading",
      color: "var(--color-chart-reading)",
      points: district.history.map((h) => ({ label: h.year, value: h.reading })),
    },
    {
      name: "Math",
      color: "var(--color-chart-math)",
      points: district.history.map((h) => ({ label: h.year, value: h.math })),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "United States", href: "/us" },
            { label: state.name, href: `/us/${stateSlug.toLowerCase()}` },
            { label: district.name },
          ]}
        />
        <PageHeader
          eyebrow="District brief"
          title={district.name}
          description={`${state.name} district ranked ${rank} of ${peers.length} by composite stress (against in-state peers). ${
            readingPercentile != null
              ? `Reading proficiency is above ${readingPercentile}% of districts in the state${
                  mathPercentile != null ? `; math above ${mathPercentile}%.` : "."
                }`
              : ""
          }`}
          meta={<FreshnessChip meta={snapshotFeedMeta(data.meta.achievement)} label="EDFacts" />}
        />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Reading proficiency"
          value={pct(district.reading)}
          sub={schoolYearLabel(data.meta.achievement.schoolYear)}
          delta={readingDelta}
          deltaGoodWhen="up"
          spark={district.history.map((h) => h.reading)}
          sparkColor="var(--color-chart-reading)"
        />
        <KpiCard
          label="Math proficiency"
          value={pct(district.math)}
          sub={schoolYearLabel(data.meta.achievement.schoolYear)}
          delta={mathDelta}
          deltaGoodWhen="up"
          spark={district.history.map((h) => h.math)}
          sparkColor="var(--color-chart-math)"
        />
        <KpiCard
          label="Students assessed"
          value={district.tested ? num(district.tested) : "—"}
          sub="all grades, all students"
        />
        <KpiCard
          label="Participation"
          value={pct(district.participation)}
          sub="assessment participation rate"
        />
        <KpiCard
          label="Reading in-state rank"
          value={readingPercentile != null ? `Top ${Math.max(1, 100 - readingPercentile)}%` : "—"}
          sub={`above ${readingPercentile ?? "—"}% of ${peers.length} districts`}
        />
        <KpiCard
          label="Stress index"
          value={mine?.stress.score != null ? Math.round(mine.stress.score) : "—"}
          sub={<StressBadge score={mine?.stress.score ?? null} band={mine?.stress.band ?? null} showScore={false} />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="card flex flex-col items-center p-4">
          <div className="label-xs self-start">Composite stress</div>
          <StressGauge score={mine?.stress.score ?? null} band={mine?.stress.band ?? null} />
          <div className="mt-2 w-full">
            <StressBadge score={mine?.stress.score ?? null} band={mine?.stress.band ?? null} />
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
              {(mine?.stress.components ?? []).map((c) => (
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
          {mine && mine.stress.missing.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted">
              District-level {mine.stress.missing.join(" and ")} are not published in the CRDC state
              tables — the gap component carries full weight.
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
            <SourceLine
              meta={snapshotFeedMeta(data.meta.achievement)}
              extra={`NCES LEA ID ${district.id}`}
            />
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h3 className="text-[13px] font-semibold text-ink">State context</h3>
        <p className="mb-3 text-[11.5px] text-muted">
          How {state.name} frames this district&apos;s stressors
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="State reading" value={pct(state.reading)} sub="all districts" />
          <KpiCard label="State math" value={pct(state.math)} sub="all districts" />
          <KpiCard
            label="State absenteeism"
            value={pct(state.absenteeism)}
            sub={schoolYearLabel(data.meta.absenteeism?.schoolYear ?? "2015-16")}
          />
          <KpiCard label="State poverty" value={pct(state.poverty)} sub="ACS 1-year" />
        </div>
      </section>

      <p className="text-[11px] leading-5 text-muted">
        Year-over-year change: reading {signed(readingDelta)} pts, math {signed(mathDelta)} pts. Rank and
        percentiles are computed against {peers.length} in-state districts in the current snapshot.
        National percentile benchmarks are not applied here — see{" "}
        <Link href="/methodology" className="underline">
          Methodology
        </Link>
        .
      </p>
    </div>
  );
}
