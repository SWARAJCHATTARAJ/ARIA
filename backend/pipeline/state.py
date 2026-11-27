from typing import TypedDict, List, Dict, Any, Optional, Annotated

def append_to_list(left: list, right: list) -> list:
    if not left: left = []
    if not right: right = []
    return left + right

class AgentState(TypedDict):
    query: str
    topic: Optional[str]
    api_key_pool: Optional[List[str]]
    thread_id: Optional[str]
    user_id: Optional[str]
    compare_mode: bool
    compare_entities: Optional[List[str]]
    depth: Optional[str]
    direct_paper_mode: Optional[bool]
    direct_paper_id: Optional[Dict[str, str]]
    source_tier: Optional[str]
    recency: Optional[str]
    strict_academic: Optional[bool]

    # History
    chat_history: Annotated[List[Dict[str, Any]], append_to_list]
    
    # Route phase
    dristi_engine: Optional[str]
    route_decision: Optional[str]
    escalated: Optional[bool]
    v1_confidence: Optional[float]
    v2_confidence: Optional[float]
    latency_ms: Optional[float]
    
    # Universal LLM Query Reformulation & Domain-Cognitive Planner
    canonical_topic: str
    academic_search_query: str
    wikipedia_exact_title: str
    query_is_english: bool
    domain_discipline: Optional[str]
    planned_outline: Optional[List[str]]
    is_debated_or_empirical: Optional[bool]
    
    # Plan phase
    sub_queries: Annotated[List[str], append_to_list]
    
    # Retrieve phase
    retrieved_chunks: Annotated[List[Dict[str, Any]], append_to_list]
    tiers_fired: Annotated[List[str], append_to_list]
    okf_node_paths: Annotated[List[str], append_to_list]
    rag_scores: Annotated[List[float], append_to_list]
    
    # Audit phase
    claims: List[Dict[str, Any]]
    conflicts_found: List[Dict[str, Any]]
    retractions_found: List[Dict[str, Any]]
    confidence: Optional[float]
    tier_agreement: Optional[float]
    
    # Generate phase
    draft_answer: str
    final_answer: str
    citations: Annotated[List[Dict[str, Any]], append_to_list]
