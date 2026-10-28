import asyncio
import sys
import os
import json
import uuid
import re
from dotenv import load_dotenv

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, "D:/aria/backend")
load_dotenv(dotenv_path="D:/aria/backend/.env")

from pipeline.nodes import route_query, plan_retrieval, retrieve_cascade, audit_answer, groq_llm, sanitize_answer
from langchain_core.messages import HumanMessage, SystemMessage

async def capture_query_events(query: str, query_label: str):
    print(f"\n>>> Running pipeline for [{query_label}] '{query}'...")
    thread_id = str(uuid.uuid4())
    current_state = {
        "query": query,
        "thread_id": thread_id,
        "user_id": None,
        "compare_mode": False,
        "chat_history": [{"role": "user", "content": query}]
    }
    
    events = []

    # 1. Start Event
    start_evt = {"event": "start", "thread_id": thread_id}
    events.append(start_evt)

    # 2. Route Phase
    route_res = await route_query(current_state)
    current_state.update(route_res)
    route_evt = {"event": "route", "route_decision": "cascade"}
    events.append(route_evt)

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
    events.append(retrieve_evt)

    # 5. Citation Events
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
            "cited": False,
            "rank": chunk.get("rank"),
            "published": chunk.get("published")
        }
        events.append(citation_payload)

    # 6. Token Events
    context = "\n\n".join([
        f"[[c:{i}]] {chunk.get('title', 'Unknown')} ({chunk.get('venue', chunk.get('source', 'Unknown'))})\n{chunk.get('snippet', chunk.get('content', ''))}" 
        for i, chunk in enumerate(chunks)
    ])
    synthesis_prompt = (
        "You are ARIA, an elite, highly accurate scientific research assistant.\n"
        "Draft a rigorous, clear answer based ONLY on the provided sources.\n\n"
        "STRICT CITATION & CONTENT RULES:\n"
        "1. Cite sources using ONLY numeric marker format: [[c:0]], [[c:1]], etc.\n"
        "2. Place the marker immediately after the supported claim, e.g. 'Brooks introduced the subsumption architecture [[c:0]].'\n"
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
    async for chunk in groq_llm.astream(messages):
        delta = chunk.content
        if delta:
            delta = delta.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
            delta = delta.replace("【", "[[").replace("】", "]]")
            full_answer += delta
            events.append({"event": "token", "delta": delta})

    clean_answer = sanitize_answer(full_answer, len(chunks))
    current_state["draft_answer"] = clean_answer
    current_state["answer_final"] = clean_answer

    # 7. Audit Phase
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
        "confidence": audit_res.get("confidence", 0.85),
        "tier_agreement": audit_res.get("tier_agreement"),
        "repaired": bool(audit_res.get("repaired", False)),
        "sources": sources_with_cited
    }
    events.append(audit_evt)

    # 8. Done Event
    events.append({"event": "done"})
    return events

def write_sse_file(path: str, events: list):
    with open(path, "w", encoding="utf-8") as f:
        for evt in events:
            f.write(f"data: {json.dumps(evt, ensure_ascii=False)}\n\n")
    print(f"Wrote {len(events)} events to {path}")

def update_mock_data_ts(okf_events, rag_events, live_events):
    mock_ts_path = "D:/aria/frontend/src/fixtures/mockData.ts"
    with open(mock_ts_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Find where retraction begins
    retraction_idx = content.find('  "retraction":')
    if retraction_idx == -1:
        raise ValueError("Could not find retraction fixture in mockData.ts")

    retraction_and_beyond = content[retraction_idx:]

    header = """export interface SSEEvent {
  event: string;
  [key: string]: any;
}

export interface MockFixture {
  id: string;
  query: string;
  label: string;
  events: SSEEvent[];
}

export const MOCK_FIXTURES: Record<string, MockFixture> = {
"""
    new_fixtures = f"""{header}  "okf": {{
    "id": "okf",
    "query": "What is the definition and taxonomy of autonomous systems in artificial intelligence?",
    "label": "OKF Resolvable: Autonomous Systems Taxonomy",
    "events": {json.dumps(okf_events, indent=6, ensure_ascii=False)}
  }},
  "rag": {{
    "id": "rag",
    "query": "What are the off-target mitigation strategies for CRISPR gene editing?",
    "label": "RAG Fallback: CRISPR Mitigation Strategies",
    "events": {json.dumps(rag_events, indent=6, ensure_ascii=False)}
  }},
  "live": {{
    "id": "live",
    "query": "What were the latest discoveries of the James Webb Space Telescope in 2024?",
    "label": "Live Web Search: JWST 2024 Discoveries",
    "events": {json.dumps(live_events, indent=6, ensure_ascii=False)}
  }},
{retraction_andBeyond}"""

    # Fix indentation if needed
    with open(mock_ts_path, "w", encoding="utf-8") as f:
        f.write(new_fixtures.replace("{retraction_andBeyond}", retraction_and_beyond))
    print(f"Updated {mock_ts_path} with fresh okf, rag, live fixtures.")

async def main():
    print("Recording Q1 (OKF)...")
    okf_events = await capture_query_events(
        query="What is the definition and taxonomy of autonomous systems in artificial intelligence?",
        query_label="OKF-RESOLVABLE"
    )
    write_sse_file("D:/aria/frontend/public/fixtures/okf.sse", okf_events)

    print("Recording Q2 (RAG)...")
    rag_events = await capture_query_events(
        query="What are the off-target mitigation strategies for CRISPR gene editing?",
        query_label="RAG-NEEDING (pgvector)"
    )
    write_sse_file("D:/aria/frontend/public/fixtures/rag.sse", rag_events)

    print("Recording Q3 (LIVE)...")
    live_events = await capture_query_events(
        query="What were the latest discoveries of the James Webb Space Telescope in 2024?",
        query_label="LIVE-SEARCH-NEEDING"
    )
    write_sse_file("D:/aria/frontend/public/fixtures/live.sse", live_events)

    print("Updating mockData.ts...")
    update_mock_data_ts(okf_events, rag_events, live_events)

    # Validate okf claims
    audit_evt = next((e for e in okf_events if e.get("event") == "audit"), None)
    if audit_evt:
        claims = audit_evt.get("claims", [])
        print(f"\nOKF Audit Claims count: {len(claims)}")
        uncited = [c for c in claims if c.get("status") == "uncited"]
        print(f"Uncited claims in OKF: {len(uncited)}")
        for c in claims:
            print(f"  [{c.get('status')}] {c.get('text')[:60]}... (cov: {c.get('coverage')})")

    print("\nAll fixtures re-recorded successfully!")

if __name__ == "__main__":
    asyncio.run(main())
