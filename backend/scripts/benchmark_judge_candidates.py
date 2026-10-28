import os
import sys
import json
import time
import re
from typing import List, Dict, Any
import httpx
from dotenv import dotenv_values

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from pipeline.nodes import (
    compute_claim_quote_coverage,
    normalize_units_and_notation,
    ALIASES,
    MONTH_ALIASES,
    STOPWORDS,
    KEY_PHRASES
)

env = dotenv_values("backend/.env")
api_key = env.get("GROQ_API_KEY") or os.getenv("GROQ_API_KEY")
if not api_key:
    print("FATAL: GROQ_API_KEY not found")
    sys.exit(1)

def norm_text(t: str) -> str:
    """Normalizes whitespace, unicode hyphens and unicode quotes for substring matching."""
    if not t:
        return ""
    s = " ".join(t.split()).lower()
    for d in ['\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2212']:
        s = s.replace(d, '-')
    for q in ['\u201c', '\u201d', '"']:
        s = s.replace(q, '"')
    for q in ['\u2018', '\u2019', "'"]:
        s = s.replace(q, "'")
    return s

def evaluate_claim_in_code(claim_text: str, passage: str, llm_supported: bool, quotes: List[str]) -> Dict[str, Any]:
    norm_passage = norm_text(passage)
    norm_claim = normalize_units_and_notation(claim_text)
    
    # 1. Quote check: verbatim substring in passage
    valid_quotes = []
    for q in (quotes or [])[:2]:
        q_clean = (q or "").strip()
        norm_q = norm_text(q_clean)
        # Strip trailing punctuation if not matching
        if norm_q and len(norm_q) >= 10:
            if norm_q in norm_passage:
                valid_quotes.append(q_clean)
            elif norm_q.rstrip('.,;:!?') in norm_passage:
                valid_quotes.append(q_clean.rstrip('.,;:!?'))
            
    is_length_valid = (len(claim_text) <= 300)
    coverage = compute_claim_quote_coverage(claim_text, valid_quotes)
    is_coverage_sufficient = (coverage >= 0.60)
    condition_a = bool(llm_supported and valid_quotes and is_coverage_sufficient and is_length_valid)
    
    # 2. Number & Entity check
    norm_passage_eval = normalize_units_and_notation(passage).lower()
    
    claim_numbers = set(re.findall(r'\b\d+(?:\.\d+)?%?\b', norm_claim))
    source_numbers = set(re.findall(r'\b\d+(?:\.\d+)?%?\b', normalize_units_and_notation(passage)))
    missing_numbers = claim_numbers - source_numbers
    
    clean_lower = norm_claim.lower()
    missing_phrases = []
    for phrase in KEY_PHRASES:
        if phrase in clean_lower and phrase not in norm_passage_eval:
            missing_phrases.append(f"'{phrase}'")
            
    words = re.findall(r'\b[A-Za-z0-9_-]+\b', norm_claim)
    missing_entities = []
    for i, w in enumerate(words):
        if i == 0:
            continue
        w_lower = w.lower()
        if w_lower in STOPWORDS and not (w.isupper() and len(w) >= 2):
            continue
        if len(w) <= 1:
            continue
        is_acronym = (w.isupper() and len(w) >= 2 and w.isalpha()) or w_lower in ALIASES
        has_digits = any(c.isdigit() for c in w)
        is_mid_sentence_cap = (any(c.isupper() for c in w) and w_lower not in STOPWORDS)
        if not (is_acronym or has_digits or is_mid_sentence_cap):
            continue
            
        matched = (w_lower in norm_passage_eval)
        if not matched and w_lower in ALIASES:
            for alias in ALIASES[w_lower]:
                if alias in norm_passage_eval:
                    matched = True
                    break
        if not matched:
            for k, aliases in ALIASES.items():
                if w_lower in aliases and (k in norm_passage_eval or any(a in norm_passage_eval for a in aliases)):
                    matched = True
                    break
        if not matched and w_lower in MONTH_ALIASES:
            for alias in MONTH_ALIASES[w_lower]:
                if alias in norm_passage_eval:
                    matched = True
                    break
        if not matched:
            for k, aliases in MONTH_ALIASES.items():
                if w_lower in aliases and (k in norm_passage_eval or any(a in norm_passage_eval for a in aliases)):
                    matched = True
                    break
        if not matched:
            missing_entities.append(w)
            
    condition_b = (
        len(missing_numbers) == 0 and
        len(missing_phrases) == 0 and
        len(missing_entities) == 0
    )
    
    is_supported = condition_a and condition_b
    status = "supported" if is_supported else ("unsupported" if not llm_supported else "partially_supported")
    return {
        "is_supported": is_supported,
        "status": status,
        "coverage": round(coverage, 3),
        "valid_quotes": valid_quotes,
        "missing_numbers": list(missing_numbers),
        "missing_entities": missing_entities,
        "condition_a": condition_a,
        "condition_b": condition_b
    }

def run_candidate_benchmark(model_name: str, pairs: List[Dict[str, Any]], batch_size: int = 5) -> Dict[str, Any]:
    print(f"\n{'='*80}")
    print(f"BENCHMARKING CANDIDATE JUDGE MODEL: {model_name}")
    print(f"{'='*80}")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_reasoning_tokens = 0
    total_tokens = 0
    
    pair_results = []
    
    for b_idx in range(0, len(pairs), batch_size):
        batch = pairs[b_idx:b_idx+batch_size]
        print(f"\n--- Batch {b_idx//batch_size + 1}/{(len(pairs)+batch_size-1)//batch_size} (Pairs #{batch[0]['id']} - #{batch[-1]['id']}) ---")
        
        sources_text = "\n\n".join([
            f"[[c:{item['id']}]] {item['passage']}"
            for item in batch
        ])
        claims_to_judge = [
            {"claim_id": item["id"], "text": item["claim"], "citation_id": item["id"]}
            for item in batch
        ]
        
        prompt = (
            "You are a rigorous Scientific Fact-Checking and Evidence Verification Engine.\n"
            "For each claim statement below, determine whether the cited source snippet explicitly and factually supports it.\n"
            "Be strict: if a claim reverses a relation, uses wrong numbers, attributes an outcome incorrectly, or adds assertions not in snippet, set \"supported\": false.\n"
            "If the snippet fully supports the claim:\n"
            "  - Set \"supported\": true\n"
            "  - Provide \"quotes\": a list of up to 2 EXACT, VERBATIM quotes copied word-for-word from the snippet that directly prove the statement (include the full clause from the snippet covering both the observation and the values/units, at most 40 words).\n"
            "If the snippet does NOT support the claim:\n"
            "  - Set \"supported\": false\n"
            "  - Set \"quotes\": []\n\n"
            f"Cited Sources:\n{sources_text}\n\n"
            f"Claims to Verify:\n{json.dumps(claims_to_judge, separators=(',', ':'))}\n\n"
            "Return ONLY a valid JSON array of objects:\n"
            '[{"claim_id": 0, "supported": true, "quotes": ["verbatim quote"]}]'
        )
        
        payload = {
            "model": model_name,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1500,
            "temperature": 0.0
        }
        if "gpt-oss" in model_name:
            payload["reasoning_effort"] = "low"
            
        data = None
        for attempt in range(3):
            try:
                with httpx.Client(timeout=45.0) as client:
                    resp = client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        break
                    elif resp.status_code == 429:
                        print(f"Groq 429 encountered, waiting 5s before retry...")
                        time.sleep(5.0)
                        continue
                    else:
                        print(f"ERROR: Groq returned {resp.status_code}: {resp.text}")
                        break
            except Exception as conn_err:
                print(f"Connection attempt {attempt+1} failed: {conn_err}, retrying in 2s...")
                time.sleep(2.0)
                
        if not data:
            print(f"Failed to get response for batch {b_idx//batch_size + 1}")
            continue
            
        usage = data.get("usage", {})
        p_tok = usage.get("prompt_tokens", 0)
        c_tok = usage.get("completion_tokens", 0)
        t_tok = usage.get("total_tokens", p_tok + c_tok)
        r_tok = usage.get("completion_tokens_details", {}).get("reasoning_tokens", 0)
        
        total_prompt_tokens += p_tok
        total_completion_tokens += c_tok
        total_reasoning_tokens += r_tok
        total_tokens += t_tok
        
        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        try:
            verdicts = json.loads(content)
        except Exception as e:
            print(f"JSON Parse error: {e}. Raw content:\n{content}")
            verdicts = []
            
        verdict_map = {v["claim_id"]: v for v in verdicts if "claim_id" in v}
        
        for item in batch:
            cid = item["id"]
            v = verdict_map.get(cid, {"supported": False, "quotes": []})
            eval_res = evaluate_claim_in_code(
                claim_text=item["claim"],
                passage=item["passage"],
                llm_supported=v.get("supported", False),
                quotes=v.get("quotes", [])
            )
            
            verdict_bool = eval_res["is_supported"]
            is_correct = (verdict_bool == item["ground_truth"])
            res_record = {
                "id": cid,
                "type": item["type"],
                "ground_truth": item["ground_truth"],
                "llm_supported": v.get("supported", False),
                "code_supported": verdict_bool,
                "status": eval_res["status"],
                "coverage": eval_res["coverage"],
                "is_correct": is_correct,
                "quotes": eval_res["valid_quotes"],
                "claim": item["claim"]
            }
            pair_results.append(res_record)
            
            status_icon = "PASS" if is_correct else "FAIL"
            print(f"Pair #{cid:02d} [{item['type'][:14]:<14}] | GT: {str(item['ground_truth']):<5} | Code: {str(verdict_bool):<5} | LLM: {str(v.get('supported', False)):<5} | Cov: {eval_res['coverage']:.2f} | {status_icon}")
            if not is_correct:
                print(f"       -> LLM quotes: {v.get('quotes')}")
                print(f"       -> Valid quotes in code: {eval_res['valid_quotes']}")
                if eval_res["missing_entities"]:
                    print(f"       -> Missing entities: {eval_res['missing_entities']}")
                if eval_res["missing_numbers"]:
                    print(f"       -> Missing numbers: {eval_res['missing_numbers']}")
            
        time.sleep(2.5)
        
    correct_count = sum(1 for r in pair_results if r["is_correct"])
    accuracy = correct_count / len(pair_results) if pair_results else 0.0
    
    bad_claims_accepted = [r for r in pair_results if not r["ground_truth"] and r["code_supported"]]
    good_claims_flagged = [r for r in pair_results if r["ground_truth"] and not r["code_supported"]]
    
    tokens_per_pair = round(total_tokens / len(pair_results), 1) if pair_results else 0
    
    summary = {
        "model": model_name,
        "total_pairs": len(pair_results),
        "correct": correct_count,
        "accuracy": round(accuracy * 100, 1),
        "bad_claims_accepted": len(bad_claims_accepted),
        "good_claims_flagged": len(good_claims_flagged),
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": total_completion_tokens,
        "reasoning_tokens": total_reasoning_tokens,
        "total_tokens": total_tokens,
        "tokens_per_pair": tokens_per_pair,
        "bad_claims_accepted_ids": [r["id"] for r in bad_claims_accepted],
        "good_claims_flagged_ids": [r["id"] for r in good_claims_flagged]
    }
    
    print("\n" + "="*80)
    print(f"SUMMARY FOR CANDIDATE: {model_name}")
    print(f"{'Metric':<25} | {'Value'}")
    print("-" * 50)
    print(f"{'Total Pairs':<25} | {summary['total_pairs']}")
    print(f"{'Accuracy':<25} | {summary['accuracy']}% ({summary['correct']}/{summary['total_pairs']})")
    print(f"{'Bad Claims Accepted':<25} | {summary['bad_claims_accepted']} (IDs: {summary['bad_claims_accepted_ids']})")
    print(f"{'Good Claims Flagged':<25} | {summary['good_claims_flagged']} (IDs: {summary['good_claims_flagged_ids']})")
    print(f"{'Total Tokens':<25} | {summary['total_tokens']} (prompt: {summary['prompt_tokens']}, completion: {summary['completion_tokens']}, reasoning: {summary['reasoning_tokens']})")
    print(f"{'Tokens per Pair':<25} | {summary['tokens_per_pair']}")
    print("="*80 + "\n")
    return summary

if __name__ == "__main__":
    with open("data/dristi_40_pairs.json", "r", encoding="utf-8") as f:
        pairs = json.load(f)
        
    models_to_test = sys.argv[1:] if len(sys.argv) > 1 else ["openai/gpt-oss-120b"]
    for m in models_to_test:
        run_candidate_benchmark(m, pairs, batch_size=5)
