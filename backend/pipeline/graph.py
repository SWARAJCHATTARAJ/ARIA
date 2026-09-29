from langgraph.graph import StateGraph, END
from pipeline.state import AgentState
from pipeline.nodes import route_query, plan_retrieval, retrieve_cascade, synthesize_answer, audit_answer

def build_graph():
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("route", route_query)
    workflow.add_node("plan", plan_retrieval)
    workflow.add_node("retrieve", retrieve_cascade)
    workflow.add_node("synthesize", synthesize_answer)
    workflow.add_node("audit", audit_answer)
    
    # Edges
    workflow.set_entry_point("route")
    
    # Conditional routing logic can be added here. For now, linear path.
    workflow.add_edge("route", "plan")
    workflow.add_edge("plan", "retrieve")
    workflow.add_edge("retrieve", "synthesize")
    workflow.add_edge("synthesize", "audit")
    workflow.add_edge("audit", END)
    
    return workflow.compile()

app_graph = build_graph()
