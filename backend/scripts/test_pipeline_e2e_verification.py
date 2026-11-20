import asyncio
import os
import sys

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from utils.academic_search import (
    extract_core_subject_entities,
    evaluate_topical_relevance,
    search_all_free_sources,
)
from utils.media import fetch_verified_figures, extract_or_generate_topic_chart, render_chart_matplotlib

async def run_tests():
    print("=== TEST 1: Core Subject Extraction & Topical Filtering for 'Milky Way' ===")
    query = "What is the Milky Way galaxy and its structure?"
    core_subject, core_entities = extract_core_subject_entities(query)
    print(f"Extracted Core Subject: '{core_subject}', Entities: {core_entities}")
    assert "milky way" in core_subject.lower(), f"Expected 'milky way' in core subject, got '{core_subject}'"

    # Test topical relevance scoring
    mw_title = "The structure and evolution of the Milky Way Galaxy"
    mw_abstract = "The Milky Way is a barred spiral galaxy containing 100-400 billion stars..."
    score_mw, is_rel_mw = evaluate_topical_relevance(mw_title, mw_abstract, core_subject, core_entities)
    print(f"Topical score for direct Milky Way paper: {score_mw:.2f}, relevant: {is_rel_mw}")
    assert is_rel_mw and score_mw >= 8.0, f"Expected high score for Milky Way paper, got {score_mw}"

    dwarf_title = "Star formation history of dwarf irregular galaxies in the Local Group"
    dwarf_abstract = "We investigate photometric properties of irregular dwarf galaxies..."
    score_dwarf, is_rel_dwarf = evaluate_topical_relevance(dwarf_title, dwarf_abstract, core_subject, core_entities)
    print(f"Topical score for unrelated dwarf galaxy paper: {score_dwarf:.2f}, relevant: {is_rel_dwarf}")
    assert not is_rel_dwarf or score_dwarf < 4.0, f"Expected dwarf galaxy paper to be rejected (<4.0), got {score_dwarf}"

    print("\n=== TEST 2: Concurrent Multi-Source Free Retrieval for 'Milky Way' ===")
    sources = await search_all_free_sources("Milky Way")
    print(f"Retrieved {len(sources)} sources:")
    for i, s in enumerate(sources, 1):
        print(f"  {i}. [{s.get('source_tier', 'LIVE')}] {s.get('title')} ({s.get('year')})")
        # Ensure no off-topic dwarf irregular galaxies papers leaked through
        assert "dwarf irregular" not in s.get("title", "").lower(), f"Off-topic paper leaked: {s.get('title')}"
        # Ensure Milky Way relevance
        tit_abs = (s.get("title", "") + " " + s.get("snippet", "")).lower()
        assert "milky way" in tit_abs or "galaxy" in tit_abs or "galactic" in tit_abs, f"Source lacks galactic context: {s.get('title')}"

    print("\n=== TEST 3: Grounded Verified Figures for 'Milky Way' ===")
    figures = await fetch_verified_figures("Milky Way", max_figures=2)
    print(f"Retrieved {len(figures)} figures:")
    for f in figures:
        print(f"  Title: {f.get('title')}")
        print(f"  URL: {f.get('url')}")
        print(f"  Caption: {f.get('caption')}")
        print(f"  Attribution: {f.get('attribution')}")
        # Verify strict format requirements
        url = f.get("url", "").lower()
        assert not url.endswith(".svg") and not url.endswith(".ico") and not url.endswith(".gif"), "Rejected format leaked!"
        assert any(url.split("?")[0].endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")), "Invalid image extension!"
    assert len(figures) >= 1, "Expected at least 1 verified figure for Milky Way"

    print("\n=== TEST 4: Chart Rejection for Mixed-Unit Data (e.g. Milky Way Mass/Diameter/Age) ===")
    text_mixed = """
### Section III: Observational Parameters
| Parameter | Value |
|---|---|
| Total Mass | 1.5e12 M_sun |
| Optical Diameter | 100,000 ly |
| Rotational Velocity | 220 km/s |
| Age | 13.6 Gyr |
"""
    chart_mixed = extract_or_generate_topic_chart("Milky Way", text_mixed, sources)
    print(f"Chart result for mixed-unit table: {chart_mixed}")
    assert chart_mixed is None, f"Expected chart to be None for mixed units, got {chart_mixed}"

    print("\n=== TEST 5: Chart Verification with Uniform-Unit Metrics Across >= 3 Items ===")
    text_uniform = """
### Section III: Comparative Kinematics
| Galaxy / Structure | Rotational Velocity (km/s) | Source Citation |
|---|---|---|
| Milky Way Disk | 220 km/s | [1] |
| Andromeda (M31) | 250 km/s | [2] |
| Triangulum (M33) | 105 km/s | [3] |
"""
    sources_with_data = [
        {"title": "Local Group Kinematics", "text": "The Milky Way disk rotates at approximately 220 km/s, while Andromeda M31 reaches 250 km/s and Triangulum M33 rotates at 105 km/s."}
    ]
    chart_uniform = extract_or_generate_topic_chart("Local Group Galaxies", text_uniform, sources_with_data)
    print(f"Chart result for uniform-unit table: {chart_uniform is not None}")
    assert chart_uniform is not None, "Expected valid chart for uniform-unit table"
    assert chart_uniform["y_label"] == "Rotational Velocity (km/s)", f"Unexpected y_label: {chart_uniform['y_label']}"
    assert len(chart_uniform["categories"]) == 3, f"Expected 3 categories, got {len(chart_uniform['categories'])}"
    assert chart_uniform["series"][0]["data"] == [220.0, 250.0, 105.0]

    # Test Matplotlib rendering
    c_bytes = render_chart_matplotlib(chart_uniform)
    assert c_bytes is not None and len(c_bytes) > 1000, f"Expected valid PNG bytes from render_chart_matplotlib, got {len(c_bytes) if c_bytes else None}"
    print(f"Rendered Matplotlib chart bytes size: {len(c_bytes)} bytes")

    print("\n=== TEST 6: Chart Rejection when a Metric Number is Hallucinated (Not in Sources) ===")
    sources_missing_num = [
        {"title": "Local Group Kinematics", "text": "The Milky Way disk rotates at approximately 220 km/s, while Andromeda M31 reaches 250 km/s."}
        # 105 km/s is omitted from sources!
    ]
    chart_hallucinated = extract_or_generate_topic_chart("Local Group Galaxies", text_uniform, sources_missing_num)
    print(f"Chart result when number is missing from sources: {chart_hallucinated}")
    assert chart_hallucinated is None, f"Expected chart to be rejected when number is not verbatim in sources, got {chart_hallucinated}"

    print("\nALL AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run_tests())
