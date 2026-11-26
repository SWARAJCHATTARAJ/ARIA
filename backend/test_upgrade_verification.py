import asyncio
import os
import sys
from unittest.mock import AsyncMock, patch

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from main import app
from pipeline.nodes import audit_answer, generate_followup_questions
from utils.academic_search import (
    clean_scraped_reference_text,
    fetch_readable_text,
    search_wikipedia,
)
from utils.media import format_figure_caption
from utils.ssrf_guard import is_allowed_image_url, is_safe_url


def test_wikipedia_clean_extraction():
    print("[1/4] Testing clean Wikipedia API extraction & boilerplate stripping...")
    noisy = (
        "Jump to content Main menu Toggle the table of contents "
        "331 languages Аԥсшәа Acèh Afrikaans Alemannisch العربية 日本語 "
        "From Wikipedia, the free encyclopedia "
        "Japan (Japanese: 日本, Nippon or Nihon, and formally Nippon-koku) is an island country in East Asia. "
        "[citation needed] [edit] See also: Geography of Japan."
    )
    cleaned = clean_scraped_reference_text(noisy)
    assert "331 languages" not in cleaned, f"Language list leaked: {cleaned}"
    assert "Аԥсшәа" not in cleaned, f"Foreign language link leaked: {cleaned}"
    assert "Jump to content" not in cleaned, f"Navigation leaked: {cleaned}"
    assert "Nippon-koku" in cleaned, f"Factual prose missing: {cleaned}"

    # Verify live/API MediaWiki extraction returns clean prose without nav boilerplate
    wiki_results = asyncio.run(search_wikipedia("Japan", exact_title="Japan", canonical_topic="Japan"))
    assert wiki_results, "Wikipedia search returned no results for Japan"
    entry = wiki_results[0]
    snippet = entry.get("snippet", "")
    assert "331 languages" not in snippet, "331 languages leaked from Wikipedia API"
    assert "Jump to content" not in snippet, "Jump to content leaked from Wikipedia API"
    assert entry.get("authors") == ["Wikipedia Contributors"], f"Unexpected authors: {entry.get('authors')}"
    assert entry.get("venue") == "Wikipedia", f"Unexpected venue: {entry.get('venue')}"
    assert entry.get("year") is not None, "Missing Wikipedia revision year"

    # Verify Wikipedia URL routed through fetch_readable_text uses MediaWiki API cleanly
    fetched = asyncio.run(fetch_readable_text("https://en.wikipedia.org/wiki/Japan", "Japan"))
    assert "331 languages" not in fetched
    assert len(fetched) >= 150
    print("  -> PASS: Wikipedia API extraction & cleaning verified.")


def test_export_pdf_endpoint_200():
    print("[2/4] Testing /api/export/pdf HTTP 200 & %PDF- signature...")
    client = TestClient(app)

    payload = {
        "query": "Japan",
        "answer_final": (
            "## I. Geographic & Historical Foundations\n"
            "Japan is an island country in East Asia located in the northwest Pacific Ocean [[c:0]]. "
            "Its official title is Nippon-koku [[c:0]].\n\n"
            "## II. Constitutional Governance & Economy\n"
            "Japan operates under a constitutional monarchy with a bicameral legislature known as the National Diet [[c:0]].\n\n"
            "## III. Key National Indicators\n"
            "| Indicator | Value | Context |\n"
            "| Capital | Tokyo | Largest metropolitan area |\n"
            "| Official Name | Nippon-koku | Constitutional designation |\n"
            "| Region | East Asia | Northwest Pacific archipelago |\n\n"
            "## IV. Contemporary Significance & Outlook\n"
            "Japan remains a major global economy and active participant in international scientific research [[c:0]].\n\n"
            "## V. Conclusion\n"
            "Primary geographic and constitutional sources establish Japan's foundational institutions [[c:0]]."
        ),
        "canonical_topic": "Japan",
        "confidence": 0.92,
        "tiers": ["LIVE"],
        "claims": [
            {
                "claim_id": 0,
                "text": "Japan is an island country in East Asia located in the northwest Pacific Ocean.",
                "citation_ids": [0],
                "status": "supported",
                "coverage": 0.95,
                "evidence": "Japan is an island country in East Asia.",
            }
        ],
        "sources": [
            {
                "id": 0,
                "title": "Wikipedia: Japan",
                "authors": ["Wikipedia Contributors"],
                "year": 2026,
                "venue": "Wikipedia",
                "url": "https://en.wikipedia.org/wiki/Japan",
                "snippet": "Japan is an island country in East Asia located in the northwest Pacific Ocean.",
                "tier": "LIVE",
                "source_type": "wikipedia",
            }
        ],
        "full_ledger": True,
        "clickable_urls": True,
    }

    with patch("main.verify_supabase_jwt", new=AsyncMock(return_value={"id": "00000000-0000-0000-0000-000000000001"})):
        resp = client.post(
            "/api/export/pdf",
            json=payload,
            headers={"Authorization": "Bearer valid-test-token"},
        )

    assert resp.status_code == 200, f"Expected HTTP 200 from /api/export/pdf, got {resp.status_code}: {resp.text}"
    assert resp.headers.get("content-type", "").startswith("application/pdf")
    assert resp.content[:5] == b"%PDF-", f"Invalid PDF magic bytes: {resp.content[:16]!r}"
    assert len(resp.content) > 2000
    print(f"  -> PASS: /api/export/pdf returned HTTP 200 ({len(resp.content)} bytes, valid %PDF-).")


def test_ssrf_metadata_and_loopback_blocked():
    print("[3/4] Testing SSRF blocker against Azure IMDS & loopback...")
    ok_imds, reason_imds = is_safe_url("http://169.254.169.254/metadata/instance")
    assert ok_imds is False, f"IMDS URL must be blocked! Got: {reason_imds}"

    ok_loopback, reason_loopback = is_safe_url("http://127.0.0.1:8000")
    assert ok_loopback is False, f"Loopback port 8000 URL must be blocked! Got: {reason_loopback}"

    ok_img_imds, _ = is_allowed_image_url("https://169.254.169.254/latest/meta-data")
    assert ok_img_imds is False, "Image guard must reject IMDS IP"

    ok_img_http, _ = is_allowed_image_url("http://upload.wikimedia.org/wikipedia/commons/test.png")
    assert ok_img_http is False, "Image guard must enforce HTTPS-only"

    fetched = asyncio.run(fetch_readable_text("http://169.254.169.254/metadata/instance", "test", fallback_snippet="BLOCKED_SAFE"))
    assert fetched == "BLOCKED_SAFE", "fetch_readable_text must return fallback when SSRF blocked"
    print("  -> PASS: SSRF blocker rejected IMDS, loopback, and non-HTTPS image fetches.")


def test_verification_state_and_adaptive_followups():
    print("[4/4] Testing resolved audit verification state & content-grounded follow-ups...")
    state = {
        "query": "Japan",
        "canonical_topic": "Japan",
        "tiers_fired": ["LIVE"],
        "retrieved_chunks": [
            {
                "title": "Wikipedia: Japan",
                "venue": "Wikipedia",
                "source_type": "wikipedia",
                "tier": "LIVE",
                "snippet": (
                    "Japan is an island country in East Asia. "
                    "Japan is a constitutional monarchy with a bicameral National Diet. "
                    "Tokyo is the capital and largest city of Japan."
                ),
            }
        ],
        "answer_final": (
            "## Geographic Foundations\n"
            "Japan is an island country in East Asia [[c:0]].\n\n"
            "## Constitutional Governance\n"
            "Japan is a constitutional monarchy with a bicameral National Diet [[c:0]].\n"
            "Tokyo is the capital and largest city of Japan [[c:0]]."
        ),
        "compare_mode": False,
        "_skip_regeneration": True,
    }

    with patch("pipeline.nodes.run_claim_audit", new=AsyncMock(return_value=[
        {
            "claim_id": 0,
            "text": "Japan is an island country in East Asia.",
            "citation_ids": [0],
            "status": "supported",
            "supported": True,
            "coverage": 1.0,
            "evidence": "Japan is an island country in East Asia.",
        },
        {
            "claim_id": 1,
            "text": "Japan is a constitutional monarchy with a bicameral National Diet.",
            "citation_ids": [0],
            "status": "supported",
            "supported": True,
            "coverage": 1.0,
            "evidence": "Japan is a constitutional monarchy with a bicameral National Diet.",
        },
        {
            "claim_id": 2,
            "text": "Tokyo is the capital and largest city of Japan.",
            "citation_ids": [0],
            "status": "supported",
            "supported": True,
            "coverage": 1.0,
            "evidence": "Tokyo is the capital and largest city of Japan.",
        },
    ])), patch("pipeline.nodes.check_retractions", new=AsyncMock(return_value=[])):
        res = asyncio.run(audit_answer(state))

    assert res.get("verification_status") in ("verified", "partial", "unverified"), f"Unresolved status: {res.get('verification_status')}"
    assert res["verification_status"] == "verified"
    assert isinstance(res.get("entailment_score"), float) and res["entailment_score"] > 0.0
    assert len(res.get("claims", [])) == 3

    # Ensure follow-up questions are topic-specific and NEVER plug headings into generic templates
    followups = generate_followup_questions("Japan", state["answer_final"], res["claims"], "Japan")
    assert len(followups) == 3
    for q in followups:
        assert "What empirical benchmarks validate" not in q, f"Generic template leaked: {q}"
        assert "Geographic Foundations" not in q and "Constitutional Governance" not in q, f"Heading plugged into question: {q}"

    # Verify figure caption deduplication never repeats title word-for-word
    cap = format_figure_caption("Japan Orthographic Projection", "Japan Orthographic Projection", "Japan is an island country in East Asia.")
    assert cap.lower().strip(". ") != "japan orthographic projection"
    print("  -> PASS: Resolved verification state, grounded follow-ups, and figure caption deduplication verified.")


if __name__ == "__main__":
    test_wikipedia_clean_extraction()
    test_export_pdf_endpoint_200()
    test_ssrf_metadata_and_loopback_blocked()
    test_verification_state_and_adaptive_followups()
    print("\nALL UPGRADE VERIFICATION TESTS PASSED!")
