"""About — provenance, attribution, pipeline, and disclaimers.

Streamlit counterpart of ``src/app/about/page.tsx``, including the
"Developed and Designed by" credit section.
"""

from __future__ import annotations

from pathlib import Path

import streamlit as st

from lib import ui

ASSETS = Path(__file__).resolve().parents[1] / "assets"

PIPELINE = [
    {
        "step": "01",
        "title": "Discover",
        "detail": "The federal data portal (data.ed.gov) is queried for the "
        "current EDFacts release; the mirror at eddatacenter.org supplies "
        "direct, streamable CSVs for the achievement series back to 2013-14.",
    },
    {
        "step": "02",
        "title": "Ingest (build time)",
        "detail": "`npm run ingest` streams the large source files (140MB+ "
        "district files), filters to all-students/all-grades rows, resolves "
        "censored ranges to midpoints, and joins CRDC absenteeism counts with "
        "same-year CRDC enrollment to produce rates.",
    },
    {
        "step": "03",
        "title": "Snapshot",
        "detail": "The result is written to /data/snapshots as compact JSON "
        "(a few hundred KB total) that ships with the repository — so the "
        "dashboard renders even when every live feed is unreachable.",
    },
    {
        "step": "04",
        "title": "Serve (request time)",
        "detail": "Pages merge the achievement snapshot, the absenteeism "
        "snapshot, the live Census poverty feed, and (on the global lens) the "
        "hourly World Bank API. The composite index is computed on the cohort "
        "by both editions in the same way.",
    },
]

ATTRIBUTION = [
    {
        "Source": "World Bank Open Data — EdStats & World Development Indicators",
        "License": "CC BY 4.0",
        "Home": "https://data.worldbank.org",
    },
    {
        "Source": "U.S. Department of Education, EDFacts — achievement files "
        "(via the eddatacenter.org mirror)",
        "License": "Public domain (US federal data product)",
        "Home": "https://www.eddatacenter.org",
    },
    {
        "Source": "U.S. Department of Education, CRDC 2015-16 — chronic "
        "absenteeism & enrollment",
        "License": "Public domain (US federal data product)",
        "Home": "https://civilrightsdata.ed.gov",
    },
    {
        "Source": "U.S. Census Bureau — American Community Survey 1-year "
        "estimates (B17001)",
        "License": "Public domain",
        "Home": "https://data.census.gov",
    },
]

ui.page_header(
    "About",
    "Provenance, attribution, and how this was built",
    "This dashboard exists to make the health of foundational skills — and the "
    "stressors acting on them — legible to decision-makers in one place, using "
    "nothing but public data. Every transformation is reproducible from the "
    "repository.",
)

# --- Project credit -------------------------------------------------------------
st.subheader("Developed and Designed by")
st.caption("Project credit")
with st.container(border=True):
    photo, credit = st.columns([1, 6], vertical_alignment="center")
    with photo:
        st.image(str(ASSETS / "emmanuel-onuoha.jpg"), width=88)
    with credit:
        st.markdown("**Emmanuel Onuoha**")
        st.markdown(
            "Developed and Designed by Emmanuel Onuoha — the data pipeline, "
            "the composite Stress Index, and the executive dashboard "
            "experience, built entirely on open federal and international data."
        )

# --- Why this dashboard -----------------------------------------------------------
st.subheader("Why this dashboard")
st.caption("The executive problem it addresses")
with st.container(border=True):
    st.markdown(
        "Foundational skills — early reading and math — are the platform every "
        "later outcome is built on, and the stressors that erode them "
        "(absenteeism, poverty, learning loss) are tracked in fragments across "
        "federal, civil-rights, and international statistical systems. No "
        "single view connects them with a comparable metric. This project "
        "closes that gap: one composite Stress Index computed the same way at "
        "every level — global country, US state, and US district — with the "
        "freshness of every input stated on the panel it feeds."
    )
    st.page_link("app_pages/methodology.py", label="Read the methodology", icon=":material/science:")

# --- The data pipeline -------------------------------------------------------------
st.subheader("The data pipeline")
st.caption("From federal and international sources to the rendered panel")
cols = st.columns(4)
for col, item in zip(cols, PIPELINE):
    with col, st.container(border=True):
        st.caption(item["step"])
        st.markdown(f"**{item['title']}**")
        st.markdown(item["detail"])

# --- Attribution & licenses ---------------------------------------------------------
st.subheader("Attribution & licenses")
st.caption(
    "All source data is public; please attribute the originators, not this "
    "dashboard"
)
lines = [
    "| Source | License | Home |",
    "| --- | --- | --- |",
]
for a in ATTRIBUTION:
    domain = a["Home"].replace("https://", "").replace("http://", "")
    lines.append(f"| {a['Source']} | {a['License']} | [{domain}]({a['Home']}) |")
st.markdown("\n".join(lines))
st.markdown(
    "The Urban Institute Education Data API adapter is shipped but optional: "
    "the host blocks this deployment network, so the dashboard treats it "
    "purely as opportunistic enrichment and falls back to the federal "
    "snapshot path above — there is no hard dependency on it. The "
    "eddatacenter.org mirror is used only for its direct, streamable copies "
    "of the same federal EDFacts files; the originating agency of record is "
    "the U.S. Department of Education."
)

# --- Engineering notes ---------------------------------------------------------------
st.subheader("Engineering notes")
st.caption("Reproducibility and reliability")
left, right = st.columns(2)
with left, st.container(border=True):
    st.markdown("**Stack**")
    st.markdown(
        "- Two editions, one index: a Next.js (App Router) + TypeScript + "
        "Tailwind web app and a Python Streamlit app share the same snapshots, "
        "feeds, constants, and rounding — scores match across editions.\n"
        "- Next.js edition: Recharts for trends and rankings; d3-geo + "
        "topojson-client for the world and US state choropleths. Vitest "
        "unit-tests the index math (z-scores, renormalized weights, banding, "
        "clamping).\n"
        "- Streamlit edition: native elements + Altair for charts; pandas "
        "for cohort scoring (population SD z-scores, in-state district peers)."
    )
with right, st.container(border=True):
    st.markdown("**Reliability**")
    st.markdown(
        "- Every feed call carries a timeout; a failed live revalidation "
        "degrades to an explicit notice rather than an empty panel.\n"
        "- The ingest pipeline resumes at byte offsets after a network reset, "
        "so a 140MB stream never restarts from zero.\n"
        "- `npm run verify-feeds` smoke-tests every endpoint (status + shape) "
        "and is the first troubleshooting step for a red panel."
    )

# --- Disclaimer -----------------------------------------------------------------------
st.subheader("Disclaimer")
st.caption("Scope and stewardship")
with st.container(border=True):
    st.markdown(
        "- This is an independent analytics product. It is **not** an official "
        "dashboard of the U.S. Department of Education, the U.S. Census "
        "Bureau, or the World Bank.\n"
        "- The Stress Index is a decision-support heuristic — 45% proficiency "
        "gap, 30% chronic absenteeism, 25% poverty context, peer-relative — "
        "documented in full on the Methodology page — including the reasons "
        "cross-state proficiency comparisons are directional only.\n"
        "- Source datasets may be refreshed upstream at any time; this "
        "dashboard shows the vintage it actually has rather than implying "
        "recency."
    )
    st.page_link("app_pages/methodology.py", label="Read the methodology", icon=":material/science:")

st.divider()
st.caption(
    "Developed and Designed by Emmanuel Onuoha · Sources: World Bank Open "
    "Data · U.S. Department of Education (EDFacts, CRDC) · U.S. Census Bureau ACS"
)
