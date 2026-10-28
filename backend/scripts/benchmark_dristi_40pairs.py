import json
import os
import sys
import time
import httpx

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

# 40-pair benchmark set using real ARIA snippets
# 20 Supported (True)
# 20 Unsupported (False): 5 reversed relations, 5 wrong numbers, 5 mechanisms not in passage, 5 unrelated claims

PAIR_DATA = [
    # --- 20 SUPPORTED PAIRS ---
    # OKF Snippet 1 (Autonomous Systems)
    {
        "id": 1,
        "type": "supported",
        "ground_truth": True,
        "passage": "An autonomous system is a computational or physical entity capable of perceiving its environment, formulating goal-directed plans, and executing actions over extended operational horizons without continuous human intervention. Level 4 (High Automation): System sustains complete dynamic performance and automated fallback within defined ODD even if human fails to intervene.",
        "claim": "An autonomous system can execute actions over extended operational horizons without continuous human intervention."
    },
    {
        "id": 2,
        "type": "supported",
        "ground_truth": True,
        "passage": "Level 0 (No Automation): System provides warnings or momentary intervention; human controls all execution. Level 1 (Driver / Operator Assistance): Execution of either steering or acceleration/deceleration using environmental information.",
        "claim": "In Level 0 autonomy, the system provides warnings or momentary intervention while the human controls all execution."
    },
    {
        "id": 3,
        "type": "supported",
        "ground_truth": True,
        "passage": "Level 4 (High Automation): System sustains complete dynamic performance and automated fallback within defined ODD even if human fails to intervene. Level 5 (Full Automation): Unconditional automated performance across all environmental and operational conditions manageable by human operators.",
        "claim": "Level 4 high automation sustains automated fallback within its defined ODD even if a human fails to intervene."
    },
    {
        "id": 4,
        "type": "supported",
        "ground_truth": True,
        "passage": "Subsumption Architecture: Layered reactive behaviors without centralized world models (Brooks, 1986).",
        "claim": "Brooks introduced the subsumption architecture featuring layered reactive behaviors without centralized world models."
    },
    {
        "id": 5,
        "type": "supported",
        "ground_truth": True,
        "passage": "Taxonomy of Autonomy Levels (adapted from SAE J3016 and NIST ALFUS): Level 2 (Partial Automation): Simultaneous execution of multiple sub-tasks with human monitoring and immediate fallback readiness.",
        "claim": "Level 2 partial automation requires human monitoring and immediate fallback readiness."
    },
    {
        "id": 6,
        "type": "supported",
        "ground_truth": True,
        "passage": "Level 3 (Conditional Automation): System handles all aspects of dynamic performance within an Operational Design Domain (ODD); human intervenes upon request.",
        "claim": "Under conditional automation (Level 3), the human driver intervenes upon request from the system."
    },
    # OKF Snippet 2 (Multi-agent Consensus)
    {
        "id": 7,
        "type": "supported",
        "ground_truth": True,
        "passage": "In synchronous systems with unauthenticated messages, consensus is impossible unless more than two-thirds of nodes are non-faulty: n >= 3f + 1, where f denotes the maximum number of Byzantine failures (Lamport, Shostak, & Pease, 1982).",
        "claim": "Byzantine consensus in unauthenticated synchronous systems requires at least 3f + 1 total nodes to tolerate f failures."
    },
    {
        "id": 8,
        "type": "supported",
        "ground_truth": True,
        "passage": "FLP Impossibility Result: Deterministic asynchronous consensus cannot guarantee liveness in the presence of even a single unannounced crash failure (Fischer, Lynch, & Paterson, 1985).",
        "claim": "The FLP impossibility theorem proves that deterministic asynchronous consensus cannot guarantee liveness with even a single crash failure."
    },
    {
        "id": 9,
        "type": "supported",
        "ground_truth": True,
        "passage": "Practical Byzantine Fault Tolerance (PBFT): Provides safety and liveness under partial synchrony using three-phase message exchanges (Pre-prepare, Prepare, Commit) with polynomial complexity O(n^2).",
        "claim": "PBFT achieves safety and liveness under partial synchrony using Pre-prepare, Prepare, and Commit message phases."
    },
    {
        "id": 10,
        "type": "supported",
        "ground_truth": True,
        "passage": "Application to Multi-Agent Reasoning Pipelines: Hypotheses proposed by individual agents require quorum verification (2f + 1 matching endorsements) prior to commitment into verified shared memory.",
        "claim": "Multi-agent reasoning pipelines require 2f + 1 matching endorsements before committing hypotheses to verified memory."
    },
    # RAG Snippet (CRISPR-Cas9)
    {
        "id": 11,
        "type": "supported",
        "ground_truth": True,
        "passage": "High-fidelity engineered Cas9 nucleases (such as SpCas9-HF1, eSpCas9, and HypaCas9) featuring mutated contact residues that destabilize non-target strand binding.",
        "claim": "Engineered Cas9 nucleases like SpCas9-HF1 feature mutated contact residues that destabilize non-target binding."
    },
    {
        "id": 12,
        "type": "supported",
        "ground_truth": True,
        "passage": "Paired nickase configurations (Cas9n D10A) creating adjacent single-strand breaks on opposing strands, requiring dual guide RNA recognition.",
        "claim": "Paired nickase configurations using Cas9n D10A create adjacent single-strand breaks on opposing strands."
    },
    {
        "id": 13,
        "type": "supported",
        "ground_truth": True,
        "passage": "Prime editing systems and transient delivery via ribonucleoprotein (RNP) complexes, restricting nuclease exposure duration to diminish off-target accumulation.",
        "claim": "Transient delivery of Cas9 via ribonucleoprotein complexes restricts nuclease exposure duration."
    },
    {
        "id": 14,
        "type": "supported",
        "ground_truth": True,
        "passage": "Engineered SpCas9-HF1 achieves high genome-wide specificity by altering contact residues with the DNA phosphate backbone.",
        "claim": "SpCas9-HF1 alters contact residues with the DNA phosphate backbone to improve target specificity."
    },
    {
        "id": 15,
        "type": "supported",
        "ground_truth": True,
        "passage": "Cas9n D10A paired nickases require dual guide RNA recognition at offset genomic sites to generate a double-strand break.",
        "claim": "Paired Cas9 nickases require dual guide RNA recognition at offset genomic sites."
    },
    # LIVE Snippet (JWST)
    {
        "id": 16,
        "type": "supported",
        "ground_truth": True,
        "passage": "The James Webb Space Telescope (JWST) confirmed the discovery of galaxy JADES-GS-z14-0 at redshift z = 14.32, corresponding to approximately 290 million years after the Big Bang.",
        "claim": "JWST observed galaxy JADES-GS-z14-0 at redshift z = 14.32."
    },
    {
        "id": 17,
        "type": "supported",
        "ground_truth": True,
        "passage": "Spectroscopic measurements with NIRSpec confirmed the Lyman break and high intrinsic luminosity of galaxy JADES-GS-z14-0.",
        "claim": "NIRSpec spectroscopic measurements confirmed the Lyman break for JADES-GS-z14-0."
    },
    {
        "id": 18,
        "type": "supported",
        "ground_truth": True,
        "passage": "Observations of exoplanet LHS 1140 b revealed evidence of a nitrogen-dominated atmosphere and potential water ice mantle.",
        "claim": "JWST observations of exoplanet LHS 1140 b showed evidence of a nitrogen-dominated atmosphere."
    },
    {
        "id": 19,
        "type": "supported",
        "ground_truth": True,
        "passage": "JWST Mid-Infrared Instrument (MIRI) resolved warm dust structures and rings within the debris disk of the Vega star system.",
        "claim": "The MIRI instrument resolved warm dust structures within the debris disk around Vega."
    },
    {
        "id": 20,
        "type": "supported",
        "ground_truth": True,
        "passage": "JADES-GS-z14-0 existed approximately 290 million years post-Big Bang, exhibiting unexpected brightness and stellar mass.",
        "claim": "JADES-GS-z14-0 existed roughly 290 million years after the Big Bang."
    },

    # --- 20 UNSUPPORTED PAIRS ---
    # Subgroup A: 5 Reversed Relations
    {
        "id": 21,
        "type": "unsupported_reversed_relation",
        "ground_truth": False,
        "passage": "Paired nickase configurations (Cas9n D10A) creating adjacent single-strand breaks on opposing strands, requiring dual guide RNA recognition.",
        "claim": "Cas9n D10A creates double-strand breaks directly without requiring paired guide RNAs."
    },
    {
        "id": 22,
        "type": "unsupported_reversed_relation",
        "ground_truth": False,
        "passage": "Subsumption Architecture: Layered reactive behaviors without centralized world models (Brooks, 1986).",
        "claim": "The subsumption architecture requires a centralized world model to coordinate layered reactive behaviors."
    },
    {
        "id": 23,
        "type": "unsupported_reversed_relation",
        "ground_truth": False,
        "passage": "Level 4 (High Automation): System sustains complete dynamic performance and automated fallback within defined ODD even if human fails to intervene.",
        "claim": "Level 4 high automation requires continuous human intervention to execute automated fallback routines."
    },
    {
        "id": 24,
        "type": "unsupported_reversed_relation",
        "ground_truth": False,
        "passage": "High-fidelity engineered Cas9 nucleases (such as SpCas9-HF1, eSpCas9, and HypaCas9) featuring mutated contact residues that destabilize non-target strand binding.",
        "claim": "SpCas9-HF1 stabilizes non-target strand binding to increase off-target cleavage efficiency."
    },
    {
        "id": 25,
        "type": "unsupported_reversed_relation",
        "ground_truth": False,
        "passage": "Deterministic asynchronous consensus cannot guarantee liveness in the presence of even a single unannounced crash failure (Fischer, Lynch, & Paterson, 1985).",
        "claim": "The FLP impossibility theorem proves that asynchronous deterministic consensus guarantees liveness despite crash failures."
    },

    # Subgroup B: 5 Wrong Numbers
    {
        "id": 26,
        "type": "unsupported_wrong_number",
        "ground_truth": False,
        "passage": "The James Webb Space Telescope (JWST) confirmed the discovery of galaxy JADES-GS-z14-0 at redshift z = 14.32, corresponding to approximately 290 million years after the Big Bang.",
        "claim": "JWST confirmed the discovery of galaxy JADES-GS-z14-0 at redshift z = 7.15."
    },
    {
        "id": 27,
        "type": "unsupported_wrong_number",
        "ground_truth": False,
        "passage": "JADES-GS-z14-0 existed approximately 290 million years post-Big Bang, exhibiting unexpected brightness and stellar mass.",
        "claim": "JADES-GS-z14-0 existed 950 million years after the Big Bang."
    },
    {
        "id": 28,
        "type": "unsupported_wrong_number",
        "ground_truth": False,
        "passage": "Taxonomy of Autonomy Levels (adapted from SAE J3016 and NIST ALFUS): Levels range from Level 0 to Level 5.",
        "claim": "The SAE J3016 standard defines an autonomy taxonomy ranging across nine distinct operational levels from Level 1 to Level 9."
    },
    {
        "id": 29,
        "type": "unsupported_wrong_number",
        "ground_truth": False,
        "passage": "Consensus is impossible unless more than two-thirds of nodes are non-faulty: n >= 3f + 1, where f denotes the maximum number of Byzantine failures.",
        "claim": "Byzantine fault tolerance requires a supermajority of at least n >= 7f + 3 non-faulty nodes."
    },
    {
        "id": 30,
        "type": "unsupported_wrong_number",
        "ground_truth": False,
        "passage": "Practical Byzantine Fault Tolerance (PBFT) provides polynomial communication complexity O(n^2).",
        "claim": "Practical Byzantine Fault Tolerance scales with exponential message complexity O(2^n)."
    },

    # Subgroup C: 5 Mechanisms Not in Passage
    {
        "id": 31,
        "type": "unsupported_unmentioned_mechanism",
        "ground_truth": False,
        "passage": "Off-target cleavage during CRISPR-Cas9 genome editing presents substantial challenges for therapeutic translation. Key mitigation strategies include high-fidelity engineered nucleases and paired nickases.",
        "claim": "CRISPR off-target cleavage is mitigated by incorporating magnetic nanoparticle resonance to guide Cas9 cleavage."
    },
    {
        "id": 32,
        "type": "unsupported_unmentioned_mechanism",
        "ground_truth": False,
        "passage": "High-fidelity engineered Cas9 nucleases (such as SpCas9-HF1, eSpCas9, and HypaCas9) featuring mutated contact residues that destabilize non-target strand binding.",
        "claim": "SpCas9-HF1 employs zinc-finger fusion domains to enforce strand proofreading."
    },
    {
        "id": 33,
        "type": "unsupported_unmentioned_mechanism",
        "ground_truth": False,
        "passage": "Observations of exoplanet LHS 1140 b revealed evidence of a nitrogen-dominated atmosphere and potential water ice mantle.",
        "claim": "LHS 1140 b possesses active technological radio beacons detected by the MIRI spectrometer."
    },
    {
        "id": 34,
        "type": "unsupported_unmentioned_mechanism",
        "ground_truth": False,
        "passage": "An autonomous system is a computational or physical entity capable of perceiving its environment, formulating goal-directed plans, and executing actions over extended operational horizons.",
        "claim": "Autonomous artificial intelligence agents maintain goal coherence through quantum entanglement synchronization."
    },
    {
        "id": 35,
        "type": "unsupported_unmentioned_mechanism",
        "ground_truth": False,
        "passage": "PBFT uses three-phase message exchanges (Pre-prepare, Prepare, Commit) under partial synchrony.",
        "claim": "PBFT secures agreement across nodes using proof-of-work cryptographic hashing puzzles."
    },

    # Subgroup D: 5 Unrelated Claims
    {
        "id": 36,
        "type": "unsupported_unrelated_claim",
        "ground_truth": False,
        "passage": "The James Webb Space Telescope (JWST) confirmed the discovery of galaxy JADES-GS-z14-0 at redshift z = 14.32.",
        "claim": "High-temperature copper-oxide superconductors demonstrate zero electrical resistance below 135 Kelvin."
    },
    {
        "id": 37,
        "type": "unsupported_unrelated_claim",
        "ground_truth": False,
        "passage": "Paired nickase configurations (Cas9n D10A) creating adjacent single-strand breaks on opposing strands, requiring dual guide RNA recognition.",
        "claim": "Ancient Roman marine concrete gains compressive strength over millennia through aluminum tobermorite crystallization."
    },
    {
        "id": 38,
        "type": "unsupported_unrelated_claim",
        "ground_truth": False,
        "passage": "Consensus in decentralized multi-agent systems requires establishing agreement on shared state variables despite network partitions.",
        "claim": "Photosynthetic light-harvesting complexes utilize exciton coherence to transfer excitation energy to reaction centers."
    },
    {
        "id": 39,
        "type": "unsupported_unrelated_claim",
        "ground_truth": False,
        "passage": "Subsumption Architecture: Layered reactive behaviors without centralized world models (Brooks, 1986).",
        "claim": "The Navier-Stokes equations describe the motion of viscous fluid substances through partial differential equations."
    },
    {
        "id": 40,
        "type": "unsupported_unrelated_claim",
        "ground_truth": False,
        "passage": "JWST Mid-Infrared Instrument (MIRI) resolved warm dust structures and rings within the debris disk of the Vega star system.",
        "claim": "Mitochondrial oxidative phosphorylation generates adenosine triphosphate across the inner cristae membrane."
    }
]

def run_benchmark():
    # 1. Save benchmark dataset to data/dristi_40_pairs.json
    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, "dristi_40_pairs.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(PAIR_DATA, f, indent=2)
    print(f"Saved 40-pair dataset to: {out_file}")

    print("\n" + "=" * 80)
    print("PATCH 4C: BENCHMARKING DRISTI COMPOUND VERIFIER ON 40 ARIA CLAIM-PASSAGE PAIRS")
    print("Target Server: http://127.0.0.1:8001/predict")
    print("=" * 80)

    url = "http://127.0.0.1:8001/predict"
    results = []
    v1_latencies = []
    v2_latencies = []
    v1_count = 0
    v2_count = 0
    abstain_count = 0

    # Dristi training input format:
    # question: formatted context + claim query
    # options: ["Yes", "No"] (where Yes = Supported, No = Unsupported)
    options = ["Yes", "No"]

    with httpx.Client(timeout=5.0) as client:
        for item in PAIR_DATA:
            qid = item["id"]
            claim = item["claim"]
            passage = item["passage"]
            gt = item["ground_truth"]
            q_type = item["type"]

            prompt = f"Source Passage: {passage}\nClaim: {claim}\nDoes the source passage support this claim?"
            payload = {
                "question": prompt,
                "options": options
            }

            t0 = time.perf_counter()
            try:
                resp = client.post(url, json=payload)
                elapsed_ms = (time.perf_counter() - t0) * 1000
                if resp.status_code == 200:
                    d = resp.json()
                else:
                    d = {"decision": "ERROR", "abstain": True, "engine_used": "none", "confidence": 0.0}
            except Exception as e:
                elapsed_ms = (time.perf_counter() - t0) * 1000
                d = {"decision": "ERROR", "abstain": True, "engine_used": "none", "confidence": 0.0, "error": str(e)}

            engine = d.get("engine_used", "unknown")
            abstain = d.get("abstain", False)
            selected_option = d.get("selected_option", "")
            decision = d.get("decision", "")
            conf = d.get("confidence", 0.0)

            # Map decision to boolean verdict
            # If Dristi selected "Yes" -> verdict is True (Supported)
            # If Dristi selected "No" -> verdict is False (Unsupported)
            if selected_option == "Yes" or decision == "YES":
                verdict = True
            elif selected_option == "No" or decision == "NO":
                verdict = False
            else:
                verdict = None

            if "V1" in engine:
                v1_count += 1
                v1_latencies.append(elapsed_ms)
            elif "V2" in engine:
                v2_count += 1
                v2_latencies.append(elapsed_ms)

            if abstain:
                abstain_count += 1

            # Evaluation vs Ground Truth
            # If abstained, it is not correct
            is_correct = (verdict == gt) and not abstain

            results.append({
                "id": qid,
                "type": q_type,
                "ground_truth": gt,
                "verdict": verdict,
                "selected_option": selected_option,
                "decision": decision,
                "confidence": conf,
                "abstain": abstain,
                "engine": engine,
                "latency_ms": round(elapsed_ms, 2),
                "is_correct": is_correct
            })

            res_tag = "CORRECT" if is_correct else ("ABSTAIN" if abstain else "WRONG")
            print(f"[{qid:02d}/40] GT: {str(gt):5} | Pred: {str(verdict):5} (opt={selected_option}, conf={conf:.2f}, abstain={abstain}) | Engine: {engine:22} | {elapsed_ms:5.1f}ms | {res_tag}")

    total = len(results)
    correct_count = sum(1 for r in results if r["is_correct"])
    accuracy = correct_count / total
    abstain_rate = abstain_count / total

    # Confusion Matrix:
    # TP: GT True, Pred True (not abstained)
    # FP: GT False, Pred True (not abstained)
    # TN: GT False, Pred False (not abstained)
    # FN: GT True, Pred False (not abstained)
    # Abstain: model refrained from deciding
    tp = sum(1 for r in results if r["ground_truth"] is True and r["verdict"] is True and not r["abstain"])
    fp = sum(1 for r in results if r["ground_truth"] is False and r["verdict"] is True and not r["abstain"])
    tn = sum(1 for r in results if r["ground_truth"] is False and r["verdict"] is False and not r["abstain"])
    fn = sum(1 for r in results if r["ground_truth"] is True and r["verdict"] is False and not r["abstain"])
    ab_true = sum(1 for r in results if r["ground_truth"] is True and r["abstain"])
    ab_false = sum(1 for r in results if r["ground_truth"] is False and r["abstain"])

    v1_avg_lat = sum(v1_latencies) / len(v1_latencies) if v1_latencies else 0.0
    v2_avg_lat = sum(v2_latencies) / len(v2_latencies) if v2_latencies else 0.0
    escalation_share = v2_count / total

    print("\n" + "=" * 80)
    print("BENCHMARK RESULTS SUMMARY (40-PAIR TEST SET)")
    print("=" * 80)
    print(f"Total Test Pairs:           {total} (20 Supported, 20 Unsupported)")
    print(f"Correct Decisions:          {correct_count} / {total}")
    print(f"Accuracy:                   {accuracy:.1%}")
    print(f"Abstain Rate:               {abstain_rate:.1%} ({abstain_count} / {total})")
    print(f"V1 to V2 Escalation Share:  {escalation_share:.1%} ({v2_count} / {total})")
    print(f"V1 (Fast) Avg Latency:      {v1_avg_lat:.2f} ms ({v1_count} queries)")
    print(f"V2 (Heavy) Avg Latency:     {v2_avg_lat:.2f} ms ({v2_count} queries)")
    print("\n--- CONFUSION MATRIX ---")
    print(f"               Predicted SUPPORTED  Predicted UNSUPPORTED  ABSTAIN")
    print(f"Actual TRUE:   {tp:19d}  {fn:21d}  {ab_true:7d}")
    print(f"Actual FALSE:  {fp:19d}  {tn:21d}  {ab_false:7d}")
    print("=" * 80)

if __name__ == "__main__":
    run_benchmark()
