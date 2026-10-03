// About — provenance, attribution, data flow, and disclaimers.

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";

export const metadata: Metadata = {
  title: "About — Foundational Skills Stress",
  description:
    "Provenance, attribution, licensing, and the data pipeline behind the Foundational Skills Stress dashboard.",
};

const PIPELINE: { step: string; title: string; detail: string }[] = [
  {
    step: "01",
    title: "Discover",
    detail:
      "The federal data portal (data.ed.gov) is queried for the current EDFacts release; the mirror at eddatacenter.org supplies direct, streamable CSVs for the achievement series back to 2013-14.",
  },
  {
    step: "02",
    title: "Ingest (build time)",
    detail:
      "`npm run ingest` streams the large source files (140MB+ district files), filters to all-students/all-grades rows, resolves censored ranges to midpoints, and joins CRDC absenteeism counts with same-year CRDC enrollment to produce rates.",
  },
  {
    step: "03",
    title: "Snapshot",
    detail:
      "The result is written to /data/snapshots as compact JSON (a few hundred KB total) that ships with the repository — so the dashboard renders even when every live feed is unreachable.",
  },
  {
    step: "04",
    title: "Serve (request time)",
    detail:
      "Pages merge the achievement snapshot, the absenteeism snapshot, the live Census poverty feed, and (on the global lens) the hourly-revalidated World Bank API. The composite index is computed server-side per cohort.",
  },
];

const ATTRIBUTION: { source: string; license: string; link: string }[] = [
  {
    source: "World Bank Open Data — EdStats & World Development Indicators",
    license: "CC BY 4.0",
    link: "https://data.worldbank.org",
  },
  {
    source: "U.S. Department of Education, EDFacts — achievement files (via the eddatacenter.org mirror)",
    license: "Public domain (US federal data product)",
    link: "https://www.eddatacenter.org",
  },
  {
    source: "U.S. Department of Education, CRDC 2015-16 — chronic absenteeism & enrollment",
    license: "Public domain (US federal data product)",
    link: "https://civilrightsdata.ed.gov",
  },
  {
    source: "U.S. Census Bureau — American Community Survey 1-year estimates (B17001)",
    license: "Public domain",
    link: "https://data.census.gov",
  },
];

export default function AboutPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="About"
        title="Provenance, attribution, and how this was built"
        description="This dashboard exists to make the health of foundational skills — and the stressors acting on them — legible to decision-makers in one place, using nothing but public data. Every transformation is reproducible from the repository."
      />

      <Section title="Developed and Designed by" subtitle="Project credit">
        <div className="card flex flex-wrap items-center gap-5 p-5">
          <Image
            src="/emmanuel-onuoha.jpg"
            alt="Portrait of Emmanuel Onuoha"
            width={88}
            height={88}
            className="h-[88px] w-[88px] rounded-full object-cover object-[50%_28%] ring-2 ring-line"
          />
          <div>
            <div className="text-[15px] font-semibold text-ink">Emmanuel Onuoha</div>
            <p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-muted">
              Developed and Designed by Emmanuel Onuoha — the data pipeline, the composite Stress
              Index, and the executive dashboard experience, built entirely on open federal and
              international data.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Why this dashboard"
        subtitle="The executive problem it addresses"
      >
        <div className="card p-5">
          <p className="max-w-3xl text-[13px] leading-6 text-muted">
            Foundational skills — early reading and math — are the platform every later outcome is
            built on, and the stressors that erode them (absenteeism, poverty, learning loss) are
            tracked in fragments across federal, civil-rights, and international statistical
            systems. No single view connects them with a comparable metric. This project closes that
            gap: one composite{" "}
            <Link href="/methodology" className="underline">
              Stress Index
            </Link>{" "}
            computed the same way at every level — global country, US state, and US district — with
            the freshness of every input stated on the panel it feeds.
          </p>
        </div>
      </Section>

      <Section
        title="The data pipeline"
        subtitle="From federal and international sources to the rendered panel"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map((p) => (
            <div key={p.step} className="card p-4">
              <div className="nums text-[11px] font-semibold tracking-wider text-brand-500">
                {p.step}
              </div>
              <h3 className="mt-1 text-[13px] font-semibold text-ink">{p.title}</h3>
              <p className="mt-1.5 text-[12px] leading-5 text-muted">{p.detail}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Attribution & licenses"
        subtitle="All source data is public; please attribute the originators, not this dashboard"
      >
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider uppercase">
                <th className="px-4 py-2.5 font-semibold text-muted">Source</th>
                <th className="px-4 py-2.5 font-semibold text-muted">License</th>
                <th className="px-4 py-2.5 font-semibold text-muted">Home</th>
              </tr>
            </thead>
            <tbody>
              {ATTRIBUTION.map((a) => (
                <tr key={a.source} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3 text-ink">{a.source}</td>
                  <td className="px-4 py-3 text-muted">{a.license}</td>
                  <td className="px-4 py-3">
                    <a
                      href={a.link}
                      className="text-brand-600 underline underline-offset-2"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.link.replace(/^https?:\/\//, "")}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] leading-5 text-muted">
          The Urban Institute Education Data API adapter is shipped but optional: the host blocks
          this deployment network, so the dashboard treats it purely as opportunistic enrichment and
          falls back to the federal snapshot path above — there is no hard dependency on it. The
          eddatacenter.org mirror is used only for its direct, streamable copies of the same federal
          EDFacts files; the originating agency of record is the U.S. Department of Education.
        </p>
      </Section>

      <Section
        title="Engineering notes"
        subtitle="Reproducibility and reliability"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Stack</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] leading-5 text-muted">
              <li>Next.js (App Router) + TypeScript + Tailwind CSS — all fetching is server-side.</li>
              <li>
                Recharts for trends and rankings; d3-geo + topojson-client for the world and US state
                choropleths (pre-projected Albers atlas — no heavyweight map framework).
              </li>
              <li>
                Vitest unit-tests the index math (z-scores, renormalized weights, banding, clamping).
              </li>
            </ul>
          </div>
          <div className="card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Reliability</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] leading-5 text-muted">
              <li>
                Every feed call carries a timeout and one retry; a failed live revalidation serves the
                last good cached copy rather than an empty panel.
              </li>
              <li>
                The ingest pipeline resumes at byte offsets after a network reset, so a 140MB stream
                never restarts from zero.
              </li>
              <li>
                <code className="nums rounded bg-canvas px-1 py-0.5 text-[11px]">
                  npm run verify-feeds
                </code>{" "}
                smoke-tests every endpoint (status + shape) and is the first troubleshooting step for
                a red panel.
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Disclaimer" subtitle="Scope and stewardship">
        <div className="card p-5">
          <ul className="list-disc space-y-2 pl-5 text-[12.5px] leading-5 text-muted">
            <li>
              This is an independent analytics product. It is <strong>not</strong> an official
              dashboard of the U.S. Department of Education, the U.S. Census Bureau, or the World
              Bank.
            </li>
            <li>
              The Stress Index is a decision-support heuristic — 45% proficiency gap, 30% chronic
              absenteeism, 25% poverty context, peer-relative — documented in full on the{" "}
              <Link href="/methodology" className="underline">
                Methodology
              </Link>{" "}
              page — including the reasons cross-state proficiency comparisons are directional only.
            </li>
            <li>
              Source datasets may be refreshed upstream at any time; this dashboard shows the vintage
              it actually has rather than implying recency.
            </li>
          </ul>
        </div>
      </Section>
    </div>
  );
}
