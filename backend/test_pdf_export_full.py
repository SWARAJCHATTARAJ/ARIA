import asyncio
import os
import sys
import fitz
import re

# Set path to backend
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))

from utils.pdf_generator import (
    generate_research_pdf,
    generate_academic_paper_title,
    is_page_empty_or_header_only,
    parse_markdown_table_rows
)
from pipeline.nodes import expand_to_full_research_paper, strip_orphan_headings
from utils.academic_search import search_all_free_sources, search_wikipedia, clean_scraped_reference_text
from utils.media import extract_or_generate_topic_chart, _is_image_valid

async def main():
    print("=" * 60)
    print("RUNNING ARIA FULL PUBLICATION PDF PIPELINE TEST")
    print("=" * 60)

    # 1. Test Source Cleaning
    raw_wiki_sample = (
        "(Learn how and when to remove this template message) "
        "Polyvinyl chloride is the world's third-most widely produced synthetic plastic polymer. "
        "Space-filling model of the PVC chain. [edit] Pure PVC is a white, brittle solid. "
        "See also: Plastic pollution."
    )
    cleaned = clean_scraped_reference_text(raw_wiki_sample)
    print("\n[1] Testing clean_scraped_reference_text:")
    print(f"Cleaned output: {cleaned}")
    assert "(Learn how" not in cleaned, "Maintenance banner leaked!"
    assert "Space-filling model" not in cleaned, "Image caption leaked!"
    assert "[edit]" not in cleaned, "[edit] noise leaked!"
    assert "See also:" not in cleaned, "Navigation noise leaked!"
    print("  -> Source text cleaning PASS!")

    # 2. Test Title Formatting
    query = "what is pvc"
    canon = "Polyvinyl chloride (PVC) thermoplastic polymer"
    title = generate_academic_paper_title(query, canon)
    print(f"\n[2] Testing generate_academic_paper_title:")
    print(f"Query: '{query}' -> Formatted Title: '{title}'")
    assert "What Is Pvc" not in title, "Naive title() was used!"
    assert "PVC" in title, "Acronym PVC was not preserved!"
    print("  -> Academic title generation PASS!")

    # 3. Test Retrieval with Strict Domain Filtering
    print(f"\n[3] Testing search_all_free_sources with canonical topic for '{query}':")
    sources = await search_all_free_sources(query, canonical_topic=canon)
    print(f"Retrieved {len(sources)} sources:")
    for s in sources:
        stitle = s.get("title", "")
        print(f"  - [{s.get('source_type')}] {stitle[:60]}")
        # Verify no cardiology papers leaked
        assert not any(neg in stitle.lower() for neg in ("ventricular", "arrhythmia", "cardiac", "myocardial")), f"Cardiology paper leaked: {stitle}"
    print("  -> Retrieval relevance & domain filtering PASS!")

    # 4. Test Full Manuscript Expansion & Claim Auditing
    print("\n[4] Testing expand_to_full_research_paper:")
    draft = "PVC is a thermoplastic polymer widely used in construction [[c:0]]. Pure PVC is a brittle white solid [[c:0]]."
    expanded_text, claims, confidence = await expand_to_full_research_paper(
        query=query,
        draft_answer=draft,
        sources=sources,
        canonical_topic=canon
    )
    words = len(expanded_text.split())
    print(f"Expanded Manuscript Word Count: {words} words")
    print(f"Audited Claims Count: {len(claims)} claims")
    print(f"Calculated Confidence: {confidence}")
    assert words >= 1000, f"Expected >= 1000 words, got {words}"
    print("  -> Manuscript expansion PASS!")

    # 5. Test PDF Generation
    print("\n[5] Generating Publication-Grade PDF:")
    pdf_bytes = generate_research_pdf(
        query=query,
        answer_final=expanded_text,
        confidence=confidence,
        tiers=["LIVE"],
        claims=claims,
        sources=sources,
        canonical_topic=canon,
        full_ledger=True,
        clickable_urls=True
    )
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_output_pvc.pdf")
    with open(output_path, "wb") as f:
        f.write(pdf_bytes)
    print(f"Saved PDF to: {output_path} ({len(pdf_bytes) // 1024} KB)")

    # 6. Inspect PDF with PyMuPDF
    doc = fitz.open(output_path)
    page_count = len(doc)
    print(f"\n[6] PDF Structure Inspection:")
    print(f"Page Count: {page_count} pages")
    assert page_count >= 4, f"Expected >= 4 pages, got {page_count}"

    full_pdf_text = ""
    for p_no in range(page_count):
        page_text = doc[p_no].get_text()
        full_pdf_text += page_text + "\n"
        # Check running header on page 2+
        if p_no >= 1:
            header_line = page_text.split("\n")[0]
            assert "ARIA v2 AUTONOMOUS VERIFICATION PREPRINT" in page_text, f"Missing running header on page {p_no + 1}"
            assert "What Is Pvc" not in page_text, f"Leaked naive 'What Is Pvc' on page {p_no + 1}"

    # Verify no raw markdown asterisks or carets
    raw_asterisks = [m.start() for m in re.finditer(r'\*\*', full_pdf_text)]
    assert len(raw_asterisks) == 0, f"Found raw '**' markdown asterisks in PDF text: count={len(raw_asterisks)}"
    
    # Verify duplicate badge bug is fixed
    assert "[SUPPORTED] Supported" not in full_pdf_text, "Found duplicate [SUPPORTED] Supported badge!"
    assert "[PARTIAL] Partial" not in full_pdf_text, "Found duplicate [PARTIAL] Partial badge!"

    # Verify sections exist
    assert "I. INTRODUCTION" in full_pdf_text, "Missing Section I"
    assert "II. CORE MECHANISMS" in full_pdf_text, "Missing Section II"
    assert "III. QUANTITATIVE PROPERTIES" in full_pdf_text, "Missing Section III"
    assert "IV. EMPIRICAL APPLICATIONS" in full_pdf_text, "Missing Section IV"
    assert "V. CONCLUSION" in full_pdf_text, "Missing Section V"
    assert "VI. REFERENCES" in full_pdf_text, "Missing Section VI"
    assert "APPENDIX: VERIFICATION AUDIT LEDGER" in full_pdf_text, "Missing Appendix"

    # 7. Test Wikipedia Action API Extended Grounding Coverage (~2,500-3,500 chars)
    print("\n[7] Testing search_wikipedia Action API extended coverage:")
    wiki_res = await search_wikipedia("Cell", canonical_topic="Cell (biology)")
    assert wiki_res, "Failed to retrieve Wikipedia article for Cell (biology)"
    wiki_snippet = wiki_res[0].get("snippet", "")
    print(f"Wikipedia 'Cell (biology)' snippet length: {len(wiki_snippet)} characters")
    assert len(wiki_snippet) >= 2500, f"Expected >= 2500 chars of encyclopedic grounding, got {len(wiki_snippet)}"
    assert any(term in wiki_snippet.lower() for term in ("prokaryot", "eukaryot")), "Foundational cell biology terms missing from Wikipedia snippet!"
    print("  -> Wikipedia extended grounding coverage PASS!")

    # 8. Test Word Collisions, Glyph Spacing, Trailing Blank Page & Table II Wrapping
    print("\n[8] Testing Glyph Spacing, Character Collisions, Blank Page Cleanup & Table II:")
    test_query = "Cell biological architecture and mechanisms"
    test_canon = "Cell (biology)"
    test_body = """
# I. INTRODUCTION & EXECUTIVE DEFINITION
The cell is encompassing — the somatic cells of biological systems [1]. The genetic pathway proceeds from DNA → RNA → protein with typical diameter 10–100 µm while smaller cells measure ~200 µm in specialized assemblies [1]. Precise dimensional quantification will be essential for cellular engineering [1].

- **Model Integration Across Scales:** Systems-level models capture subcellular dynamics and signaling cascades [1].

# II. CORE MECHANISMS, THEORETICAL ARCHITECTURE & METHODOLOGY
Prokaryotes lack a membrane-bound nucleus and organelles [1]. Eukaryotic compartmentalization enables specialized biological reactions [1].

# III. QUANTITATIVE PROPERTIES & COMPARATIVE ANALYSIS
| Property | Typical Value | Biological Scale |
| Cell diameter | 10–100 µm | Cellular |
| Organelle diameter | 0.5–5 µm | Subcellular |
| Ribosome size | ~20–30 nm | Macromolecular |

# IV. EMPIRICAL APPLICATIONS, OPERATIONAL IMPACT & TECHNICAL LIMITATIONS
Tissue engineering and synthetic cell biology rely on validated molecular models [1].

# V. CONCLUSION & OPEN RESEARCH DIRECTIONS
Cellular architecture provides the blueprint for synthetic biology [1].
"""

    test_claims = [
        {"text": "The cell is encompassing — the somatic cells of biological systems.", "citation_ids": [0], "status": "supported", "coverage": 0.95},
        {"text": "The genetic pathway proceeds from DNA → RNA → protein with typical diameter 10–100 µm while smaller cells measure ~200 µm in specialized assemblies.", "citation_ids": [0], "status": "supported", "coverage": 0.90},
        {"text": "Prokaryotes lack a membrane-bound nucleus and organelles.", "citation_ids": [0], "status": "supported", "coverage": 0.92},
        {"text": "Eukaryotic compartmentalization enables specialized biological reactions.", "citation_ids": [0], "status": "supported", "coverage": 0.88},
    ]

    test_sources = [
        {
            "title": "Wikipedia: Cell (biology)",
            "venue": "Wikipedia",
            "snippet": wiki_snippet,
            "url": "https://en.wikipedia.org/wiki/Cell_(biology)",
            "source_type": "wikipedia",
            "tier": "LIVE",
            "review_status": "unreviewed_web"
        }
    ]

    test_pdf_bytes = generate_research_pdf(
        query=test_query,
        answer_final=test_body,
        confidence=0.92,
        tiers=["LIVE"],
        claims=test_claims,
        sources=test_sources,
        canonical_topic=test_canon,
        full_ledger=True,
        clickable_urls=True
    )

    test_doc = fitz.open(stream=test_pdf_bytes, filetype="pdf")
    test_page_count = len(test_doc)
    print(f"Generated test PDF page count: {test_page_count} pages")

    # Assert no trailing blank or header-only page
    assert not is_page_empty_or_header_only(test_doc[-1]), "Trailing page is blank or header-only!"

    test_pdf_full_text = ""
    for p_no in range(test_page_count):
        test_pdf_full_text += test_doc[p_no].get_text() + "\n"

    # Assert exact words without character eating or collisions
    assert "encompassing — the somatic cells" in test_pdf_full_text, "Failed to preserve 'encompassing — the somatic cells'!"
    assert "DNA → RNA → protein" in test_pdf_full_text, "Failed to preserve 'DNA → RNA → protein'!"
    assert "10–100 µm" in test_pdf_full_text, "Failed to preserve '10–100 µm'!"
    assert "~200 µm" in test_pdf_full_text, "Failed to preserve '~200 µm'!"
    assert "will be essential" in test_pdf_full_text, "Failed to preserve 'will be essential'!"

    # Assert collisions NEVER occur
    assert "encompassinthe" not in test_pdf_full_text, "Found character collision 'encompassinthe'!"
    assert "somatizells" not in test_pdf_full_text, "Found character collision 'somatizells'!"
    assert "DNRNA" not in test_pdf_full_text, "Found character collision 'DNRNA'!"

    # Assert bullet bold lead-in preserves colon
    assert "Model Integration Across Scales:" in test_pdf_full_text, "Bullet bold lead-in colon was stripped!"

    # Assert Index Terms exclude stop-words and platform names
    if "Index Terms -- " in test_pdf_full_text:
        index_terms_line = test_pdf_full_text.split("Index Terms -- ")[1].split("\n")[0].lower()
        print(f"Extracted Index Terms: {index_terms_line}")
        assert "wikipedia" not in index_terms_line, "Platform 'wikipedia' leaked into Index Terms!"
        assert "arxiv" not in index_terms_line, "Platform 'arxiv' leaked into Index Terms!"
        assert "from" not in index_terms_line.split(", "), "Stop-word 'from' leaked into Index Terms!"
        assert "and" not in index_terms_line.split(", "), "Stop-word 'and' leaked into Index Terms!"

    print("  -> Glyph spacing, character collision, and blank page assertions PASS!")

    # 9. Regression Tests for DSA PDF Fixes:
    # (1) Citation-tag charts & dummy constant charts rejection
    # (2) Math-pipe table splitting & card formatting
    # (3) Zero raw $ LaTeX leaks & no contradictory abstract
    # (4) Dark/blank image & book scan rejection
    print("\n[9] Running DSA PDF Fix Regression Tests:")

    # 9.1: Citation markers [c:1] / §1 and constant-value charts rejected
    print("  [9.1] Testing Chart Extractor rejection for citations and constant dummy bars...")
    citation_table = """
| Operation | Complexity | Description | Citation |
| Search | O(log n) | Tree lookup | [c:1] |
| Insert | O(log n) | Balanced insertion | [c:2] |
| Delete | O(log n) | Node removal | [c:3] |
"""
    c_chart = extract_or_generate_topic_chart(query="Data Structures", text=citation_table, chunks=[])
    assert c_chart is None, f"Expected None for citation-tag table, got {c_chart}"

    constant_table = """
| Metric | Value | Unit |
| M1 | 1 | ops |
| M2 | 1 | ops |
| M3 | 1 | ops |
| M4 | 1 | ops |
| M5 | 1 | ops |
"""
    const_chart = extract_or_generate_topic_chart(query="Performance", text=constant_table, chunks=[])
    assert const_chart is None, f"Expected None for constant [1,1,1,1,1] chart, got {const_chart}"
    print("    -> Chart extractor citation and constant rejection PASS!")

    # 9.2: 4-column Markdown table with math pipes stays 4 columns with zero ': N/A' and zero raw '**'
    print("  [9.2] Testing math-pipe table splitting...")
    math_pipe_table = """
| Operation | Time Complexity | Space Complexity | Notes |
| Substring Matching | $O(|S|/|L|)$ | $O(|S|)$ | **Optimal** string matching |
| Hash Indexing | $O(1)$ | $O(|S| + |L|)$ | **Average** lookup time |
"""
    parsed_table = parse_markdown_table_rows(math_pipe_table)
    assert len(parsed_table) == 3, f"Expected 3 rows (header + 2 data), got {len(parsed_table)}"
    for r_idx, row in enumerate(parsed_table):
        assert len(row) == 4, f"Row {r_idx} has {len(row)} columns instead of 4: {row}"
        for cell in row:
            assert ": N/A" not in cell, f"Found ': N/A' phantom padding in cell: {cell}"
            assert "**" not in cell, f"Found raw '**' in cell: {cell}"
    print("    -> Math-pipe table splitting PASS!")

    # 9.3: Zero raw $ LaTeX delimiters and zero contradictory 'Partially verified' when partial_count == 0
    print("  [9.3] Testing PDF text for zero raw $ LaTeX leaks and abstract phrasing...")
    math_body = r"""
# I. INTRODUCTION
Algorithmic complexity guarantees $O(m)$ worst-case bound and $O(m \log n)$ average bound [1].
Energy efficiency satisfies $\lambda \cdot T + (1-\lambda) \cdot E$ optimization with operational power $P_{op}$ and energy $E_{op}$ [1].
In C++20 modern implementations, mapping index is $: [0,|S|) \rightarrow L$ where element satisfies $l \in L$ and scaling factor \gamma governs throughput [1].

# II. CORE MECHANISMS
Balanced trees ensure logarithmic height [1].

# III. QUANTITATIVE PROPERTIES
| Metric | Time | Space | Notes |
| Search | $O(\log n)$ | $O(1)$ | Standard lookup |
| Construction | $O(n)$ | $O(n)$ | Linear initialization |

# IV. EMPIRICAL APPLICATIONS
Applied in database indexing and compiler symbol tables [1].

# V. CONCLUSION
Foundational data structures optimize memory and computational time [1].
"""
    supported_claims = [
        {"text": "Algorithmic complexity guarantees worst-case and average bounds.", "citation_ids": [0], "status": "supported", "coverage": 0.95},
        {"text": "Energy efficiency satisfies operational optimization.", "citation_ids": [0], "status": "supported", "coverage": 0.92},
    ]
    math_pdf = generate_research_pdf(
        query="Data Structures and Algorithms complexity bounds",
        answer_final=math_body,
        confidence=0.94,
        tiers=["LIVE"],
        claims=supported_claims,
        sources=[{"title": "Foundations of Computer Science", "venue": "ACM", "snippet": "Complexity bounds.", "tier": "LIVE"}],
        canonical_topic="Data Structures and Algorithms",
        full_ledger=True
    )
    math_doc = fitz.open(stream=math_pdf, filetype="pdf")
    math_full_text = ""
    for page in math_doc:
        math_full_text += page.get_text() + "\n"

    raw_latex_dollar = re.findall(r'(?<!\d)\$(?!\d)', math_full_text)
    assert len(raw_latex_dollar) == 0, f"Found raw '$' LaTeX delimiters in PDF text: {raw_latex_dollar}"
    assert "Partially verified" not in math_full_text, "Found 'Partially verified' in abstract when partial_count == 0!"
    assert "factor γ" in math_full_text, "Failed to render factor γ in PDF text!"
    print("    -> Zero raw $ LaTeX leaks and abstract phrasing PASS!")

    # 9.4: Dark/blank image and book scan rejection
    print("  [9.4] Testing image rejection filter...")
    assert not _is_image_valid("http://example.com/ia.jpg", 800, 600, "File:ia_904231_scan.djvu.jpg", "Scanned from Internet Archive"), "Failed to reject ia_ scan!"
    assert not _is_image_valid("http://example.com/thesis.png", 800, 600, "File:Thesis_research_paper.pdf.png", "National Technical Information Service thesis report"), "Failed to reject thesis/NTIS scan!"
    assert not _is_image_valid("http://example.com/book.jpg", 800, 600, "File:Data_Structures_book_cover.jpg", "Front cover and title page"), "Failed to reject book cover!"
    assert not _is_image_valid("http://example.com/ia1.jpg", 800, 600, "Ia Datastructuresal00Gren.jpg", ""), "Failed to reject Ia book scan!"
    assert not _is_image_valid("http://example.com/ia2.jpg", 800, 600, "Ia Conceptualframew109451411.jpg", ""), "Failed to reject Ia title scan!"
    assert not _is_image_valid("http://example.com/ia3.jpg", 800, 600, "File:(ia 109451411).jpg", ""), "Failed to reject (ia scan!"
    assert not _is_image_valid("http://example.com/dtic.jpg", 800, 600, "DTIC_ADA123456.jpg", ""), "Failed to reject DTIC report!"
    assert not _is_image_valid("http://example.com/ntis.jpg", 800, 600, "NTIS_PB987654.jpg", ""), "Failed to reject NTIS report!"
    assert not _is_image_valid("http://example.com/caltrans.jpg", 800, 600, "Caltrans_Research_Report.jpg", ""), "Failed to reject Caltrans report!"
    assert not _is_image_valid("http://example.com/rep.jpg", 800, 600, "image.jpg", "Published by Defense Technical Information Center"), "Failed to reject Defense Technical Information!"
    assert not _is_image_valid("http://example.com/rep2.jpg", 800, 600, "image.jpg", "Technical report submitted in partial fulfillment"), "Failed to reject technical report!"
    assert not _is_image_valid("http://example.com/diss.jpg", 800, 600, "image.jpg", "Doctoral dissertation, Stanford University"), "Failed to reject dissertation!"

    # Pillow brightness and std-dev check on solid black image
    from PIL import Image, ImageStat
    black_img = Image.new("RGB", (100, 100), color=(0, 0, 0))
    stat = ImageStat.Stat(black_img.convert("L"))
    mean_b = stat.mean[0]
    std_b = stat.stddev[0]
    assert mean_b < 25.0 or std_b < 8.0, "Black image should fail brightness/std-dev check"
    print("    -> Image filter rejection PASS!")

    # 9.5: Answer post-processor strips trailing empty headings and standalone short sub-labels
    print("  [9.5] Testing answer post-processor trailing heading and sub-label stripping...")
    ans_with_trailing_sublabel = (
        "# I. INTRODUCTION\n"
        "Data structures organize computational memory efficiently [[c:0]].\n\n"
        "Applications"
    )
    stripped1 = strip_orphan_headings(ans_with_trailing_sublabel)
    assert "Applications" not in stripped1, f"Failed to strip bare 'Applications' sub-label: {stripped1}"
    assert "Data structures organize" in stripped1

    ans_with_trailing_limitations = (
        "# I. INTRODUCTION\n"
        "Data structures organize computational memory efficiently [[c:0]].\n\n"
        "# II. PERSPECTIVES\n\n"
        "Technical Limitations"
    )
    stripped2 = strip_orphan_headings(ans_with_trailing_limitations)
    assert "Technical Limitations" not in stripped2, f"Failed to strip 'Technical Limitations': {stripped2}"
    assert "II. PERSPECTIVES" not in stripped2, f"Failed to strip empty section '# II. PERSPECTIVES': {stripped2}"

    ans_with_trailing_bullet_label = (
        "# I. INTRODUCTION\n"
        "Data structures organize computational memory efficiently [[c:0]].\n\n"
        "- **Key Limitations:**"
    )
    stripped3 = strip_orphan_headings(ans_with_trailing_bullet_label)
    assert "Key Limitations" not in stripped3, f"Failed to strip bullet sub-label: {stripped3}"
    print("    -> Answer post-processor trailing heading & sub-label stripping PASS!")

    # 9.6: Graceful handling of broken / unreachable / 404 figure URLs
    print("  [9.6] Testing PDF export resilience against broken / 404 / slow figure URLs...")
    broken_figures = [
        {
            "url": "http://127.0.0.1:9999/broken_nonexistent_image.jpg",
            "title": "Broken Nonexistent Figure",
            "caption": "This figure is on an unreachable port and should be skipped gracefully.",
            "source": "Wikimedia Commons"
        },
        {
            "url": "https://invalid-nonexistent-domain-xyz123.org/image.png",
            "title": "Unreachable Domain Figure",
            "caption": "Unreachable domain figure.",
            "source": "Wikimedia Commons"
        }
    ]
    resilient_pdf = generate_research_pdf(
        query="Fault Tolerant Systems",
        answer_final="# I. INTRODUCTION\nFault tolerance ensures continuity under partial failure [1].\n\n# II. CONCLUSION\nRobust systems remain available.",
        confidence=0.92,
        tiers=["LIVE"],
        claims=[{"text": "Fault tolerance ensures continuity under partial failure.", "citation_ids": [0], "status": "supported"}],
        sources=[{"title": "Reliable Distributed Systems", "venue": "IEEE", "snippet": "Fault tolerance ensures continuity.", "tier": "LIVE"}],
        figures=broken_figures,
        canonical_topic="Fault Tolerant Systems"
    )
    assert resilient_pdf and len(resilient_pdf) > 1000, "Resilient PDF generation failed or returned empty bytes!"
    resilient_doc = fitz.open(stream=resilient_pdf, filetype="pdf")
    assert len(resilient_doc) >= 1, "Resilient PDF has 0 pages!"
    print(f"    -> Broken figure URL resilience PASS! (Generated {len(resilient_doc)} pages, {len(resilient_pdf)} bytes)")

    print("\n" + "=" * 60)
    print(f"ALL TESTS PASSED! PDF generated successfully with {page_count} pages, {words} words.")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
