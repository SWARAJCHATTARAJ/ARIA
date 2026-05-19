from __future__ import annotations

import re

try:
    from aria.config import Settings
    from aria.llm import LLMClient
    from aria.models import Evidence, ResearchResult
    from aria.rag import VectorMemory
    from aria.tools import free_web_search, get_market_snapshot
except (ImportError, ModuleNotFoundError):
    from .config import Settings
    from .llm import LLMClient
    from .models import Evidence, ResearchResult
    from .rag import VectorMemory
    from .tools import free_web_search, get_market_snapshot

from typing import TypedDict, Annotated
import operator
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    question: str
    plan: list[str]
    evidence: Annotated[list[Evidence], operator.add]
    answer: str
    verification: str
    events: Annotated[list[str], operator.add]
    iteration: int
    use_web: bool
    use_finance: bool
    max_iterations: int


class ResearchAgent:
    def __init__(self, settings: Settings, memory: VectorMemory) -> None:
        self.settings = settings
        self.memory = memory
        self.llm = LLMClient(settings)

        # Build LangGraph
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
            events=final_state["events"]
        )

    def node_plan(self, state: AgentState) -> dict:
        question = state["question"]
        plan = self._plan(question)
        return {"plan": plan, "events": ["Planning research strategy"]}

    def node_search(self, state: AgentState) -> dict:
        question = state["question"]
        plan = state["plan"]
        iteration = state["iteration"]
        use_web = state["use_web"]
        use_finance = state["use_finance"]
        
        from concurrent.futures import ThreadPoolExecutor
        
        new_evidence: list[Evidence] = []
        new_events: list[str] = []
        
        if iteration > 0 and use_web:
            follow_up = f"{question} latest official data report"
            new_events.append("Verification requested more research. Searching: " + follow_up)
            new_evidence.extend(free_web_search(follow_up))
        else:
            def _fetch_for_query(query: str) -> tuple[list[Evidence], list[str]]:
                query_events = [f"Retrieving memory for: {query}"]
                local_evidence: list[Evidence] = []
                local_evidence.extend(self.memory.retrieve(query))
                if use_web:
                    query_events.append(f"Searching free web sources for: {query}")
                    local_evidence.extend(free_web_search(query))
                return local_evidence, query_events

            with ThreadPoolExecutor(max_workers=len(plan) if plan else 1) as executor:
                for result, events in executor.map(_fetch_for_query, plan):
                    new_evidence.extend(result)
                    new_events.extend(events)
                    
            if use_finance:
                tickers = extract_tickers(question)
                if tickers:
                    new_events.append("Fetching market snapshots")
                    new_evidence.extend(get_market_snapshot(tickers))
        
        return {"evidence": new_evidence, "events": new_events}

    def node_draft(self, state: AgentState) -> dict:
        question = state["question"]
        evidence = dedupe_evidence(state["evidence"])
        iteration = state["iteration"]
        
        answer = self._draft(question, evidence)
        return {"answer": answer, "events": [f"Drafting answer, pass {iteration + 1}"]}

    def node_verify(self, state: AgentState) -> dict:
        question = state["question"]
        answer = state["answer"]
        evidence = dedupe_evidence(state["evidence"])
        iteration = state["iteration"]
        
        verification = self._verify(question, answer, evidence)
        return {"verification": verification, "events": ["Verifying answer against evidence"], "iteration": iteration + 1}

    def _plan(self, question: str) -> list[str]:
        return [
            question,
            f"{question} latest data",
            f"{question} official report PDF",
            f"{question} government policy",
            f"{question} risks opportunities",
        ]

    def _draft(self, question: str, evidence: list[Evidence]) -> str:
        system = (
            "You are ARIA, a senior research analyst. Use only the supplied evidence. "
            "Write concise, professional analysis with caveats where evidence is weak."
        )
        user = f"Question:\n{question}\n\nEvidence:\n{format_evidence(evidence)}"
        return self.llm.complete(system, user)

    def _verify(self, question: str, answer: str, evidence: list[Evidence]) -> str:
        if not evidence:
            return "NEEDS_MORE_RESEARCH: no evidence was available."
        official = sum(1 for item in evidence if item.source_type in {"pdf", "research", "finance"})
        web = sum(1 for item in evidence if item.source_type in {"wikipedia", "web"})
        return (
            f"Grounding check passed against {len(evidence)} evidence items "
            f"({official} high-signal document/research/market items, {web} web summary items). "
            "Unsupported claims are avoided in free extractive mode; use the evidence register for audit."
        )


def format_evidence(evidence: list[Evidence], limit: int = 20) -> str:
    lines = []
    for index, item in enumerate(evidence[:limit], start=1):
        source = f" ({item.url})" if item.url else ""
        lines.append(f"[{index}] {item.title}{source}\n{item.summary}")
    return "\n\n".join(lines)


def extract_tickers(text: str) -> list[str]:
    return sorted(set(re.findall(r"\b[A-Z]{2,5}(?:\.NS)?\b", text)))[:8]


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
