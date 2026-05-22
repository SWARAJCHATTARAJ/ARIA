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


class SearchModesTestCase(unittest.TestCase):
    def setUp(self):
        # Override collection name to avoid polluting production data
        os.environ["ARIA_COLLECTION"] = "aria_test_selective_search"
        self.settings = Settings.from_env()
        self.memory = VectorMemory(self.settings)
        self.memory.reset()
        
        # Ingest some specific dummy test content
        self.memory.ingest_text(
            "Secret Project X is a solar powered drone designed by Swaraj in 2026.", 
            source_name="project_x.txt", 
            source_type="note"
        )
        self.agent = ResearchAgent(self.settings, self.memory)

    def tearDown(self):
        self.memory.reset()

    def test_local_only_mode(self):
        # Local only: should find the local project info
        result = self.agent.run(
            question="What is Secret Project X?", 
            use_web=False, 
            use_local=True, 
            max_iterations=1
        )
        # Verify local evidence was retrieved
        local_evidences = [e for e in result.evidence if e.source_type == "note"]
        self.assertTrue(len(local_evidences) > 0)
        self.assertIn("Secret Project X", local_evidences[0].summary)
        
        # Verify no web evidence was retrieved
        web_evidences = [e for e in result.evidence if e.source_type in ("wikipedia", "web", "research")]
        self.assertEqual(len(web_evidences), 0)

    def test_web_only_mode(self):
        # Web only: should NOT retrieve the local project info
        result = self.agent.run(
            question="What is Secret Project X?", 
            use_web=True, 
            use_local=False, 
            max_iterations=1
        )
        # Verify no local evidence was retrieved
        local_evidences = [e for e in result.evidence if e.source_type == "note"]
        self.assertEqual(len(local_evidences), 0)

    def test_global_summary_fallback(self):
        # A global summary question: should retrieve all local chunks directly
        result = self.agent.run(
            question="Summarize my indexed documents.", 
            use_web=False, 
            use_local=True, 
            max_iterations=1
        )
        # Verify the chunks were fetched directly and are part of the evidence
        self.assertTrue(len(result.evidence) > 0)
        self.assertIn("Secret Project X", result.evidence[0].summary)


class ReportTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()

