"""Methodology — the composite index, sources, freshness contract, limits.

Streamlit counterpart of ``src/app/methodology/page.tsx``. The index
constants are imported live from ``lib.stress`` so this page can never drift
out of sync with the math.
"""

from __future__ import annotations

import streamlit as st

from lib import stress as si
from lib import ui

SOURCES: list[dict[str, str]] = [
    {
        "Source": "World Bank Open Data (EdStats / WDI)",
        "Scope": "Global — ~200 countries",
        "Indicators": "Learning poverty (SE.LPV.PRIM), primary completion "
        "(SE.PRM.CUAT.ZS), out-of-school primary-age children (SE.PRM.UNER.ZS)",
        "Mode": "Live feed",
        "Refresh": "Revalidated hourly; source series update annually (with lag)",
        "License": "CC BY 4.0",
    },
    {
        "Source": "EDFacts achievement (ED, via eddatacenter.org mirror)",
        "Scope": "US — national, state, district",
        "Indicators": "Reading and math proficiency rates for all students, "
        "all grades; students assessed and participation",
        "Mode": "Snapshot",
        "Refresh": "Annual federal release; latest available is school year "
        "2021-22. Refresh with `npm run ingest`",
        "License": "Public domain (US federal data)",
    },
    {
        "Source": "CRDC 2015-16 chronic absenteeism + enrollment",
        "Scope": "US — national, state, district",
        "Indicators": "Students missing 15+ school days; district enrollment "
        "used as the same-year denominator",
        "Mode": "Snapshot",
        "Refresh": "Biennial civil-rights collection; district detail is the "
        "latest published at scale",
        "License": "Public domain (US federal data)",
    },
    {
        "Source": "U.S. Census Bureau ACS 1-year (B17001)",
        "Scope": "US — state",
        "Indicators": "Share of population below the poverty line, used as "
        "context stress",
        "Mode": "Live feed",
        "Refresh": "Revalidated daily; latest published ACS release is selected automatically",
        "License": "Public domain",
    },
    {
        "Source": "Urban Institute Education Data API",
        "Scope": "US — fallback enrichment",
        "Indicators": "Optional adapter; used opportunistically when the host "
        "is reachable from this network",
        "Mode": "Live feed",
        "Refresh": "On request, with automatic fallback to EDFacts snapshots",
        "License": "Varies by upstream source",
    },
]

BAND_GUIDANCE = {
    "stable": "At or better than the cohort norm",
    "watch": "Drifting behind peers — monitor",
    "elevated": "Clearly behind peers — intervene",
    "critical": "Far behind peers — executive priority",
}

LIMITATIONS = [
    "**Proficiency is state-defined.** Under ESSA each state sets its own "
    "standards and cut scores, so EDFacts proficiency rates are *not* directly "
    "comparable across states. District rankings are computed within a single "
    "state for exactly this reason; national roll-ups are directional.",
    "**Absenteeism lags.** The district-level chronic absenteeism rates on this "
    "dashboard come from the CRDC 2015-16 collection — the latest civil-rights "
    "collection with full district coverage in a distributable file. Rates are "
    "counts divided by same-year CRDC enrollment. Treat them as a structural "
    "baseline, not a current-year measure.",
    "**Poverty is state-level only.** The ACS input covers states, so "
    "district-level poverty is not yet an input. District scores rest on the "
    "proficiency gap and (where published) absenteeism; the missing weight is "
    "renormalized onto the gap component.",
    "**Small-district noise.** Proficiency rates for very small districts swing "
    "on a few students. Rank tables label low-N districts with their tested "
    "counts so outliers can be spotted, but the index does not apply a "
    "minimum-N filter.",
    "**Release lag is universal.** Federal assessment data arrives about a year "
    "after a school year ends, and World Bank learning-poverty series update on "
    "their own (slower) schedule. The freshness chips tell you exactly what "
    "vintage you are looking at; always read them before acting.",
    "**Suppression.** Source files censor small cells (e.g. “≤5%” or range "
    "values). The ingester resolves ranges to midpoints and drops non-numeric "
    "cells, so a minority of districts have partially populated entries — they "
    "render as “—” rather than guesses.",
]

ui.page_header(
    "Methodology & data lineage",
    "How the Stress Index works",
    "Every number on this dashboard is traceable to a public source and a "
    "documented transformation. This page defines the composite index, the "
    "component inputs, refresh cadence per feed, and the limitations you "
    "should weigh when reading the results.",
)

# --- The composite Stress Index ------------------------------------------------
st.subheader("The composite Stress Index")
st.caption(
    "A peer-relative 0–100 score — deliberately simple, auditable, and "
    "recomputed from source on every load"
)

gap_w = round(si.STRESS_WEIGHTS["gap"] * 100)
abs_w = round(si.STRESS_WEIGHTS["absenteeism"] * 100)
pov_w = round(si.STRESS_WEIGHTS["poverty"] * 100)

left, right = st.columns(2)
with left, st.container(border=True):
    st.markdown("**Definition**")
    st.markdown(
        "1. Each component is converted to a **z-score** against the peer "
        "cohort (states nationally; districts within their own state — so a "
        "district is judged against comparable districts facing the same "
        "state assessment regime).\n"
        f"2. Components are combined with fixed weights — proficiency gap "
        f"**{gap_w}%**, chronic absenteeism **{abs_w}%**, poverty context "
        f"**{pov_w}%**. Missing components are dropped and the remaining "
        "weights are renormalized.\n"
        "3. The composite z maps to the executive scale: "
        "`score = clamp(50 + 15·z, 0, 100)`. By construction **50 is the "
        "cohort average**, one point is one-fifteenth of a standard deviation."
    )
    st.divider()
    st.markdown(
        "*The index measures relative stress within the cohort, not absolute "
        "compliance. A Critical band means a jurisdiction is far behind its "
        "peers on these inputs — it is a prioritization signal, not a judgment "
        "on any single school.*"
    )

with right, st.container(border=True):
    st.markdown("**Bands**")
    for band_key in ["stable", "watch", "elevated", "critical"]:
        meta = si.BAND_META[band_key]
        st.markdown(
            f":{ui.BAND_BADGE_COLOR[band_key]}-badge[{meta['label']}] "
            f"**{meta['range']}** — {BAND_GUIDANCE[band_key]}"
        )
    st.markdown("**Component inputs**")
    st.markdown(
        "- **Proficiency gap** — 100 minus the average of reading and math "
        "proficiency (all students, all grades).\n"
        "- **Chronic absenteeism** — share of students missing 15+ school days "
        "in a year.\n"
        "- **Poverty context** — ACS poverty rate, a proxy for out-of-school "
        "stressors acting on foundational skills."
    )

# --- Data sources ---------------------------------------------------------------
st.subheader("Data sources & refresh cadence")
st.caption(
    "Snapshot feeds are ingested at build time (`npm run ingest`); live feeds "
    "are fetched on demand and cached."
)
header = "| Source | Scope | Indicators | Mode | Refresh | License |"
separator = "| --- | --- | --- | --- | --- | --- |"
lines = [header, separator]
for s in SOURCES:
    lines.append(
        f"| {s['Source']} | {s['Scope']} | {s['Indicators']} | {s['Mode']} | "
        f"{s['Refresh']} | {s['License']} |"
    )
st.markdown("\n".join(lines))

# --- Freshness contract ---------------------------------------------------------
st.subheader("The freshness contract")
st.caption("What every panel on this dashboard promises about its data")
c1, c2, c3 = st.columns(3)
with c1, st.container(border=True):
    st.markdown("**Live feeds**")
    st.markdown(
        "Fetched on demand and cached — World Bank hourly, Census daily. "
        "Panels carry an *updated …* chip. If a fetch fails, the page renders "
        "an explicit degraded state that recovers on the next successful "
        "refresh; it never silently shows stale or empty data."
    )
with c2, st.container(border=True):
    st.markdown("**Snapshot feeds**")
    st.markdown(
        "EDFacts achievement, CRDC absenteeism, and enrollment ship as compact "
        "JSON snapshots in the repository, rebuilt with `npm run ingest`. "
        "Panels show the school year, never an implied recency."
    )
with c3, st.container(border=True):
    st.markdown("**Degraded-mode demos**")
    st.markdown(
        "The Next.js edition ships `STRESS_FAIL_FEEDS=global,us,census` to "
        "force-fail feeds so fallback states can be demonstrated deliberately. "
        "In this Streamlit edition, feed failures surface automatically as "
        "in-page notices."
    )

# --- Known limitations ----------------------------------------------------------
st.subheader("Known limitations")
st.caption("Read everything below before drawing cross-jurisdiction conclusions")
with st.container(border=True):
    for item in LIMITATIONS:
        st.markdown(f"- {item}")

st.divider()
st.page_link("app_pages/about.py", label="About this project", icon=":material/info:")
