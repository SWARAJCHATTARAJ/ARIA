from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    query: str
    thread_id: Optional[str]
    user_id: Optional[str]
    compare_mode: bool

    
    # Route phase
    dristi_engine: Optional[str] # "V1", "V2", "LLM"
    route_decision: Optional[str] # "okf_only", "cascade", "trivial", "ood"
    
    # Plan phase
    sub_queries: List[str]
    
    # Retrieve phase
    retrieved_chunks: List[Dict[str, Any]]
    tiers_fired: List[str] # "OKF", "RAG", "LIVE"
    
    # Audit phase
    conflicts_found: List[Dict[str, Any]]
    retractions_found: List[Dict[str, Any]]
    
    # Generate phase
    draft_answer: str
    final_answer: str
    citations: List[Dict[str, Any]]
