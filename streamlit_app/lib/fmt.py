"""Display formatters — Python port of src/lib/format.ts.

All values shown by the dashboard pass through here so the two editions
(Next.js and Streamlit) format numbers identically.
"""

from __future__ import annotations

from datetime import datetime, timezone


def pct(value: float | None, digits: int = 1) -> str:
    """Format an already-multiplied percentage, e.g. 47.3 -> "47.3%"."""
    if value is None:
        return "—"
    try:
        return f"{float(value):.{digits}f}%"
    except (TypeError, ValueError):
        return "—"


def num(value: float | None, digits: int = 0) -> str:
    """Thousands-separated number, e.g. 378006 -> "378,006"."""
    if value is None:
        return "—"
    try:
        return f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return "—"


def signed(value: float | None, digits: int = 1) -> str:
    """Signed number, e.g. 1.9 -> "+1.9"."""
    if value is None:
        return "—"
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "—"
    sign = "+" if v > 0 else ""
    return f"{sign}{v:.{digits}f}"


def school_year_label(year: str | None) -> str:
    """"2021-22" -> "SY 2021-22"."""
    return f"SY {year}" if year else "—"


def relative_time(iso: str | None) -> str:
    """Human freshness label for a live-feed timestamp."""
    if not iso:
        return "—"
    try:
        then = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return "—"
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    mins = max(0, round((datetime.now(timezone.utc) - then).total_seconds() / 60))
    if mins < 1:
        return "just now"
    if mins < 60:
        return f"{mins} min ago"
    hours = round(mins / 60)
    if hours < 48:
        return f"{hours} hr{'s' if hours != 1 else ''} ago"
    days = round(hours / 24)
    return f"{days} day{'s' if days != 1 else ''} ago"
