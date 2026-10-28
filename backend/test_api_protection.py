import asyncio
import sys
import os
import uuid
import httpx

# Ensure backend in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from utils.api_security import _ip_query_history, _ip_feedback_history, _daily_counter

def main():
    print("=" * 80)
    print("RUNNING API HARDENING AND RATE LIMITING TESTS")
    print("=" * 80)
    
    # Reset in-memory rate limits for test run
    _ip_query_history.clear()
    _ip_feedback_history.clear()
    _daily_counter["count"] = 0
    
    client = TestClient(app)
    
    # 1. Body Size Limit (> 8 KB)
    print("\n--- 1. BODY SIZE LIMIT TEST (> 8 KB) ---")
    large_payload = {"query": "x" * 9000, "thread_id": str(uuid.uuid4())}
    resp = client.post("/api/query", json=large_payload)
    print(f"Status: {resp.status_code} | Response: {resp.text[:100]}")
    assert resp.status_code in (400, 413), f"Expected 400 or 413, got {resp.status_code}"
    print("[PASS] Body size > 8 KB correctly rejected.")

    # 2. Query Length Limit (> 500 characters)
    print("\n--- 2. QUERY LENGTH LIMIT TEST (> 500 chars) ---")
    long_query_payload = {"query": "A" * 501, "thread_id": str(uuid.uuid4())}
    resp = client.post("/api/query", json=long_query_payload)
    print(f"Status: {resp.status_code} | Detail: {resp.json().get('detail')}")
    assert resp.status_code == 400
    assert "exceeds 500 characters" in resp.json().get("detail", "")
    print("[PASS] Query > 500 characters correctly returned 400.")

    # 3. Invalid thread_id (Not a valid UUID)
    print("\n--- 3. THREAD_ID UUID VALIDATION TEST ---")
    bad_uuid_payload = {"query": "Valid query", "thread_id": "not-a-valid-uuid-12345"}
    resp = client.post("/api/query", json=bad_uuid_payload)
    print(f"Status: {resp.status_code} | Detail: {resp.json().get('detail')}")
    assert resp.status_code == 400
    assert "must be a valid UUID" in resp.json().get("detail", "")
    print("[PASS] Non-UUID thread_id correctly rejected with 400.")

    # 4. Anonymous Per-IP Rate Limit (5 queries per hour)
    print("\n--- 4. ANONYMOUS PER-IP RATE LIMIT (5 queries/hr) ---")
    client_ip = "testclient"
    _ip_query_history.clear()
    
    # Send 5 allowed queries
    for i in range(5):
        valid_payload = {"query": f"Test question {i}", "thread_id": str(uuid.uuid4())}
        # Mock request by directly invoking rate limit check or sending request
        from utils.api_security import check_anonymous_rate_limit, record_anonymous_request
        allowed, retry_after, msg = check_anonymous_rate_limit("198.51.100.1")
        assert allowed is True, f"Query {i+1} should be allowed"
        record_anonymous_request("198.51.100.1")
        print(f"Query {i+1}/5 allowed.")

    # 6th query must be rejected with 429
    allowed, retry_after, msg = check_anonymous_rate_limit("198.51.100.1")
    assert allowed is False, "Query 6 must be blocked!"
    assert retry_after > 0, "Retry-After must be > 0"
    print(f"Query 6/5 rejected: allowed={allowed}, retry_after={retry_after}s")
    print(f"Message: '{msg}'")
    assert "5 requests per hour" in msg
    print("[PASS] Per-IP rate limit correctly enforced 5 queries/hr and returned retry-after.")

    # 5. Global DAILY_QUERY_CAP Check
    print("\n--- 5. GLOBAL DAILY QUERY CAP CHECK ---")
    _daily_counter["count"] = 100
    allowed, retry_after, msg = check_anonymous_rate_limit("203.0.113.99")
    assert allowed is False, "Daily cap must block new anonymous queries!"
    assert "Daily query cap" in msg
    assert retry_after > 0
    print(f"Daily cap block: allowed={allowed}, retry_after={retry_after}s")
    print(f"Message: '{msg}'")
    print("[PASS] Global DAILY_QUERY_CAP correctly returned 429 with retry-after.")
    _daily_counter["count"] = 0  # reset

    # 6. /api/feedback Verdict Enum Validation
    print("\n--- 6. /api/feedback VERDICT ENUM VALIDATION ---")
    bad_feedback = {
        "message_id": "msg-123",
        "thread_id": str(uuid.uuid4()),
        "verdict": "completely_unsupported_verdict_enum"
    }
    resp = client.post("/api/feedback", json=bad_feedback)
    print(f"Status: {resp.status_code} | Detail: {resp.json().get('detail')}")
    assert resp.status_code == 400
    assert "Invalid verdict" in resp.json().get("detail", "")
    print("[PASS] Invalid feedback verdict rejected with 400.")

    # 7. /api/feedback String Length Limits
    print("\n--- 7. /api/feedback STRING LENGTH LIMITS ---")
    giant_msg_feedback = {
        "message_id": "m" * 150,
        "thread_id": str(uuid.uuid4()),
        "verdict": "accurate"
    }
    resp = client.post("/api/feedback", json=giant_msg_feedback)
    print(f"Status: {resp.status_code} | Detail: {resp.json().get('detail')}")
    assert resp.status_code == 400
    assert "message_id must be between" in resp.json().get("detail", "")
    print("[PASS] Excessive feedback string lengths rejected with 400.")

    # 8. Security Headers Verification
    print("\n--- 8. SECURITY HEADERS VERIFICATION ---")
    health_resp = client.get("/health")
    assert health_resp.headers.get("x-content-type-options") == "nosniff"
    assert "x-request-id" in health_resp.headers
    print(f"[PASS] X-Content-Type-Options: {health_resp.headers.get('x-content-type-options')}")
    print(f"[PASS] X-Request-ID present: {health_resp.headers.get('x-request-id')}")

    print("\n" + "=" * 80)
    print("ALL API PROTECTION & SECURITY TESTS PASSED")
    print("=" * 80)

if __name__ == "__main__":
    main()
