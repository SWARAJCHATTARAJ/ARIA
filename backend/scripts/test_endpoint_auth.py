import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app, base_url="http://testserver")

def test_unauthenticated_endpoints():
    print("=== Testing unauthenticated access to /api/query ===")
    r = client.post("/api/query", json={"query": "Test question about physics"})
    print(f"POST /api/query without auth -> status: {r.status_code}, response: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"
    assert "Authentication required" in r.json()["detail"]

    print("\n=== Testing invalid token on /api/query ===")
    r = client.post("/api/query", json={"query": "Test question about physics"}, headers={"Authorization": "Bearer bad-token-999"})
    print(f"POST /api/query with bad token -> status: {r.status_code}, response: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    print("\n=== Testing unauthenticated access to /api/feedback ===")
    r = client.post("/api/feedback", json={"message_id": "1", "verdict": "accurate"})
    print(f"POST /api/feedback without auth -> status: {r.status_code}, response: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    print("\n=== Testing unauthenticated access to /api/export/pdf ===")
    r = client.post("/api/export/pdf", json={"query": "Test", "answer_final": "Test"})
    print(f"POST /api/export/pdf without auth -> status: {r.status_code}, response: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    print("\n=== Testing unauthenticated access to /api/okf/sync ===")
    r = client.post("/api/okf/sync", json={"title": "Test", "content": "Test note"})
    print(f"POST /api/okf/sync without auth -> status: {r.status_code}, response: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    print("\n=== Testing unauthenticated access to /api/okf/list ===")
    r = client.get("/api/okf/list")
    print(f"GET /api/okf/list without auth -> status: {r.status_code}, response: {r.json()}")
    assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    print("\nALL ENDPOINT AUTHENTICATION TESTS PASSED: Unauthenticated access is completely blocked!")
    return True

if __name__ == "__main__":
    success = test_unauthenticated_endpoints()
    sys.exit(0 if success else 1)
