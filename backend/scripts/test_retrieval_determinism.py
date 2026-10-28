import asyncio
import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from dotenv import load_dotenv
load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))

from pipeline.nodes import plan_retrieval, retrieve_cascade

async def test_determinism():
    query = "What are the off-target mitigation strategies for CRISPR gene editing?"
    print("=" * 80)
    print("TESTING RETRIEVAL DETERMINISM (2 IDENTICAL RUNS)")
    print(f"Query: '{query}'")
    print("=" * 80)

    # RUN 1
    state1 = {"query": query, "compare_mode": False}
    plan1 = plan_retrieval(state1)
    state1.update(plan1)
    res1 = await retrieve_cascade(state1)
    scores1 = res1.get("rag_scores", [])
    sub_q1 = plan1.get("sub_queries", [])

    print("\n--- RUN 1 ---")
    print(f"Planner Sub-queries: {sub_q1}")
    print(f"RAG Scores:          {scores1}")
    for c in res1.get("retrieved_chunks", []):
        print(f"  [{c.get('tier')}] {c.get('title')} (sim: {c.get('similarity')})")

    # RUN 2
    state2 = {"query": query, "compare_mode": False}
    plan2 = plan_retrieval(state2)
    state2.update(plan2)
    res2 = await retrieve_cascade(state2)
    scores2 = res2.get("rag_scores", [])
    sub_q2 = plan2.get("sub_queries", [])

    print("\n--- RUN 2 ---")
    print(f"Planner Sub-queries: {sub_q2}")
    print(f"RAG Scores:          {scores2}")
    for c in res2.get("retrieved_chunks", []):
        print(f"  [{c.get('tier')}] {c.get('title')} (sim: {c.get('similarity')})")

    print("\n" + "=" * 80)
    scores_match = (scores1 == scores2)
    sub_queries_match = (sub_q1 == sub_q2)
    print(f"Sub-queries Match: {sub_queries_match}")
    print(f"Scores Match:      {scores_match}")
    print("DETERMINISM TEST PASSED" if (scores_match and sub_queries_match) else "DETERMINISM TEST FAILED")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_determinism())
