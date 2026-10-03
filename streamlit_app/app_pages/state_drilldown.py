"""State drill-down — one state's stress profile and its district league.

Streamlit counterpart of ``src/app/us/[state]/page.tsx`` and the district
brief at ``src/app/us/[state]/[district]/page.tsx``: KPIs, the composite
scorecard with component weights, the proficiency trajectory, a filterable
district league table, a per-district brief, and a small comparator.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from lib import fmt
from lib import stress as si
from lib import ui
from lib.us_data import (
    district_frame,
    latest_change,
    load_absenteeism,
    load_achievement,
    percentile_of_better,
    state_frame,
)

# Enrollment-size buckets for the district league filter (students tested).
SIZE_TIERS = {
    "Under 1,000": "lt1k",
    "1,000–4,999": "1k-5k",
    "5,000–24,999": "5k-25k",
    "25,000+": "gte25k",
}


def size_tier(tested) -> str | None:
    """Mirrors sizeTier() from src/app/us/[state]/page.tsx."""
    if not si.is_number(tested):
        return None
    t = float(tested)
    if t < 1000:
        return "lt1k"
    if t < 5000:
        return "1k-5k"
    if t < 25000:
        return "5k-25k"
    return "gte25k"


sdf = state_frame()
achievement = load_achievement()

st.page_link("app_pages/united_states.py", label="United States", icon=":material/arrow_back:")

if sdf is None or not achievement:
    ui.page_header(
        "State drill-down",
        "US state",
        "The EDFacts achievement snapshot is missing or unreadable — run "
        "`npm run ingest` and reload.",
    )
    st.stop()

# --- State picker (session state lets the league table deep-link here) -------
ordered = sdf.sort_values("name").reset_index(drop=True)
options = ordered["abbr"].tolist()
name_for = dict(zip(ordered["abbr"], ordered["name"]))

if "state_abbr" in st.session_state and st.session_state["state_abbr"] not in options:
    del st.session_state["state_abbr"]

if "state_abbr" in st.session_state:
    selected_abbr = st.selectbox(
        "State or territory", options, format_func=lambda a: name_for[a], key="state_abbr"
    )
else:
    ranked_default = sdf.dropna(subset=["score"]).sort_values("score", ascending=False)
    default_abbr = ranked_default["abbr"].iloc[0] if len(ranked_default) else options[0]
    selected_abbr = st.selectbox(
        "State or territory",
        options,
        index=options.index(default_abbr),
        format_func=lambda a: name_for[a],
        key="state_abbr",
    )

row = sdf[sdf["abbr"] == selected_abbr].iloc[0]
years = achievement["meta"]["schoolYears"]
abs_year = (load_absenteeism() or {}).get("meta", {}).get("schoolYear", "2015-16")

dist = district_frame()
state_districts = (
    dist[dist["state_fips"] == row["fips"]].copy() if dist is not None else pd.DataFrame()
)
if len(state_districts):
    state_districts = state_districts.sort_values(
        "score", ascending=False, na_position="last"
    ).reset_index(drop=True)
scored_districts = int(state_districts["score"].notna().sum()) if len(state_districts) else 0

rank = int(row["rank"]) if si.is_number(row["rank"]) else None
ranked_total = int(sdf["score"].notna().sum())
reading_delta = row["yoy"] if si.is_number(row["yoy"]) else None
math_delta = latest_change(row["history"], "math")

ui.page_header(
    "State drill-down",
    row["name"],
    f"{row['name']} ranks {rank if rank is not None else '—'} of {ranked_total} "
    f"states/territories by composite stress. {len(state_districts)} school "
    "districts in this snapshot; district scores are z-scored against in-state peers.",
)

chips = [f"EDFacts · snapshot · {fmt.school_year_label(achievement['meta']['schoolYear'])}"]
chips.append(f"CRDC · snapshot · {fmt.school_year_label(abs_year)}")
ui.freshness(chips)

# --- KPIs ---------------------------------------------------------------------
ui.kpi_row(
    [
        {
            "label": "Reading proficiency",
            "value": fmt.pct(row["reading"]),
            "delta": f"{fmt.signed(reading_delta)} pts YoY" if reading_delta is not None else None,
            "help": fmt.school_year_label(achievement["meta"]["schoolYear"]),
            "chart_data": row["reading_spark"],
        },
        {
            "label": "Math proficiency",
            "value": fmt.pct(row["math"]),
            "delta": f"{fmt.signed(math_delta)} pts YoY" if math_delta is not None else None,
            "help": fmt.school_year_label(achievement["meta"]["schoolYear"]),
            "chart_data": row["math_spark"],
        },
        {
            "label": "Chronic absenteeism",
            "value": fmt.pct(row["absenteeism"]),
            "help": f"{fmt.school_year_label(abs_year)} · absent 15+ days ÷ enrollment",
        },
        {
            "label": "Poverty context",
            "value": fmt.pct(row["poverty"]),
            "help": "ACS 1-year, all ages",
        },
        {
            "label": "Students assessed",
            "value": fmt.num(row["tested"]) if si.is_number(row["tested"]) else "—",
            "help": "all grades, all students",
        },
        {
            "label": "Districts",
            "value": fmt.num(len(state_districts)),
            "help": f"{scored_districts} scored",
        },
    ]
)

# --- Composite scorecard + trajectory ----------------------------------------
left, right = st.columns([1, 2])
with left, st.container(border=True):
    st.metric(
        "Composite stress",
        f"{float(row['score']):.1f} / 100" if si.is_number(row["score"]) else "—",
    )
    st.markdown(ui.band_badge(row["score"], row["band"], show_score=False))
    components = pd.DataFrame(
        [
            {
                "Component": c["label"],
                "Value": fmt.pct(c["value"]),
                "Weight": f"{c['weight'] * 100:.0f}%" if c["weight"] > 0 else "n/a",
            }
            for c in row["components"]
        ]
    )
    st.dataframe(components, hide_index=True)
    if row["missing"]:
        st.caption(
            f"Not available for this state: {row['missing']} — remaining weights renormalized."
        )
with right, st.container(border=True):
    st.markdown("**Proficiency trajectory**")
    st.caption(f"All students, all grades — snapshot school years {', '.join(years)}")
    trend_rows = []
    for point in row["history"]:
        if point.get("reading") is not None:
            trend_rows.append({"year": point["year"], "value": point["reading"], "series": "Reading"})
        if point.get("math") is not None:
            trend_rows.append({"year": point["year"], "value": point["math"], "series": "Math"})
    st.altair_chart(
        ui.trend_line(
            pd.DataFrame(trend_rows),
            "year",
            "value",
            "series",
            {"Reading": ui.series("reading"), "Math": ui.series("math")},
            height=300,
        )
    )
    st.caption(f"Source: {achievement['meta'].get('source', 'EDFacts achievement snapshot')}")

# --- District league table ----------------------------------------------------
st.subheader("District league table")
st.caption(
    f"{len(state_districts)} districts, most stressed first — filter by band or "
    "enrollment size. Select a district's name cell, then open its brief."
)

if len(state_districts) == 0:
    st.info("This state has no district-level rows in the current snapshot.")
else:
    with st.container(border=True):
        g1, g2, g3 = st.columns([2, 1, 1])
        d_search = g1.text_input("Search districts", placeholder="Search districts…")
        d_band = g2.selectbox("Stress band", ui.band_filter_options(), key="district_band_filter")
        d_size = g3.selectbox("Tested size", ["All sizes"] + list(SIZE_TIERS), key="district_size_filter")

    d_view = state_districts.copy()
    if d_search.strip():
        d_view = d_view[d_view["name"].str.lower().str.contains(d_search.strip().lower(), regex=False)]
    d_band_key = ui.band_from_label(d_band)
    if d_band_key is not None:
        d_view = d_view[d_view["band"] == d_band_key]
    if d_size != "All sizes":
        d_view = d_view[d_view["tested"].apply(size_tier) == SIZE_TIERS[d_size]]
    d_view = d_view.sort_values("score", ascending=False, na_position="last").reset_index(drop=True)

    if d_view.empty:
        st.warning("No districts match the current search and filters.")
    else:
        display = d_view.copy()
        display["band_badges"] = display["band"].apply(
            lambda b: [si.BAND_META[b]["label"]] if isinstance(b, str) and b in si.BAND_META else []
        )
        selection = st.dataframe(
            display,
            height=520,
            hide_index=True,
            column_order=["rank", "name", "reading", "math", "tested", "score", "band_badges"],
            column_config={
                "rank": st.column_config.NumberColumn("#", format="%.0f", width="small"),
                "name": st.column_config.TextColumn("District", width="large", pinned=True),
                "reading": st.column_config.NumberColumn("Reading", format="%.1f%%"),
                "math": st.column_config.NumberColumn("Math", format="%.1f%%"),
                "tested": st.column_config.NumberColumn(
                    "Tested", format="%.0f", help="Students assessed, all grades"
                ),
                "score": st.column_config.NumberColumn(
                    "Stress index", format="%.1f", help="Composite score, 0–100 (50 = in-state average)"
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
            key="district_league",
        )

        if selection.selection.cells:
            row_idx, col_name = selection.selection.cells[0]
            if col_name == "name" and row_idx < len(display):
                picked = display.iloc[row_idx]

                def _render_district_brief(district: pd.Series) -> None:
                    reading_pct = percentile_of_better(
                        state_districts["reading"].tolist(), district["reading"]
                    )
                    math_pct = percentile_of_better(
                        state_districts["math"].tolist(), district["math"]
                    )
                    d_rank = int(district["rank"]) if si.is_number(district["rank"]) else None
                    sentence = (
                        f"{row['name']} district ranked {d_rank if d_rank is not None else '—'} "
                        f"of {len(state_districts)} by composite stress (against in-state peers)."
                    )
                    if reading_pct is not None:
                        sentence += f" Reading proficiency is above {reading_pct}% of districts in the state"
                        sentence += f"; math above {math_pct}%." if math_pct is not None else "."
                    st.markdown(ui.band_badge(district["score"], district["band"]))
                    st.caption(sentence)

                    d_reading_delta = latest_change(district["history"], "reading")
                    d_math_delta = latest_change(district["history"], "math")
                    ui.kpi_row(
                        [
                            {
                                "label": "Reading proficiency",
                                "value": fmt.pct(district["reading"]),
                                "delta": f"{fmt.signed(d_reading_delta)} pts YoY"
                                if d_reading_delta is not None
                                else None,
                                "chart_data": district["reading_spark"],
                            },
                            {
                                "label": "Math proficiency",
                                "value": fmt.pct(district["math"]),
                                "delta": f"{fmt.signed(d_math_delta)} pts YoY"
                                if d_math_delta is not None
                                else None,
                                "chart_data": district["math_spark"],
                            },
                            {
                                "label": "Students assessed",
                                "value": fmt.num(district["tested"])
                                if si.is_number(district["tested"])
                                else "—",
                                "help": "all grades, all students",
                            },
                            {
                                "label": "Participation",
                                "value": fmt.pct(district["participation"]),
                                "help": "assessment participation rate",
                            },
                            {
                                "label": "Reading in-state rank",
                                "value": f"Top {max(1, 100 - reading_pct)}%"
                                if reading_pct is not None
                                else "—",
                                "help": f"above {reading_pct if reading_pct is not None else '—'}% "
                                f"of {len(state_districts)} districts",
                            },
                            {
                                "label": "Stress index",
                                "value": fmt.num(district["score"], 1)
                                if si.is_number(district["score"])
                                else "—",
                                "help": "Composite, against in-state peers",
                            },
                        ]
                    )

                    dl, dr = st.columns([1, 2])
                    with dl, st.container(border=True):
                        st.markdown("**Composite stress**")
                        components = pd.DataFrame(
                            [
                                {
                                    "Component": "Proficiency gap",
                                    "Value": fmt.pct(district["gap"]),
                                    "Weight": "100%" if si.is_number(district["gap"]) else "n/a",
                                },
                                {"Component": "Chronic absenteeism", "Value": "—", "Weight": "n/a"},
                                {"Component": "Poverty context", "Value": "—", "Weight": "n/a"},
                            ]
                        )
                        st.dataframe(components, hide_index=True)
                        st.caption(
                            "District-level chronic absenteeism and poverty context are "
                            "not published in the CRDC state tables — the gap component "
                            "carries full weight."
                        )
                    with dr, st.container(border=True):
                        st.markdown("**Proficiency trajectory**")
                        rows = []
                        for point in district["history"]:
                            if point.get("reading") is not None:
                                rows.append({"year": point["year"], "value": point["reading"], "series": "Reading"})
                            if point.get("math") is not None:
                                rows.append({"year": point["year"], "value": point["math"], "series": "Math"})
                        st.altair_chart(
                            ui.trend_line(
                                pd.DataFrame(rows),
                                "year",
                                "value",
                                "series",
                                {"Reading": ui.series("reading"), "Math": ui.series("math")},
                                height=280,
                            )
                        )
                        st.caption(
                            f"NCES LEA ID {district['id']} · year-over-year: reading "
                            f"{fmt.signed(d_reading_delta)}, math {fmt.signed(d_math_delta)} pts"
                        )

                if st.button(
                    f"Open brief for {picked['name']}",
                    icon=":material/location_on:",
                    key=f"open_district_{row_idx}",
                ):

                    @st.dialog(f"{picked['name']}", width="large")
                    def _district_dialog() -> None:
                        _render_district_brief(picked)

                    _district_dialog()

# --- Compare districts --------------------------------------------------------
st.subheader("Compare districts")
st.caption("Pick up to six districts with at least 300 students tested — proficiency side by side.")

comparable = state_districts[state_districts["tested"].fillna(0) >= 300]
comparable = comparable.sort_values("score", ascending=False, na_position="last").head(400)

if comparable.empty:
    st.info("This state has no districts with sufficient tested counts in the current snapshot.")
else:
    choice_options = sorted(comparable["name"].tolist())
    default_picks = comparable["name"].head(4).tolist()
    compare_key = f"district_compare_{selected_abbr}"
    if compare_key in st.session_state:
        picked_districts = st.multiselect(
            "Districts to compare", choice_options, max_selections=6, key=compare_key
        )
    else:
        picked_districts = st.multiselect(
            "Districts to compare",
            choice_options,
            default=default_picks,
            max_selections=6,
            key=compare_key,
        )

    sel = comparable[comparable["name"].isin(picked_districts)]
    if sel.empty:
        st.caption("No districts selected yet.")
    else:
        long_rows = []
        for _, r in sel.iterrows():
            long_rows.append({"district": r["name"], "value": r["reading"], "subject": "Reading"})
            long_rows.append({"district": r["name"], "value": r["math"], "subject": "Math"})
        long_df = pd.DataFrame(long_rows).dropna(subset=["value"])
        st.altair_chart(
            ui.grouped_bar(
                long_df, "district", "value", "subject", {"Reading": ui.series("reading"), "Math": ui.series("math")}
            )
        )
        compare_table = sel[["name", "tested", "reading", "math", "score"]].rename(
            columns={
                "name": "District",
                "tested": "Tested",
                "reading": "Reading",
                "math": "Math",
                "score": "Stress index",
            }
        )
        st.dataframe(
            compare_table,
            hide_index=True,
            column_config={
                "Tested": st.column_config.NumberColumn(format="%.0f"),
                "Reading": st.column_config.NumberColumn(format="%.1f%%"),
                "Math": st.column_config.NumberColumn(format="%.1f%%"),
                "Stress index": st.column_config.NumberColumn(format="%.1f"),
            },
        )

st.divider()
st.caption(
    "District stress scores use the proficiency gap against in-state peers; "
    "chronic absenteeism and poverty are not published at district level, so "
    "weights renormalize to the gap component. "
    f"Year-over-year change for {row['name']}: reading {fmt.signed(reading_delta)} pts, "
    f"math {fmt.signed(math_delta)} pts."
)
st.page_link("app_pages/methodology.py", label="Read the methodology", icon=":material/science:")
