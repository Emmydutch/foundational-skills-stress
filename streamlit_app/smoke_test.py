"""Headless smoke test for the Streamlit edition.

Boots the real entrypoint (app.py + st.navigation) and visits every page with
Streamlit's AppTest harness, reporting exceptions and rendered element counts.

Run from the repository root:
    .venv\\Scripts\\python.exe streamlit_app/smoke_test.py
"""

import os
import sys
import time

sys.path.insert(0, os.path.abspath("streamlit_app"))

from streamlit.testing.v1 import AppTest

ENTRY = os.path.abspath("streamlit_app/app.py")

PAGES = [
    ("app_pages/executive_brief.py", "Executive brief (default)"),
    ("app_pages/global_lens.py", "Global lens"),
    ("app_pages/united_states.py", "United States"),
    ("app_pages/state_drilldown.py", "State drill-down"),
    ("app_pages/methodology.py", "Methodology"),
    ("app_pages/about.py", "About"),
]

failures = 0
at = AppTest.from_file(ENTRY, default_timeout=300)

for path, label in PAGES:
    t0 = time.time()
    if path != "app_pages/executive_brief.py":
        try:
            at.switch_page(path)
        except Exception as exc:  # noqa: BLE001
            print(f"[SWITCH-FAILED] {label}: {exc}")
            failures += 1
            continue
    at.run()
    dt = time.time() - t0
    if at.exception:
        failures += 1
        print(f"[EXCEPTION] {label} ({dt:.1f}s)")
        for exc in at.exception:
            print(f"    {exc.value}")
    else:
        counts = (
            f"metrics={len(at.metric)} dataframes={len(at.dataframe)} "
            f"charts={len(getattr(at, 'altair_chart', []) or [])} "
            f"buttons={len(at.button)}"
        )
        notes = []
        for kind, elements in (("error", at.error), ("warning", at.warning), ("info", at.info)):
            for element in elements:
                notes.append(f"{kind}: {str(getattr(element, 'value', ''))[:160]}")
        print(f"[OK] {label} ({dt:.1f}s) {counts} {'; '.join(notes)}")

print("FAILURES:", failures)
sys.exit(1 if failures else 0)
