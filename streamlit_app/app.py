"""Foundational Skills Stress — Streamlit edition.

Run from the repository root::

    streamlit run streamlit_app/app.py

This entry point registers the multipage navigation and the shared sidebar
(brand + attribution). Page files are plain scripts under ``app_pages/``;
shared data and index math live in ``lib/`` and are kept equivalent to the
Next.js edition in ``src/``.
"""

from pathlib import Path

import streamlit as st

ASSETS = Path(__file__).parent / "assets"

st.set_page_config(
    page_title="Foundational Skills Stress",
    page_icon=":material/school:",
    layout="wide",
)

with st.sidebar:
    st.markdown("#### Foundational Skills Stress")
    st.caption("Executive Intelligence Dashboard")

page = st.navigation(
    [
        st.Page(
            "app_pages/executive_brief.py",
            title="Executive Brief",
            icon=":material/monitoring:",
            default=True,
        ),
        st.Page("app_pages/global_lens.py", title="Global Lens", icon=":material/public:"),
        st.Page("app_pages/united_states.py", title="United States", icon=":material/flag:"),
        st.Page(
            "app_pages/state_drilldown.py",
            title="State drill-down",
            icon=":material/location_on:",
        ),
        st.Page("app_pages/methodology.py", title="Methodology", icon=":material/science:"),
        st.Page("app_pages/about.py", title="About", icon=":material/info:"),
    ]
)

with st.sidebar:
    st.divider()
    st.image(str(ASSETS / "emmanuel-onuoha.jpg"), width=64)
    st.markdown("Developed and Designed by  \n**Emmanuel Onuoha**")
    st.caption(
        "Sources: World Bank Open Data · U.S. Dept. of Education EDFacts "
        "· U.S. Census Bureau ACS"
    )

page.run()
