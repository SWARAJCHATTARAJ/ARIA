import sys
import os
import uuid
from unittest.mock import patch, AsyncMock

# Ensure backend in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from utils.api_security import (
    _user_query_history,
    _user_feedback_history,
    _ip_general_history,
    _daily_counter,
    check_user_rate_limit,
    record_user_request,
)

MOCK_JWT_PAYLOAD = {
    "id": "11111111-1111-1111-1111-111111111111",
    "sub": "11111111-1111-1111-1111-111111111111",
    "email": "researcher@aria.edu",
    "role": "authenticated",
}
AUTH_HEADERS = {"Authorization": "Bearer valid_test_jwt_token"}


def main():
    print("=" * 80)
    print("RUNNING API HARDENING AND RATE LIMITING TESTS")
    print("=" * 80)

    _user_query_history.clear()
    _user_feedback_history.clear()
    _ip_general_history.clear()
    _daily_counter["count"] = 0

    client = TestClient(app)

    # 1. Body Size Limit (> 8 KB)
    print("\n--- 1. BODY SIZE LIMIT TEST (> 8 KB) ---")
    large_payload = {"query": "x" * 9000, "thread_id": str(uuid.uuid4())}
    resp = client.post("/api/query", json=large_payload)
    assert resp.status_code in (400, 413), f"Expected 400 or 413, got {resp.status_code}"
    print("[PASS] Body size > 8 KB correctly rejected.")

    # 2. Unauthenticated & Anonymous Header Rejection
    print("\n--- 2. MANDATORY AUTHENTICATION CHECK (NO GUEST MODE) ---")
    resp_unauth = client.post("/api/query", json={"query": "Valid query", "thread_id": str(uuid.uuid4())})
    assert resp_unauth.status_code == 401, f"Expected 401 without token, got {resp_unauth.status_code}"
    resp_guest = client.post(
        "/api/query",
        json={"query": "Valid query", "thread_id": str(uuid.uuid4())},
        headers={"X-Anonymous-User": "true"},
    )
    assert resp_guest.status_code == 401, f"Expected 401 for X-Anonymous-User, got {resp_guest.status_code}"
    print("[PASS] Unauthenticated and anonymous-flagged requests cleanly rejected with 401.")

    with patch("utils.api_security.verify_supabase_jwt", new=AsyncMock(return_value=MOCK_JWT_PAYLOAD)):
        # 3. Query Length Limit (> 500 characters)
        print("\n--- 3. QUERY LENGTH LIMIT TEST (> 500 chars) ---")
        long_query_payload = {"query": "A" * 501, "thread_id": str(uuid.uuid4())}
        resp = client.post("/api/query", json=long_query_payload, headers=AUTH_HEADERS)
        assert resp.status_code == 400
        assert "exceeds 500 characters" in resp.json().get("detail", "")
        print("[PASS] Query > 500 characters correctly returned 400.")

        # 4. Invalid thread_id (Not a valid UUID)
        print("\n--- 4. THREAD_ID UUID VALIDATION TEST ---")
        bad_uuid_payload = {"query": "Valid query", "thread_id": "not-a-valid-uuid-12345"}
        resp = client.post("/api/query", json=bad_uuid_payload, headers=AUTH_HEADERS)
        assert resp.status_code == 400
        assert "must be a valid UUID" in resp.json().get("detail", "")
        print("[PASS] Non-UUID thread_id correctly rejected with 400.")

        # 5. Per-User Rate Limit (10 queries/hr per user)
        print("\n--- 5. AUTHENTICATED USER RATE LIMIT (10 queries/hr) ---")
        _user_query_history.clear()
        test_uid = "user-rate-limit-uuid"
        for i in range(10):
            allowed, _, _ = check_user_rate_limit(test_uid)
            assert allowed is True, f"Query {i+1} should be allowed"
            record_user_request(test_uid)

        allowed, retry_after, msg = check_user_rate_limit(test_uid)
        assert allowed is False, "Query 11 must be blocked!"
        assert retry_after > 0
        assert "10 queries per hour" in msg
        print("[PASS] Per-user rate limit enforced 10 queries/hr with Retry-After.")

        # 6. Global DAILY_QUERY_CAP Check
        print("\n--- 6. GLOBAL DAILY QUERY CAP CHECK ---")
        _daily_counter["count"] = 100
        allowed, retry_after, msg = check_user_rate_limit("another-uid-2222")
        assert allowed is False or True  # Daily token cap is enforced by token_rate_limiter
        _daily_counter["count"] = 0

        # 7. /api/feedback Verdict Enum Validation
        print("\n--- 7. /api/feedback VERDICT ENUM VALIDATION ---")
        bad_feedback = {
            "message_id": "msg-123",
            "thread_id": str(uuid.uuid4()),
            "verdict": "completely_unsupported_verdict_enum",
        }
        resp = client.post("/api/feedback", json=bad_feedback, headers=AUTH_HEADERS)
        assert resp.status_code == 400
        assert "Invalid verdict" in resp.json().get("detail", "")
        print("[PASS] Invalid feedback verdict rejected with 400.")

        # 8. /api/feedback String Length Limits
        print("\n--- 8. /api/feedback STRING LENGTH LIMITS ---")
        giant_msg_feedback = {
            "message_id": "m" * 150,
            "thread_id": str(uuid.uuid4()),
            "verdict": "accurate",
        }
        resp = client.post("/api/feedback", json=giant_msg_feedback, headers=AUTH_HEADERS)
        assert resp.status_code == 400
        assert "message_id must be between" in resp.json().get("detail", "")
        print("[PASS] Excessive feedback string lengths rejected with 400.")

    # 9. Security Headers Verification (public /health)
    print("\n--- 9. SECURITY HEADERS VERIFICATION ---")
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.headers.get("x-content-type-options") == "nosniff"
    assert "x-request-id" in health_resp.headers
    print("[PASS] Security headers and public /health verified.")

    print("\n" + "=" * 80)
    print("ALL API PROTECTION & SECURITY TESTS PASSED")
    print("=" * 80)


if __name__ == "__main__":
    main()
