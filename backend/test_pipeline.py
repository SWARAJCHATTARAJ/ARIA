import asyncio
import sys
import os
import time
import json
import uuid
import re
from dotenv import load_dotenv

# Ensure UTF-8 output in Windows console
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

# Load .env first before importing config/pipeline
load_dotenv(dotenv_path="D:/aria/backend/.env")

from pipeline.nodes import route_query, plan_retrieval, retrieve_cascade, audit_answer, groq_llm
from config import settings
from utils.token_tracker import TokenTracker, token_rate_limiter
from langchain_core.messages import HumanMessage, SystemMessage

async def stream_query_sse(query: str, query_label: str, compare_mode: bool = False):
    start_wall_clock = time.time()
    print("=" * 80)
    print(f"QUERY: [{query_label}] '{query}' (Compare Mode: {compare_mode})")
    print("=" * 80)
    print("--- SERVER-SENT EVENTS (SSE) STREAM ---")

    thread_id = str(uuid.uuid4())
    tracker = TokenTracker(query_id=thread_id)
    current_state = {
        "query": query,
        "thread_id": thread_id,
        "user_id": None,
        "compare_mode": compare_mode,
        "chat_history": [{"role": "user", "content": query}],
        "token_tracker": tracker
    }

    # 1. Start Event
    start_evt = {"event": "start", "thread_id": thread_id}
    print(f"data: {json.dumps(start_evt)}")

    try:
        # 2. Route Phase
        route_res = await route_query(current_state)
        current_state.update(route_res)
        route_evt = {
            "event": "route",
            "route_decision": "cascade"
        }
        print(f"data: {json.dumps(route_evt)}")

        # 3. Plan Phase
        plan_res = plan_retrieval(current_state)
        current_state.update(plan_res)

        # 4. Retrieve Phase
        retrieve_res = await retrieve_cascade(current_state)
        current_state.update(retrieve_res)

        chunks = current_state.get("retrieved_chunks", [])
        sources_summary = [
            {
                "source": c.get("source"),
                "source_type": c.get("source_type", "unknown"),
                "tier": c.get("tier", "LIVE"),
                "similarity": c.get("similarity"),
                "is_retracted": c.get("is_retracted", False),
                "rank": c.get("rank"),
                "published": c.get("published"),
                "cited": False
            }
            for c in chunks
        ]
        retrieve_evt = {
            "event": "retrieve",
            "tiers": current_state.get("tiers_fired", []),
            "okf_node_paths": current_state.get("okf_node_paths", []),
            "rag_scores": current_state.get("rag_scores", []),
            "sources": sources_summary
        }
        print(f"data: {json.dumps(retrieve_evt)}")

        # 5. Citation Events (All 13 display fields including review_status; null when absent, never empty string)
        for i, chunk in enumerate(chunks):
            rev_status = chunk.get("review_status")
            if not rev_status:
                if chunk.get("tier") == "OKF":
                    rev_status = "draft" if chunk.get("confidence") == "draft" else "verified"
                elif chunk.get("tier") == "RAG":
                    rev_status = "draft" if chunk.get("confidence") == "draft" else "verified"
                elif chunk.get("source_type") == "openalex":
                    rev_status = "scholarly"
                elif chunk.get("source_type") == "arxiv":
                    rev_status = "preprint"
                else:
                    rev_status = "unreviewed_web"

            citation_payload = {
                "event": "citation",
                "id": i,
                "title": chunk.get("title") or None,
                "path": chunk.get("path") or chunk.get("node_path") or None,
                "url": chunk.get("url") or None,
                "authors": chunk.get("authors") or None,
                "year": chunk.get("year") or None,
                "venue": chunk.get("venue") or None,
                "snippet": chunk.get("snippet") or chunk.get("content") or None,
                "source_type": chunk.get("source_type") or "unknown",
                "tier": chunk.get("tier") or "LIVE",
                "doi": chunk.get("doi") or None,
                "arxiv_id": chunk.get("arxiv_id") or None,
                "is_retracted": bool(chunk.get("is_retracted", False)),
                "review_status": rev_status,
                "similarity": chunk.get("similarity"),
                "cited": False,
                "rank": chunk.get("rank"),
                "published": chunk.get("published")
            }
            print(f"data: {json.dumps(citation_payload)}")

        # 6. Token Events (Real Groq streaming deltas, strict [[c:ID]] markers, Markdown only)
        context = "\n\n".join([
            f"[[c:{i}]] {chunk.get('title', 'Unknown')} ({chunk.get('venue', chunk.get('source', 'Unknown'))})\n{chunk.get('snippet', chunk.get('content', ''))}" 
            for i, chunk in enumerate(chunks)
        ])
        synthesis_prompt = (
            "You are ARIA, an elite, highly accurate scientific research assistant.\n"
            "Draft a rigorous, clear answer based ONLY on the provided sources.\n\n"
            "STRICT CITATION & CONTENT RULES:\n"
            "1. Cite sources using ONLY numeric marker format: [[c:0]], [[c:1]], etc.\n"
            "2. Place the citation marker immediately after EVERY supported claim. Every single sentence, bullet point, and table row MUST end with its own [[c:N]] citation marker (e.g. 'Brooks introduced the subsumption architecture [[c:0]].'). Never output a bullet point or table row without its own [[c:N]] marker.\n"
            "3. Name the site or paper, NEVER the search engine (e.g. refer to arXiv or the publication title, NEVER mention DuckDuckGo, Google, or search engines).\n"
            "4. NEVER write the words 'snippet', 'context', or 'provided context'; refer to them ONLY as 'the sources'.\n"
            "5. Don't state anything the sources don't say. Strictly avoid extrapolations, unmentioned mechanisms, or claims like 'for the first time' unless explicitly stated in the sources.\n"
            "6. Do NOT include a Summary section unless the answer has 4 or more paragraphs.\n"
            "7. Do NOT write recap sentences.\n"
            "8. Use Markdown tables ONLY when presenting 3 or more comparable items.\n"
            "9. If the sources don't answer the question, say so in one sentence and stop. Do NOT pad with 'a source mentions X but says nothing'.\n"
            "10. If the cited sources answer only part of the question, say so in one sentence in the answer.\n"
            "11. Use ONLY citation IDs that exist in the context (0 through N-1).\n"
            "12. Output clean Markdown ONLY. Absolutely NO raw HTML tags (e.g., do NOT use <br>, <p>, or <div>). Use markdown newlines and paragraphs.\n"
            "13. Keep claim sentences concise: no claim longer than 300 characters."
        )
        messages = [
            SystemMessage(content=synthesis_prompt),
            HumanMessage(content=f"Query: {current_state['query']}\n\nContext:\n{context}")
        ]
        full_answer = ""
        token_count = 0
        full_resp = None
        try:
            await token_rate_limiter.check_and_pace(settings.groq_writer_model, estimated_tokens=700)
            async for chunk in groq_llm.astream(messages, max_tokens=700):
                full_resp = chunk if full_resp is None else full_resp + chunk
                delta = chunk.content
                if delta:
                    delta = delta.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
                    delta = delta.replace("【", "[[").replace("】", "]]")
                    full_answer += delta
                    token_count += 1
                    token_evt = {"event": "token", "delta": delta}
                    print(f"data: {json.dumps(token_evt)}")
        except Exception as stream_err:
            err_str = str(stream_err).lower()
            is_busy = "429" in err_str or "rate limit" in err_str or "ratelimit" in err_str or "timeout" in err_str or "timed out" in err_str or isinstance(stream_err, (asyncio.TimeoutError, httpx.TimeoutException))
            if is_busy:
                headers = getattr(stream_err, "response", None)
                hdr_dict = dict(headers.headers) if headers and hasattr(headers, "headers") else {}
                token_rate_limiter.log_groq_429(settings.groq_writer_model, hdr_dict, str(stream_err))
                print(f"data: {json.dumps({'event': 'error', 'message': 'ARIA is busy right now, try again in a few minutes'})}")
                print(f"data: {json.dumps({'event': 'done'})}")
                return tracker.summary()
            raise stream_err

        if full_resp:
            tracker.record_from_response("synthesis_stream", full_resp, model_name=settings.groq_writer_model)

        from pipeline.nodes import sanitize_answer
        clean_answer = sanitize_answer(full_answer, len(chunks))
        current_state["draft_answer"] = clean_answer
        current_state["answer_final"] = clean_answer

        # 7. Audit Phase (Runs on finished answer)
        audit_res = await audit_answer(current_state)
        current_state.update(audit_res)
        final_answer = audit_res.get("answer_final", clean_answer)
        cited_ids = set(int(m) for m in re.findall(r'\[+c:(\d+)\]+', final_answer))
        sources_with_cited = [
            {**s, "cited": (idx in cited_ids)}
            for idx, s in enumerate(sources_summary)
        ]
        audit_evt = {
            "event": "audit",
            "answer_final": final_answer,
            "claims": audit_res.get("claims", []),
            "removed_claims": audit_res.get("removed_claims", []),
            "conflicts": audit_res.get("conflicts_found", []),
            "retractions": audit_res.get("retractions_found", []),
            "confidence": audit_res.get("confidence") if audit_res.get("confidence") is not None else 0.85,
            "tier_agreement": audit_res.get("tier_agreement"),
            "repaired": bool(audit_res.get("repaired", False)),
            "sources": sources_with_cited
        }
        print(f"data: {json.dumps(audit_evt)}")

        # 8. Done Event
        done_evt = {"event": "done"}
        print(f"data: {json.dumps(done_evt)}")

        elapsed_sec = round(time.time() - start_wall_clock, 2)
        tok_sum = tracker.summary()
        tok_sum["wall_clock_seconds"] = elapsed_sec
        print("\n" + "-" * 70)
        print(f"GROQ TOKEN SUMMARY FOR [{query_label}] (Wall-clock: {elapsed_sec}s)")
        print(f"Model calls: {tok_sum['model_calls']}")
        print(f"Prompt tokens: {tok_sum['prompt_tokens']}")
        print(f"Completion tokens: {tok_sum['completion_tokens']}")
        print(f"Reasoning tokens: {tok_sum.get('reasoning_tokens', 0)}")
        print(f"Total tokens: {tok_sum['total_tokens']}")
        print("Model call breakdown:")
        for c in tok_sum['calls']:
            print(f"  - {c['name']:20} ({c.get('model', '')}) -> Prompt: {c['prompt_tokens']:4} | Completion: {c['completion_tokens']:4} (reasoning: {c.get('reasoning_tokens', 0):3}) | Total: {c['total_tokens']:4} | Usage: {c.get('usage', {})}")
        print("-" * 70 + "\n\n")
        return tok_sum

    except Exception as e:
        err_str = str(e).lower()
        is_busy = "429" in err_str or "rate limit" in err_str or "ratelimit" in err_str or "timeout" in err_str or "timed out" in err_str
        if is_busy:
            err_evt = {"event": "error", "message": "ARIA is busy right now, try again in a few minutes"}
            print(f"data: {json.dumps(err_evt)}")
            done_evt = {"event": "done"}
            print(f"data: {json.dumps(done_evt)}")
        else:
            err_evt = {"event": "error", "message": str(e)}
            print(f"data: {json.dumps(err_evt)}")
        return tracker.summary()

    print("\n")

async def main():
    args = [a.lower() for a in sys.argv[1:]]
    run_all = len(args) == 0

    summaries = {}

    if run_all or "q1" in args:
        # 1. OKF Query: Answerable directly by local verified personal OKF graph
        s1 = await stream_query_sse(
            query="What is the definition and taxonomy of autonomous systems in artificial intelligence?",
            query_label="Q1 (OKF-RESOLVABLE)"
        )
        summaries["Q1"] = s1

    if run_all or "q2" in args:
        # 2. RAG Query: Answerable via pgvector dense retrieval in Supabase okf_docs
        s2 = await stream_query_sse(
            query="What are the off-target mitigation strategies for CRISPR gene editing?",
            query_label="Q2 (RAG-NEEDING)"
        )
        summaries["Q2"] = s2

    if run_all or "q3" in args:
        # 3. LIVE Query: Requires live external multi-source search (arXiv, OpenAlex, DDGS, Wikipedia)
        s3 = await stream_query_sse(
            query="What were the latest discoveries of the James Webb Space Telescope in 2024?",
            query_label="Q3 (LIVE-SEARCH-NEEDING)"
        )
        summaries["Q3"] = s3

    print("\n" + "=" * 95)
    print("GROQ CAPACITY SUMMARY TABLE (Q1, Q2, Q3)")
    print("=" * 95)
    print(f"{'Query':<8} | {'Model Calls':<12} | {'Prompt Tokens':<14} | {'Completion Tokens':<18} | {'Reasoning Tokens':<18} | {'Total Tokens':<12} | {'Wall Clock (s)':<14}")
    print("-" * 112)
    for q_name, s in summaries.items():
        if s:
            print(f"{q_name:<8} | {s['model_calls']:<12} | {s['prompt_tokens']:<14} | {s['completion_tokens']:<18} | {s.get('reasoning_tokens', 0):<18} | {s['total_tokens']:<12} | {s.get('wall_clock_seconds', 0.0):<14.2f}")
    print("=" * 112 + "\n")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    asyncio.run(main())
