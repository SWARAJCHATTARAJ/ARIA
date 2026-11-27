import asyncio
import datetime
import fitz
import json
import os
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from main import app
from pipeline.nodes import (
    audit_answer,
    generate_followup_cards,
    generate_followup_questions,
    run_claim_audit,
)
from utils.academic_search import (
    SCHOLARLY_SOURCE_TYPES,
    clean_scraped_reference_text,
    fetch_readable_text,
    search_all_free_sources,
    search_wikipedia,
)
from utils.media import format_figure_caption
from utils.ssrf_guard import is_allowed_image_url, is_safe_url


def test_wikipedia_clean_extraction():
    print("[1/6] Testing clean Wikipedia API extraction & boilerplate stripping...")
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

    wiki_results = asyncio.run(search_wikipedia("Japan", exact_title="Japan", canonical_topic="Japan"))
    assert wiki_results, "Wikipedia search returned no results for Japan"
    entry = wiki_results[0]
    snippet = entry.get("snippet", "")
    assert "331 languages" not in snippet, "331 languages leaked from Wikipedia API"
    assert "Jump to content" not in snippet, "Jump to content leaked from Wikipedia API"
    assert entry.get("authors") == ["Wikipedia Contributors"], f"Unexpected authors: {entry.get('authors')}"
    assert entry.get("venue") == "Wikipedia", f"Unexpected venue: {entry.get('venue')}"
    assert entry.get("year") is not None, "Missing Wikipedia revision year"

    fetched = asyncio.run(fetch_readable_text("https://en.wikipedia.org/wiki/Japan", "Japan"))
    assert "331 languages" not in fetched
    assert len(fetched) >= 150
    print("  -> PASS: Wikipedia API extraction & cleaning verified.")


def test_export_pdf_endpoint_styles():
    print("[2/6] Testing /api/export/pdf Academic Paper & Executive Brief modes...")
    client = TestClient(app)

    base_payload = {
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
        "pdf_style": "academic",
    }

    with patch("utils.api_security.verify_supabase_jwt", new=AsyncMock(return_value={"id": "00000000-0000-0000-0000-000000000001"})):
        resp_acad = client.post(
            "/api/export/pdf",
            json=base_payload,
            headers={"Authorization": "Bearer valid-test-token"},
        )
        assert resp_acad.status_code == 200, f"Academic PDF failed: {resp_acad.status_code} {resp_acad.text}"
        assert resp_acad.content[:5] == b"%PDF-"
        doc_acad = fitz.open(stream=resp_acad.content, filetype="pdf")
        acad_text = "\n".join(p.get_text() for p in doc_acad)
        assert "ARIA v2 AUTONOMOUS VERIFICATION PREPRINT" in acad_text
        assert "APPENDIX: VERIFICATION AUDIT LEDGER" in acad_text

        exec_payload = {**base_payload, "pdf_style": "executive", "full_ledger": False}
        resp_exec = client.post(
            "/api/export/pdf",
            json=exec_payload,
            headers={"Authorization": "Bearer valid-test-token"},
        )
        assert resp_exec.status_code == 200, f"Executive PDF failed: {resp_exec.status_code} {resp_exec.text}"
        assert resp_exec.content[:5] == b"%PDF-"
        doc_exec = fitz.open(stream=resp_exec.content, filetype="pdf")
        exec_text = "\n".join(p.get_text() for p in doc_exec)
        assert "ARIA v2 EXECUTIVE RESEARCH BRIEF" in exec_text
        assert "APPENDIX: VERIFICATION AUDIT LEDGER" not in exec_text

    print("  -> PASS: /api/export/pdf Academic & Executive styles and ledger toggle verified.")


def test_ssrf_metadata_and_loopback_blocked():
    print("[3/6] Testing SSRF blocker against Azure IMDS & loopback...")
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
    print("[4/6] Testing resolved audit verification state, 3-angle follow-ups & caption deduplication...")
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
            "verdict": "supported",
            "supported": True,
            "coverage": 1.0,
            "evidence": "Japan is an island country in East Asia.",
            "evidence_quote": "Japan is an island country in East Asia.",
        },
        {
            "claim_id": 1,
            "text": "Japan is a constitutional monarchy with a bicameral National Diet.",
            "citation_ids": [0],
            "status": "supported",
            "verdict": "supported",
            "supported": True,
            "coverage": 1.0,
            "evidence": "Japan is a constitutional monarchy with a bicameral National Diet.",
            "evidence_quote": "Japan is a constitutional monarchy with a bicameral National Diet.",
        },
        {
            "claim_id": 2,
            "text": "Tokyo is the capital and largest city of Japan.",
            "citation_ids": [0],
            "status": "supported",
            "verdict": "supported",
            "supported": True,
            "coverage": 1.0,
            "evidence": "Tokyo is the capital and largest city of Japan.",
            "evidence_quote": "Tokyo is the capital and largest city of Japan.",
        },
    ])), patch("pipeline.nodes.check_retractions", new=AsyncMock(return_value=[])):
        res = asyncio.run(audit_answer(state))

    assert res.get("verification_status") == "verified"
    assert isinstance(res.get("entailment_score"), float) and res["entailment_score"] > 0.0
    assert len(res.get("claims", [])) == 3

    cards = generate_followup_cards("Japan", state["answer_final"], res["claims"], "Japan")
    assert len(cards) == 3
    assert [c["intent"] for c in cards] == ["deep_dive", "counter_view", "applied"]
    assert [c["label"] for c in cards] == ["Deep Dive", "Counter-View", "Applied"]
    followups = generate_followup_questions("Japan", state["answer_final"], res["claims"], "Japan")
    assert len(followups) == 3
    for q in followups:
        assert "What empirical benchmarks validate" not in q
        assert "Geographic Foundations" not in q and "Constitutional Governance" not in q

    cap = format_figure_caption("Japan Orthographic Projection", "Japan Orthographic Projection", "Japan is an island country in East Asia.")
    assert cap.lower().strip(". ") != "japan orthographic projection"
    print("  -> PASS: Resolved state, structured 3-angle follow-ups, and caption deduplication verified.")


def test_evidence_quote_alignment_and_strict_academic():
    print("[5/6] Testing click-to-proof evidence_quote substring alignment & strict_academic mode...")
    chunks = [
        {
            "title": "CRISPR Off-Target Reduction via High-Fidelity Cas9",
            "venue": "Nature Biotechnology",
            "source_type": "openalex",
            "year": 2025,
            "snippet": (
                "High-fidelity SpCas9 variants substantially reduce genome-wide off-target DNA cleavage "
                "while preserving on-target editing efficiency in mammalian cells. "
                "Truncated guide RNAs of 17 nucleotides also improve specificity in human cell lines."
            ),
        }
    ]
    answer_text = (
        "High-fidelity SpCas9 variants reduce genome-wide off-target cleavage in mammalian cells [[c:0]]. "
        "Truncated guide RNAs also improve editing specificity [[c:0]]."
    )
    mock_judge_payload = json.dumps([
        {"claim_id": 0, "supported": True, "quotes": ["High-fidelity SpCas9 variants substantially reduce genome-wide off-target DNA cleavage"]},
        {"claim_id": 1, "supported": True, "quotes": ["Truncated guide RNAs of 17 nucleotides also improve specificity in human cell lines"]},
    ])
    mock_llm_inst = MagicMock()
    mock_llm_inst.ainvoke = AsyncMock(
        return_value=MagicMock(content=mock_judge_payload, response_metadata={"finish_reason": "stop"}, usage_metadata=None)
    )

    with patch("pipeline.nodes.current_judge_llm", return_value=mock_llm_inst):
        audited = asyncio.run(run_claim_audit(answer_text, chunks))

    assert len(audited) == 2
    for c in audited:
        assert c.get("source_index") == 0
        assert c.get("verdict") == "supported"
        eq = c.get("evidence_quote") or ""
        assert eq and eq in chunks[0]["snippet"], f"evidence_quote not exact substring of snippet: {eq!r}"

    # Verify strict_academic mode withholds partial low-coverage claims (< 0.60)
    strict_c0 = (
        "High-fidelity SpCas9 engineered protein variants substantially reduce genome-wide off-target DNA cleavage "
        "while reliably preserving on-target genome editing efficiency across mammalian cell lines in experimental assays"
    )
    strict_c1 = "Truncated guide RNAs eliminate all off-target effects universally"
    strict_answer = f"{strict_c0} [[c:0]]. {strict_c1} [[c:0]]."
    strict_state = {
        "query": "CRISPR off-target mitigation",
        "canonical_topic": "CRISPR",
        "tiers_fired": ["LIVE"],
        "strict_academic": True,
        "retrieved_chunks": chunks,
        "answer_final": strict_answer,
        "compare_mode": False,
        "_skip_regeneration": True,
    }
    mixed_claims = [
        {
            "claim_id": 0,
            "text": strict_c0,
            "citation_ids": [0],
            "source_index": 0,
            "status": "supported",
            "verdict": "supported",
            "supported": True,
            "coverage": 0.92,
            "evidence": "High-fidelity SpCas9 variants substantially reduce genome-wide off-target DNA cleavage",
            "evidence_quote": "High-fidelity SpCas9 variants substantially reduce genome-wide off-target DNA cleavage",
            "start": 0,
            "end": len(strict_c0),
        },
        {
            "claim_id": 1,
            "text": strict_c1,
            "citation_ids": [0],
            "source_index": 0,
            "status": "partially_supported",
            "verdict": "partial",
            "supported": False,
            "coverage": 0.42,
            "evidence": "Truncated guide RNAs of 17 nucleotides also improve specificity",
            "evidence_quote": "Truncated guide RNAs of 17 nucleotides also improve specificity",
            "start": len(strict_c0) + 9,
            "end": len(strict_c0) + 9 + len(strict_c1),
        },
    ]
    with patch("pipeline.nodes.run_claim_audit", new=AsyncMock(return_value=mixed_claims)), \
         patch("pipeline.nodes.check_retractions", new=AsyncMock(return_value=[])):
        strict_res = asyncio.run(audit_answer(strict_state))

    assert len(strict_res["claims"]) == 1, f"Strict mode should withhold <60% partial claim, got {len(strict_res['claims'])}"
    assert strict_res["claims"][0]["verdict"] == "supported"
    print("  -> PASS: Exact evidence_quote alignment and strict_academic withholding verified.")


def test_peer_reviewed_and_recency_filters():
    print("[6/6] Testing source_tier='peer_reviewed' & recency='2y' backend retrieval filters...")
    cur_year = datetime.datetime.now().year
    mock_scholarly = [
        {
            "tier": "LIVE",
            "source_type": "openalex",
            "review_status": "scholarly",
            "title": "CRISPR-Cas9 high fidelity nucleases in gene editing",
            "snippet": "CRISPR-Cas9 nucleases with high fidelity engineering significantly decrease off-target mutations in genome editing.",
            "year": cur_year,
            "venue": "Nature",
            "url": "https://doi.org/10.1000/recent",
        },
        {
            "tier": "LIVE",
            "source_type": "crossref",
            "review_status": "scholarly",
            "title": "Older CRISPR genome editing survey from 2016",
            "snippet": "CRISPR genome editing mechanisms studied in 2016 baseline experiments and mammalian cell lines.",
            "year": 2016,
            "venue": "Science",
            "url": "https://doi.org/10.1000/old",
        },
    ]

    with patch("utils.academic_search.search_wikipedia", new=AsyncMock(side_effect=AssertionError("Wikipedia must NOT be called in peer_reviewed mode"))), \
         patch("utils.academic_search.search_duckduckgo", new=AsyncMock(side_effect=AssertionError("DuckDuckGo must NOT be called in peer_reviewed mode"))), \
         patch("utils.academic_search.search_openalex", new=AsyncMock(return_value=[mock_scholarly[0]])), \
         patch("utils.academic_search.search_crossref", new=AsyncMock(return_value=[mock_scholarly[1]])), \
         patch("utils.academic_search.search_arxiv", new=AsyncMock(return_value=[])), \
         patch("utils.academic_search.search_semantic_scholar", new=AsyncMock(return_value=[])), \
         patch("utils.academic_search.search_pubmed", new=AsyncMock(return_value=[])):
        results = asyncio.run(
            search_all_free_sources(
                "CRISPR gene editing",
                canonical_topic="CRISPR",
                source_tier="peer_reviewed",
                recency="2y",
            )
        )

    assert len(results) == 1, f"Expected 1 recent scholarly paper after 2y filter, got {len(results)}"
    assert results[0]["source_type"] in SCHOLARLY_SOURCE_TYPES
    assert results[0]["year"] >= cur_year - 2
    print("  -> PASS: peer_reviewed exclusion & recency cutoff verified.")


def test_mandatory_auth_and_no_guest_bypass():
    import time
    from main import app

    print("[7/8] Testing mandatory JWT authentication & zero guest fallback across protected endpoints...")
    client = TestClient(app)

    assert client.get("/health").status_code == 200

    # /api/query unauthenticated + X-Anonymous-User must be 401
    r1 = client.post("/api/query", json={"query": "Quantum entanglement", "thread_id": str(uuid.uuid4())})
    assert r1.status_code == 401, f"/api/query without auth expected 401, got {r1.status_code}"
    r2 = client.post(
        "/api/query",
        json={"query": "Quantum entanglement", "thread_id": str(uuid.uuid4())},
        headers={"X-Anonymous-User": "true"},
    )
    assert r2.status_code == 401, f"/api/query with X-Anonymous-User expected 401, got {r2.status_code}"

    # /api/export/pdf unauthenticated + X-Anonymous-User must be 401
    pdf_body = {"query": "Test", "answer_final": "Summary", "sources": [], "claims": []}
    p1 = client.post("/api/export/pdf", json=pdf_body)
    assert p1.status_code == 401, f"/api/export/pdf without auth expected 401, got {p1.status_code}"
    p2 = client.post("/api/export/pdf", json=pdf_body, headers={"X-Anonymous-User": "true"})
    assert p2.status_code == 401, f"/api/export/pdf with X-Anonymous-User expected 401, got {p2.status_code}"

    # Auxiliary protected endpoints must also reject missing auth cleanly
    assert client.post("/api/keys/test", json={"api_key": "gsk_1234567890abcdef"}).status_code == 401
    assert client.get("/api/okf/graph").status_code == 401
    assert client.request("DELETE", "/api/account", json={"confirm_text": "DELETE"}).status_code == 401
    print("  -> PASS: All protected endpoints reject unauthenticated and anonymous requests with 401.")


def test_account_deletion_reauth_and_cleanup():
    import time
    from main import app

    print("[8/8] Testing DELETE /api/account validation, re-auth enforcement, and cascade cleanup...")
    client = TestClient(app)
    uid = "33333333-3333-3333-3333-333333333333"
    now_ts = int(time.time())

    # Case 1: Wrong confirmation phrase -> 400
    email_payload = {
        "sub": uid,
        "email": "researcher@university.edu",
        "iat": now_ts,
        "app_metadata": {"provider": "email", "providers": ["email"]},
    }
    with patch("utils.api_security.verify_supabase_jwt", new=AsyncMock(return_value=email_payload)):
        r_bad_confirm = client.request(
            "DELETE",
            "/api/account",
            json={"confirm_text": "delete", "password": "correct-password"},
            headers={"Authorization": "Bearer valid_email_jwt"},
        )
        assert r_bad_confirm.status_code == 400, f"Expected 400 on lowercase confirm, got {r_bad_confirm.status_code}"

        # Case 2: Wrong current password -> 401
        with patch("main.verify_supabase_user_password", new=AsyncMock(return_value=False)):
            r_bad_pwd = client.request(
                "DELETE",
                "/api/account",
                json={"confirm_text": "DELETE", "password": "wrong-password"},
                headers={"Authorization": "Bearer valid_email_jwt"},
            )
            assert r_bad_pwd.status_code == 401, f"Expected 401 on wrong password, got {r_bad_pwd.status_code}"

        # Case 3: Email account missing password -> 400
        r_no_pwd = client.request(
            "DELETE",
            "/api/account",
            json={"confirm_text": "DELETE"},
            headers={"Authorization": "Bearer valid_email_jwt"},
        )
        assert r_no_pwd.status_code == 400, f"Expected 400 on missing password for email account, got {r_no_pwd.status_code}"

        # Case 4: Valid email password re-auth -> 200 {"deleted": true} and cleanup called with verified user_id
        delete_mock = AsyncMock(return_value={"deleted": True})
        with patch("main.verify_supabase_user_password", new=AsyncMock(return_value=True)), \
             patch("utils.supabase_client.permanently_delete_user_account", new=delete_mock):
            r_ok_email = client.request(
                "DELETE",
                "/api/account",
                json={"confirm_text": "DELETE", "password": "correct-password"},
                headers={"Authorization": "Bearer valid_email_jwt"},
            )
            assert r_ok_email.status_code == 200, f"Expected 200 on valid password delete, got {r_ok_email.status_code}"
            assert r_ok_email.json() == {"deleted": True}
            delete_mock.assert_awaited_once_with(uid)

    # Case 5: OAuth account with stale iat (> 300s ago) -> 403
    stale_oauth_payload = {
        "sub": uid,
        "email": "octocat@github.com",
        "iat": now_ts - 600,
        "app_metadata": {"provider": "github", "providers": ["github"]},
    }
    with patch("utils.api_security.verify_supabase_jwt", new=AsyncMock(return_value=stale_oauth_payload)):
        r_stale_oauth = client.request(
            "DELETE",
            "/api/account",
            json={"confirm_text": "DELETE"},
            headers={"Authorization": "Bearer stale_oauth_jwt"},
        )
        assert r_stale_oauth.status_code == 403, f"Expected 403 on stale OAuth iat, got {r_stale_oauth.status_code}"
        assert "Recent authentication required" in r_stale_oauth.json().get("detail", "")

    # Case 6: OAuth account with fresh iat (<= 300s ago) -> 200 {"deleted": true}
    fresh_oauth_payload = {
        "sub": uid,
        "email": "octocat@github.com",
        "iat": now_ts - 30,
        "app_metadata": {"provider": "github", "providers": ["github"]},
    }
    delete_oauth_mock = AsyncMock(return_value={"deleted": True})
    with patch("utils.api_security.verify_supabase_jwt", new=AsyncMock(return_value=fresh_oauth_payload)), \
         patch("utils.supabase_client.permanently_delete_user_account", new=delete_oauth_mock):
        r_ok_oauth = client.request(
            "DELETE",
            "/api/account",
            json={"confirm_text": "DELETE"},
            headers={"Authorization": "Bearer fresh_oauth_jwt"},
        )
        assert r_ok_oauth.status_code == 200, f"Expected 200 on fresh OAuth delete, got {r_ok_oauth.status_code}"
        assert r_ok_oauth.json() == {"deleted": True}
        delete_oauth_mock.assert_awaited_once_with(uid)

    print("  -> PASS: DELETE /api/account re-auth and permanent deletion ledger verified.")


def test_universal_domain_planner_and_pdf_titles():
    print("[Test 9] Universal Domain-Cognitive Planner ('Singing', 'Soil', 'Japan', 'Microscope')...")
    from pipeline.nodes import (
        classify_domain_discipline,
        build_specialist_outline,
        build_synthesis_prompt,
        heuristic_reformulation,
        generate_followup_cards,
    )
    from utils.pdf_generator import generate_academic_paper_title

    cases = [
        ("How does singing work acoustically?", "singing", "arts_performance"),
        ("What determines soil fertility and horizons?", "soil", "zoology_botany_earth"),
        ("Japan", "Japan", "geography_history_social"),
        ("How does an optical microscope resolve sub-micron specimens?", "microscope", "instruments_engineering"),
    ]
    for query, topic, expected_disc in cases:
        disc = classify_domain_discipline(query, topic)
        assert disc == expected_disc, f"Expected discipline '{expected_disc}' for {query!r}, got '{disc}'"
        outline = build_specialist_outline(disc, query, is_debated=False)
        assert len(outline) >= 5, f"Outline too short for {query!r}: {outline}"
        joined = " | ".join(outline).lower()
        if disc != "instruments_engineering":
            assert "theoretical formulation" not in joined and "core mechanisms, architecture" not in joined, (
                f"CS heading leaked into {disc}: {outline}"
            )
        prompt = build_synthesis_prompt(domain_discipline=disc, planned_outline=outline)
        assert outline[0] in prompt

        plan = heuristic_reformulation(query)
        assert len(plan.get("sub_queries", [])) >= 3, f"Expected multi-faceted sub-queries for {query!r}"

        cards = generate_followup_cards(query, f"## {outline[0]}\nVocal Folds and Acoustic Formants govern pitch [c:0].", canonical_topic=topic)
        assert len(cards) == 3
        assert [c["label"] for c in cards] == ["Deep Dive", "Counter-View", "Applied"]

        title = generate_academic_paper_title(topic, topic)
        assert ":" in title and len(title) > 10

    print("  -> PASS: All 4 domain planners, multi-faceted sub-queries, follow-ups, and titles verified.")


def test_retraction_exclusion_polarity_and_feedback_cleanup():
    print("[Test 10] Retraction exclusion, claim polarity, & DELETE feedback cleanup...")
    from pipeline.nodes import synthesize_answer, run_claim_audit
    from utils import supabase_client
    import utils.academic_search as ac_search

    assert ac_search._is_retracted_title("RETRACTED: Spurious soil horizon correlation") is True
    assert ac_search._is_retracted_title("Soil Organic Carbon Dynamics") is False

    # Claim audit must emit valid polarity + confidence fields
    async def run_audit_check():
        chunks = [
            {
                "title": "Vocal Tract Acoustics",
                "snippet": "Human singing relies on vocal fold oscillation and supraglottal formant tuning between 300 Hz and 3500 Hz.",
                "venue": "Journal of Voice",
                "source_type": "peer_reviewed",
            }
        ]
        ans = "Human singing relies on vocal fold oscillation and supraglottal formant tuning [[c:0]]. Unrelated claim lacking source support [[c:0]]."
        claims = await run_claim_audit(ans, chunks)
        assert len(claims) >= 1
        for c in claims:
            assert c.get("polarity") in ("supported", "contested", "partial"), f"Missing polarity: {c}"
            assert isinstance(c.get("confidence"), float), f"Missing float confidence: {c}"

    asyncio.run(run_audit_check())

    # permanently_delete_user_account must delete from feedback as well as all other user tables
    called_urls = []

    class FakeResp:
        def __init__(self, status_code=204):
            self.status_code = status_code

    class FakeClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return False
        async def delete(self, url, headers=None, params=None):
            called_urls.append(url)
            return FakeResp(204)

    async def run_del_check():
        with patch.object(supabase_client.settings, "supabase_url", "https://example.supabase.co"), \
             patch.object(supabase_client.settings, "supabase_service_role_key", "srv_test_key"), \
             patch("utils.supabase_client.httpx.AsyncClient", return_value=FakeClient()):
            res = await supabase_client.permanently_delete_user_account("11111111-1111-1111-1111-111111111111")
            assert res == {"deleted": True}

    asyncio.run(run_del_check())
    assert any(u.endswith("/rest/v1/feedback") for u in called_urls), f"feedback cleanup missing: {called_urls}"
    assert any("/auth/v1/admin/users/" in u for u in called_urls)
    print("  -> PASS: Retraction gate, claim polarity, and feedback deletion cleanup verified.")


def test_depth_consensus_badges_compare_and_direct_paper():
    print("[Test 11] Reading Depth Dial, Consensus Breakdown, Rigor Badges, Auto Compare, Direct Paper Microscope...")
    from pipeline.nodes import (
        build_synthesis_prompt,
        compute_consensus_breakdown,
        detect_compare_query,
        heuristic_reformulation,
        plan_retrieval,
    )
    from main import QueryRequest
    import utils.academic_search as ac_search

    # 1. Reading Depth Dial calibration & request schema
    req_spec = QueryRequest(query="Quantum Hall effect", depth="specialist")
    assert req_spec.depth == "specialist"
    p_found = build_synthesis_prompt(depth="foundational")
    p_spec = build_synthesis_prompt(depth="specialist")
    assert "READING DEPTH — FOUNDATIONAL" in p_found
    assert "READING DEPTH — SPECIALIST" in p_spec

    # 2. Evidence Consensus Gauge breakdown
    claims = [
        {"polarity": "supported", "status": "supported"},
        {"polarity": "supported", "status": "supported"},
        {"polarity": "partial", "status": "partially_supported"},
        {"polarity": "contested", "status": "unsupported"},
    ]
    bd = compute_consensus_breakdown(claims, total_sources=3)
    assert bd == {"supporting": 2, "mixed": 1, "contrasting": 1, "total_claims": 4, "total_sources": 3}, bd

    # 3. Study-Type & Rigor Badges
    meta_c = ac_search.normalize_source_metadata({
        "source_type": "pubmed",
        "title": "Efficacy of treatment X: a randomized controlled trial",
        "snippet": "Double-blind randomized controlled trial across 420 patients showing improved outcomes.",
        "is_open_access": True,
        "publication_types": ["Randomized Controlled Trial"],
    })
    assert "RCT" in meta_c["rigor_badges"] and "Peer-Reviewed" in meta_c["rigor_badges"] and "Open Access" in meta_c["rigor_badges"]
    ma_c = ac_search.normalize_source_metadata({
        "source_type": "openalex",
        "title": "A systematic review and meta-analysis of neural scaling laws",
        "snippet": "Comprehensive meta-analysis evaluating empirical scaling curves.",
        "is_open_access": False,
    })
    assert ma_c["study_type"] == "Meta-Analysis" and "Meta-Analysis" in ma_c["rigor_badges"]
    ax_c = ac_search.normalize_source_metadata({"source_type": "arxiv", "title": "Sparse Attention", "snippet": "We propose sparse attention kernels."})
    assert "Preprint" in ax_c["rigor_badges"] and "Open Access" in ax_c["rigor_badges"]
    ret_c = ac_search.normalize_source_metadata({"source_type": "crossref", "title": "Paper", "snippet": "Body", "is_retracted": True})
    assert ret_c["rigor_badges"][0] == "Retracted"

    # 4. Auto Compare Mode ('A vs B')
    is_cmp, ents = detect_compare_query("CRISPR-Cas9 vs Prime Editing in mammalian cells")
    assert is_cmp is True and ents == ["CRISPR-Cas9", "Prime Editing"], (is_cmp, ents)
    cmp_plan = heuristic_reformulation("Lithium-ion vs Sodium-ion batteries")
    assert cmp_plan["compare_mode"] is True and len(cmp_plan["compare_entities"]) == 2
    pr = plan_retrieval({
        "query": "Lithium-ion vs Sodium-ion batteries",
        "compare_mode": True,
        "compare_entities": ["Lithium-ion", "Sodium-ion batteries"],
        "academic_search_query": "Lithium-ion vs Sodium-ion batteries",
        "canonical_topic": "Lithium-ion vs Sodium-ion batteries",
        "planned_outline": cmp_plan["planned_outline"],
    })
    assert len(pr["sub_queries"]) == 3
    cmp_prompt = build_synthesis_prompt(compare_mode=True, compare_entities=["Lithium-ion", "Sodium-ion"])
    assert "AUTO COMPARE MODE" in cmp_prompt

    # 5. DOI / arXiv / PMID Direct Microscope detection & mocked resolution
    assert ac_search.detect_direct_paper_identifier("10.1038/s41586-021-03819-2") == {"kind": "doi", "value": "10.1038/s41586-021-03819-2"}
    assert ac_search.detect_direct_paper_identifier("https://arxiv.org/abs/1706.03762") == {"kind": "arxiv", "value": "1706.03762"}
    assert ac_search.detect_direct_paper_identifier("PMID: 32511329") == {"kind": "pmid", "value": "32511329"}

    mic_plan = heuristic_reformulation("https://arxiv.org/abs/1706.03762")
    assert mic_plan["direct_paper_mode"] is True
    assert mic_plan["planned_outline"][0] == "Core Claim & Bibliographic Profile"
    mic_prompt = build_synthesis_prompt(direct_paper_mode=True)
    assert "DIRECT PAPER MICROSCOPE DISSECTION" in mic_prompt

    class FakeHttpResp:
        def __init__(self, status_code, payload=None, text=""):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = text
        def json(self):
            return self._payload

    class FakeDirectClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return False
        async def get(self, url, headers=None):
            if "api.openalex.org/works/https://doi.org/" in url:
                return FakeHttpResp(200, {
                    "id": "https://openalex.org/W1234567",
                    "title": "Highly accurate protein structure prediction with AlphaFold",
                    "publication_year": 2021,
                    "publication_date": "2021-07-15",
                    "cited_by_count": 25000,
                    "type": "article",
                    "open_access": {"is_oa": True},
                    "primary_location": {"source": {"display_name": "Nature"}},
                    "authorships": [{"author": {"display_name": "John Jumper"}}],
                    "abstract_inverted_index": {"AlphaFold": [0], "predicts": [1], "atomic": [2], "protein": [3], "structures.": [4]},
                })
            if "filter=cites:W1234567" in url:
                return FakeHttpResp(200, {
                    "results": [{
                        "title": "Following AlphaFold across Structural Proteomics",
                        "publication_year": 2023,
                        "cited_by_count": 120,
                        "type": "review",
                        "open_access": {"is_oa": True},
                        "doi": "https://doi.org/10.1000/citing1",
                        "primary_location": {"source": {"display_name": "Nature Reviews"}},
                        "authorships": [{"author": {"display_name": "Jane Doe"}}],
                    }]
                })
            return FakeHttpResp(404)

    async def run_direct_check():
        with patch("utils.academic_search.httpx.AsyncClient", return_value=FakeDirectClient()):
            res = await ac_search.resolve_direct_paper({"kind": "doi", "value": "10.1038/s41586-021-03819-2"})
            assert len(res) == 2
            assert res[0]["doi"] == "10.1038/s41586-021-03819-2"
            assert "Open Access" in res[0]["rigor_badges"]
            assert res[1]["title"].startswith("Following AlphaFold")

    asyncio.run(run_direct_check())
    print("  -> PASS: Depth Dial, Consensus Breakdown, Rigor Badges, Auto Compare, and Direct Paper Microscope verified.")


if __name__ == "__main__":
    test_wikipedia_clean_extraction()
    test_export_pdf_endpoint_styles()
    test_ssrf_metadata_and_loopback_blocked()
    test_verification_state_and_adaptive_followups()
    test_evidence_quote_alignment_and_strict_academic()
    test_peer_reviewed_and_recency_filters()
    test_mandatory_auth_and_no_guest_bypass()
    test_account_deletion_reauth_and_cleanup()
    test_universal_domain_planner_and_pdf_titles()
    test_retraction_exclusion_polarity_and_feedback_cleanup()
    test_depth_consensus_badges_compare_and_direct_paper()
    print("\nALL UPGRADE VERIFICATION TESTS PASSED!")
