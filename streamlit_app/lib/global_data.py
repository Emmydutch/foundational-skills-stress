"""Global layer — live World Bank indicators and the country stress composite.

Python port of ``src/lib/feeds/worldbank.ts`` and ``src/lib/global-metrics.ts``.
The fetch is cached for an hour; failures raise, so pages render an explicit
degraded state and recover automatically on the next refresh.

The composite is indicator-driven — learning poverty 35% · out-of-school 35%
· completion gap 30% — with weights renormalized over whatever each country
publishes. Series run from 2015 to the current year.
"""

from __future__ import annotations

import json
import math
import urllib.request
from datetime import date, datetime, timezone
from typing import Any, Optional

import pandas as pd
import streamlit as st

from lib import stress as si

WB = "https://api.worldbank.org/v2"
FIRST_YEAR = 2015
INDICATORS = {
    "lp": "SE.LPV.PRIM",  # Learning poverty: % below minimum reading proficiency
    "completion": "SE.PRM.CUAT.ZS",  # Primary completion rate (% of relevant age group)
    "oos": "SE.PRM.UNER.ZS",  # Children out of school, primary (% of primary age)
}
_USER_AGENT = "foundational-skills-stress/0.1 (education research dashboard)"


def _fetch_json(url: str, timeout: int = 30) -> list:
    """GET a World Bank v2 endpoint (responses are ``[meta, rows]``)."""
    req = urllib.request.Request(
        url, headers={"User-Agent": _USER_AGENT, "Accept": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8", errors="replace"))
    if not isinstance(payload, list) or len(payload) < 2:
        message = "unexpected payload"
        if isinstance(payload, list) and payload and isinstance(payload[0], dict):
            message = str(payload[0].get("message", message))
        raise RuntimeError(f"World Bank API error: {message}")
    return payload


def _fetch_paged(base: str, max_pages: int = 10) -> list[dict]:
    meta, rows = _fetch_json(f"{base}&page=1")
    out: list[dict] = list(rows or [])
    pages = min(int((meta or {}).get("pages", 1) or 1), max_pages)
    for page in range(2, pages + 1):
        _, more = _fetch_json(f"{base}&page={page}")
        out.extend(more or [])
    return out


def _to_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _series_for(points: list[dict], iso3: str, first_year: int, last_year: int) -> list[Optional[float]]:
    """Year-aligned values for one country (index 0 = first_year)."""
    by_year: dict[int, Optional[float]] = {}
    for p in points:
        if p.get("countryiso3code") != iso3:
            continue
        try:
            year = int(p.get("date"))
        except (TypeError, ValueError):
            continue
        if first_year <= year <= last_year:
            by_year[year] = _to_number(p.get("value"))
    return [by_year.get(y) for y in range(first_year, last_year + 1)]


def _latest_non_null(series: list[Optional[float]]) -> tuple[Optional[float], Optional[float]]:
    values = [v for v in series if v is not None]
    latest = values[-1] if values else None
    prev = values[-2] if len(values) > 1 else None
    return latest, prev


@st.cache_data(ttl=3600, show_spinner="Fetching World Bank open data…")
def load_global() -> tuple[pd.DataFrame, list[int], dict]:
    """Countries with scored composites, the year axis, and feed metadata."""
    last_year = date.today().year
    years = list(range(FIRST_YEAR, last_year + 1))
    window = f"date={FIRST_YEAR}:{last_year}"

    country_meta = _fetch_paged(f"{WB}/country?format=json&per_page=1000", max_pages=3)
    points = {
        key: _fetch_paged(
            f"{WB}/country/all/indicator/{code}?format=json&per_page=2000&{window}",
            max_pages=10,
        )
        for key, code in INDICATORS.items()
    }

    # Keep only real countries: WB aggregates carry region id "NA".
    real = [
        c
        for c in country_meta
        if isinstance(c.get("id"), str)
        and len(c["id"]) == 3
        and (c.get("region") or {}).get("id") != "NA"
    ]

    rows = []
    for c in real:
        lp_series = _series_for(points["lp"], c["id"], FIRST_YEAR, last_year)
        completion_series = _series_for(points["completion"], c["id"], FIRST_YEAR, last_year)
        oos_series = _series_for(points["oos"], c["id"], FIRST_YEAR, last_year)
        lp_latest, lp_prev = _latest_non_null(lp_series)
        completion_latest, _ = _latest_non_null(completion_series)
        oos_latest, _ = _latest_non_null(oos_series)
        rows.append(
            {
                "iso3": c["id"],
                "name": c["name"],
                "region": (c.get("region") or {}).get("value", "—"),
                "lp": lp_latest,
                "lp_prev": lp_prev,
                "completion": completion_latest,
                "oos": oos_latest,
                "completion_gap": None
                if completion_latest is None
                else round((100 - completion_latest) * 10) / 10,
                "series_lp": lp_series,
                "series_completion": completion_series,
                "series_oos": oos_series,
            }
        )
    df = pd.DataFrame(rows).sort_values("name", ignore_index=True)

    # Peer-relative composite across the country cohort.
    lp_z = si.z_scores(df["lp"].tolist())
    oos_z = si.z_scores(df["oos"].tolist())
    gap_z = si.z_scores(df["completion_gap"].tolist())
    scored = [si.global_score(lp_z[i], oos_z[i], gap_z[i]) for i in range(len(df))]
    df["score"] = [s for s, _ in scored]
    df["band"] = [b for _, b in scored]
    df["lp_spark"] = df["series_lp"].apply(lambda s: [v for v in s if v is not None])

    meta = {
        "source": "World Bank Open Data (EdStats / WDI)",
        "source_url": "https://data.worldbank.org",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "mode": "live",
    }
    return df, years, meta


def _mean(values: list[Optional[float]]) -> Optional[float]:
    xs = [float(v) for v in values if si.is_number(v)]
    if not xs:
        return None
    return round(sum(xs) / len(xs) * 10) / 10


def global_kpis(df: pd.DataFrame) -> dict:
    """Unweighted cohort aggregates (documented limitation on Methodology)."""
    return {
        "countries": len(df),
        "with_learning_poverty": int(df["lp"].notna().sum()),
        "mean_learning_poverty": _mean(df["lp"].tolist()),
        "mean_completion": _mean(df["completion"].tolist()),
        "mean_out_of_school": _mean(df["oos"].tolist()),
    }


def region_aggregates(df: pd.DataFrame) -> pd.DataFrame:
    """Unweighted regional means of the three indicators."""
    grouped = (
        df.groupby("region")
        .agg(
            countries=("iso3", "count"),
            learning_poverty=("lp", lambda s: _mean(s.tolist())),
            completion=("completion", lambda s: _mean(s.tolist())),
            out_of_school=("oos", lambda s: _mean(s.tolist())),
        )
        .reset_index()
        .sort_values("region", ignore_index=True)
    )
    return grouped


def lp_movers(df: pd.DataFrame, count: int = 5) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Largest learning-poverty movements (both directions) between the two
    most recent reporting years per country; negative delta = improvement."""
    movers = df[df["lp"].notna() & df["lp_prev"].notna()].copy()
    movers["delta"] = ((movers["lp"] - movers["lp_prev"]) * 10).round() / 10
    improvers = movers[movers["delta"] < 0].sort_values("delta").head(count)
    decliners = movers[movers["delta"] > 0].sort_values("delta", ascending=False).head(count)
    return improvers, decliners


def cohort_means(df: pd.DataFrame, years: list[int], key: str) -> list[Optional[float]]:
    """Unweighted country mean per reporting year for one indicator series."""
    col = f"series_{key}"
    out: list[Optional[float]] = []
    for i in range(len(years)):
        out.append(_mean([row[i] for row in df[col]]))
    return out
