import asyncio
import sys
import os
import json
sys.path.insert(0, 'D:/aria/backend')
from dotenv import load_dotenv
load_dotenv('D:/aria/backend/.env')
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8')

from pipeline.nodes import run_claim_audit, compute_claim_quote_coverage

async def test_all_coverages():
    with open('frontend/src/fixtures/mockData.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    prefix = 'export const MOCK_FIXTURES: Record<string, MockFixture> = '
    start_idx = content.find(prefix) + len(prefix)
    end_idx = content.rfind(';\n')
    if end_idx == -1:
        end_idx = content.rfind(';')
    data = json.loads(content[start_idx:end_idx].strip())

    # 1. Q1
    q1 = data['okf']
    q1_audit = next(e for e in q1['events'] if e.get('event') == 'audit')
    q1_cits = [e for e in q1['events'] if e.get('event') == 'citation']

    # 2. Q2
    q2 = data['rag']
    q2_audit = next(e for e in q2['events'] if e.get('event') == 'audit')
    q2_cits = [e for e in q2['events'] if e.get('event') == 'citation']

    # 3. Q3
    q3 = data['live']
    q3_audit = next(e for e in q3['events'] if e.get('event') == 'audit')
    q3_cits = [e for e in q3['events'] if e.get('event') == 'citation']

    # 4. Red-team
    snippet_content = (
        "High-fidelity engineered Cas9 nucleases (SpCas9-HF1, eSpCas9, HypaCas9) "
        "featuring mutated contact residues reduce off-target cleavage. "
        "Paired nickase configurations (Cas9n D10A) generate adjacent single-strand "
        "breaks on opposite strands to produce a double-strand break."
    )
    rt_chunks = [{
        "title": "CRISPR-Cas9 Specificity and Off-Target Mitigation",
        "venue": "Nature Biotechnology",
        "snippet": snippet_content
    }]
    rt_answer = (
        "### CRISPR-Cas9 Off-Target Mitigation\n\n"
        "**Key strategies evaluated in recent studies:**\n\n"
        "High-fidelity engineered Cas9 nucleases featuring mutated contact residues reduce off-target cleavage [[c:0]].\n"
        "Cas9n D10A creates double-strand breaks [[c:0]].\n"
        "Engineered SpCas9-HF1 achieves 99.4% specificity across 850 genomic sites [[c:0]].\n"
        "Prime editing employs engineered pegRNAs to achieve targeted search-and-replace modifications without double-strand breaks.\n"
    )

    print("=========================================================================================")
    print("RUNNING CLAIM AUDIT AND COVERAGE CHECK ACROSS Q1, Q2, Q3, AND RED-TEAM")
    print("=========================================================================================")

    for label, ans, chunks in [
        ("Q1 (OKF Autonomy)", q1_audit['answer_final'], q1_cits),
        ("Q2 (RAG CRISPR)", q2_audit['answer_final'], q2_cits),
        ("Q3 (LIVE JWST)", q3_audit['answer_final'], q3_cits),
        ("Red-Team Test", rt_answer, rt_chunks)
    ]:
        print(f"\n--- {label} ---")
        claims = await run_claim_audit(ans, chunks)
        for c in claims:
            txt_preview = c['text'][:60]
            cov = c.get('coverage', 0.0)
            status = c['status']
            ev = c.get('evidence', '')
            print(f"[{status:20}] Coverage: {cov:6.1%} | {txt_preview}...")
            if ev:
                print(f"   Evidence: \"{ev[:80]}...\"")

if __name__ == '__main__':
    asyncio.run(test_all_coverages())
