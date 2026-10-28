import asyncio
import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from pipeline.nodes import run_claim_audit, split_answer_into_claim_sentences

async def run_red_team_test():
    print("======================================================================")
    print("PATCH 4 SECTION B: RED-TEAM AUDIT VERIFICATION TEST")
    print("======================================================================")
    
    snippet_content = (
        "High-fidelity engineered Cas9 nucleases (SpCas9-HF1, eSpCas9, HypaCas9) "
        "featuring mutated contact residues reduce off-target cleavage. "
        "Paired nickase configurations (Cas9n D10A) generate adjacent single-strand "
        "breaks on opposite strands to produce a double-strand break."
    )
    chunk0 = {
        "title": "CRISPR-Cas9 Specificity and Off-Target Mitigation",
        "venue": "Nature Biotechnology",
        "snippet": snippet_content
    }
    chunks = [chunk0]
    
    answer_final = (
        "### CRISPR-Cas9 Off-Target Mitigation\n\n"
        "**Key strategies evaluated in recent studies:**\n\n"
        "High-fidelity engineered Cas9 nucleases featuring mutated contact residues reduce off-target cleavage [[c:0]].\n"
        "Cas9n D10A creates double-strand breaks [[c:0]].\n"
        "Engineered SpCas9-HF1 achieves 99.4% specificity across 850 genomic sites [[c:0]].\n"
        "Prime editing employs engineered pegRNAs to achieve targeted search-and-replace modifications without double-strand breaks.\n"
    )
    
    print("\n--- TEST INPUT: answer_final ---")
    print(answer_final)
    print("--- CONTEXT SNIPPET [c:0] ---")
    print(snippet_content)
    print("\n--- RUNNING AUDIT ---")
    
    claims = await run_claim_audit(answer_final, chunks)
    
    for c in claims:
        print(f"\n[Claim {c['claim_id']}]")
        print(f"  Status: {c['status']}")
        print(f"  Supported: {c['supported']}")
        print(f"  Citation IDs: {c['citation_ids']}")
        print(f"  Offsets: [{c['start']}:{c['end']}] -> \"{answer_final[c['start']:c['end']].strip()}\"")
        print(f"  Clean Text: \"{c['text']}\"")
        print(f"  Evidence: \"{c['evidence']}\"")
        print(f"  Note: {c['note']}")
        
    print("\n--- ASSERTION CHECKS ---")
    assert len(claims) == 4, f"Expected 4 claims (non-claims filtered out), got {len(claims)}"
    
    # Check claim 0: Valid claim
    assert claims[0]["supported"] is True, "Claim 0 should be supported"
    assert claims[0]["status"] == "supported", "Claim 0 status should be 'supported'"
    assert len(claims[0]["evidence"]) > 0, "Claim 0 must have non-empty verbatim evidence"
    assert claims[0]["evidence"] in snippet_content, "Evidence must be exact substring in snippet"
    print("[PASS] Claim 0 (Good claim): Verified SUPPORTED with exact snippet evidence.")
    
    # Check claim 1: Reversed relation ("Cas9n D10A creates double-strand breaks")
    assert claims[1]["supported"] is False, "Claim 1 (reversed relation) must be flagged!"
    assert claims[1]["status"] in ("partially_supported", "unsupported"), f"Claim 1 status={claims[1]['status']}"
    print(f"[PASS] Claim 1 (Reversed relation): Successfully FLAGGED ({claims[1]['status']}) - {claims[1]['note']}")
    
    # Check claim 2: Wrong numbers (99.4%, 850)
    assert claims[2]["supported"] is False, "Claim 2 (wrong number) must be flagged!"
    assert claims[2]["status"] in ("partially_supported", "unsupported"), f"Claim 2 status={claims[2]['status']}"
    assert "unverified numbers" in claims[2]["note"], f"Note should mention numbers: {claims[2]['note']}"
    print(f"[PASS] Claim 2 (Wrong numbers): Successfully FLAGGED ({claims[2]['status']}) - {claims[2]['note']}")
    
    # Check claim 3: Uncited factual sentence
    assert claims[3]["supported"] is False, "Claim 3 (uncited) must be unsupported!"
    assert claims[3]["status"] == "uncited", f"Claim 3 status={claims[3]['status']}"
    assert claims[3]["citation_ids"] == [], "Claim 3 citation_ids must be empty"
    print(f"[PASS] Claim 3 (Uncited factual sentence): Successfully FLAGGED ({claims[3]['status']}) - {claims[3]['note']}")
    
    print("\n======================================================================")
    print("ALL RED-TEAM ASSERTIONS PASSED: ALL 3 BAD SENTENCES FLAGGED")
    print("======================================================================")

if __name__ == "__main__":
    asyncio.run(run_red_team_test())
