"""US layer — snapshots, live Census poverty, and per-cohort stress scoring.

Python port of ``src/lib/data/us.ts``, ``src/lib/us-metrics.ts``,
``src/lib/us-regions.ts`` and ``src/lib/feeds/census.ts``. Snapshot files ship
with the repository under ``data/snapshots/``, so the app renders even when
live feeds are unreachable.

Cohorts: states are z-scored against all states/territories; each district is
z-scored against its in-state peers, so it is judged against comparable
districts facing the same state assessment regime.
"""

from __future__ import annotations

import json
import math
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pandas as pd
import streamlit as st

from lib import stress as si

REPO_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_DIR = REPO_ROOT / "data" / "snapshots"
_USER_AGENT = "foundational-skills-stress/0.1 (education research dashboard)"

# U.S. Census Bureau regions — static mapping, mirrors src/lib/us-regions.ts.
CENSUS_REGIONS = ["Northeast", "Midwest", "South", "West", "Territories"]

_BY_ABBR: dict[str, str] = {
    # Northeast
    **{a: "Northeast" for a in ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"]},
    # Midwest
    **{a: "Midwest" for a in ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"]},
    # South
    **{a: "South" for a in ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"]},
    # West
    **{a: "West" for a in ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"]},
}


def census_region(abbr: str) -> str:
    """Census region for a state abbreviation; unknown codes -> "Territories"."""
    return _BY_ABBR.get(str(abbr).upper(), "Territories")


def _read_snapshot(name: str) -> Optional[dict]:
    path = SNAPSHOT_DIR / name
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


@st.cache_data(ttl=300, show_spinner=False)
def load_achievement() -> Optional[dict]:
    """EDFacts achievement snapshot (states + districts with year history)."""
    return _read_snapshot("us-achievement.json")


@st.cache_data(ttl=300, show_spinner=False)
def load_absenteeism() -> Optional[dict]:
    """CRDC 2015-16 chronic absenteeism snapshot."""
    return _read_snapshot("us-absenteeism.json")


@st.cache_data(ttl=86400, show_spinner="Fetching Census poverty context…")
def load_poverty() -> Optional[dict]:
    """ACS 1-year poverty rate by state FIPS (live, keyless, daily cache).

    Some gateways answer keyless requests with an HTML page; both that case
    and network errors fall through to the next candidate year, mirroring
    src/lib/feeds/census.ts. Returns None when fully unavailable.
    """
    for year in (2024, 2023, 2022, 2021):
        url = (
            f"https://api.census.gov/data/{year}/acs/acs1"
            f"?get=NAME,B17001_001E,B17001_002E&for=state:*"
        )
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
            with urllib.request.urlopen(req, timeout=20) as resp:
                text = resp.read().decode("utf-8", errors="replace")
        except Exception:
            continue
        if text.lstrip().startswith("<"):
            continue  # gateway HTML (missing key) — treat as unavailable
        try:
            rows = json.loads(text)
        except json.JSONDecodeError:
            continue
        if not isinstance(rows, list) or len(rows) < 2:
            continue
        head = rows[0]
        try:
            i_total = head.index("B17001_001E")
            i_pov = head.index("B17001_002E")
            i_state = head.index("state")
        except ValueError:
            continue
        by_fips: dict[str, float] = {}
        for row in rows[1:]:
            try:
                total = float(row[i_total])
                pov = float(row[i_pov])
            except (TypeError, ValueError, IndexError):
                continue
            if total > 0:
                by_fips[str(row[i_state]).zfill(2)] = round(pov / total * 1000) / 10
        if by_fips:
            return {
                "by_fips": by_fips,
                "year": year,
                "source": f"U.S. Census Bureau, ACS 1-year estimates (B17001, {year})",
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
    return None


def gap_of(reading: Any, math_score: Any) -> Optional[float]:
    """Proficiency gap: 100 − mean(reading, math) — higher means more stress."""
    parts = [float(v) for v in (reading, math_score) if si.is_number(v)]
    if not parts:
        return None
    return round((100 - sum(parts) / len(parts)) * 10) / 10


def latest_change(history: list[dict], key: str) -> Optional[float]:
    """Latest year-over-year change in a history series (last non-null minus prior)."""
    values = [float(p[key]) for p in history if isinstance(p, dict) and si.is_number(p.get(key))]
    if len(values) < 2:
        return None
    return round((values[-1] - values[-2]) * 10) / 10


def weighted_mean(items: list[tuple[Optional[float], Optional[float]]]) -> Optional[float]:
    """Weighted mean over rows with a positive weight (enrollment-weighted roll-ups)."""
    num = 0.0
    den = 0.0
    for value, weight in items:
        if not si.is_number(value) or not si.is_number(weight) or float(weight) <= 0:
            continue
        num += float(value) * float(weight)
        den += float(weight)
    return round(num / den * 10) / 10 if den > 0 else None


def percentile_of_better(values: list[Optional[float]], mine: Optional[float]) -> Optional[int]:
    """Share of the cohort (0–100) that sits below `mine` — in-state percentile."""
    if not si.is_number(mine):
        return None
    xs = [float(v) for v in values if si.is_number(v)]
    if not xs:
        return None
    better = sum(1 for v in xs if v < float(mine))
    return round(better / len(xs) * 100)


@st.cache_data(ttl=300, show_spinner="Scoring the state cohort…")
def state_frame() -> Optional[pd.DataFrame]:
    """One scored row per state/territory: inputs, z-score composite, band, rank."""
    achievement = load_achievement()
    if not achievement:
        return None

    absenteeism = load_absenteeism() or {}
    poverty = load_poverty()
    abs_by_fips = {s.get("fips"): s.get("rate") for s in absenteeism.get("states", [])}
    pov_by_fips = (poverty or {}).get("by_fips", {})

    rows = []
    for s in achievement.get("states", []):
        history = s.get("history", [])
        rows.append(
            {
                "fips": s.get("fips"),
                "abbr": s.get("abbr"),
                "name": s.get("name"),
                "region": census_region(s.get("abbr", "")),
                "reading": s.get("reading"),
                "math": s.get("math"),
                "tested": s.get("tested"),
                "participation": s.get("participation"),
                "absenteeism": abs_by_fips.get(s.get("fips")),
                "poverty": pov_by_fips.get(str(s.get("fips")).zfill(2)),
                "gap": gap_of(s.get("reading"), s.get("math")),
                "yoy": latest_change(history, "reading"),
                "history": history,
            }
        )
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    gap_z = si.z_scores(df["gap"].tolist())
    abs_z = si.z_scores(df["absenteeism"].tolist())
    pov_z = si.z_scores(df["poverty"].tolist())
    computed = [
        si.compute_stress(row.gap, gap_z[i], row.absenteeism, abs_z[i], row.poverty, pov_z[i])
        for i, row in enumerate(df.itertuples())
    ]
    df["score"] = [c["score"] for c in computed]
    df["band"] = [c["band"] for c in computed]
    df["components"] = [c["components"] for c in computed]
    df["missing"] = [", ".join(c["missing"]) for c in computed]

    ranked = df[df["score"].notna()].sort_values("score", ascending=False).index
    df["rank"] = df.index.map({idx: i + 1 for i, idx in enumerate(ranked)})
    df["reading_spark"] = df["history"].apply(lambda h: [p.get("reading") for p in h])
    df["math_spark"] = df["history"].apply(lambda h: [p.get("math") for p in h])
    return df


@st.cache_data(ttl=300, show_spinner="Scoring districts within their states…")
def district_frame() -> Optional[pd.DataFrame]:
    """One scored row per district; z-scores are computed within each state."""
    achievement = load_achievement()
    if not achievement:
        return None

    rows = []
    for d in achievement.get("districts", []):
        history = d.get("history", [])
        rows.append(
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "state_fips": d.get("state"),
                "reading": d.get("reading"),
                "math": d.get("math"),
                "tested": d.get("tested"),
                "participation": d.get("participation"),
                "gap": gap_of(d.get("reading"), d.get("math")),
                "yoy_reading": latest_change(history, "reading"),
                "yoy_math": latest_change(history, "math"),
                "history": history,
            }
        )
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # In-state cohort z-scores with the population standard deviation.
    group = df.groupby("state_fips")["gap"]
    mean = group.transform("mean")
    sd = group.transform(lambda s: math.sqrt(((s - s.mean()) ** 2).mean()))
    z = (df["gap"] - mean) / sd
    z = z.where(sd > 0, 0.0)
    z[df["gap"].isna()] = float("nan")
    df["gap_z"] = z
    df["score"] = df["gap_z"].apply(lambda v: si.score_from_z(float(v)) if si.is_number(v) else None)
    df["band"] = df["score"].apply(si.band_for_score)
    df["rank"] = df.groupby("state_fips")["score"].rank(ascending=False, method="first")

    # District-level scores rest on the proficiency gap; absenteeism and
    # poverty are not published at this grain, so the gap carries full weight.
    df["missing"] = "Chronic absenteeism, Poverty context"
    df["reading_spark"] = df["history"].apply(lambda h: [p.get("reading") for p in h])
    df["math_spark"] = df["history"].apply(lambda h: [p.get("math") for p in h])
    return df


def us_kpis(states: pd.DataFrame) -> dict:
    """Enrollment-weighted national aggregates across the state cohort."""
    return {
        "reading": weighted_mean(list(zip(states["reading"], states["tested"]))),
        "math": weighted_mean(list(zip(states["math"], states["tested"]))),
        "absenteeism": weighted_mean(list(zip(states["absenteeism"], states["tested"]))),
        "poverty": weighted_mean(list(zip(states["poverty"], states["tested"]))),
        "tested": int(states["tested"].fillna(0).sum()) or None,
        "states_with_proficiency": int((states["reading"].notna() | states["math"].notna()).sum()),
    }


def national_year_series(states: pd.DataFrame, years: list[str], key: str) -> list[Optional[float]]:
    """Students-tested-weighted national mean per snapshot school year."""
    series = []
    for year in years:
        pairs = [
            (next((h.get(key) for h in hist if h.get("year") == year), None), tested)
            for hist, tested in zip(states["history"], states["tested"])
        ]
        series.append(weighted_mean(pairs))
    return series
