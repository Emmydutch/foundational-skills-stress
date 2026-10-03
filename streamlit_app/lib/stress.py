"""Composite Stress Index — the shared math for both dashboard editions.

Python port of ``src/lib/stress-index.ts``. Constants and formulas are kept
equivalent to the TypeScript implementation so the Next.js and Streamlit
editions score every cohort identically:

    score = clamp(50 + 15·z, 0, 100)

Component z-scores are peer-relative — countries against countries, states
against states, districts against their in-state peers — computed with the
population standard deviation. Missing components are dropped and the
remaining weights are renormalized over what is present.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Optional, Sequence

# Domestic weights: proficiency gap 45% · chronic absenteeism 30% · poverty 25%.
STRESS_WEIGHTS: dict[str, float] = {"gap": 0.45, "absenteeism": 0.30, "poverty": 0.25}

# Global composite: learning poverty 35% · out-of-school 35% · completion gap 30%.
GLOBAL_WEIGHTS: dict[str, float] = {"lp": 0.35, "oos": 0.35, "completionGap": 0.30}

COMPONENT_LABELS: dict[str, str] = {
    "gap": "Proficiency gap",
    "absenteeism": "Chronic absenteeism",
    "poverty": "Poverty context",
}

BAND_META: dict[str, dict[str, str]] = {
    "stable": {"label": "Stable", "range": "0–24", "hex": "#15803d", "soft_hex": "#e7f3ea"},
    "watch": {"label": "Watch", "range": "25–49", "hex": "#b45309", "soft_hex": "#f9efdf"},
    "elevated": {"label": "Elevated", "range": "50–74", "hex": "#c2410c", "soft_hex": "#fbe9e0"},
    "critical": {"label": "Critical", "range": "75–100", "hex": "#b91c1c", "soft_hex": "#fae5e5"},
}

# Band order for filter menus, most → least stressed.
BAND_ORDER = ["critical", "elevated", "watch", "stable"]


def is_number(value: Any) -> bool:
    """True for finite numbers — mirrors the TS `!= null && Number.isFinite` check."""
    if value is None:
        return False
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def band_for_score(score: Optional[float]) -> Optional[str]:
    if not is_number(score):
        return None
    if score < 25:
        return "stable"
    if score < 50:
        return "watch"
    if score < 75:
        return "elevated"
    return "critical"


def cohort_stats(values: Sequence[Optional[float]]) -> tuple[float, float, int]:
    """Mean and population standard deviation over non-null values."""
    xs = [float(v) for v in values if is_number(v)]
    if not xs:
        return 0.0, 0.0, 0
    mean = sum(xs) / len(xs)
    variance = sum((v - mean) ** 2 for v in xs) / len(xs)
    return mean, math.sqrt(variance), len(xs)


def z_scores(values: Sequence[Optional[float]]) -> list[Optional[float]]:
    """Z-scores against the cohort. None in -> None out; sd 0 -> z 0."""
    mean, sd, _ = cohort_stats(values)
    out: list[Optional[float]] = []
    for v in values:
        if not is_number(v):
            out.append(None)
        else:
            out.append((float(v) - mean) / sd if sd > 0 else 0.0)
    return out


def composite_z(
    components: Mapping[str, Optional[float]],
    weights: Mapping[str, float] = STRESS_WEIGHTS,
) -> Optional[float]:
    """Weighted composite z with weights renormalized over present components."""
    numerator = 0.0
    weight_sum = 0.0
    for key, weight in weights.items():
        z = components.get(key)
        if not is_number(z):
            continue
        numerator += float(z) * weight
        weight_sum += weight
    return numerator / weight_sum if weight_sum > 0 else None


def score_from_z(z: float) -> float:
    """Maps a composite z to the 0–100 executive score (50 = cohort average)."""
    return min(100.0, max(0.0, 50.0 + 15.0 * float(z)))


def compute_stress(
    gap: Optional[float],
    gap_z: Optional[float],
    absenteeism: Optional[float],
    abs_z: Optional[float],
    poverty: Optional[float],
    pov_z: Optional[float],
) -> dict:
    """Full stress result for one geography (score, band, components, missing)."""
    inputs: dict[str, tuple[Optional[float], Optional[float]]] = {
        "gap": (gap, gap_z),
        "absenteeism": (absenteeism, abs_z),
        "poverty": (poverty, pov_z),
    }
    present = [key for key, (_, z) in inputs.items() if is_number(z)]
    weight_sum = sum(STRESS_WEIGHTS[key] for key in present)
    z = composite_z({key: inputs[key][1] for key in present}) if present else None
    score = score_from_z(z) if z is not None else None
    return {
        "z": z,
        "score": score,
        "band": band_for_score(score),
        "components": [
            {
                "key": key,
                "label": COMPONENT_LABELS[key],
                "value": inputs[key][0],
                "z": inputs[key][1],
                "weight": (STRESS_WEIGHTS[key] / weight_sum)
                if (key in present and weight_sum > 0)
                else 0.0,
            }
            for key in STRESS_WEIGHTS
        ],
        "missing": [COMPONENT_LABELS[key] for key in STRESS_WEIGHTS if key not in present],
    }


def global_score(lp_z: Optional[float], oos_z: Optional[float], gap_z: Optional[float]) -> tuple[Optional[float], Optional[str]]:
    """Country composite score/band from the three World Bank component z-scores."""
    z = composite_z({"lp": lp_z, "oos": oos_z, "completionGap": gap_z}, GLOBAL_WEIGHTS)
    score = None if z is None else round(score_from_z(z) * 10) / 10
    return score, band_for_score(score)
