import asyncio
import sys
import os
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from utils.academic_search import search_all_free_sources, search_duckduckgo

async def test_duckduckgo_resilience():
    print("=" * 80)
    print("TEST E.1: DUCKDUCKGO FAILURE RESILIENCE")
    print("Requirement: If DuckDuckGo returns nothing or a block page, continue with")
    print("OpenAlex, arXiv and Wikipedia without error.")
    print("=" * 80)

    query = "CRISPR-Cas9 off-target gene editing mitigation"

    # Case 1: DuckDuckGo throws an error or bot challenge / block page
    async def mock_failing_ddg(q, max_results=3):
        print("  [Mock] DuckDuckGo threw exception: '403 Forbidden: Bot anomaly detected / block page'")
        raise RuntimeError("DuckDuckGo block page encountered (simulated 403 / captcha challenge)")

    with patch("utils.academic_search.search_duckduckgo", side_effect=mock_failing_ddg):
        print("\nExecuting search_all_free_sources with DuckDuckGo FORCED TO FAIL...")
        results = await search_all_free_sources(query)

        print(f"\nTotal results retrieved from other providers: {len(results)}")
        source_types = set(r.get("source_type") for r in results)
        print(f"Source types present: {source_types}")

        assert len(results) > 0, "Pipeline should return results from surviving providers!"
        assert "duckduckgo" not in source_types, "DuckDuckGo results should be absent due to failure."
        assert any(t in source_types for t in ("arxiv", "openalex", "wikipedia")), "arXiv / OpenAlex / Wikipedia should succeed!"

        for r in results[:4]:
            print(f" - [{r.get('source_type')}] {r.get('title')[:60]} (venue: {r.get('venue')})")

    # Case 2: DuckDuckGo returns empty results / 0 results
    async def mock_empty_ddg(q, max_results=3):
        print("\n  [Mock] DuckDuckGo returned 0 results (empty response)")
        return []

    with patch("utils.academic_search.search_duckduckgo", side_effect=mock_empty_ddg):
        print("Executing search_all_free_sources with DuckDuckGo RETURNING EMPTY...")
        results_empty = await search_all_free_sources(query)
        print(f"Total results retrieved: {len(results_empty)}")
        assert len(results_empty) > 0, "Pipeline should continue with non-empty results from other providers!"

    print("\n" + "=" * 80)
    print("PASS: DuckDuckGo failure did not disrupt search pipeline. Other sources continued seamlessly.")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_duckduckgo_resilience())
