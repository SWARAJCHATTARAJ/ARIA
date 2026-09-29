import httpx
from pipeline.state import AgentState
from config import settings
import logging
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
import os

logger = logging.getLogger(__name__)

# Initialize Groq LLM
# Explicitly loading from environment or settings
groq_llm = ChatGroq(
    api_key=settings.groq_api_key,
    model_name="llama-3.3-70b-versatile",
    temperature=0
)

async def route_query(state: AgentState) -> AgentState:
    """
    Calls Dristi API. Dristi internally handles the V1 (DistilBERT) to V2 (DeBERTa-v3) cascade.
    """
    logger.info("Routing query through Dristi...")
    
    try:
        # Expected Dristi FastAPI endpoint
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{settings.dristi_url}/api/route",
                json={"query": state["query"]},
                timeout=2.0
            )
            data = resp.json()
            
            # Extract which engine Dristi ultimately used (V1 or V2) and its decision
            state["dristi_engine"] = data.get("engine_used", "V1")
            
            # If Dristi flags as Out-of-Distribution, we skip to LLM fallback
            if data.get("is_ood", False):
                state["route_decision"] = "ood"
            else:
                state["route_decision"] = data.get("decision", "cascade")
                
    except Exception as e:
        logger.error(f"Dristi API failed/unreachable. Defaulting to LLM cascade. Error: {e}")
        state["dristi_engine"] = "FAILSAFE"
        state["route_decision"] = "cascade"
        
    return state

def plan_retrieval(state: AgentState) -> AgentState:
    """
    LLM breaks the question into sub-queries.
    """
    logger.info("Planning retrieval...")
    # TODO: Real Groq planning call
    state["sub_queries"] = [state["query"]]
    return state

async def retrieve_cascade(state: AgentState) -> AgentState:
    """
    OKF -> RAG -> Live cascade, with Compare Mode forcing all tiers.
    """
    logger.info("Executing retrieval cascade...")
    state["tiers_fired"] = []
    state["retrieved_chunks"] = []
    
    is_compare = state.get("compare_mode", False)
    
    # 1. OKF Tier
    state["tiers_fired"].append("OKF")
    state["retrieved_chunks"].append({
        "tier": "OKF", 
        "content": "A mocked concept definition from personal OKF notes stating autonomous systems are mature.",
        "source": "concept.md"
    })
    
    # 2. LIVE Tier (Only if OKF empty OR Compare Mode is ON)
    if is_compare or not state["retrieved_chunks"]:
        state["tiers_fired"].append("LIVE")
        state["retrieved_chunks"].append({
            "tier": "LIVE", 
            "content": "A recent live arXiv paper arguing autonomous systems are still highly immature.",
            "source": "arXiv:2401.999"
        })
    
    return state

def synthesize_answer(state: AgentState) -> AgentState:
    """
    LLM drafts answer grounded in retrieved_chunks.
    """
    logger.info("Synthesizing answer with Groq...")
    
    context = "\n\n".join([
        f"[{chunk['tier']} - {chunk['source']}]\n{chunk['content']}" 
        for chunk in state.get("retrieved_chunks", [])
    ])
    
    system_prompt = (
        "You are ARIA, a highly accurate research assistant.\n"
        "Draft a precise answer based ONLY on the provided context.\n"
        "Include inline citations matching the source names (e.g. [concept.md])."
    )
    
    user_prompt = f"Query: {state['query']}\n\nContext:\n{context}"
    
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt)
    ]
    
    # We call Groq here
    try:
        response = groq_llm.invoke(messages)
        state["draft_answer"] = response.content
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        state["draft_answer"] = f"Error generating answer: {str(e)}"
        
    state["citations"] = state.get("retrieved_chunks", [])
    return state

def audit_answer(state: AgentState) -> AgentState:
    """
    Verifies claims, flags conflicts, and flags retractions.
    """
    logger.info("Auditing answer...")
    state["conflicts_found"] = []
    state["retractions_found"] = []
    
    is_compare = state.get("compare_mode", False)
    
    if is_compare and len(state.get("retrieved_chunks", [])) > 1:
        logger.info("Compare Mode: Checking for factual conflicts between OKF and Live sources...")
        context = "\n\n".join([f"[{c['tier']} - {c['source']}]\n{c['content']}" for c in state["retrieved_chunks"]])
        
        prompt = (
            "You are an audit agent. Analyze the following retrieved chunks from different sources. "
            "Identify any direct factual contradictions. "
            "Return 'CONFLICT DETECTED: <description>' if there is a conflict. If none, return 'NO CONFLICT'.\n\n"
            f"Context:\n{context}"
        )
        try:
            audit_resp = groq_llm.invoke([HumanMessage(content=prompt)])
            if "CONFLICT DETECTED" in audit_resp.content.upper():
                state["conflicts_found"].append({"description": audit_resp.content})
        except Exception as e:
            logger.error(f"Audit LLM failed: {e}")

    state["final_answer"] = state.get("draft_answer", "")
    return state
