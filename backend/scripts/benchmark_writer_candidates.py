import asyncio
import sys
import os
import time
import json
from dotenv import load_dotenv

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv(dotenv_path="D:/aria/backend/.env")
sys.path.insert(0, os.path.abspath("backend"))

from config import settings
from pipeline.nodes import route_query, plan_retrieval, retrieve_cascade, audit_answer, sanitize_answer, normalize_markers
from utils.token_tracker import TokenTracker, token_rate_limiter
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage

QUESTIONS = [
    ("Q1", "What is the definition and taxonomy of autonomous systems in artificial intelligence?"),
    ("Q2", "What are the off-target mitigation strategies for CRISPR gene editing?"),
    ("Q3", "What were the latest discoveries of the James Webb Space Telescope in 2024?")
]

CANDIDATES = [
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b"
]

async def run_single_query(writer_model: str, judge_model: str, q_id: str, query: str):
    print(f"\n---> Running [{q_id}] with Writer={writer_model}, Judge={judge_model}")
    start_time = time.time()
    tracker = TokenTracker(query_id=f"{writer_model}_{q_id}")
    
    state = {
        "query": query,
        "thread_id": f"bench_{q_id}_{int(time.time())}",
        "user_id": None,
        "compare_mode": False,
        "chat_history": [{"role": "user", "content": query}],
        "token_tracker": tracker
    }

    # 1. Route
    route_res = await route_query(state)
    state.update(route_res)

    # 2. Plan
    plan_res = plan_retrieval(state)
    state.update(plan_res)

    # 3. Retrieve
    retrieve_res = await retrieve_cascade(state)
    state.update(retrieve_res)
    chunks = state.get("retrieved_chunks", [])

    # 4. Configure candidate writer dynamically
    import pipeline.nodes as nodes
    writer_kwargs = {}
    if "gpt-oss" in writer_model:
        writer_kwargs["reasoning_effort"] = "low"
    nodes.groq_llm = ChatGroq(
        api_key=settings.groq_api_key,
        model_name=writer_model,
        temperature=0,
        **writer_kwargs
    )
    settings.groq_writer_model = writer_model
    settings.groq_judge_model = judge_model

    context = "\n\n".join([
        f"[[c:{i}]] {c.get('title', 'Unknown')} ({c.get('venue', c.get('source', 'Unknown'))})\n{c.get('snippet', c.get('content', ''))}" 
        for i, c in enumerate(chunks)
    ])
    synthesis_prompt = (
        "You are ARIA, an elite, highly accurate scientific research assistant.\n"
        "Draft a rigorous, clear answer based ONLY on the provided sources.\n"
        "Cite sources using ONLY numeric marker format: [[c:0]], [[c:1]], etc.\n"
        "Keep claim sentences concise: no claim longer than 300 characters.\n"
        "Output clean Markdown only."
    )
    messages = [
        SystemMessage(content=synthesis_prompt),
        HumanMessage(content=f"Query: {query}\n\nContext:\n{context}")
    ]

    await token_rate_limiter.check_and_pace(writer_model, estimated_tokens=700)
    synth_resp = await nodes.groq_llm.ainvoke(messages, max_tokens=700)
    tracker.record_from_response("synthesize_answer", synth_resp, model_name=writer_model)

    clean_ans = sanitize_answer(synth_resp.content, len(chunks))
    clean_ans = normalize_markers(clean_ans)
    state["draft_answer"] = clean_ans
    state["answer_final"] = clean_ans

    # 5. Audit with judge model
    audit_res = await audit_answer(state)

    state.update(audit_res)
    elapsed = round(time.time() - start_time, 2)

    final_claims = audit_res.get("claims", [])
    removed_claims = audit_res.get("removed_claims", [])

    supported_count = sum(1 for c in final_claims if c.get("status") == "supported")
    partial_count = sum(1 for c in final_claims if c.get("status") == "partially_supported")
    removed_count = len(removed_claims)

    tok_sum = tracker.summary()
    writer_tokens = sum(c["total_tokens"] for c in tok_sum["calls"] if c["model"] == writer_model)
    judge_tokens = sum(c["total_tokens"] for c in tok_sum["calls"] if c["model"] == judge_model)

    result = {
        "writer": writer_model,
        "judge": judge_model,
        "query_id": q_id,
        "supported": supported_count,
        "partial": partial_count,
        "removed": removed_count,
        "writer_tokens": writer_tokens,
        "judge_tokens": judge_tokens,
        "total_tokens": tok_sum["total_tokens"],
        "wall_clock": elapsed,
        "calls": tok_sum["calls"]
    }
    print(f"Result [{q_id}]: Supported={supported_count}, Partial={partial_count}, Removed={removed_count}, Tokens={tok_sum['total_tokens']} (Writer: {writer_tokens}, Judge: {judge_tokens}), WallClock={elapsed}s")
    return result

async def main():
    print("=" * 80)
    print("BENCHMARKING WRITER CANDIDATES (openai/gpt-oss-20b vs qwen/qwen3.8-27b)")
    print("Judge Model: openai/gpt-oss-120b (fixed)")
    print("=" * 80)

    results = []
    judge = "openai/gpt-oss-120b"

    for writer in CANDIDATES:
        print(f"\n{'#' * 80}\nEVALUATING WRITER: {writer}\n{'#' * 80}")
        for q_id, q_text in QUESTIONS:
            res = await run_single_query(writer, judge, q_id, q_text)
            results.append(res)
            # Sleep 10s between queries to avoid rolling pacing pauses
            await asyncio.sleep(10.0)

    print("\n" + "=" * 105)
    print("FINAL WRITER BENCHMARK SUMMARY TABLE")
    print("=" * 105)
    print(f"{'Writer Model':<20} | {'Query':<5} | {'Supported':<10} | {'Partial':<8} | {'Removed':<8} | {'Writer Tok':<11} | {'Judge Tok':<10} | {'Total Tok':<10} | {'Time (s)':<8}")
    print("-" * 105)
    for r in results:
        print(f"{r['writer']:<20} | {r['query_id']:<5} | {r['supported']:<10} | {r['partial']:<8} | {r['removed']:<8} | {r['writer_tokens']:<11} | {r['judge_tokens']:<10} | {r['total_tokens']:<10} | {r['wall_clock']:<8.2f}")
    print("=" * 105)

if __name__ == "__main__":
    asyncio.run(main())
