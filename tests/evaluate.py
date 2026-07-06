import os
import sys
import time
import json
import unittest
from pathlib import Path
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Ensure project root is in python path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from aria.core import Settings, Evidence, ResearchResult
from aria.rag import VectorMemory
from aria.agent import ResearchAgent

# Test questions, expected keywords, and expected source types
EVAL_QUESTIONS = [
    {
        "question": "What is Secret Project X?",
        "expected_keywords": ["solar", "drone", "2026"],
        "expected_source_types": ["note"]
    },
    {
        "question": "What is Project Y?",
        "expected_keywords": ["Mariana", "Trench", "submersible"],
        "expected_source_types": ["note"]
    },
    {
        "question": "Who built ARIA?",
        "expected_keywords": ["Swaraj", "Chattaraj", "creator", "architect"],
        "expected_source_types": ["developer"]
    },
    {
        "question": "How to download or install ARIA on mobile or windows?",
        "expected_keywords": ["desktop", "PWA", "Home Screen", "WebAPK"],
        "expected_source_types": ["system"]
    },
    {
        "question": "Summarize the details of Secret Project X, Project Y, and Company Alpha.",
        "expected_keywords": ["Secret Project X", "Project Y", "Company Alpha"],
        "expected_source_types": ["note"]
    },
    {
        "question": "What were the Q2 2026 earnings of Company Alpha?",
        "expected_keywords": ["15 million", "earnings", "Q2"],
        "expected_source_types": ["note"]
    },
    {
        "question": "Compare Secret Project X and Project Y.",
        "expected_keywords": ["drone", "submersible", "solar", "Mariana"],
        "expected_source_types": ["note"]
    },
    {
        "question": "Who is Swaraj Chattaraj?",
        "expected_keywords": ["Swaraj", "Chattaraj", "creator", "Lead Creator"],
        "expected_source_types": ["developer"]
    },
    {
        "question": "Explain the difference between Project Y and Project X.",
        "expected_keywords": ["submersible", "drone"],
        "expected_source_types": ["note"]
    },
    {
        "question": "Tell me about Swaraj Chattaraj's contact details.",
        "expected_keywords": ["swarajchattaraj17402@gmail.com", "GitHub"],
        "expected_source_types": ["developer"]
    }
]

def run_evaluation():
    print("===================================================")
    print("   ARIA Autonomous RAG Agent Regression Evaluator  ")
    print("===================================================\n")
    
    # 1. Setup local temporary database
    os.environ["ARIA_COLLECTION"] = "aria_eval_collection"
    settings = Settings.from_env()
    memory = VectorMemory(settings)
    memory.reset()
    
    # 2. Ingest mock documents
    print("[1/4] Ingesting evaluation documents...")
    memory.ingest_text(
        "Secret Project X is a solar powered drone designed for field research in 2026.",
        source_name="project_x.txt",
        source_type="note"
    )
    memory.ingest_text(
        "Project Y is a deep-sea submersible designed to explore the Mariana Trench.",
        source_name="project_y.txt",
        source_type="note"
    )
    memory.ingest_text(
        "Company Alpha reported a net income of 15 million USD in Q2 2026.",
        source_name="company_alpha_earnings.txt",
        source_type="note"
    )
    print(f"Indexed {memory.count()} chunks in local memory.\n")
    
    # Initialize agent
    agent = ResearchAgent(settings, memory)
    
    # Clear old latencies/failures logs
    failures_log = ROOT / ".aria_sessions" / "verification_failures.jsonl"
    latencies_log = ROOT / ".aria_sessions" / "latencies.log"
    failures_log.unlink(missing_ok=True)
    latencies_log.unlink(missing_ok=True)
    
    # 3. Run Evaluation Questions
    print("[2/4] Running agent evaluation loop...")
    results = []
    all_passed = True
    
    print(f"{'Question':<55} | {'Source OK':<9} | {'Citations':<9} | {'Grounding':<9} | {'Latency':<8}")
    print("-" * 105)
    
    for q_data in EVAL_QUESTIONS:
        q = q_data["question"]
        start_time = time.perf_counter()
        
        # Run agent in local mode
        res = agent.run(q, use_web=False, use_local=True, max_iterations=1)
        elapsed = time.perf_counter() - start_time
        
        # Check source type accuracy
        source_ok = any(e.source_type in q_data["expected_source_types"] for e in res.evidence)
        
        # Check citation presence (in extractive fallback mode it cites source indexes)
        citations_ok = "[" in res.answer and "]" in res.answer
        
        # Check keyword grounding (check if expected terms are in answer)
        grounding_ok = any(kw.lower() in res.answer.lower() for kw in q_data["expected_keywords"])
        
        passed = source_ok and grounding_ok
        if not passed:
            all_passed = False
            
        status_str = "PASS" if passed else "FAIL"
        print(f"{q[:55]:<55} | {'YES' if source_ok else 'NO':<9} | {'YES' if citations_ok else 'NO':<9} | {'YES' if grounding_ok else 'NO':<9} | {elapsed:.2f}s")
        
        results.append({
            "question": q,
            "latency": elapsed,
            "source_ok": source_ok,
            "citations_ok": citations_ok,
            "grounding_ok": grounding_ok,
            "passed": passed,
            "latencies": getattr(agent, "_latencies", {})
        })
        
    print("\n[3/4] Evaluating Verifier's Self-Correction...")
    
    # Test verifier catching a bad claim
    test_hallucinated_brief = (
        "Secret Project X is a nuclear-powered stealth fighter jet [2].\n"
        "It was built to carry atomic payloads and bypass air defense radars [2]."
    )
    
    evidence = [
        Evidence(
            title="project_x.txt",
            summary="Secret Project X is a solar powered drone designed for field research in 2026.",
            source_type="note",
            source_id="project_x"
        )
    ]
    
    verification = agent._verify("What is Secret Project X?", test_hallucinated_brief, evidence)
    
    verifier_caught = "STATUS: NEEDS_MORE_RESEARCH" in verification or "NEEDS_REVISION" in verification
    logged_ok = failures_log.exists()
    
    print(f"Verifier caught hallucination: {'YES' if verifier_caught else 'NO'}")
    print(f"Failure logged to file: {'YES' if logged_ok else 'NO'}")
    
    # Clean up database
    memory.reset()
    
    print("\n[4/4] Final Metrics Summary:")
    print(f"Total Questions Run: {len(EVAL_QUESTIONS)}")
    avg_latency = sum(r["latency"] for r in results) / len(results)
    print(f"Average Total Latency: {avg_latency:.2f}s")
    
    # Verify latencies are tracked per-node
    print("\nSample Node Latencies:")
    if results:
        sample_lat = results[0]["latencies"]
        for node, lat in sample_lat.items():
            print(f"  - Node '{node}': {lat}s")
            
    print("\n===================================================")
    if all_passed and verifier_caught and logged_ok:
        print("   ALL EVALUATION CHECKS PASSED SUCCESSFULLY!      ")
        print("===================================================")
        return 0
    else:
        print("   EVALUATION FAILED: REGRESSIONS DETECTED.        ")
        print("===================================================")
        return 1

if __name__ == "__main__":
    sys.exit(run_evaluation())
