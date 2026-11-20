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

from utils.pdf_generator import generate_research_pdf, generate_academic_paper_title, is_page_empty_or_header_only
from pipeline.nodes import expand_to_full_research_paper
from utils.academic_search import search_all_free_sources, search_wikipedia, clean_scraped_reference_text

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

    print("\n" + "=" * 60)
    print(f"ALL TESTS PASSED! PDF generated successfully with {page_count} pages, {words} words.")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
