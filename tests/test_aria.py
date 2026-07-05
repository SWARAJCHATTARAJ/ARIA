import os
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"
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
                self.assertEqual(user1_sessions[1]["user_id"], "user1")

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


if __name__ == "__main__":
    unittest.main()
