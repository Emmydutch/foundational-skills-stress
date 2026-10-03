"""Global lens — World Bank indicators and the country stress league.

Streamlit counterpart of ``src/app/global/page.tsx``: cohort KPIs, the
multi-indicator trend, regional picture, and a filterable country league with
a per-country brief.
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from lib import fmt
from lib import stress as si
from lib import ui
from lib.global_data import cohort_means, global_kpis, load_global, region_aggregates

ui.page_header(
    "Global Lens",
    "World Bank education indicators",
    "Learning poverty, primary completion, and out-of-school children for every "
    "country with a reporting value. The composite score is peer-relative "
    "across countries (50 = cohort average).",
)

try:
    gdf, years, meta = load_global()
except Exception as exc:  # noqa: BLE001 — explicit degraded state, recovers on refresh
    st.error(
        "The World Bank Open Data API could not be reached from this environment. "
        "This page recovers automatically when the feed works again. "
        f"Detail: `{exc}`"
    )
    st.stop()

ui.freshness([f"World Bank · live · updated {fmt.relative_time(meta['fetched_at'])}"])

kpis = global_kpis(gdf)
ui.kpi_row(
    [
        {
            "label": "Learning poverty · mean",
            "value": fmt.pct(kpis["mean_learning_poverty"]),
            "help": f"{kpis['with_learning_poverty']} of {kpis['countries']} countries reporting. "
            "Children past primary age below minimum reading proficiency.",
        },
        {
            "label": "Primary completion · mean",
            "value": fmt.pct(kpis["mean_completion"]),
            "help": "Cohort average, latest year per country",
        },
        {
            "label": "Out of school · mean",
            "value": fmt.pct(kpis["mean_out_of_school"]),
            "help": "Primary-age children, cohort average",
        },
        {
            "label": "Countries tracked",
            "value": fmt.num(kpis["countries"]),
            "help": "With at least one indicator series",
        },
    ]
)

# --- Cohort trend -----------------------------------------------------------
st.subheader("Cohort trend")
st.caption(
    "Unweighted country means per reporting year — gaps mean the cohort had no "
    "published values for that year."
)
series_spec = [
    ("Learning poverty", "lp", ui.series("amber")),
    ("Primary completion", "completion", ui.series("math")),
    ("Out of school", "oos", ui.series("red")),
]
trend_rows = []
for label, key, _ in series_spec:
    for year, value in zip(years, cohort_means(gdf, years, key)):
        trend_rows.append({"year": str(year), "value": value, "series": label})
trend_df = pd.DataFrame(trend_rows).dropna(subset=["value"])
with st.container(border=True):
    st.altair_chart(
        ui.trend_line(
            trend_df,
            "year",
            "value",
            "series",
            {label: color for label, _, color in series_spec},
        )
    )

# --- Regional picture + most stressed systems -------------------------------
st.subheader("Stress map")
st.caption("Composite learning-stress score per country (0–100) and unweighted regional means.")
left, right = st.columns([2, 1])
with left, st.container(border=True):
    st.markdown("**Most stressed systems**")
    top = gdf.dropna(subset=["score"]).sort_values("score", ascending=False).head(12).copy()
    top["detail"] = top.apply(
        lambda r: f"Learning poverty {fmt.pct(r['lp'])} · completion {fmt.pct(r['completion'])}",
        axis=1,
    )
    view = top[["name", "score", "detail"]].rename(columns={"score": "value"})
    st.altair_chart(
        ui.rank_bar(view, "name", "value", ui.series("red"), tooltip=[("value", "Stress index"), ("detail", "")])
    )
with right, st.container(border=True):
    st.markdown("**Regional picture**")
    st.caption("Unweighted country means by region")
    regions = region_aggregates(gdf)
    st.dataframe(
        regions,
        hide_index=True,
        column_config={
            "region": st.column_config.TextColumn("Region"),
            "countries": st.column_config.NumberColumn("Countries", format="%.0f"),
            "learning_poverty": st.column_config.NumberColumn("Learn. pov.", format="%.1f%%"),
            "completion": st.column_config.NumberColumn("Completion", format="%.1f%%"),
            "out_of_school": st.column_config.NumberColumn("Out of school", format="%.1f%%"),
        },
    )
st.caption(f"Source: {meta['source']} · fetched {fmt.relative_time(meta['fetched_at'])}")

# --- Country league table ----------------------------------------------------
st.subheader("Country league table")
st.caption(
    "Sort any column, filter by stress band or region — select a country's "
    "name cell, then open its brief."
)
region_options = ["All regions"] + sorted(gdf["region"].dropna().unique().tolist())
with st.container(border=True):
    f1, f2, f3 = st.columns([2, 1, 1])
    search = f1.text_input("Search", placeholder="Search countries or regions…")
    band_label = f2.selectbox("Stress band", ui.band_filter_options())
    region_label = f3.selectbox("Region", region_options)

view = gdf.copy()
if search.strip():
    needle = search.strip().lower()
    view = view[
        view["name"].str.lower().str.contains(needle, regex=False)
        | view["region"].str.lower().str.contains(needle, regex=False)
    ]
band_key = ui.band_from_label(band_label)
if band_key is not None:
    view = view[view["band"] == band_key]
if region_label != "All regions":
    view = view[view["region"] == region_label]
view = view.sort_values("score", ascending=False, na_position="last").reset_index(drop=True)

if view.empty:
    st.warning("No countries match the current search and filters.")
else:
    display = view.copy()
    display["band_badges"] = display["band"].apply(
        lambda b: [si.BAND_META[b]["label"]] if isinstance(b, str) and b in si.BAND_META else []
    )
    selection = st.dataframe(
        display,
        height=560,
        hide_index=True,
        column_order=["name", "region", "lp", "completion", "oos", "score", "band_badges", "lp_spark"],
        column_config={
            "name": st.column_config.TextColumn("Country", width="medium", pinned=True),
            "region": st.column_config.TextColumn("Region", width="medium"),
            "lp": st.column_config.NumberColumn("Learning poverty", format="%.1f%%"),
            "completion": st.column_config.NumberColumn("Completion", format="%.1f%%"),
            "oos": st.column_config.NumberColumn("Out of school", format="%.1f%%"),
            "score": st.column_config.NumberColumn(
                "Stress index", format="%.0f", help="Composite score, 0–100 (50 = cohort average)"
            ),
            "band_badges": st.column_config.MultiselectColumn(
                "Band",
                options=["Stable", "Watch", "Elevated", "Critical"],
                color=[ui.series("reading"), ui.series("amber"), ui.series("orange"), ui.series("red")],
                width="small",
            ),
            "lp_spark": st.column_config.LineChartColumn(
                "LP trend", width="medium", help="Learning poverty, 2015 → latest"
            ),
        },
        on_select="rerun",
        selection_mode="single-cell",
        key="country_league",
    )

    if selection.selection.cells:
        row_idx, col_name = selection.selection.cells[0]
        if col_name == "name" and row_idx < len(display):
            row = display.iloc[row_idx]

            def _render_country_brief(row: pd.Series) -> None:
                st.markdown(
                    f"{ui.band_badge(row['score'], row['band'])} "
                    f":gray-badge[{row['region']}]"
                )
                delta = (
                    round((row["lp"] - row["lp_prev"]) * 10) / 10
                    if si.is_number(row["lp"]) and si.is_number(row["lp_prev"])
                    else None
                )
                ui.kpi_row(
                    [
                        {
                            "label": "Learning poverty",
                            "value": fmt.pct(row["lp"]),
                            "delta": f"{fmt.signed(delta)} pts vs prior year" if delta is not None else None,
                            "help": "Children past primary age below minimum reading proficiency",
                        },
                        {"label": "Primary completion", "value": fmt.pct(row["completion"])},
                        {"label": "Out of school", "value": fmt.pct(row["oos"])},
                        {
                            "label": "Stress index",
                            "value": fmt.num(row["score"], 1) if si.is_number(row["score"]) else "—",
                            "help": "Composite, peer-relative across countries",
                        },
                    ]
                )
                rows = []
                for label, key in [("Learning poverty", "series_lp"), ("Primary completion", "series_completion")]:
                    for year, value in zip(years, row[key]):
                        if value is not None:
                            rows.append({"year": str(year), "value": value, "series": label})
                with st.container(border=True):
                    st.altair_chart(
                        ui.trend_line(
                            pd.DataFrame(rows),
                            "year",
                            "value",
                            "series",
                            {"Learning poverty": ui.series("amber"), "Primary completion": ui.series("math")},
                        )
                    )
                st.caption(f"Source: {meta['source']}")

            if st.button(
                f"Open brief for {row['name']}",
                icon=":material/public:",
                key=f"open_country_{row_idx}",
            ):

                @st.dialog(f"{row['name']}", width="large")
                def _country_dialog() -> None:
                    _render_country_brief(row)

                _country_dialog()

st.page_link("app_pages/methodology.py", label="Read the methodology", icon=":material/science:")
