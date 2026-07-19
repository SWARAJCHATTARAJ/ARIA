import os
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: None
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
# Isolate unit tests from external Supabase database and OpenRouter API keys
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DISABLE_HEAVY_MODELS"] = "true"
os.environ.pop("OPENROUTER_API_KEY", None)
import unittest
from aria.core import Settings, MAX_UPLOAD_BYTES, validate_pdf_upload
from aria.rag import split_text, VectorMemory
from aria.agent import ResearchAgent


class SecurityTests(unittest.TestCase):
    def test_validate_pdf_upload_rejects_empty_file(self) -> None:
        with self.assertRaisesRegex(ValueError, "empty"):
            validate_pdf_upload("report.pdf", 0)

    def test_validate_pdf_upload_rejects_path_like_name(self) -> None:
        with self.assertRaisesRegex(ValueError, "invalid"):
            validate_pdf_upload("../report.pdf", 128)

    def test_validate_pdf_upload_rejects_oversized_file(self) -> None:
        with self.assertRaisesRegex(ValueError, "too large"):
            validate_pdf_upload("report.pdf", MAX_UPLOAD_BYTES + 1)


class SplitTextTests(unittest.TestCase):
    def test_split_text_rejects_invalid_overlap(self) -> None:
        with self.assertRaisesRegex(ValueError, "overlap"):
            split_text("abc", chunk_size=10, overlap=10)

    def test_split_text_chunks_with_overlap(self) -> None:
        chunks = split_text("abcdefghij", chunk_size=4, overlap=1)
        self.assertEqual(chunks, ["abcd", "defg", "ghij", "j"])

    def test_split_text_aligns_to_word_boundaries(self) -> None:
        text = "hello world this is a test of boundary"
        chunks = split_text(text, chunk_size=12, overlap=3)
        for chunk in chunks:
            self.assertTrue(len(chunk) <= 12)
        self.assertEqual(chunks[0], "hello world")


class SearchModesTestCase(unittest.TestCase):
    def setUp(self):
        self.old_api_key = os.environ.pop("OPENROUTER_API_KEY", None)
        os.environ["ARIA_COLLECTION"] = "aria_test_selective_search"
        self.settings = Settings.from_env()
        self.memory = VectorMemory(self.settings)
        self.memory.reset()
        
        self.memory.ingest_text(
            "Secret Project X is a solar powered drone designed for field research in 2026.",
            source_name="project_x.txt", 
            source_type="note"
        )
        self.agent = ResearchAgent(self.settings, self.memory)

    def tearDown(self):
        self.memory.reset()
        if self.old_api_key is not None:
            os.environ["OPENROUTER_API_KEY"] = self.old_api_key

    def test_local_only_mode(self):
        result = self.agent.run(
            question="What is Secret Project X?", 
            use_web=False, 
            use_local=True, 
            max_iterations=1
        )
        local_evidences = [e for e in result.evidence if e.source_type == "note"]
        self.assertTrue(len(local_evidences) > 0)
        self.assertIn("Secret Project X", local_evidences[0].summary)
        
        web_evidences = [e for e in result.evidence if e.source_type in ("wikipedia", "web", "research")]
        self.assertEqual(len(web_evidences), 0)

    def test_web_only_mode(self):
        result = self.agent.run(
            question="What is Secret Project X?", 
            use_web=True, 
            use_local=False, 
            max_iterations=1
        )
        local_evidences = [e for e in result.evidence if e.source_type == "note"]
        self.assertEqual(len(local_evidences), 0)

    def test_global_summary_fallback(self):
        result = self.agent.run(
            question="Summarize my indexed documents.",
            use_web=False, 
            use_local=True, 
            max_iterations=1
        )
        self.assertTrue(len(result.evidence) > 0)
        self.assertIn("Secret Project X", result.evidence[0].summary)


class ReportTests(unittest.TestCase):
    def test_markdown_report_linkifies_inline_citations(self) -> None:
        from aria.reports import build_markdown_report
        from aria.core import ResearchResult, Evidence

        result = ResearchResult(
            question="What changed?",
            plan=["source query"],
            answer="The answer cites evidence [1].",
            verification="Passed.",
            evidence=[
                Evidence(
                    title="Primary source",
                    summary="Evidence summary.",
                    source_type="web",
                    url="https://example.com/source",
                )
            ],
        )

        report = build_markdown_report(result)
        self.assertIn("[[1]](https://example.com/source)", report)

    def test_pdf_report_with_query_params_url(self) -> None:
        from aria.reports import build_pdf_report
        from aria.core import ResearchResult, Evidence
        
        result = ResearchResult(
            question="What is the stock price of AAPL?",
            plan=["AAPL stock price"],
            answer="Here is the report.",
            verification="Passed.",
            evidence=[
                Evidence(
                    title="Yahoo Finance AAPL",
                    summary="AAPL is trading at 180.",
                    source_type="web",
                    url='https://finance.yahoo.com/quote/AAPL?p="AAPL"&other=1'
                )
            ]
        )
        pdf_bytes = build_pdf_report(result)
        self.assertTrue(len(pdf_bytes) > 0)

    def test_pdf_report_with_visual_analytics(self) -> None:
        from aria.reports import build_pdf_report, citation_stats, evidence_type_counts
        from aria.core import ResearchResult, Evidence

        result = ResearchResult(
            question="Compare evidence quality.",
            plan=["query one", "query two"],
            answer="The report cites a PDF [1] and a web source [2].",
            verification="STATUS: PASSED",
            evidence=[
                Evidence(title="PDF source", summary="PDF evidence.", source_type="pdf", score=0.95),
                Evidence(title="Web source", summary="Web evidence.", source_type="web", score=0.72),
                Evidence(title="Research source", summary="Paper evidence.", source_type="research", score=0.88),
            ],
            metrics={"iterations": 2, "answer_tokens_est": 12, "verification_tokens_est": 4},
        )

        self.assertEqual(evidence_type_counts(result.evidence), {"pdf": 1, "research": 1, "web": 1})
        self.assertEqual(citation_stats(result)["cited_sources"], 2)
        self.assertTrue(len(build_pdf_report(result)) > 0)


class SessionTests(unittest.TestCase):
    def test_session_round_trip(self) -> None:
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from aria.core import ResearchResult, Evidence
        from aria.sessions import save_session, list_sessions, load_session

        with TemporaryDirectory() as tmp:
            result = ResearchResult(
                question="Persist this?",
                plan=["persist query"],
                answer="Saved answer [1].",
                verification="Passed.",
                evidence=[
                    Evidence(
                        title="Saved source",
                        summary="Saved evidence.",
                        source_type="note",
                        score=0.9,
                        source_id="note:1",
                        retrieved_via="local_vector_memory",
                    )
                ],
                metrics={"answer_tokens_est": 3},
            )
            save_session(result, Path(tmp), user_id="user1")
            sessions = list_sessions(Path(tmp), user_id="user1")
            loaded = load_session(sessions[0]["path"])

            self.assertEqual(loaded.question, result.question)
            self.assertEqual(loaded.evidence[0].source_id, "note:1")
            self.assertEqual(loaded.metrics["answer_tokens_est"], 3)

    def test_download_endpoints_return_pdf_and_markdown_for_owner(self) -> None:
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from fastapi.testclient import TestClient
        from aria.core import ResearchResult, Evidence
        from aria.sessions import save_session
        import main

        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            result = ResearchResult(
                question="Download this?",
                plan=["download query"],
                answer="Downloadable answer [1].",
                verification="STATUS: PASSED",
                evidence=[
                    Evidence(
                        title="Download source",
                        summary="Evidence for download.",
                        source_type="web",
                        url="https://example.com/download",
                    )
                ],
                metrics={"iterations": 1},
            )
            session = save_session(result, tmp_path, user_id="user1")
            original_find_session_path = main.find_session_path

            def temp_find_session_path(session_id, user_id=None):
                return original_find_session_path(session_id, tmp_path, user_id)

            main.find_session_path = temp_find_session_path
            from aria.auth import get_current_user
            main.app.dependency_overrides[get_current_user] = lambda: "user1"
            try:
                client = TestClient(main.app)
                pdf_response = client.get(f"/api/sessions/{session['id']}/download/pdf?user_id=user1")
                md_response = client.get(f"/api/sessions/{session['id']}/download/md?user_id=user1")
                blocked_response = client.get(f"/api/sessions/{session['id']}/download/md?user_id=user2")

                self.assertEqual(pdf_response.status_code, 200)
                self.assertEqual(pdf_response.headers["content-type"], "application/pdf")
                self.assertTrue(pdf_response.content.startswith(b"%PDF"))
                self.assertEqual(md_response.status_code, 200)
                self.assertIn(b"# ARIA Research Brief", md_response.content)
                self.assertEqual(blocked_response.status_code, 404)
            finally:
                main.find_session_path = original_find_session_path
                main.app.dependency_overrides.pop(get_current_user, None)


class LLMClientTests(unittest.TestCase):
    def test_complete_fallback_plan(self) -> None:
        from aria.agent import LLMClient
        client = LLMClient(Settings.from_env())
        client.openrouter_api_key = None
        res = client.complete("system", "Research Question: test", task="plan")
        self.assertEqual(res, "")

    def test_complete_fallback_verify(self) -> None:
        from aria.agent import LLMClient
        client = LLMClient(Settings.from_env())
        client.openrouter_api_key = None
        res = client.complete("system", "Research Question: test\n\nEvidence:\n[1] Title\nSummary of source.", task="verify")
        self.assertIn("STATUS: PASSED", res)
        self.assertIn("Checked 1 retrieved sources.", res)

    def test_generate_diverse_fallback_queries(self) -> None:
        from aria.agent import generate_diverse_fallback_queries
        res = generate_diverse_fallback_queries("Compare supply chain risks for NVIDIA, AMD, and Intel")
        self.assertEqual(len(res), 3)
        self.assertEqual(res[0], "NVIDIA supply chain risks")
        self.assertEqual(res[1], "AMD supply chain risks")
        self.assertEqual(res[2], "Intel supply chain risks")

    def test_generate_diverse_fallback_queries_vs(self) -> None:
        from aria.agent import generate_diverse_fallback_queries
        res = generate_diverse_fallback_queries("Python vs Go vs Rust")
        self.assertEqual(len(res), 4)
        self.assertEqual(res[0], "Python vs Go vs Rust")
        self.assertEqual(res[1], "Python comparison features")
        self.assertEqual(res[2], "Go comparison features")
        self.assertEqual(res[3], "Rust comparison features")

    def test_is_developer_query(self) -> None:
        from aria.agent import is_developer_query
        self.assertTrue(is_developer_query("who built ARIA"))
        self.assertTrue(is_developer_query("developer of aria"))
        self.assertTrue(is_developer_query("who is Swaraj Chattaraj?"))
        self.assertTrue(is_developer_query("who build you?"))
        self.assertTrue(is_developer_query("who created you"))
        self.assertTrue(is_developer_query("who is your developer?"))
        self.assertFalse(is_developer_query("Compare supply chain risks"))

    def test_developer_query_fallback(self) -> None:
        from aria.agent import LLMClient
        client = LLMClient(Settings.from_env())
        client.openrouter_api_key = None
        res = client.complete("system", "Question: who built ARIA\n\nEvidence: [1] developer_profile", task="draft")
        self.assertIn("Swaraj Chattaraj", res)
        self.assertIn("Creator & Developer", res)

    def test_fallback_structured_summary(self) -> None:
        from aria.agent import LLMClient
        from aria.core import Evidence
        client = LLMClient(Settings.from_env())
        client.openrouter_api_key = None
        evidence = [
            Evidence(title="Sample Wikipedia", summary="Wikipedia source text.", source_type="wikipedia", score=0.8),
            Evidence(title="Sample PDF p.1", summary="PDF source text.", source_type="pdf", score=0.9),
            Evidence(title="Sample Arxiv", summary="Arxiv source text.", source_type="research", score=0.85)
        ]
        res = client.complete(
            system="system_prompt",
            user="Question:\nWhat is the test?\n\nEvidence:\n[1] Sample Wikipedia\nWikipedia source text.",
            task="draft",
            evidence=evidence
        )
        self.assertIn("Findings from Local Knowledge Base", res)
        self.assertIn("Findings from Web & General Search", res)
        self.assertIn("Findings from Academic & Scientific Literature", res)
        self.assertIn("Sample Wikipedia", res)
        self.assertIn("Sample PDF p.1", res)
        self.assertIn("Sample Arxiv", res)

    def test_async_duckduckgo_search_stub(self) -> None:
        import asyncio
        from aria.tools import run_async
        from aria.core import Evidence
        
        # Test parsing function directly with simulated HTML content
        from aria.tools import async_duckduckgo_search
        
        class MockResponse:
            def __init__(self, status, text_data):
                self.status = status
                self.text_data = text_data
            async def text(self):
                return self.text_data
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc, tb):
                pass

        class MockSession:
            def __init__(self, text_data):
                self.text_data = text_data
            def post(self, url, data=None, headers=None, timeout=None):
                return MockResponse(200, self.text_data)

        simulated_html = """
        <div class="result__body">
            <h2 class="result__title">
                <a class="result__a" href="https://example.com/test">Test Title</a>
            </h2>
            <a class="result__snippet" href="https://example.com/test">This is a test snippet about python programming.</a>
        </div>
        """
        session = MockSession(simulated_html)
        loop = asyncio.new_event_loop()
        try:
            results = loop.run_until_complete(async_duckduckgo_search(session, "test query", 1))
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].title, "Test Title")
            self.assertEqual(results[0].url, "https://example.com/test")
            self.assertIn("test snippet", results[0].summary)
        finally:
            loop.close()

    def test_async_doaj_search_stub(self) -> None:
        import asyncio
        from aria.tools import async_doaj_search
        
        class MockResponse:
            def __init__(self, status, json_data):
                self.status = status
                self.json_data = json_data
            async def json(self):
                return self.json_data
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc, tb):
                pass

        class MockSession:
            def get(self, url, params=None, timeout=None):
                mock_json = {
                    "results": [
                        {
                            "bibjson": {
                                "title": "Mock DOAJ Title",
                                "abstract": "Mock DOAJ abstract text.",
                                "link": [{"url": "https://doaj.org/mock"}]
                            }
                        }
                    ]
                }
                return MockResponse(200, mock_json)

        session = MockSession()
        loop = asyncio.new_event_loop()
        try:
            results = loop.run_until_complete(async_doaj_search(session, "test query", 1))
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].title, "Mock DOAJ Title")
            self.assertEqual(results[0].url, "https://doaj.org/mock")
            self.assertEqual(results[0].summary, "Mock DOAJ abstract text.")
        finally:
            loop.close()

    def test_async_pubmed_search_stub(self) -> None:
        import asyncio
        from aria.tools import async_pubmed_search
        
        class MockResponse:
            def __init__(self, status, json_data):
                self.status = status
                self.json_data = json_data
            async def json(self):
                return self.json_data
            async def __aenter__(self):
                return self
            async def __aexit__(self, exc_type, exc, tb):
                pass

        class MockSession:
            def get(self, url, params=None, timeout=None):
                if "esearch" in url:
                    return MockResponse(200, {"esearchresult": {"idlist": ["123456"]}})
                else:
                    mock_summary = {
                        "result": {
                            "123456": {
                                "title": "Mock PubMed Title",
                                "source": "Mock Journal",
                                "pubdate": "2026",
                                "authors": [{"name": "Author One"}]
                            }
                        }
                    }
                    return MockResponse(200, mock_summary)

        session = MockSession()
        loop = asyncio.new_event_loop()
        try:
            results = loop.run_until_complete(async_pubmed_search(session, "test query", 1))
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0].title, "Mock PubMed Title")
            self.assertEqual(results[0].url, "https://pubmed.ncbi.nlm.nih.gov/123456/")
            self.assertIn("Mock Journal", results[0].summary)
            self.assertIn("Author One", results[0].summary)
        finally:
            loop.close()

    def test_re_rank_evidence(self) -> None:
        from aria.agent import re_rank_evidence
        from aria.core import Evidence
        
        evidence = [
            Evidence(title="Python programming", summary="A guide to python coding.", source_type="web", score=0.5),
            Evidence(title="Java basics", summary="An introduction to Java language.", source_type="web", score=0.9),
            Evidence(title="Cooking recipes", summary="How to bake chocolate cake.", source_type="web", score=0.8)
        ]
        
        ranked = re_rank_evidence("python guide", evidence)
        self.assertEqual(ranked[0].title, "Python programming")
        self.assertTrue(ranked[0].score > ranked[1].score)

    def test_audit_answer_grounding_rejects_invalid_citation_number(self) -> None:
        from aria.agent import audit_answer_grounding
        from aria.core import Evidence

        evidence = [
            Evidence(title="Source one", summary="Grounded detail.", source_type="web")
        ]

        issues = audit_answer_grounding("This claim cites a missing source [2].", evidence)

        self.assertTrue(any("outside the evidence register" in issue for issue in issues))

    def test_audit_answer_grounding_rejects_uncited_draft(self) -> None:
        from aria.agent import audit_answer_grounding
        from aria.core import Evidence

        evidence = [
            Evidence(title="Source one", summary="Grounded detail.", source_type="web")
        ]

        issues = audit_answer_grounding(
            "This is a long research answer with factual wording but no source marker anywhere.",
            evidence,
        )

        self.assertIn("draft contains no inline citations", issues)

    def test_verify_uses_deterministic_grounding_audit(self) -> None:
        from aria.core import Evidence

        agent = ResearchAgent(Settings.from_env(), memory=None)
        verification = agent._verify(
            "What happened?",
            "The report invents a citation [9].",
            [Evidence(title="Only source", summary="Evidence text.", source_type="web")],
        )

        self.assertIn("STATUS: NEEDS_MORE_RESEARCH", verification)
        self.assertIn("Deterministic grounding audit failed", verification)

    def test_user_session_isolation_and_clear(self) -> None:
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from aria.core import ResearchResult
        from aria.sessions import save_session, list_sessions, clear_sessions, find_session_path, is_valid_session_id

        with TemporaryDirectory() as tmp:
            previous_admin = os.environ.get("ARIA_ADMIN_USER_ID")
            os.environ["ARIA_ADMIN_USER_ID"] = "owner_1"
            tmp_path = Path(tmp)
            result = ResearchResult(
                question="Q1", plan=[], answer="A1", verification="Passed", evidence=[]
            )
            user1_session = save_session(result, tmp_path, user_id="user1")
            save_session(result, tmp_path, user_id="user2")
            legacy_session = save_session(result, tmp_path, user_id=None)

            try:
                self.assertTrue(is_valid_session_id(user1_session["id"]))
                self.assertFalse(is_valid_session_id("*"))
                self.assertEqual(list_sessions(tmp_path, user_id=None), [])

                user1_sessions = list_sessions(tmp_path, user_id="user1")
                # Legacy sessions (user_id=None) are accessible to all identified users
                self.assertEqual(len(user1_sessions), 2)
                user_ids = {s["user_id"] for s in user1_sessions}
                self.assertEqual(user_ids, {"user1", None})

                public_admin_sessions = list_sessions(tmp_path, user_id="admin")
                self.assertEqual(len(public_admin_sessions), 3)

                owner_sessions = list_sessions(tmp_path, user_id="owner_1")
                self.assertEqual(len(owner_sessions), 3)

                self.assertIsNone(find_session_path(user1_session["id"], tmp_path, user_id="user2"))
                self.assertIsNone(find_session_path(legacy_session["id"], tmp_path, user_id=None))
                self.assertIsNone(find_session_path("*", tmp_path, user_id="owner_1"))
                self.assertIsNotNone(find_session_path(user1_session["id"], tmp_path, user_id="owner_1"))

                clear_sessions(tmp_path, user_id=None)
                owner_sessions_after_anonymous_clear = list_sessions(tmp_path, user_id="owner_1")
                self.assertEqual(len(owner_sessions_after_anonymous_clear), 3)

                clear_sessions(tmp_path, user_id="user1")

                user1_sessions_after = list_sessions(tmp_path, user_id="user1")
                # Legacy session remains because user1 is not the owner and cannot delete it
                self.assertEqual(len(user1_sessions_after), 1)

                owner_sessions_after = list_sessions(tmp_path, user_id="owner_1")
                self.assertEqual(len(owner_sessions_after), 2)
                self.assertEqual({s["user_id"] for s in owner_sessions_after}, {"user2", None})
            finally:
                if previous_admin is None:
                    os.environ.pop("ARIA_ADMIN_USER_ID", None)
                else:
                    os.environ["ARIA_ADMIN_USER_ID"] = previous_admin


class QueryCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        from aria.auth import init_db, get_db_connection
        init_db()
        conn = get_db_connection()
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM query_cache")
            conn.commit()
            cur.close()
        finally:
            conn.close()
        
    def test_cache_hit_and_miss(self) -> None:
        from aria.cache import check_cache, store_cache
        from aria.core import ResearchResult, Evidence
        
        q1 = "What is the capital of France?"
        q2 = "What is France's capital city?"
        q3 = "How does photosynthesis work?"
        
        res = ResearchResult(
            question=q1,
            plan=["plan step"],
            answer="Paris is the capital of France.",
            verification="Passed",
            evidence=[Evidence(title="Paris Info", summary="Paris is France's capital.", source_type="web")]
        )
        
        # Cache is initially empty
        self.assertIsNone(check_cache(q1))
        
        # Store in cache
        store_cache(q1, res)
        
        # Direct lookup should hit
        hit1 = check_cache(q1)
        self.assertIsNotNone(hit1)
        self.assertTrue(hit1.cached)
        self.assertEqual(hit1.answer, res.answer)
        
        # Semantic lookup should also hit (q2 is very similar to q1)
        hit2 = check_cache(q2)
        self.assertIsNotNone(hit2)
        self.assertTrue(hit2.cached)
        
        # Unrelated lookup should miss
        miss = check_cache(q3)
        self.assertIsNone(miss)


class SourceDiversityTests(unittest.TestCase):
    def test_enforce_source_diversity(self) -> None:
        from aria.agent import enforce_source_diversity
        from aria.core import Evidence
        
        evidence = [
            # 4 items from the same web domain
            Evidence(title="Page 1", summary="content", source_type="web", url="https://wikipedia.org/wiki/A"),
            Evidence(title="Page 2", summary="content", source_type="web", url="https://wikipedia.org/wiki/B"),
            Evidence(title="Page 3", summary="content", source_type="web", url="https://wikipedia.org/wiki/C"),
            Evidence(title="Page 4", summary="content", source_type="web", url="https://wikipedia.org/wiki/D"),
            # 2 items from another web domain
            Evidence(title="Page 5", summary="content", source_type="web", url="https://arxiv.org/abs/1"),
            Evidence(title="Page 6", summary="content", source_type="web", url="https://arxiv.org/abs/2"),
            # 1 local document note (uses title for source identifier)
            Evidence(title="MyLocalDoc", summary="content", source_type="note", url=None)
        ]
        
        # Enforce max 2 per source
        diverse = enforce_source_diversity(evidence, max_per_source=2)
        
        # Should keep 2 from wikipedia, 2 from arxiv, 1 from MyLocalDoc -> total 5 items
        self.assertEqual(len(diverse), 5)
        
        wikipedia_items = [e for e in diverse if "wikipedia" in (e.url or "")]
        self.assertEqual(len(wikipedia_items), 2)
        
        arxiv_items = [e for e in diverse if "arxiv" in (e.url or "")]
        self.assertEqual(len(arxiv_items), 2)
        
        local_items = [e for e in diverse if e.url is None]
        self.assertEqual(len(local_items), 1)


class MultiTurnFollowUpTests(unittest.TestCase):
    def test_multi_turn_flow(self) -> None:
        from aria.agent import ResearchAgent
        from aria.core import Settings, Evidence, ResearchResult
        from aria.rag import VectorMemory
        
        settings = Settings.from_env()
        memory = VectorMemory(settings)
        agent = ResearchAgent(settings, memory)
        
        history = [
            {"question": "Who created Python?", "answer": "Guido van Rossum created Python."}
        ]
        
        # Test that _plan incorporates history
        queries = agent._plan("Where was he born?", history=history)
        self.assertTrue(len(queries) > 0)
        
        # Test that _draft incorporates history
        evidence = [
            Evidence(title="Guido Bio", summary="Guido van Rossum was born in the Netherlands.", source_type="web")
        ]
        answer = agent._draft("Where was he born?", evidence, history=history)
        self.assertIn("Netherlands", answer)


class OutputValidationTests(unittest.TestCase):
    def test_brief_validation(self) -> None:
        from pydantic import BaseModel, model_validator
        import re
        from aria.core import Evidence
        
        evidence = [
            Evidence(title="Source 1", summary="content", source_type="web")
        ]
        
        class ResearchBriefValidation(BaseModel):
            answer: str
            
            @model_validator(mode="after")
            def validate_brief(self) -> "ResearchBriefValidation":
                if not self.answer or not self.answer.strip():
                    raise ValueError("Research brief answer must not be empty.")
                if "no sufficient evidence found" in self.answer.lower():
                    return self
                citations = re.findall(r"\[(\d+)\]", self.answer)
                if not citations:
                    raise ValueError("Research brief must contain citations in bracketed format (e.g., [1]).")
                max_idx = len(evidence)
                for cit in citations:
                    idx = int(cit)
                    if idx < 1 or idx > max_idx:
                        raise ValueError(f"Citation [{idx}] is out of bounds.")
                return self
                
        # Valid brief (contains valid citation [1])
        valid = ResearchBriefValidation(answer="Paris is nice [1].")
        self.assertEqual(valid.answer, "Paris is nice [1].")
        
        # Valid brief (sufficient evidence fallback)
        fallback = ResearchBriefValidation(answer="No sufficient evidence found to answer the query.")
        self.assertEqual(fallback.answer, "No sufficient evidence found to answer the query.")
        
        # Invalid: empty brief
        with self.assertRaises(ValueError):
            ResearchBriefValidation(answer="")
            
        # Invalid: missing citations
        with self.assertRaises(ValueError):
            ResearchBriefValidation(answer="Paris is nice.")
            
        # Invalid: citation out of bounds ([2] is out of bounds since len(evidence) is 1)
        with self.assertRaises(ValueError):
            ResearchBriefValidation(answer="Paris is nice [2].")


class RateLimiterTests(unittest.TestCase):
    def test_in_memory_rate_limiter(self) -> None:
        from main import InMemoryRateLimiter
        from fastapi import HTTPException
        
        limiter = InMemoryRateLimiter(limit_per_minute=3)
        
        # 3 requests should pass
        limiter.check_rate_limit("user1")
        limiter.check_rate_limit("user1")
        limiter.check_rate_limit("user1")
        
        # 4th request should raise HTTPException with 429 status code
        with self.assertRaises(HTTPException) as ctx:
            limiter.check_rate_limit("user1")
        self.assertEqual(ctx.exception.status_code, 429)
        
        # Requests for a different user should pass
        limiter.check_rate_limit("user2")


class SourceTrustWeightingTests(unittest.TestCase):
    def test_trust_tier_mapping(self) -> None:
        from aria.core import Evidence
        from aria.agent import format_evidence

        # Check default mapping based on source_type
        ev_academic = Evidence(title="Paper", summary="details", source_type="arxiv")
        self.assertEqual(ev_academic.trust_tier, "academic")

        ev_ref = Evidence(title="Wiki", summary="details", source_type="wikipedia")
        self.assertEqual(ev_ref.trust_tier, "reference")

        ev_market = Evidence(title="Stock", summary="details", source_type="yfinance")
        self.assertEqual(ev_market.trust_tier, "market")

        ev_web = Evidence(title="Blog", summary="details", source_type="web")
        self.assertEqual(ev_web.trust_tier, "web")

        # Explicit override
        ev_explicit = Evidence(title="Custom", summary="details", source_type="web", trust_tier="academic")
        self.assertEqual(ev_explicit.trust_tier, "academic")

        # Formatting outputs trust_tier information
        formatted = format_evidence([ev_academic])
        self.assertIn("[Trust Tier: academic]", formatted)


class ExportableTraceTests(unittest.TestCase):
    def test_trace_report_generation(self) -> None:
        from aria.core import Evidence, ResearchResult
        from aria.reports import build_trace_report

        ev1 = Evidence(title="Acme Corp Overview", summary="Acme is a tech leader.", source_type="web", query="Acme tech", score=0.9, retrieved_via="duckduckgo_web")
        ev2 = Evidence(title="Acme Financials", summary="Acme revenue grew 15%.", source_type="yfinance", query="Acme revenue", score=0.85, retrieved_via="yfinance")

        result = ResearchResult(
            question="Analyze Acme Corp.",
            plan=["Acme tech", "Acme revenue"],
            answer="Acme is a tech leader [1].",
            verification="STATUS: PASSED\nCLAIMS_CONFIDENCE:\n- Claim 1 | Confidence 1.0",
            evidence=[ev1, ev2]
        )

        trace = build_trace_report(result)
        
        # Verify sub-queries exist
        self.assertIn("Acme tech", trace)
        self.assertIn("Acme revenue", trace)
        
        # Verify sources retrieved are mapped under their query sections
        self.assertIn("Acme Corp Overview", trace)
        self.assertIn("Acme Financials", trace)
        
        # Verify used / unused evidence classification
        self.assertIn("### Cited / Used Evidence", trace)
        self.assertIn("### Discarded / Unused Evidence", trace)
        
        # ev1 is cited (index 1), so it should be in the cited section
        # ev2 is NOT cited, so it should have a discard reason
        self.assertIn("Discard Reason: Not cited in final synthesized brief.", trace)
        
        # Verify verification block exists
        self.assertIn("STATUS: PASSED", trace)


class ComparativeModeTests(unittest.TestCase):
    def test_comparative_query_detection(self) -> None:
        from aria.agent import is_comparative_query

        # True cases
        self.assertTrue(is_comparative_query("compare react and vue"))
        self.assertTrue(is_comparative_query("Postgres vs MySQL performance"))
        self.assertTrue(is_comparative_query("which is better: iOS vs. Android"))
        self.assertTrue(is_comparative_query("Ruby versus Python web development"))
        self.assertTrue(is_comparative_query("Should I use NextJS or Remix?"))
        self.assertTrue(is_comparative_query("difference between REST and GraphQL"))
        self.assertTrue(is_comparative_query("comparison of AWS and GCP services"))

        # False cases
        self.assertFalse(is_comparative_query("what is the speed of light?"))
        self.assertFalse(is_comparative_query("summarize recent tech news"))
        self.assertFalse(is_comparative_query("latest price of TSLA stock"))


class RecurringResearchTests(unittest.TestCase):
    def test_research_result_serialization_recurring(self) -> None:
        from aria.core import ResearchResult, Evidence
        from aria.sessions import result_to_dict, result_from_dict

        result = ResearchResult(
            question="Test Q",
            plan=["plan"],
            answer="Answer",
            verification="verification",
            evidence=[Evidence(title="E1", summary="S1", source_type="web")],
            recurring_interval="weekly",
            last_run_at="2026-07-13T10:00:00Z"
        )

        d = result_to_dict(result)
        self.assertEqual(d["recurring_interval"], "weekly")
        self.assertEqual(d["last_run_at"], "2026-07-13T10:00:00Z")

        deserialized = result_from_dict(d)
        self.assertEqual(deserialized.recurring_interval, "weekly")
        self.assertEqual(deserialized.last_run_at, "2026-07-13T10:00:00Z")

    def test_generate_research_diff(self) -> None:
        from aria.core import Evidence, ResearchResult
        from aria.agent import generate_research_diff

        ev_old = Evidence(title="Acme Info", summary="Revenue $10M", source_type="web", url="https://acme.com")
        ev_new_same = Evidence(title="Acme Info", summary="Revenue $10M", source_type="web", url="https://acme.com")
        ev_new_added = Evidence(title="Acme Q2 Details", summary="Revenue grew to $15M", source_type="web", url="https://acme.com/q2")

        old_res = ResearchResult(
            question="Acme updates", plan=["acme"], answer="Acme revenue is $10M.", verification="OK", evidence=[ev_old]
        )
        # 1. No new sources, same answer
        new_res_same = ResearchResult(
            question="Acme updates", plan=["acme"], answer="Acme revenue is $10M.", verification="OK", evidence=[ev_new_same]
        )
        diff_same = generate_research_diff(old_res, new_res_same, None)
        self.assertFalse(diff_same["is_changed"])
        self.assertEqual(len(diff_same["new_evidence"]), 0)
        self.assertEqual(diff_same["changes"], "No significant changes found.")

        # 2. New source added
        new_res_diff = ResearchResult(
            question="Acme updates", plan=["acme"], answer="Acme revenue is $15M.", verification="OK", evidence=[ev_old, ev_new_added]
        )
        diff_new = generate_research_diff(old_res, new_res_diff, None)
        self.assertTrue(diff_new["is_changed"])
        self.assertEqual(len(diff_new["new_evidence"]), 1)
        self.assertEqual(diff_new["new_evidence"][0]["url"], "https://acme.com/q2")


class LocalOnlyOfflineModeTests(unittest.TestCase):
    def test_local_only_agent_nodes(self) -> None:
        from aria.agent import ResearchAgent
        from aria.core import Settings

        settings = Settings.from_env()
        agent = ResearchAgent(settings=settings, memory=None)

        # 1. Test node_plan in local_only mode
        state_plan = {
            "question": "test question",
            "plan": [],
            "evidence": [],
            "answer": "",
            "verification": "",
            "events": [],
            "iteration": 0,
            "use_web": True,
            "use_local": True,
            "use_finance": True,
            "max_iterations": 2,
            "field_focus": "all",
            "history": [],
            "validation_warning": False,
            "local_only": True
        }
        res_plan = agent.node_plan(state_plan)
        self.assertEqual(len(res_plan["plan"]), 1)
        self.assertIn("offline mode", res_plan["events"][0])

        # 2. Test complete fallback call in local_only mode
        from aria.core import Evidence
        ev1 = Evidence(title="Doc 1", summary="Data point A", source_type="web", url="https://a.com")
        ans = agent.llm.complete("System prompt", "User query", task="draft", evidence=[ev1], local_only=True)
        self.assertIn("Local Extractive Mode", ans)
        self.assertIn("Data point A", ans)


class GuestAccessTests(unittest.TestCase):
    def test_guest_rate_limiting(self) -> None:
        import main
        from fastapi import HTTPException

        main.GUEST_LIMITER.clear()

        # Call check_guest_rate_limit
        main.check_guest_rate_limit("1.2.3.4")
        main.check_guest_rate_limit("1.2.3.4")
        main.check_guest_rate_limit("1.2.3.4")

        with self.assertRaises(HTTPException) as ctx:
            main.check_guest_rate_limit("1.2.3.4")
        self.assertEqual(ctx.exception.status_code, 429)

        # Another IP should work
        main.check_guest_rate_limit("5.6.7.8")

    def test_get_current_user_or_guest(self) -> None:
        import main

        user = main.get_current_user_or_guest(token=None)
        self.assertEqual(user, "guest")


if __name__ == "__main__":
    unittest.main()
