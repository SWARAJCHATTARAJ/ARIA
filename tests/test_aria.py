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
            save_session(result, Path(tmp))
            sessions = list_sessions(Path(tmp))
            loaded = load_session(sessions[0]["path"])

            self.assertEqual(loaded.question, result.question)
            self.assertEqual(loaded.evidence[0].source_id, "note:1")
            self.assertEqual(loaded.metrics["answer_tokens_est"], 3)


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
        self.assertFalse(is_developer_query("Compare supply chain risks"))

    def test_developer_query_fallback(self) -> None:
        from aria.agent import LLMClient
        client = LLMClient(Settings.from_env())
        client.openrouter_api_key = None
        res = client.complete("system", "Question: who built ARIA\n\nEvidence: [1] developer_profile", task="draft")
        self.assertIn("Swaraj Chattaraj", res)
        self.assertIn("Creator & Developer", res)


if __name__ == "__main__":
    unittest.main()
