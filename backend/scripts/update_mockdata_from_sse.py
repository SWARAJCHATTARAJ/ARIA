import json
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

def parse_sse(path):
    events = []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    chunks = content.split("\n\n")
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        if chunk.startswith("data: "):
            data_str = chunk[6:].strip()
            events.append(json.loads(data_str))
    return events

def main():
    okf_events = parse_sse("D:/aria/frontend/public/fixtures/okf.sse")
    rag_events = parse_sse("D:/aria/frontend/public/fixtures/rag.sse")
    live_events = parse_sse("D:/aria/frontend/public/fixtures/live.sse")

    print(f"OKF events: {len(okf_events)}, RAG events: {len(rag_events)}, LIVE events: {len(live_events)}")

    with open("D:/aria/frontend/src/fixtures/mockData.ts", "r", encoding="utf-8") as f:
        content = f.read()

    retraction_marker = '  "retraction": {'
    retraction_idx = content.find(retraction_marker)
    if retraction_idx == -1:
        raise ValueError("Could not find '  \"retraction\": {' in mockData.ts")

    retraction_and_beyond = content[retraction_idx:]

    header = """export interface SSEEvent {
  event: string;
  [key: string]: any;
}

export interface MockFixture {
  id: string;
  query: string;
  label: string;
  events: SSEEvent[];
}

export const MOCK_FIXTURES: Record<string, MockFixture> = {
"""

    okf_json = json.dumps(okf_events, indent=6, ensure_ascii=False)
    rag_json = json.dumps(rag_events, indent=6, ensure_ascii=False)
    live_json = json.dumps(live_events, indent=6, ensure_ascii=False)

    new_content = (
        header
        + '  "okf": {\n'
        + '    "id": "okf",\n'
        + '    "query": "What is the definition and taxonomy of autonomous systems in artificial intelligence?",\n'
        + '    "label": "OKF Resolvable: Autonomous Systems Taxonomy",\n'
        + f'    "events": {okf_json}\n'
        + '  },\n'
        + '  "rag": {\n'
        + '    "id": "rag",\n'
        + '    "query": "What are the off-target mitigation strategies for CRISPR gene editing?",\n'
        + '    "label": "RAG Fallback: CRISPR Mitigation Strategies",\n'
        + f'    "events": {rag_json}\n'
        + '  },\n'
        + '  "live": {\n'
        + '    "id": "live",\n'
        + '    "query": "What were the latest discoveries of the James Webb Space Telescope in 2024?",\n'
        + '    "label": "Live Web Search: JWST 2024 Discoveries",\n'
        + f'    "events": {live_json}\n'
        + '  },\n'
        + retraction_and_beyond
    )

    with open("D:/aria/frontend/src/fixtures/mockData.ts", "w", encoding="utf-8") as f:
        f.write(new_content)

    print("Successfully updated D:/aria/frontend/src/fixtures/mockData.ts")

    # Audit okf claims
    audit_evt = next((e for e in okf_events if e.get("event") == "audit"), None)
    if audit_evt:
        claims = audit_evt.get("claims", [])
        print(f"\nOKF Audit Claims count: {len(claims)}")
        uncited = [c for c in claims if c.get("status") == "uncited"]
        print(f"Uncited claims in OKF: {len(uncited)}")
        for c in claims:
            print(f"  [{c.get('status')}] (cov: {c.get('coverage')}) {c.get('text')[:60]}...")

if __name__ == "__main__":
    main()
