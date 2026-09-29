import asyncio
from dotenv import load_dotenv
import os

# Load .env first before importing config/pipeline
load_dotenv(dotenv_path="D:/aria/backend/.env")

from pipeline.graph import app_graph
from pipeline.state import AgentState

async def run_test_query(query: str):
    print(f"\n--- Running Test Query: '{query}' ---\n")
    
    # Initialize state
    initial_state = AgentState(
        query=query,
        thread_id="test_thread_001",
        user_id="test_user_001"
    )
    
    # Run the graph
    print("Executing pipeline...")
    try:
        final_state = await app_graph.ainvoke(initial_state)
        
        print("\n--- Pipeline Results ---")
        print(f"Dristi Route: {final_state.get('dristi_engine')} -> {final_state.get('route_decision')}")
        print(f"Tiers Fired: {final_state.get('tiers_fired')}")
        print(f"Retrieved Chunks: {len(final_state.get('retrieved_chunks', []))}")
        print(f"Conflicts Found: {len(final_state.get('conflicts_found', []))}")
        print(f"Retractions Found: {len(final_state.get('retractions_found', []))}")
        
        print("\n--- Final Synthesized Answer ---")
        print(final_state.get("final_answer"))
        print("\n--- Citations ---")
        for cit in final_state.get("citations", []):
            print(f"[{cit.get('tier')}] {cit.get('source')}")
            
    except Exception as e:
        print(f"\nERROR: Pipeline failed - {e}")

if __name__ == "__main__":
    asyncio.run(run_test_query("What is the definition of autonomous intelligence?"))
