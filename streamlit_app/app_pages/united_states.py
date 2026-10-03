"""United States — the state stress league.

Streamlit counterpart of ``src/app/us/page.tsx``: national roll-up KPIs, the
ranked view of state stress (standing in for the Next.js choropleth), and the
filterable state league table with a click-through into the district
drill-down.
"""

from __future__ import annotations

import streamlit as st

from lib import fmt
from lib import stress as si
from lib import ui
from lib.us_data import (
    CENSUS_REGIONS,
    district_frame,
    load_absenteeism,
    load_achievement,
    load_poverty,
    national_year_series,
    state_frame,
    us_kpis,
)

sdf = state_frame()
achievement = load_achievement()
absenteeism = load_absenteeism() or {}
poverty = load_poverty()

sy_label = fmt.school_year_label(achievement["meta"]["schoolYear"]) if achievement else "the snapshot school year"
abs_year = absenteeism.get("meta", {}).get("schoolYear", "2015-16")

ui.page_header(
    "United States",
    "State stress league",
    f"All-students reading and math proficiency (grades tested, {sy_label}), "
    f"chronic absenteeism ({fmt.school_year_label(abs_year)}), and poverty "
    "context — combined into a peer-relative Stress Index.",
)

if sdf is None or not achievement:
    st.error(
        "US snapshots not found — the EDFacts achievement snapshot is missing "
        "or unreadable. Run `npm run ingest` and reload; the dashboard renders "
        "again as soon as `data/snapshots` is populated."
    )
    st.stop()

chips = [f"EDFacts · snapshot · {sy_label}"]
if absenteeism:
    chips.append(f"CRDC · snapshot · {fmt.school_year_label(abs_year)}")
if poverty:
    chips.append(f"Census · live · updated {fmt.relative_time(poverty.get('fetched_at'))}")
ui.freshness(chips)

years = achievement["meta"]["schoolYears"]
k = us_kpis(sdf)

# --- National roll-up KPIs ---------------------------------------------------
reading_spark = national_year_series(sdf, years, "reading")
math_spark = national_year_series(sdf, years, "math")
reading_delta = (
    round((reading_spark[-1] - reading_spark[-2]) * 10) / 10
    if len(reading_spark) >= 2
    and reading_spark[-1] is not None
    and reading_spark[-2] is not None
    else None
)

districts = district_frame()
district_count = len(districts) if districts is not None else 0

ui.kpi_row(
    [
        {
            "label": "Reading proficiency",
            "value": fmt.pct(k["reading"]),
            "delta": f"{fmt.signed(reading_delta)} pts YoY" if reading_delta is not None else None,
            "help": f"{sy_label} · students-tested-weighted state mean",
            "chart_data": reading_spark,
        },
        {
            "label": "Math proficiency",
            "value": fmt.pct(k["math"]),
            "help": f"{sy_label} · students-tested-weighted state mean",
            "chart_data": math_spark,
        },
        {
            "label": "Chronic absenteeism",
            "value": fmt.pct(k["absenteeism"]),
            "help": f"{fmt.school_year_label(abs_year)} · absent 15+ school days ÷ enrollment",
        },
        {
            "label": "Poverty context",
            "value": fmt.pct(k["poverty"]),
            "help": "ACS 1-year, income below poverty — a stress input, not a school outcome",
        },
        {
            "label": "Students assessed",
            "value": fmt.num(k["tested"]) if k["tested"] else "—",
            "help": "all grades, all students",
        },
        {
            "label": "Districts covered",
            "value": fmt.num(district_count),
            "help": f"{k['states_with_proficiency']} states/territories reporting",
        },
    ]
)

# --- Stress ranking + what the index weighs ----------------------------------
st.subheader("Stress ranking")
st.caption(
    "State Stress Index — proficiency gap 45% · absenteeism 30% · poverty "
    "context 25%. The composite is peer-relative: 50 is the state-cohort average."
)
left, right = st.columns([2, 1])
with left, st.container(border=True):
    st.markdown("**Most stressed states**")
    top = sdf.dropna(subset=["score"]).sort_values("score", ascending=False).head(15).copy()
    top["detail"] = top.apply(
        lambda r: f"Reading {fmt.pct(r['reading'])} · absent 15+ {fmt.pct(r['absenteeism'])}",
        axis=1,
    )
    view = top[["name", "score", "detail"]].rename(columns={"score": "value"})
    st.altair_chart(
        ui.rank_bar(view, "name", "value", ui.series("red"), tooltip=[("value", "Stress index"), ("detail", "")])
    )
with right, st.container(border=True):
    st.markdown("**What the index measures**")
    st.markdown(
        "- **Proficiency gap** — distance from full proficiency in reading and "
        "math, the largest weighted driver.\n"
        "- **Chronic absenteeism** — share of students absent 15+ days; the "
        "strongest leading indicator of dropout risk.\n"
        "- **Poverty context** — household income below poverty, capturing the "
        "headwind schools do not control."
    )
    st.caption(f"Snapshot school years: {', '.join(years)}")

# --- State league table -------------------------------------------------------
st.subheader("State league table")
st.caption(
    "Most stressed states first — filter by band or region, or search by name. "
    "Select a state's name cell, then open its district drill-down."
)
with st.container(border=True):
    f1, f2, f3 = st.columns([2, 1, 1])
    search = f1.text_input("Search states", placeholder="Search states…")
    band_label = f2.selectbox("Stress band", ui.band_filter_options())
    region_label = f3.selectbox("Region", ["All regions"] + CENSUS_REGIONS)

view = sdf.copy()
if search.strip():
    view = view[view["name"].str.lower().str.contains(search.strip().lower(), regex=False)]
band_key = ui.band_from_label(band_label)
if band_key is not None:
    view = view[view["band"] == band_key]
if region_label != "All regions":
    view = view[view["region"] == region_label]
view = view.sort_values("score", ascending=False, na_position="last").reset_index(drop=True)

if view.empty:
    st.warning("No states match the current search and filters.")
else:
    display = view.copy()
    display["band_badges"] = display["band"].apply(
        lambda b: [si.BAND_META[b]["label"]] if isinstance(b, str) and b in si.BAND_META else []
    )
    selection = st.dataframe(
        display,
        height=560,
        hide_index=True,
        column_order=["rank", "name", "reading", "math", "yoy", "absenteeism", "poverty", "score", "band_badges"],
        column_config={
            "rank": st.column_config.NumberColumn("#", format="%.0f", width="small"),
            "name": st.column_config.TextColumn("State", width="medium", pinned=True),
            "reading": st.column_config.NumberColumn("Reading", format="%.1f%%"),
            "math": st.column_config.NumberColumn("Math", format="%.1f%%"),
            "yoy": st.column_config.NumberColumn(
                "Reading YoY", format="%.1f", help="Latest year-over-year change, proficiency points"
            ),
            "absenteeism": st.column_config.NumberColumn("Absent 15+", format="%.1f%%"),
            "poverty": st.column_config.NumberColumn("Poverty", format="%.1f%%"),
            "score": st.column_config.NumberColumn(
                "Stress index", format="%.1f", help="Composite score, 0–100 (50 = state-cohort average)"
            ),
            "band_badges": st.column_config.MultiselectColumn(
                "Band",
                options=["Stable", "Watch", "Elevated", "Critical"],
                color=[ui.series("reading"), ui.series("amber"), ui.series("orange"), ui.series("red")],
                width="small",
            ),
        },
        on_select="rerun",
        selection_mode="single-cell",
        key="state_league",
    )

    if selection.selection.cells:
        row_idx, col_name = selection.selection.cells[0]
        if col_name == "name" and row_idx < len(display):
            picked = display.iloc[row_idx]
            if st.button(
                f"Open {picked['name']} district drill-down",
                icon=":material/arrow_forward:",
                key=f"open_state_{row_idx}",
            ):
                st.session_state["state_abbr"] = picked["abbr"]
                st.switch_page("app_pages/state_drilldown.py")

st.page_link("app_pages/state_drilldown.py", label="Open the state drill-down", icon=":material/location_on:")
