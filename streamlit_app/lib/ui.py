"""Shared UI fragments — headers, badges, and the recurring chart idioms.

Kept deliberately thin: pages compose native Streamlit elements; helpers only
encode the visual language of the executive dashboard (eyebrow headers, band
badges, ranked bars, cohort trend lines). Follows the bundled
developing-with-streamlit guidance: no custom CSS, native elements first.
"""

from __future__ import annotations

import altair as alt
import pandas as pd
import plotly.express as px
import streamlit as st

from lib.stress import BAND_META

# Band -> Streamlit badge colour (maps onto the themed palette set in .streamlit/config.toml).
BAND_BADGE_COLOR = {"stable": "green", "watch": "yellow", "elevated": "orange", "critical": "red"}

# Band -> hex colour for MultiselectColumn badges inside dataframes.
BAND_HEX = {key: meta["hex"] for key, meta in BAND_META.items()}

# --- Theme-aware chart series -------------------------------------------------
#
# The light palette is the brand baseline; the dark palette mirrors the Next.js
# `.dark` token overrides (src/app/globals.css). Ask for a semantic colour via
# ``series("reading")`` and the helper resolves it against the active theme
# (the light/dark switcher lives in the app settings menu).
_SERIES_LIGHT = {
    "reading": "#15803d",
    "math": "#35658f",
    "amber": "#b45309",
    "orange": "#c2410c",
    "red": "#b91c1c",
    "green": "#4d7c0f",
    "slate": "#5b6b7d",
    "nodata": "#dbe2ea",
}

_SERIES_DARK = {
    "reading": "#3fbf74",
    "math": "#6fa8d8",
    "amber": "#dc9b2e",
    "orange": "#f07a3c",
    "red": "#ef6464",
    "green": "#7fb53a",
    "slate": "#94a7bd",
    "nodata": "#26364e",
}


def is_dark() -> bool:
    """True when the app renders in dark mode (settings-menu switcher)."""
    theme = getattr(st.context, "theme", None)
    return getattr(theme, "type", None) == "dark"


def series(key: str) -> str:
    """Resolve a semantic series colour (reading/math/amber/orange/red/green/slate)."""
    palette = _SERIES_DARK if is_dark() else _SERIES_LIGHT
    return palette[key]


def page_header(eyebrow: str, title: str, description: str) -> None:
    """Eyebrow + title + description block mirroring the Next.js PageHeader."""
    st.caption(eyebrow.upper())
    st.subheader(title)
    st.markdown(description)


def freshness(chips: list[str]) -> None:
    """One-line provenance strip, e.g. "EDFacts · snapshot · SY 2021-22"."""
    if chips:
        st.caption(" · ".join(chips))


def band_badge(score: float | None, band: str | None, show_score: bool = True) -> str:
    """Markdown badge string for a stress band."""
    if band is None:
        return ":gray-badge[no score]"
    label = BAND_META[band]["label"]
    if show_score and score is not None:
        label = f"{label} · {float(score):.1f} / 100"
    return f":{BAND_BADGE_COLOR[band]}-badge[{label}]"


def band_filter_options(include_all: bool = True) -> list[str]:
    """Filter dropdown choices, most → least stressed."""
    options = [f"{BAND_META[b]['label']} ({BAND_META[b]['range']})" for b in ["critical", "elevated", "watch", "stable"]]
    return (["All bands"] + options) if include_all else options


def band_from_label(label: str) -> str | None:
    """"Critical (75–100)" -> "critical"; "All bands" -> None."""
    if label == "All bands":
        return None
    for key, meta in BAND_META.items():
        if label.startswith(meta["label"]):
            return key
    return None


def kpi_row(items: list[dict]) -> None:
    """Horizontal metric cards that wrap on narrow screens.

    Each item: label, value, and optionally delta / help / chart_data.
    """
    with st.container(horizontal=True):
        for item in items:
            chart_data = item.get("chart_data")
            if chart_data is not None:
                # Sparklines only carry y-values; drop gaps so the chart reads cleanly.
                chart_data = [float(v) for v in chart_data if v is not None]
                if len(chart_data) < 2:
                    chart_data = None
            st.metric(
                item["label"],
                item["value"],
                delta=item.get("delta"),
                help=item.get("help"),
                border=True,
                chart_data=chart_data,
                chart_type="line",
            )


def rank_bar(
    df: pd.DataFrame,
    label_col: str,
    value_col: str,
    color: str,
    tooltip: list[tuple[str, str]] | None = None,
    axis_format: str = ".0f",
    height: int | None = None,
) -> alt.Chart:
    """Horizontal ranked bars — the Streamlit counterpart of the rank lists."""
    height = height or max(150, 30 * len(df) + 20)
    enc_tooltip = []
    for col, title in tooltip or []:
        kind = "N" if df[col].dtype == object else "Q"
        enc_tooltip.append(alt.Tooltip(f"{col}:{kind}", title=title))
    return (
        alt.Chart(df)
        .mark_bar(color=color, size=16)
        .encode(
            x=alt.X(f"{value_col}:Q", title=None, axis=alt.Axis(grid=False, format=axis_format)),
            y=alt.Y(f"{label_col}:N", sort="-x", title=None, axis=alt.Axis(labelLimit=220)),
            tooltip=enc_tooltip or [alt.Tooltip(f"{value_col}:Q", title="Value", format=axis_format)],
        )
        .properties(height=height)
    )


def trend_line(
    df: pd.DataFrame,
    x_col: str,
    y_col: str,
    color_col: str,
    colors: dict[str, str],
    height: int = 280,
) -> alt.Chart:
    """Multi-series line chart with fixed brand colours per series."""
    return (
        alt.Chart(df)
        .mark_line(strokeWidth=2, point=alt.OverlayMarkDef(size=30, filled=True))
        .encode(
            x=alt.X(f"{x_col}:N", title=None, axis=alt.Axis(labelAngle=0)),
            y=alt.Y(f"{y_col}:Q", title=None, scale=alt.Scale(zero=False)),
            color=alt.Color(
                f"{color_col}:N",
                title=None,
                scale=alt.Scale(domain=list(colors.keys()), range=list(colors.values())),
                legend=alt.Legend(orient="top"),
            ),
            tooltip=[
                alt.Tooltip(f"{x_col}:N", title="Period"),
                alt.Tooltip(f"{y_col}:Q", title="Value", format=".1f"),
                alt.Tooltip(f"{color_col}:N", title=""),
            ],
        )
        .properties(height=height)
    )


def grouped_bar(
    df: pd.DataFrame,
    x_col: str,
    y_col: str,
    group_col: str,
    colors: dict[str, str],
    height: int = 320,
) -> alt.Chart:
    """Grouped columns comparing subjects across entities (comparator view)."""
    return (
        alt.Chart(df)
        .mark_bar()
        .encode(
            x=alt.X(f"{x_col}:N", title=None, axis=alt.Axis(labelAngle=0, labelLimit=140)),
            xOffset=alt.XOffset(f"{group_col}:N"),
            y=alt.Y(f"{y_col}:Q", title=None),
            color=alt.Color(
                f"{group_col}:N",
                title=None,
                scale=alt.Scale(domain=list(colors.keys()), range=list(colors.values())),
                legend=alt.Legend(orient="top"),
            ),
            tooltip=[
                alt.Tooltip(f"{x_col}:N", title=""),
                alt.Tooltip(f"{group_col}:N", title=""),
                alt.Tooltip(f"{y_col}:Q", title="Value", format=".1f"),
            ],
        )
        .properties(height=height)
    )


def world_stress_map(df: pd.DataFrame, height: int = 430) -> "px.Figure":
    """World choropleth in the map's four-step ramp (+ a no-data gray).

    Mirrors the Next.js WorldMap, including its STRESS_BANDS colours
    (--color-stable, --color-chart-green, --color-watch, --color-critical):
    canvas-coloured ocean, card-coloured borders, and no-data land. Expects
    ``iso3``, ``name``, ``score`` (nullable) and ``band`` (nullable) columns —
    rows outside the current filter simply drop out, leaving the surrounding
    land in the no-data tone.
    """
    categories = ["stable", "watch", "elevated", "critical", "no data"]
    # The Next.js STRESS_BANDS ramp (src/app/page.tsx and src/app/us/page.tsx):
    # stable → chart-green → watch → critical.
    colors = {
        "stable": series("reading"),
        "watch": series("green"),
        "elevated": series("amber"),
        "critical": series("red"),
        "no data": series("nodata"),
    }
    dark = is_dark()
    canvas = "#0b1322" if dark else "#f4f6f9"
    card = "#121e30" if dark else "#ffffff"

    plot_df = df.copy()
    plot_df["band_cat"] = plot_df["band"].apply(
        lambda b: b if isinstance(b, str) and b in categories else "no data"
    )
    plot_df["score_label"] = plot_df["score"].apply(
        lambda v: f"{v:.0f} / 100" if pd.notna(v) else "no score"
    )

    fig = px.choropleth(
        plot_df,
        locations="iso3",
        locationmode="ISO-3",
        color="band_cat",
        category_orders={"band_cat": categories},
        color_discrete_map=colors,
        hover_name="name",
        custom_data=["score_label"],
    )
    fig.update_traces(
        marker_line_color=card,
        marker_line_width=0.5,
        hovertemplate="<b>%{hovertext}</b><br>Stress index %{customdata[0]}<extra></extra>",
    )
    fig.update_geos(
        projection_type="natural earth",
        showframe=False,
        showcoastlines=False,
        showcountries=True,
        countrycolor=card,
        countrywidth=0.4,
        showland=True,
        landcolor=series("nodata"),
        showocean=True,
        oceancolor=canvas,
        showlakes=False,
    )
    fig.update_layout(
        height=height,
        margin={"l": 0, "r": 0, "t": 0, "b": 0},
        paper_bgcolor=canvas,
        plot_bgcolor=canvas,
        showlegend=False,
        font={"color": "#e8eef7" if dark else "#16202c", "size": 12},
    )
    return fig
