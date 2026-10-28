import asyncio
import sys
import os
import unittest
import logging
from unittest.mock import patch, MagicMock, AsyncMock

# Add backend to sys.path
sys.path.insert(0, os.path.abspath("backend"))

from utils.supabase_client import (
    shared_embeddings_cache,
    fetch_shared_okf_docs,
    search_pgvector,
    get_embed_model,
    get_supabase_headers,
    DeterministicHashEmbedder,
    settings
)
import httpx
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_search_fallback")

class TestSearchFallback(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        shared_embeddings_cache.clear()

    async def test_row_51_or_later_is_found(self):
        """
        Proves that a note in row 51 or later (index >= 50) is found by search_pgvector.
        Previously, limit=50 truncated the results and missed rows beyond index 49.
        """
        model = get_embed_model()
        query = "CRISPR Cas9 high-fidelity variant off-target mitigation"
        query_vec = list(model.embed([query]))[0]
        q_norm = float(np.linalg.norm(query_vec))

        # Generate 60 mock docs
        # Rows 0-49: low-similarity filler notes
        mock_docs = []
        for i in range(50):
            filler_vec = np.zeros(384, dtype=float)
            filler_vec[i % 384] = 0.05
            mock_docs.append({
                "id": f"doc-filler-{i}",
                "file_path": f"okf/filler_{i}.md",
                "type": "note",
                "topic": f"Unrelated Topic {i}",
                "source": "Seed Notes",
                "content": f"Filler content for document {i} that has nothing to do with gene editing.",
                "embedding": filler_vec.tolist()
            })

        # Row 55 (1-based row index 55, 0-based index 54): Target note on CRISPR
        target_vec = np.array(query_vec, dtype=float) # exact match vector
        mock_docs.append({
            "id": "doc-crispr-row-55",
            "file_path": "okf/row55_crispr_mitigation.md",
            "type": "note",
            "topic": "CRISPR Off-Target Mitigation High-Fidelity Enzymes",
            "source": "Seed Notes",
            "content": "Engineered Cas9 variants such as SpCas9-HF1 and eSpCas9 exhibit reduced non-specific genomic interactions.",
            "embedding": target_vec.tolist()
        })

        # Add a few more rows so total > 55
        for i in range(56, 62):
            filler_vec = np.zeros(384, dtype=float)
            filler_vec[i % 384] = 0.02
            mock_docs.append({
                "id": f"doc-filler-{i}",
                "file_path": f"okf/filler_{i}.md",
                "type": "note",
                "topic": f"Unrelated Topic {i}",
                "source": "Seed Notes",
                "content": f"Filler content {i}.",
                "embedding": filler_vec.tolist()
            })

        print(f"\n[TEST] Created {len(mock_docs)} mock okf_docs (target is at index 50, row 51+).")

        # Mock PostgREST client: RPC returns 404 (forcing fallback), GET returns pages of docs
        async def mock_get(url, headers=None, params=None):
            resp = MagicMock()
            resp.status_code = 200
            offset = params.get("offset", 0) if params else 0
            limit = params.get("limit", 200) if params else 200
            page = mock_docs[offset:offset + limit]
            resp.json.return_value = page
            return resp

        async def mock_post(url, headers=None, json=None):
            resp = MagicMock()
            resp.status_code = 404 # RPC not found, forces fallback
            return resp

        with patch("httpx.AsyncClient.post", side_effect=mock_post), \
             patch("httpx.AsyncClient.get", side_effect=mock_get):

            # Call 1: Cache MISS, fetches all docs, finds row 55
            results = await search_pgvector(query, limit=5, threshold=0.4)
            
            # Verify target doc in row 51+ was found!
            found_ids = [r["id"] for r in results]
            self.assertIn("doc-crispr-row-55", found_ids, "Target note in row 51+ MUST be found in search results!")
            target_result = next(r for r in results if r["id"] == "doc-crispr-row-55")
            self.assertGreater(target_result["similarity"], 0.90)
            print(f"[TEST PASS] Row 55 found! File: {target_result['file_path']}, Similarity: {target_result['similarity']}")

            # Verify Cache was populated
            self.assertTrue(shared_embeddings_cache.is_valid())
            self.assertEqual(len(shared_embeddings_cache.get()), len(mock_docs))

            # Call 2: Cache HIT
            with patch("utils.supabase_client.fetch_shared_okf_docs") as mock_fetch:
                results_hit = await search_pgvector(query, limit=5, threshold=0.4)
                mock_fetch.assert_not_called() # Proves cache was used, network not called
                self.assertIn("doc-crispr-row-55", [r["id"] for r in results_hit])
                print("[TEST PASS] Second query successfully used 10-minute in-memory cache (Cache HIT)!")

    async def test_pagination_and_500_warning(self):
        """Verifies pagination in pages of 200 and warning when >500 rows."""
        # 520 mock rows
        big_mock = [{"id": f"doc-{i}", "embedding": [0.1]*384} for i in range(520)]

        async def mock_get(url, headers=None, params=None):
            offset = params.get("offset", 0)
            limit = params.get("limit", 200)
            resp = MagicMock()
            resp.status_code = 200
            resp.json.return_value = big_mock[offset:offset+limit]
            return resp

        client = MagicMock()
        client.get = AsyncMock(side_effect=mock_get)

        with self.assertLogs("utils.supabase_client", level="WARNING") as cm:
            docs = await fetch_shared_okf_docs(client, headers={})
            self.assertEqual(len(docs), 520)
            self.assertTrue(any("More than 500 rows returned from okf_docs" in log for log in cm.output))
            print(f"[TEST PASS] Correctly fetched {len(docs)} rows in pages of 200 and logged warning for >500 rows.")

    async def test_fallback_when_onnx_fails(self):
        """When ONNX model fails to load, text fallback is activated with a warning."""
        fallback_model = DeterministicHashEmbedder()
        mock_kw_results = [
            {"id": "doc-kw-1", "file_path": "okf/crispr.md", "topic": "CRISPR", "content": "text"}
        ]
        with patch("utils.supabase_client.get_embed_model", return_value=fallback_model), \
             patch("utils.supabase_client.search_okf_docs", return_value=mock_kw_results) as mock_text_search, \
             self.assertLogs("utils.supabase_client", level="WARNING") as cm:

            results = await search_pgvector("gene editing", limit=5)
            mock_text_search.assert_called_once()
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["source_type"], "okf_text_fallback")
            self.assertIsNone(results[0]["similarity"])
            self.assertTrue(any("secondary okf_text_fallback" in log for log in cm.output))
            print("[TEST PASS] Fallback correctly activated with warning when ONNX embedder fails to load.")

    async def test_real_embedder_normal_operation_no_fallback_on_zero_matches(self):
        """When ONNX model works normally, zero threshold matches returns [] without text fallback."""
        with patch("utils.supabase_client.search_okf_docs") as mock_text_search:
            results = await search_pgvector("completely unrelated astronomical query", threshold=0.99, limit=5)
            mock_text_search.assert_not_called()
            self.assertEqual(results, [])
            print("[TEST PASS] Real embedder returned empty list on low similarity without triggering text fallback.")


async def print_live_supabase_row_count():
    """Print the live row count of okf_docs directly from Supabase."""
    headers = get_supabase_headers()
    headers["Prefer"] = "count=exact"
    url = f"{settings.supabase_url}/rest/v1/okf_docs"
    async with httpx.AsyncClient(timeout=6.0) as client:
        resp = await client.head(url, headers=headers)
        cr = resp.headers.get("content-range", "")
        get_resp = await client.get(url, headers=headers, params={"select": "id"})
        count = len(get_resp.json()) if get_resp.status_code == 200 else "error"
        print(f"\n==================================================")
        print(f"LIVE SUPABASE OKF_DOCS ROW COUNT:")
        print(f"HEAD Content-Range: {cr}")
        print(f"GET Returned Row Count: {count}")
        print(f"==================================================\n")

if __name__ == "__main__":
    asyncio.run(print_live_supabase_row_count())
    unittest.main()
