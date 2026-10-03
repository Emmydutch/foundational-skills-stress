// Methodology — documents the composite stress index, every data source,
// refresh cadence, the freshness contract, and known limitations.
//
// The index constants are imported live from lib/stress-index so this page can
// never drift out of sync with the math.

import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { BAND_META, STRESS_WEIGHTS, type StressBand } from "@/lib/stress-index";

export const metadata: Metadata = {
  title: "Methodology — Foundational Skills Stress",
  description:
    "How the composite Stress Index is computed, where every data point comes from, refresh cadence per feed, and known limitations.",
};

const BAND_ORDER: StressBand[] = ["stable", "watch", "elevated", "critical"];

const SOURCES: {
  feed: string;
  scope: string;
  indicators: string;
  mode: "Live" | "Snapshot";
  cadence: string;
  license: string;
}[] = [
  {
    feed: "World Bank Open Data (EdStats / WDI)",
    scope: "Global — ~200 countries",
    indicators:
      "Learning poverty (SE.LPV.PRIM), primary completion (SE.PRM.CUAT.ZS), out-of-school primary-age children (SE.PRM.UNER.ZS)",
    mode: "Live",
    cadence: "Revalidated hourly; source series update annually (with lag)",
    license: "CC BY 4.0",
  },
  {
    feed: "EDFacts achievement (ED, via eddatacenter.org mirror)",
    scope: "US — national, state, district",
    indicators:
      "Reading and math proficiency rates for all students, all grades; students assessed and participation",
    mode: "Snapshot",
    cadence: "Annual federal release; latest available is school year 2021-22. Refresh with `npm run ingest`",
    license: "Public domain (US federal data)",
  },
  {
    feed: "CRDC 2015-16 chronic absenteeism + enrollment",
    scope: "US — national, state, district",
    indicators:
      "Students missing 15+ school days; district enrollment used as the same-year denominator",
    mode: "Snapshot",
    cadence: "Biennial civil-rights collection; district detail is the latest published at scale",
    license: "Public domain (US federal data)",
  },
  {
    feed: "U.S. Census Bureau ACS 1-year (B17001)",
    scope: "US — state",
    indicators: "Share of population below the poverty line, used as context stress",
    mode: "Live",
    cadence: "Revalidated daily; latest published ACS release is selected automatically",
    license: "Public domain",
  },
  {
    feed: "Urban Institute Education Data API",
    scope: "US — fallback enrichment",
    indicators: "Optional adapter; used opportunistically when the host is reachable from this network",
    mode: "Live",
    cadence: "On request, with automatic fallback to EDFacts snapshots",
    license: "Varies by upstream source",
  },
];

function ModeTag({ mode }: { mode: "Live" | "Snapshot" }) {
  const live = mode === "Live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${
        live ? "border-stable-soft bg-stable-soft text-stable" : "border-line bg-canvas text-brand-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-stable" : "bg-brand-400"}`} aria-hidden />
      {live ? "Live feed" : "Snapshot"}
    </span>
  );
}

export default function MethodologyPage() {
  const gapWeight = Math.round(STRESS_WEIGHTS.gap * 100);
  const absWeight = Math.round(STRESS_WEIGHTS.absenteeism * 100);
  const povWeight = Math.round(STRESS_WEIGHTS.poverty * 100);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Methodology & data lineage"
        title="How the Stress Index works"
        description="Every number on this dashboard is traceable to a public source and a documented transformation. This page defines the composite index, the component inputs, refresh cadence per feed, and the limitations you should weigh when reading the results."
      />

      <Section
        title="The composite Stress Index"
        subtitle="A peer-relative 0–100 score — deliberately simple, auditable, and recomputed from source on every build"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-[13px] font-semibold text-ink">Definition</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-[12.5px] leading-5 text-muted">
              <li>
                Each component is converted to a <strong className="text-ink">z-score</strong> against
                the peer cohort (states nationally; districts within their own state — so a district is
                judged against comparable districts facing the same state assessment regime).
              </li>
              <li>
                Components are combined with fixed weights — proficiency gap{" "}
                <strong className="text-ink">{gapWeight}%</strong>, chronic absenteeism{" "}
                <strong className="text-ink">{absWeight}%</strong>, poverty context{" "}
                <strong className="text-ink">{povWeight}%</strong>. Missing components are dropped and
                the remaining weights are renormalized.
              </li>
              <li>
                The composite z maps to the executive scale:{" "}
                <code className="nums rounded bg-canvas px-1.5 py-0.5 text-[11.5px] text-ink">
                  score = clamp(50 + 15·z, 0, 100)
                </code>
                . By construction <strong className="text-ink">50 is the cohort average</strong>, one
                point is one-fifteenth of a standard deviation.
              </li>
            </ol>
            <p className="mt-3 border-t border-line pt-3 text-[11.5px] leading-5 text-muted">
              The index measures <em>relative</em> stress within the cohort, not absolute compliance.
              A Critical band means a jurisdiction is far behind its peers on these inputs — it is a
              prioritization signal, not a judgment on any single school.
            </p>
          </div>

          <div className="card p-5">
            <h3 className="text-[13px] font-semibold text-ink">Bands</h3>
            <table className="mt-2 w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider uppercase">
                  <th className="py-1.5 font-semibold text-muted">Band</th>
                  <th className="py-1.5 font-semibold text-muted">Score range</th>
                  <th className="py-1.5 font-semibold text-muted">Reading</th>
                </tr>
              </thead>
              <tbody>
                {BAND_ORDER.map((band) => {
                  const meta = BAND_META[band];
                  return (
                    <tr key={band} className="border-b border-line/60 last:border-0">
                      <td className="py-2">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold"
                          style={{ backgroundColor: `var(--color-${band}-soft)`, color: `var(--color-${band})` }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: `var(--color-${band})` }}
                            aria-hidden
                          />
                          {meta.label}
                        </span>
                      </td>
                      <td className="nums py-2 text-ink">{meta.range}</td>
                      <td className="py-2 text-muted">
                        {band === "stable"
                          ? "At or better than the cohort norm"
                          : band === "watch"
                            ? "Drifting behind peers — monitor"
                            : band === "elevated"
                              ? "Clearly behind peers — intervene"
                              : "Far behind peers — executive priority"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h3 className="mt-4 text-[13px] font-semibold text-ink">Component inputs</h3>
            <ul className="mt-2 space-y-1.5 text-[12.5px] leading-5 text-muted">
              <li>
                <strong className="text-ink">Proficiency gap</strong> — 100 minus the average of
                reading and math proficiency (all students, all grades).
              </li>
              <li>
                <strong className="text-ink">Chronic absenteeism</strong> — share of students missing
                15+ school days in a year.
              </li>
              <li>
                <strong className="text-ink">Poverty context</strong> — ACS poverty rate, a proxy for
                out-of-school stressors acting on foundational skills.
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section
        title="Data sources & refresh cadence"
        subtitle="Snapshot feeds are ingested at build time (npm run ingest); live feeds revalidate server-side"
      >
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider uppercase">
                <th className="px-4 py-2.5 font-semibold text-muted">Source</th>
                <th className="px-4 py-2.5 font-semibold text-muted">Scope</th>
                <th className="px-4 py-2.5 font-semibold text-muted">Indicators</th>
                <th className="px-4 py-2.5 font-semibold text-muted">Mode</th>
                <th className="px-4 py-2.5 font-semibold text-muted">Refresh</th>
                <th className="px-4 py-2.5 font-semibold text-muted">License</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.feed} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{s.feed}</td>
                  <td className="px-4 py-3 text-muted">{s.scope}</td>
                  <td className="max-w-[280px] px-4 py-3 text-muted">{s.indicators}</td>
                  <td className="px-4 py-3">
                    <ModeTag mode={s.mode} />
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-muted">{s.cadence}</td>
                  <td className="px-4 py-3 text-muted">{s.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="The freshness contract"
        subtitle="What every panel on this dashboard promises about its data"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Live feeds</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              Fetched server-side with hourly (World Bank) and daily (Census) revalidation. Panels
              carry an <em>updated …</em> chip. If a revalidation fails, the last good copy is served
              and the chip turns amber — the dashboard never renders empty.
            </p>
          </div>
          <div className="card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Snapshot feeds</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              EDFacts achievement, CRDC absenteeism, and enrollment ship as compact JSON snapshots in
              the repository, rebuilt with{" "}
              <code className="nums rounded bg-canvas px-1 py-0.5 text-[11px]">npm run ingest</code>.
              Panels show the school year, never an implied recency.
            </p>
          </div>
          <div className="card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Degraded-mode demos</h3>
            <p className="mt-1.5 text-[12px] leading-5 text-muted">
              Setting{" "}
              <code className="nums rounded bg-canvas px-1 py-0.5 text-[11px]">
                STRESS_FAIL_FEEDS=global,us,census
              </code>{" "}
              force-fails feeds so the fallback states can be demonstrated deliberately (see the{" "}
              <Link href="/about" className="underline">
                About
              </Link>{" "}
              page).
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Known limitations"
        subtitle="Read everything below before drawing cross-jurisdiction conclusions"
      >
        <div className="card p-5">
          <ul className="list-disc space-y-2.5 pl-5 text-[12.5px] leading-5 text-muted">
            <li>
              <strong className="text-ink">Proficiency is state-defined.</strong> Under ESSA each
              state sets its own standards and cut scores, so EDFacts proficiency rates are{" "}
              <em>not</em> directly comparable across states. District rankings are computed within a
              single state for exactly this reason; national roll-ups are directional.
            </li>
            <li>
              <strong className="text-ink">Absenteeism lags.</strong> The district-level chronic
              absenteeism rates on this dashboard come from the CRDC 2015-16 collection — the latest
              civil-rights collection with full district coverage in a distributable file. Rates are
              counts divided by same-year CRDC enrollment. Treat them as a structural baseline, not a
              current-year measure.
            </li>
            <li>
              <strong className="text-ink">Poverty is state-level only.</strong> The ACS input covers
              states, so district-level poverty is not yet an input. District scores rest on the
              proficiency gap and (where published) absenteeism; the missing weight is renormalized
              onto the gap component.
            </li>
            <li>
              <strong className="text-ink">Small-district noise.</strong> Proficiency rates for very
              small districts swing on a few students. Rank tables label low-N districts with their
              tested counts so outliers can be spotted, but the index does not apply a minimum-N
              filter.
            </li>
            <li>
              <strong className="text-ink">Release lag is universal.</strong> Federal assessment data
              arrives about a year after a school year ends, and World Bank learning-poverty series
              update on their own (slower) schedule. The freshness chips tell you exactly what vintage
              you are looking at; always read them before acting.
            </li>
            <li>
              <strong className="text-ink">Suppression.</strong> Source files censor small cells
              (e.g. &ldquo;&le;5%&rdquo; or range values). The ingester resolves ranges to midpoints
              and drops non-numeric cells, so a minority of districts have partially populated
              entries — they render as &ldquo;—&rdquo; rather than guesses.
            </li>
          </ul>
        </div>
      </Section>
    </div>
  );
}
