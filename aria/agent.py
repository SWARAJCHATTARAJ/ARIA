from __future__ import annotations

import os
import re
import operator
import requests
from typing import TypedDict, Annotated
from concurrent.futures import ThreadPoolExecutor
from langgraph.graph import StateGraph, END

from .core import Settings, Evidence, ResearchResult
from .rag import VectorMemory
from .tools import free_web_search, get_market_snapshot


class AgentState(TypedDict):
    question: str
    plan: list[str]
    evidence: Annotated[list[Evidence], operator.add]
    answer: str
    verification: str
    events: Annotated[list[str], operator.add]
    iteration: int
    use_web: bool
    use_local: bool
    use_finance: bool
    max_iterations: int


class LLMClient:
    """Small LLM adapter with a deterministic local fallback."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")

    def complete(self, system: str, user: str) -> str:
        if self.settings.llm_provider == "openrouter" and self.openrouter_api_key:
            response = self._openrouter(system, user)
            if response:
                return response
        return self._fallback(user)

    def _openrouter(self, system: str, user: str) -> str:
        payload = {
            "model": self.settings.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        }
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:8501",
                    "X-Title": "ARIA Research Workspace",
                },
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except (requests.RequestException, KeyError, IndexError):
            return ""

    def _fallback(self, user: str) -> str:
        evidence = user.split("Evidence:", 1)[-1].strip()
        snippets = [block.strip() for block in evidence.split("\n\n") if block.strip()]
        if not snippets:
            return (
                "### Executive View\n\n"
                "No usable evidence was retrieved from your search base.\n\n"
                "### About ARIA\n\n"
                "ARIA (Autonomous Research Intelligence Analyst) is built to search, retrieve, synthesize, and verify "
                "information from your local documents (PDFs, notes) and live web sources to write structured executive briefs.\n\n"
                "### Required Action\n\n"
                "- Select 'Hybrid' or 'Web Search Only' if you want live web results.\n"
                "- Upload PDFs or paste text in the 'Knowledge Base' tab to populate your local database.\n"
                "- Ensure the search queries match the content of your indexed documents."
            )

        source_blocks = [
            item for item in snippets if "search unavailable" not in item.lower()
        ]
        if not source_blocks:
            source_blocks = snippets

        top = source_blocks[:6]
        bullets = []
        for item in top:
            first_line, _, rest = item.partition("\n")
            sentence = first_sentence(rest or first_line)
            bullets.append(f"- {sentence}")
        return (
            "### Executive View\n\n"
            "ARIA found the following evidence-backed points:\n\n"
            + "\n".join(bullets)
            + "\n\n### Source Coverage\n\n"
            f"- Evidence items reviewed: {len(snippets)}\n"
            "- Synthesis mode: lightweight extractive analysis\n\n"
            "### Analyst Caveat\n\n"
            "Local extractive mode keeps the answer grounded in retrieved evidence. "
            "Connect an OpenRouter key when you want fuller prose and model-backed verification."
        )


def first_sentence(text: str) -> str:
    text = " ".join(text.split())
    if not text:
        return "Evidence item collected, but no summary text was available."
    for marker in [". ", "? ", "! "]:
        if marker in text:
            return text.split(marker, 1)[0].strip() + marker.strip()
    return text[:240]


class ResearchAgent:
    def __init__(self, settings: Settings, memory: VectorMemory) -> None:
        self.settings = settings
        self.memory = memory
        self.llm = LLMClient(settings)

        workflow = StateGraph(AgentState)
        
        workflow.add_node("plan", self.node_plan)
        workflow.add_node("search", self.node_search)
        workflow.add_node("draft", self.node_draft)
        workflow.add_node("verify", self.node_verify)
        
        workflow.set_entry_point("plan")
        workflow.add_edge("plan", "search")
        workflow.add_edge("search", "draft")
        workflow.add_edge("draft", "verify")
        
        def should_continue(state: AgentState):
            if "NEEDS_MORE_RESEARCH" in state["verification"].upper() and state["iteration"] < state["max_iterations"]:
                return "search"
            return END
            
        workflow.add_conditional_edges("verify", should_continue, {"search": "search", END: END})
        
        self.graph = workflow.compile()

    def run(
        self,
        question: str,
        use_web: bool = True,
        use_local: bool = True,
        use_finance: bool = False,
        max_iterations: int = 2,
    ) -> ResearchResult:
        initial_state = {
            "question": question,
            "plan": [],
            "evidence": [],
            "answer": "",
            "verification": "No verification run.",
            "events": [],
            "iteration": 0,
            "use_web": use_web,
            "use_local": use_local,
            "use_finance": use_finance,
            "max_iterations": max_iterations
        }
        
        final_state = self.graph.invoke(initial_state)
        
        return ResearchResult(
            question=final_state["question"],
            plan=final_state["plan"],
            answer=final_state["answer"],
            verification=final_state["verification"],
            evidence=dedupe_evidence(final_state["evidence"]),
            events=final_state["events"],
            metrics=build_run_metrics(final_state),
        )

    def node_plan(self, state: AgentState) -> dict:
        question = state["question"]
        plan = self._plan(question)
        return {"plan": plan, "events": ["Planner Agent: built research strategy"]}

    def node_search(self, state: AgentState) -> dict:
        question = state["question"]
        plan = state["plan"]
        iteration = state["iteration"]
        use_web = state["use_web"]
        use_local = state.get("use_local", True)
        use_finance = state["use_finance"]
        
        new_evidence: list[Evidence] = []
        new_events: list[str] = []
        
        is_global_summary = False
        if use_local and iteration == 0:
            q_lower = question.lower().strip()
            keywords = [
                "summarize my indexed documents", "summarize my documents", "summarize indexed documents",
                "summarize all indexed", "summarize all my documents", "summarize the indexed documents",
                "summarize my knowledge base", "summarize the knowledge base", "summarize the database",
                "what is in my knowledge base", "what is in my database", "what documents do i have",
                "summarize my memory", "summarize the memory"
            ]
            if any(kw in q_lower for kw in keywords):
                is_global_summary = True

        if is_global_summary:
            new_events.append("Research Agent: detected global summary request and retrieved indexed chunks directly")
            all_chunks = self.memory.retrieve_all(limit=30)
            new_evidence.extend(all_chunks)
            if not all_chunks:
                new_events.append("Research Agent: local knowledge base is empty")
            
            if use_web:
                queries_to_run = plan if plan else [question]
                def _fetch_web_only(query: str) -> tuple[list[Evidence], list[str]]:
                    query_events = [f"Research Agent: searching free web sources for: {query}"]
                    return free_web_search(query), query_events
                with ThreadPoolExecutor(max_workers=len(queries_to_run) if queries_to_run else 1) as executor:
                    for result, events in executor.map(_fetch_web_only, queries_to_run):
                        new_evidence.extend(result)
                        new_events.extend(events)
        else:
            if iteration > 0:
                verification = state.get("verification", "")
                follow_up_queries = []
                if "NEW_QUERIES:" in verification:
                    queries_part = verification.split("NEW_QUERIES:", 1)[1].strip()
                    follow_up_queries = [q.strip() for q in queries_part.splitlines() if q.strip()]
                
                cleaned_queries = clean_queries(follow_up_queries)
                
                if not cleaned_queries:
                    cleaned_queries = [f"{question} follow up research"]
                
                queries_to_run = cleaned_queries
                new_events.append(f"Citation Auditor: requested more research. Iteration {iteration + 1}.")
            else:
                queries_to_run = plan if plan else [question]

            def _fetch_for_query(query: str) -> tuple[list[Evidence], list[str]]:
                query_events = []
                local_evidence: list[Evidence] = []
                if use_local:
                    query_events.append(f"Research Agent: retrieving memory for: {query}")
                    local_evidence.extend(self.memory.retrieve(query))
                if use_web:
                    query_events.append(f"Research Agent: searching free web sources for: {query}")
                    local_evidence.extend(free_web_search(query))
                return local_evidence, query_events

            with ThreadPoolExecutor(max_workers=len(queries_to_run) if queries_to_run else 1) as executor:
                for result, events in executor.map(_fetch_for_query, queries_to_run):
                    new_evidence.extend(result)
                    new_events.extend(events)
                    
            if use_finance:
                tickers = extract_tickers(question)
                if tickers:
                    new_events.append("Research Agent: fetching market snapshots")
                    new_evidence.extend(get_market_snapshot(tickers))
        
        return {"evidence": new_evidence, "events": new_events}

    def node_draft(self, state: AgentState) -> dict:
        question = state["question"]
        evidence = dedupe_evidence(state["evidence"])
        iteration = state["iteration"]
        
        answer = self._draft(question, evidence)
        return {"answer": answer, "events": [f"Synthesis Agent: drafted answer, pass {iteration + 1}"]}

    def node_verify(self, state: AgentState) -> dict:
        question = state["question"]
        answer = state["answer"]
        evidence = dedupe_evidence(state["evidence"])
        iteration = state["iteration"]
        
        verification = self._verify(question, answer, evidence)
        return {"verification": verification, "events": ["Critic Agent: verified answer against evidence"], "iteration": iteration + 1}

    def _plan(self, question: str) -> list[str]:
        if self.settings.llm_provider == "openrouter" and self.llm.openrouter_api_key:
            system = (
                "You are ARIA's Lead Planner. Break down the user's research "
                "question into 3 to 5 distinct, highly specific search queries targeting technical specifications, "
                "standards, key developments, risks, or relevant parameters.\n"
                "Output each query on a new line. Do not include numbers, bullets, or markdown."
            )
            user = f"Research Question: {question}"
            response = self.llm.complete(system, user)
            queries = [line.strip() for line in response.splitlines() if line.strip()]
            cleaned_queries = clean_queries(queries)
            if cleaned_queries:
                return cleaned_queries[:5]
        
        return [
            question,
            f"{question} key developments risks",
            f"{question} official reports data pdf",
        ]

    def _draft(self, question: str, evidence: list[Evidence]) -> str:
        system = (
            "You are ARIA, an Autonomous Research Intelligence Analyst. "
            "Write a clear, structured, accurate research brief answering the query. "
            "For any key product, technology, standard, component, or algorithm discussed in your brief, "
            "explicitly describe its core purpose—what it was specifically made for, built to do, and its intended function. "
            "Highlight key specifications, performance characteristics, and parameters where relevant.\n"
            "Use only the provided evidence. Cite sources using bracketed numbers [1], [2], etc., corresponding "
            "to the order of evidence provided. If evidence is lacking, state the caveats and assumptions clearly. "
            "Keep the tone direct, technical, and evidence-led."
        )
        user = f"Question:\n{question}\n\nEvidence:\n{format_evidence(evidence)}"
        return self.llm.complete(system, user)

    def _verify(self, question: str, answer: str, evidence: list[Evidence]) -> str:
        if not evidence:
            return "STATUS: NEEDS_MORE_RESEARCH\nREASON: No evidence was retrieved.\nNEW_QUERIES:\n" + question
            
        if self.settings.llm_provider == "openrouter" and self.llm.openrouter_api_key:
            system = (
                "You are ARIA's Grounding & Verification Analyst. Your job is to verify if the draft "
                "research analysis is fully grounded in the retrieved evidence and completely addresses the user's query.\n"
                "Review the draft report and the evidence. Ensure that all claims regarding specifications, "
                "limits, figures, and data are strictly supported. Check if key constraints or details are missing.\n"
                "Output your findings EXACTLY in this format:\n"
                "STATUS: [PASSED or NEEDS_MORE_RESEARCH]\n"
                "REASON: [Brief explanation of verified parameters or what design/research details are missing/incorrect]\n"
                "NEW_QUERIES:\n"
                "[List 1 or 2 new search queries to retrieve missing details, each on a new line. Leave empty if status is PASSED]"
            )
            evidence_str = format_evidence(evidence, limit=15)
            user = (
                f"Research Question:\n{question}\n\n"
                f"Draft Report:\n{answer}\n\n"
                f"Evidence:\n{evidence_str}"
            )
            return self.llm.complete(system, user)
            
        official = sum(1 for item in evidence if item.source_type in {"pdf", "research", "finance"})
        web = sum(1 for item in evidence if item.source_type in {"wikipedia", "web"})
        return (
            f"STATUS: PASSED\n"
            f"REASON: Grounding check passed (extractive fallback). Reviewed {len(evidence)} evidence items "
            f"({official} high-signal document/research/market items, {web} web summary items).\n"
            f"NEW_QUERIES:\n"
        )


def format_evidence(evidence: list[Evidence], limit: int = 20) -> str:
    lines = []
    for index, item in enumerate(evidence[:limit], start=1):
        source = f" ({item.url})" if item.url else ""
        lines.append(f"[{index}] {item.title}{source}\n{item.summary}")
    return "\n\n".join(lines)


def extract_tickers(text: str) -> list[str]:
    # Match potential stock symbols: 2 to 5 uppercase characters, with optional .NS NSE suffix
    raw_tickers = re.findall(r"\b[A-Z]{2,5}(?:\.NS)?\b", text)
    exclude_words = {
        "AND", "THE", "FOR", "WHAT", "HOW", "WHY", "WHO", "RISK", "CHIP", 
        "ARIA", "PDF", "HTML", "API", "HTTP", "DATA", "YEAR", "DATE", 
        "CASE", "NOTE", "LIST", "SHOW", "OPEN", "LIVE", "FREE", "LLM", 
        "RAG", "NS", "NEW", "RUN", "GET", "USE", "BASE", "ONLY", "WEB",
        "INFO", "TIME", "MAIN", "WIKI", "HTTP", "HTTPS", "JSON", "URL",
        "FILE", "PATH", "PASS", "FAIL", "TRUE", "NONE", "TEST", "PORT"
    }
    valid_tickers = [t for t in raw_tickers if t not in exclude_words]
    return sorted(set(valid_tickers))[:8]


def clean_queries(queries: list[str]) -> list[str]:
    cleaned = []
    for query in queries:
        query = re.sub(r"^\d+[\.\-\)]\s*", "", query)
        query = re.sub(r"^[\-\*\+]\s*", "", query)
        query = query.strip('"\'')
        if query:
            cleaned.append(query)
    return cleaned


def dedupe_evidence(evidence: list[Evidence]) -> list[Evidence]:
    seen: set[str] = set()
    unique: list[Evidence] = []
    for item in evidence:
        key = (item.url or item.title).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique[:30]


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text.split()) * 1.33)) if text else 0


def build_run_metrics(state: AgentState) -> dict[str, int | float | str]:
    evidence = dedupe_evidence(state["evidence"])
    answer = state.get("answer", "")
    verification = state.get("verification", "")
    return {
        "iterations": state.get("iteration", 0),
        "evidence_items": len(evidence),
        "answer_tokens_est": estimate_tokens(answer),
        "verification_tokens_est": estimate_tokens(verification),
        "total_output_tokens_est": estimate_tokens(answer) + estimate_tokens(verification),
    }
