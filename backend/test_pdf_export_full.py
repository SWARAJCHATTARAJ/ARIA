import asyncio
import os
import sys
import fitz
import re

# Set path to backend
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.pdf_generator import generate_research_pdf, generate_academic_paper_title
from pipeline.nodes import expand_to_full_research_paper
from utils.academic_search import search_all_free_sources, clean_scraped_reference_text

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

    print("\n" + "=" * 60)
    print(f"ALL TESTS PASSED! PDF generated successfully with {page_count} pages, {words} words.")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
