import os
import json
import urllib.request
from typing import Dict, Any, List

def load_env():
    try:
        with open("D:/aria/backend/.env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    os.environ[key] = val
    except Exception as e:
        print(f"Failed to load .env: {e}")

def call_groq(prompt: str, context: str) -> str:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key or api_key == "your_groq_api_key":
        return "ERROR: Invalid or missing GROQ_API_KEY."

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "ARIA-Backend/1.0"
    }
    
    system_msg = (
        "You are ARIA, a highly accurate research assistant.\n"
        "Draft a precise answer based ONLY on the provided context.\n"
        "Include inline citations matching the source names (e.g. [concept.md])."
    )
    
    data = {
        "model": "openai/gpt-oss-20b",
        "messages": [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": f"Query: {prompt}\n\nContext:\n{context}"}
        ]
    }
    
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            return res_json["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        return f"Groq API call failed: {e.code} - {e.read().decode('utf-8')}"
    except Exception as e:
        return f"Groq API call failed: {e}"

def simulate_pipeline(query: str):
    print(f"\n=== ARIA v2 Pipeline Test ===")
    print(f"Query: '{query}'\n")
    
    print("[1] ROUTE (Dristi Mock)")
    print(" -> Engine: V1 (Confident)")
    print(" -> Decision: Cascade\n")
    
    print("[2] RETRIEVE (Cascade Mock)")
    print(" -> Tier: OKF")
    
    mocked_chunks = [
        {"tier": "OKF", "source": "ai_definition.md", "content": "Autonomous Intelligence refers to AI systems that can independently plan, execute, and adapt their actions to achieve high-level goals without human intervention."},
        {"tier": "LIVE", "source": "RetractionWatch", "content": "Recent papers suggest autonomous intelligence is still in its infancy, but this claim is highly debated."}
    ]
    
    for chunk in mocked_chunks:
        print(f"    - Found in {chunk['tier']}: {chunk['source']}")
        
    print("\n[3] AUDIT (Conflicts / Retractions Mock)")
    print(" -> Checking Retraction Watch... OK")
    print(" -> Deduping overlapping facts... OK\n")
    
    print("[4] SYNTHESIZE (Calling Groq API...)")
    
    context = "\n\n".join([f"[{c['tier']} - {c['source']}]\n{c['content']}" for c in mocked_chunks])
    
    answer = call_groq(query, context)
    
    print("\n=== FINAL ANSWER ===\n")
    print(answer.encode("ascii", errors="ignore").decode())
    print("\n=====================\n")

if __name__ == "__main__":
    load_env()
    simulate_pipeline("What is autonomous intelligence and is it fully developed?")
