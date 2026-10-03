"""Executive brief — the one-screen summary of global and US stress.

Streamlit counterpart of ``src/app/page.tsx``: cohort KPIs, the global stress
map, the most stressed systems on both layers, the largest movers, and
pointers into the drill-downs — with region and band filters on each layer.
"""

from __future__ import annotations

import streamlit as st

from lib import fmt
from lib import ui
from lib.global_data import cohort_means, global_kpis, load_global, lp_movers
from lib.us_data import (
    CENSUS_REGIONS,
    load_absenteeism,
    load_achievement,
    national_year_series,
    state_frame,
    us_kpis,
)

# --- Live feed (optional on this page — the brief still renders without it) ---
try:
    gdf, gyears, gmeta = load_global()
    global_error = None
except Exception as exc:  # noqa: BLE001 — surfaced as a degraded panel below
    gdf, gyears, gmeta = None, [], {}
    global_error = str(exc)

sdf = state_frame()
achievement = load_achievement()
absenteeism = load_absenteeism()

ui.page_header(
    "Executive Brief",
    "Foundational skills, under pressure",
    "One view of the health of core reading and math skills and the stressors "
    "around them — global learning poverty and out-of-school children, US "
    "proficiency and chronic absenteeism, and a composite Stress Index from "
    "nation to district.",
)

chips = []
if gdf is not None:
    chips.append(f"World Bank · live · updated {fmt.relative_time(gmeta.get('fetched_at'))}")
if achievement:
    chips.append(f"EDFacts · snapshot · {fmt.school_year_label(achievement['meta']['schoolYear'])}")
if absenteeism:
    chips.append(f"CRDC · snapshot · {fmt.school_year_label(absenteeism['meta']['schoolYear'])}")
ui.freshness(chips)

# --- KPI row ---------------------------------------------------------------
gk = global_kpis(gdf) if gdf is not None else None
k = us_kpis(sdf) if (sdf is not None and achievement) else None

items: list[dict] = []
if gk is not None:
    items.append(
        {
            "label": "Learning poverty · global",
            "value": fmt.pct(gk["mean_learning_poverty"]),
            "help": f"{gk['with_learning_poverty']} of {gk['countries']} countries reporting",
            "chart_data": cohort_means(gdf, gyears, "lp"),
        }
    )
    items.append(
        {
            "label": "Out of school · global",
            "value": fmt.pct(gk["mean_out_of_school"]),
            "help": "Primary age, country mean",
            "chart_data": cohort_means(gdf, gyears, "oos"),
        }
    )
else:
    items.append({"label": "Learning poverty · global", "value": "—", "help": "feed unavailable"})
    items.append({"label": "Out of school · global", "value": "—", "help": "feed unavailable"})

if k is not None:
    years = achievement["meta"]["schoolYears"]
    reading_series = national_year_series(sdf, years, "reading")
    reading_delta = (
        round((reading_series[-1] - reading_series[-2]) * 10) / 10
        if len(reading_series) >= 2 and reading_series[-1] is not None and reading_series[-2] is not None
        else None
    )
    items.append(
        {
            "label": "Reading proficiency · US",
            "value": fmt.pct(k["reading"]),
            "delta": f"{fmt.signed(reading_delta)} pts YoY" if reading_delta is not None else None,
            "help": f"{fmt.school_year_label(achievement['meta']['schoolYear'])} · students-tested-weighted state mean",
            "chart_data": reading_series,
        }
    )
    items.append(
        {
            "label": "Math proficiency · US",
            "value": fmt.pct(k["math"]),
            "help": "Students-tested-weighted state mean",
            "chart_data": national_year_series(sdf, years, "math"),
        }
    )
    items.append(
        {
            "label": "Chronic absenteeism · US",
            "value": fmt.pct(k["absenteeism"]),
            "help": "Absent 15+ days ÷ enrollment (CRDC)",
        }
    )
    items.append(
        {
            "label": "Child poverty context · US",
            "value": fmt.pct(k["poverty"]),
            "help": "ACS 1-year, income below poverty — a stress input, not an outcome",
        }
    )
else:
    for label in ["Reading proficiency · US", "Math proficiency · US", "Chronic absenteeism · US", "Child poverty context · US"]:
        items.append({"label": label, "value": "—", "help": "snapshot unavailable"})

ui.kpi_row(items)

st.divider()

# --- Global stress map -----------------------------------------
st.subheader("Global stress map")
st.caption(
    "Composite of learning poverty, out-of-school, and completion gap — "
    "peer-relative across countries (50 = country-cohort average)."
)
if gdf is not None:
    gf1, gf2 = st.columns(2)
    g_region = gf1.selectbox(
        "Region",
        ["All regions"] + sorted(gdf["region"].dropna().unique().tolist()),
        key="brief_g_region",
    )
    g_band_label = gf2.selectbox("Stress band", ui.band_filter_options(), key="brief_g_band")

    gview = gdf
    if g_region != "All regions":
        gview = gview[gview["region"] == g_region]
    g_band_key = ui.band_from_label(g_band_label)
    if g_band_key is not None:
        gview = gview[gview["band"] == g_band_key]

    left, right = st.columns([2, 1])
    with left, st.container(border=True):
        st.plotly_chart(ui.world_stress_map(gview), config={"displayModeBar": False})
        st.markdown(
            ":green-badge[<25] · :yellow-badge[25–50] · "
            ":orange-badge[50–75] · :red-badge[75+] · :gray-badge[No data]"
        )
    with right, st.container(border=True):
        st.markdown("**Most stressed systems**")
        st.caption("Composite learning-stress score, 0–100 (50 = country-cohort average)")
        top = gview.dropna(subset=["score"]).sort_values("score", ascending=False).head(6).copy()
        if top.empty:
            st.caption("No countries match the current filters.")
        else:
            top["detail"] = top.apply(
                lambda r: f"Learning poverty {fmt.pct(r['lp'])} · completion {fmt.pct(r['completion'])}",
                axis=1,
            )
            view = top[["name", "score", "detail"]].rename(columns={"score": "value"})
            st.altair_chart(
                ui.rank_bar(view, "name", "value", ui.series("red"), tooltip=[("value", "Stress index"), ("detail", "")])
            )
        st.caption(f"Source: {gmeta.get('source', 'World Bank Open Data')} · live feed, refreshed hourly")
    st.page_link("app_pages/global_lens.py", label="Open global lens", icon=":material/arrow_forward:")
else:
    st.info(
        "Global feed unavailable — the World Bank API could not be reached. "
        "This section recovers automatically on the next successful refresh."
    )

st.divider()

# --- United States: movers and concentration -------------------------------
st.subheader("United States — where stress concentrates")
if sdf is not None and achievement:
    st.caption(
        "State Stress Index: proficiency gap 45% · chronic absenteeism 30% · "
        f"poverty context 25% ({fmt.school_year_label(achievement['meta']['schoolYear'])})"
    )
    uf1, uf2 = st.columns(2)
    u_region = uf1.selectbox("Region", ["All regions"] + CENSUS_REGIONS, key="brief_u_region")
    u_band_label = uf2.selectbox("Stress band", ui.band_filter_options(), key="brief_u_band")

    uview = sdf
    if u_region != "All regions":
        uview = uview[uview["region"] == u_region]
    u_band_key = ui.band_from_label(u_band_label)
    if u_band_key is not None:
        uview = uview[uview["band"] == u_band_key]

    improvers = uview.dropna(subset=["yoy"]).sort_values("yoy", ascending=False).head(3)
    decliners = uview.dropna(subset=["yoy"]).sort_values("yoy").head(3)

    left, right = st.columns(2)
    with left, st.container(border=True):
        st.markdown("**Largest movers — reading proficiency**")
        st.caption("Latest year-over-year change, 4th–8th grade reading (all students)")
        if improvers.empty:
            st.caption("No states match the current filters, or no YoY movement is available.")
        else:
            imp = improvers.copy()
            imp["value"] = imp["yoy"].abs()
            imp["detail"] = imp.apply(lambda r: f"Reading {fmt.pct(r['reading'])} · {fmt.signed(r['yoy'])} pts YoY", axis=1)
            st.markdown(":green-badge[Improving]")
            st.altair_chart(
                ui.rank_bar(imp[["name", "value", "detail"]], "name", "value", ui.series("reading"), axis_format="+.1f")
            )
            dec = decliners.copy()
            dec["value"] = dec["yoy"].abs()
            dec["detail"] = dec.apply(lambda r: f"Reading {fmt.pct(r['reading'])} · {fmt.signed(r['yoy'])} pts YoY", axis=1)
            st.markdown(":red-badge[Declining]")
            st.altair_chart(
                ui.rank_bar(dec[["name", "value", "detail"]], "name", "value", ui.series("red"), axis_format=".1f")
            )
    with right, st.container(border=True):
        st.markdown("**Highest state stress**")
        st.caption("Top 6 states by composite Stress Index")
        top_states = uview.dropna(subset=["score"]).sort_values("score", ascending=False).head(6).copy()
        if top_states.empty:
            st.caption("No states match the current filters.")
        else:
            top_states["detail"] = top_states.apply(
                lambda r: f"Absenteeism {fmt.pct(r['absenteeism'])} · region {r['region']}",
                axis=1,
            )
            view = top_states[["name", "score", "detail"]].rename(columns={"score": "value"})
            st.altair_chart(ui.rank_bar(view, "name", "value", ui.series("orange"), tooltip=[("value", "Stress index"), ("detail", "")]))
    st.page_link("app_pages/united_states.py", label="Open US drill-down", icon=":material/arrow_forward:")
else:
    st.info(
        "US snapshots not found — the EDFacts achievement snapshot is missing. "
        "Run `npm run ingest` and reload; the brief renders again as soon as "
        "`data/snapshots` is populated."
    )

st.divider()

# --- Global movement --------------------------------------------------------
st.subheader("Global movement — learning poverty")
st.caption("Largest change between the two most recent reporting years per country")
if gdf is not None:
    improvers_g, decliners_g = lp_movers(gdf, 5)
    gleft, gright = st.columns(2)
    with gleft, st.container(border=True):
        st.markdown(":green-badge[Sharpest improvements]")
        if improvers_g.empty:
            st.caption("No country has two comparable reporting years yet.")
        else:
            view = improvers_g.copy()
            view["value"] = view["delta"].abs()
            view["detail"] = view.apply(lambda r: f"Now {fmt.pct(r['lp'])} ({fmt.signed(r['delta'])} pts)", axis=1)
            st.altair_chart(ui.rank_bar(view[["name", "value", "detail"]], "name", "value", ui.series("reading"), axis_format=".1f"))
    with gright, st.container(border=True):
        st.markdown(":red-badge[Sharpest deteriorations]")
        if decliners_g.empty:
            st.caption("No country has two comparable reporting years yet.")
        else:
            view = decliners_g.copy()
            view["value"] = view["delta"]
            view["detail"] = view.apply(lambda r: f"Now {fmt.pct(r['lp'])} ({fmt.signed(r['delta'])} pts)", axis=1)
            st.altair_chart(ui.rank_bar(view[["name", "value", "detail"]], "name", "value", ui.series("red"), axis_format=".1f"))
else:
    st.caption("Movement analysis needs the live World Bank feed; it returns when the feed recovers.")

st.divider()
st.caption(
    "Composite Stress Index is peer-relative: bands compare a geography with its cohort "
    "(countries, states, or in-state districts). Coverage: "
    f"{fmt.num(gk['with_learning_poverty']) if gk is not None else '—'} countries with "
    f"learning-poverty data, {fmt.num(k['states_with_proficiency']) if k is not None else '—'} "
    "US states/territories with proficiency data."
)
st.page_link("app_pages/methodology.py", label="Read the methodology", icon=":material/science:")
