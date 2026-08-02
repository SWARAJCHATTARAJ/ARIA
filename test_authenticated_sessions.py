"""Live test: authenticated session creation and retrieval."""
import json
import sys

import requests

BASE = "http://127.0.0.1:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0X3Rob3JvdWdoIiwiZXhwIjoxNzg1NzQyODA1fQ.-iraF5cBruC_o7R0YWQ1C3T1RDO_DPqgp-hOVutVhig"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

def main():
    print("=== 1. Create session as authenticated user ===")
    r = requests.post(f"{BASE}/api/research", headers=HEADERS,
                      json={"question": "What is ARIA?"}, stream=True, timeout=120)
    print(f"HTTP {r.status_code}")
    body = r.text
    # Extract session_id from SSE output
    session_id = None
    for line in body.splitlines():
        if line.startswith("data: "):
            try:
                payload = json.loads(line[6:])
                if "session_id" in payload:
                    session_id = payload["session_id"]
            except (json.JSONDecodeError, KeyError):
                pass
    print(f"Session ID: {session_id}")
    if not session_id:
        print("ERROR: No session_id in response")
        print(body[:2000])
        sys.exit(1)

    print("\n=== 2. List sessions ===")
    r = requests.get(f"{BASE}/api/sessions", headers=HEADERS, timeout=30)
    print(f"HTTP {r.status_code}")
    data = r.json()
    print(f"Sessions found: {len(data.get('sessions', []))}")
    for s in data.get("sessions", []):
        print(f"  - {s.get('id', '?'):36s} | {s.get('title', '?')[:60]}")

    print("\n=== 3. Retrieve session detail ===")
    r = requests.get(f"{BASE}/api/sessions/{session_id}", headers=HEADERS, timeout=30)
    print(f"HTTP {r.status_code}")
    detail = r.json()
    print(f"Question: {detail.get('result', {}).get('question', '?')}")
    print(f"Answer length: {len(detail.get('result', {}).get('answer', ''))} chars")

    print("\n=== 4. Download session as Markdown ===")
    r = requests.get(f"{BASE}/api/sessions/{session_id}/download/md", headers=HEADERS, timeout=30)
    print(f"HTTP {r.status_code}, Content-Type: {r.headers.get('content-type')}, Size: {len(r.content)} bytes")

    print("\n=== 5. Download session as PDF ===")
    r = requests.get(f"{BASE}/api/sessions/{session_id}/download/pdf", headers=HEADERS, timeout=30)
    print(f"HTTP {r.status_code}, Content-Type: {r.headers.get('content-type')}, Size: {len(r.content)} bytes")

    print("\n=== 6. Download session trace ===")
    r = requests.get(f"{BASE}/api/sessions/{session_id}/download/trace", headers=HEADERS, timeout=30)
    print(f"HTTP {r.status_code}, Content-Type: {r.headers.get('content-type')}, Size: {len(r.content)} bytes")

    print("\n=== 7. Session isolation check (guest should NOT see this session) ===")
    r = requests.get(f"{BASE}/api/sessions", timeout=30)
    print(f"Guest /api/sessions HTTP {r.status_code}")
    guest_data = r.json()
    guest_ids = [s.get("id") for s in guest_data.get("sessions", [])]
    print(f"Authenticated session visible to guest: {session_id in guest_ids}")

    print("\n=== 8. Auth guards (no token should be rejected) ===")
    r = requests.get(f"{BASE}/api/sessions", timeout=30)
    print(f"GET /api/sessions (no auth): HTTP {r.status_code}")  # requires auth
    r = requests.post(f"{BASE}/api/research/plan", json={"question": "test"}, timeout=30)
    print(f"POST /api/research/plan (no auth): HTTP {r.status_code}")  # requires auth

    print("\nALL AUTHENTICATED SESSION TESTS COMPLETE")

if __name__ == "__main__":
    main()
