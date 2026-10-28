import asyncio
import sys
import json
import os
from dotenv import load_dotenv

# Load .env
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

from pipeline.graph import app_graph

async def main():
    initial_state = {
        "query": "What are autonomous systems?",
        "thread_id": "test-123",
        "user_id": "test",
        "compare_mode": False
    }
    
    config = {"configurable": {"thread_id": "test-123"}}
    
    print("Testing pipeline execution...")
    try:
        async for output in app_graph.astream(initial_state, config=config):
            print(output)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
