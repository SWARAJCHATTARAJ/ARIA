import os
import sys
import time
import json
from pathlib import Path
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Add project root to python path
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from aria.core import Settings, Evidence, ResearchResult
from aria.rag import VectorMemory
from aria.agent import ResearchAgent

# Evaluation set of questions, expected keywords, expected source types, and ground truth answers
EVAL_SET = [
    {
        "question": "What is Secret Project X?",
        "expected_keywords": ["solar", "drone", "2026"],
        "expected_source_types": ["note"],
        "ground_truth": "Secret Project X is a solar powered drone designed for field research in 2026."
    },
    {
        "question": "What is Project Y?",
        "expected_keywords": ["Mariana", "Trench", "submersible"],
        "expected_source_types": ["note"],
        "ground_truth": "Project Y is a deep-sea submersible designed to explore the Mariana Trench."
    },
    {
        "question": "Who built ARIA?",
        "expected_keywords": ["Swaraj", "Chattaraj", "creator", "architect"],
        "expected_source_types": ["developer"],
        "ground_truth": "ARIA was created by Swaraj Chattaraj."
    },
    {
        "question": "How to download or install ARIA on mobile or windows?",
        "expected_keywords": ["desktop", "PWA", "Home Screen", "WebAPK"],
        "expected_source_types": ["system"],
        "ground_truth": "ARIA can be installed on Windows or mobile as a PWA (Progressive Web App) to the Home Screen or WebAPK."
    },
    {
        "question": "Summarize the details of Secret Project X, Project Y, and Company Alpha.",
        "expected_keywords": ["Secret Project X", "Project Y", "Company Alpha"],
        "expected_source_types": ["note"],
        "ground_truth": "Secret Project X is a solar powered drone, Project Y is a deep-sea submersible, and Company Alpha reported a net income of 15 million USD in Q2 2026."
    },
    {
        "question": "What were the Q2 2026 earnings of Company Alpha?",
        "expected_keywords": ["15 million", "earnings", "Q2"],
        "expected_source_types": ["note"],
        "ground_truth": "Company Alpha reported a net income of 15 million USD in Q2 2026."
    },
    {
        "question": "Compare Secret Project X and Project Y.",
        "expected_keywords": ["drone", "submersible", "solar", "Mariana"],
        "expected_source_types": ["note"],
        "ground_truth": "Secret Project X is a solar-powered drone for field research. Project Y is a deep-sea submersible for Mariana Trench exploration."
    },
    {
        "question": "Who is Swaraj Chattaraj?",
        "expected_keywords": ["Swaraj", "Chattaraj", "creator"],
        "expected_source_types": ["developer"],
        "ground_truth": "Swaraj Chattaraj is the creator and architect of ARIA."
    },
    {
        "question": "Explain the difference between Project Y and Project X.",
        "expected_keywords": ["submersible", "drone"],
        "expected_source_types": ["note"],
        "ground_truth": "Project Y is a deep-sea submersible designed for ocean exploration, whereas Project X is a solar-powered drone designed for aerial field research."
    },
    {
        "question": "Tell me about Swaraj Chattaraj's contact details.",
        "expected_keywords": ["swarajchattaraj17402@gmail.com", "GitHub"],
        "expected_source_types": ["developer"],
        "ground_truth": "Swaraj Chattaraj can be contacted via email at swarajchattaraj17402@gmail.com or through his GitHub profile."
    }
]

def run_evaluation():
    print("==========================================================")
    print("   ARIA Autonomous RAG Agent Accuracy Evaluator (Ragas)   ")
    print("==========================================================\n")
    
    # 1. Setup local temporary database
    os.environ["ARIA_COLLECTION"] = "aria_eval_accuracy_collection"
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
    
    agent = ResearchAgent(settings, memory)
    
    # 3. Generate Agent Responses
    print("[2/4] Running agent loop over evaluation set...")
    questions = []
    answers = []
    contexts = []
    ground_truths = []
    latencies = []
    
    for item in EVAL_SET:
        q = item["question"]
        print(f"Running query: '{q}'...")
        start_time = time.perf_counter()
        res = agent.run(q, use_web=False, use_local=True, max_iterations=1)
        elapsed = time.perf_counter() - start_time
        
        questions.append(q)
        answers.append(res.answer)
        contexts.append([ev.summary for ev in res.evidence])
        ground_truths.append(item["ground_truth"])
        latencies.append(elapsed)
        
    memory.reset()
    
    print("\n[3/4] Computing Ragas accuracy scores...")
    
    # Check if we can configure Ragas with OpenRouter
    api_key = os.getenv("OPENROUTER_API_KEY")
    use_ragas_live = bool(api_key and not api_key.startswith("your_"))
    
    faithfulness_scores = []
    answer_relevancy_scores = []
    context_precision_scores = []
    
    if use_ragas_live:
        try:
            from datasets import Dataset
            from ragas import evaluate
            from ragas.metrics import faithfulness, answer_relevancy, context_precision
            from langchain_openai import ChatOpenAI
            from langchain_community.embeddings import HuggingFaceEmbeddings
            
            # Wrap OpenRouter LLM
            llm = ChatOpenAI(
                model=os.getenv("ARIA_MODEL", "openrouter/free"),
                openai_api_key=api_key,
                openai_api_base="https://openrouter.ai/api/v1",
                default_headers={"HTTP-Referer": "https://github.com/swarajchattaraj/aria"},
                temperature=0.0
            )
            embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            
            # Set custom LLM/embeddings on Ragas metrics
            for metric in [faithfulness, answer_relevancy, context_precision]:
                metric.llm = llm
                if hasattr(metric, "embeddings"):
                    metric.embeddings = embeddings
                    
            dataset = Dataset.from_dict({
                "question": questions,
                "answer": answers,
                "contexts": contexts,
                "ground_truth": ground_truths
            })
            
            print("Running Ragas evaluation suite via OpenRouter...")
            ragas_result = evaluate(
                dataset=dataset,
                metrics=[faithfulness, answer_relevancy, context_precision],
                llm=llm,
                embeddings=embeddings
            )
            
            # Extract individual scores from evaluation dataset
            df = ragas_result.scores.to_pandas()
            faithfulness_scores = df["faithfulness"].tolist()
            answer_relevancy_scores = df["answer_relevancy"].tolist()
            context_precision_scores = df["context_precision"].tolist()
                
        except Exception as e:
            print(f"[Warning] Ragas live execution encountered an error: {e}. Falling back to proxy metrics.")
            use_ragas_live = False
            
    if not use_ragas_live:
        print("Computing proxy accuracy scores using local sentence-transformers (fallback)...")
        # Load local cross-encoder / embeddings helper for calculating proxy scores
        try:
            from sentence_transformers import SentenceTransformer
            from sklearn.metrics.pairwise import cosine_similarity
            import numpy as np
            model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            print(f"[Error] Failed to load SentenceTransformer for proxy: {e}")
            model = None
            
        for q, ans, ctx, gt in zip(questions, answers, contexts, ground_truths):
            # 1. Faithfulness Proxy: percentage of answer content present in contexts
            if not ans or not ctx:
                faithfulness_scores.append(0.0)
            else:
                combined_ctx = " ".join(ctx).lower()
                ans_words = [w.lower() for w in ans.split() if len(w) > 4]
                matches = sum(1 for w in ans_words if w in combined_ctx)
                score = round(matches / len(ans_words), 2) if ans_words else 1.0
                faithfulness_scores.append(score)
                
            # 2. Answer Relevancy Proxy: cosine similarity between question and answer
            if not ans or not model:
                answer_relevancy_scores.append(0.0)
            else:
                q_emb = model.encode([q])
                a_emb = model.encode([ans])
                sim = cosine_similarity(q_emb, a_emb)[0][0]
                answer_relevancy_scores.append(round(float(sim), 2))
                
            # 3. Context Precision Proxy: relevance of contexts to ground truth
            if not ctx or not model:
                context_precision_scores.append(0.0)
            else:
                ctx_embs = model.encode(ctx)
                gt_emb = model.encode([gt])
                sims = cosine_similarity(ctx_embs, gt_emb)
                avg_sim = float(np.mean(sims))
                context_precision_scores.append(round(avg_sim, 2))
                
    # 4. Print results table
    print("\n" + "="*85)
    print(f"{'Question':<40} | {'Faithfulness':<12} | {'Relevancy':<10} | {'Precision':<10} | {'Latency':<8}")
    print("-"*85)
    for q, f_sc, r_sc, p_sc, lat in zip(questions, faithfulness_scores, answer_relevancy_scores, context_precision_scores, latencies):
        print(f"{q[:40]:<40} | {f_sc:<12} | {r_sc:<10} | {p_sc:<10} | {lat:.2f}s")
    print("="*85)
    
    # Filter out None values in scores before computing averages
    f_filtered = [s for s in faithfulness_scores if s is not None]
    r_filtered = [s for s in answer_relevancy_scores if s is not None]
    p_filtered = [s for s in context_precision_scores if s is not None]
    
    avg_f = round(sum(f_filtered) / len(f_filtered), 2) if f_filtered else 0.0
    avg_r = round(sum(r_filtered) / len(r_filtered), 2) if r_filtered else 0.0
    avg_p = round(sum(p_filtered) / len(p_filtered), 2) if p_filtered else 0.0
    avg_lat = round(sum(latencies) / len(latencies), 2)
    
    print(f"{'AVERAGES':<40} | {avg_f:<12} | {avg_r:<10} | {avg_p:<10} | {avg_lat:.2f}s")
    print("="*85)
    
    # Save results to tracking log
    history_file = Path(ROOT) / ".aria_eval_history.json"
    history = []
    if history_file.exists():
        try:
            history = json.loads(history_file.read_text(encoding="utf-8"))
        except Exception:
            pass
            
    history.append({
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "average_faithfulness": avg_f,
        "average_answer_relevancy": avg_r,
        "average_context_precision": avg_p,
        "average_latency": avg_lat,
        "live_ragas": use_ragas_live
    })
    
    history_file.write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"Accuracy metrics saved to {history_file.name}\n")
    return 0

if __name__ == "__main__":
    sys.exit(run_evaluation())
