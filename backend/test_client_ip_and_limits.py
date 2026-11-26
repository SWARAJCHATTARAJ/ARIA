import sys
import os
import uuid
from unittest.mock import patch, AsyncMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from utils.api_security import (
    get_client_ip,
    _user_query_history,
    _ip_general_history,
    _daily_counter,
    check_user_rate_limit,
    record_user_request,
)

MOCK_JWT_PAYLOAD = {
    "id": "22222222-2222-2222-2222-222222222222",
    "sub": "22222222-2222-2222-2222-222222222222",
    "email": "researcher@aria.edu",
    "role": "authenticated",
}
AUTH_HEADERS = {"Authorization": "Bearer valid_test_jwt_token"}


def test_client_ip_determination():
    print("=" * 80)
    print("TEST B.1: CLIENT IP DETERMINATION BEHIND PROXY")
    print("=" * 80)

    class DummyClient:
        def __init__(self, host):
            self.host = host

    class DummyRequest:
        def __init__(self, client_host, x_forwarded_for=None):
            self.client = DummyClient(client_host)
            self.headers = {}
            if x_forwarded_for:
                self.headers["x-forwarded-for"] = x_forwarded_for

    req_proxy = DummyRequest(client_host="127.0.0.1", x_forwarded_for="203.0.113.42, 10.0.0.1")
    ip_proxy = get_client_ip(req_proxy)
    assert ip_proxy == "203.0.113.42", f"Expected 203.0.113.42, got {ip_proxy}"
    print(" [PASS] Forwarded address used because direct peer is 127.0.0.1")

    req_spoof = DummyRequest(client_host="198.51.100.77", x_forwarded_for="1.1.1.1")
    ip_spoof = get_client_ip(req_spoof)
    assert ip_spoof == "198.51.100.77", f"Expected 198.51.100.77, got {ip_spoof}"
    print(" [PASS] X-Forwarded-For ignored because direct peer is NOT 127.0.0.1")


def test_api_limits():
    print("\n" + "=" * 80)
    print("TEST B.2: API HARDENING & LIMITS VERIFICATION")
    print("=" * 80)

    _user_query_history.clear()
    _ip_general_history.clear()
    _daily_counter["count"] = 0

    client = TestClient(app, client=("127.0.0.1", 50000))

    # 1. 9 KB body returns 413
    print("\n[1] Testing 9 KB request body (Body Limit: 8 KB)...")
    large_body = {"query": "A" * 9216, "thread_id": str(uuid.uuid4())}
    resp_413 = client.post("/api/query", json=large_body)
    assert resp_413.status_code == 413, f"Expected 413, got {resp_413.status_code}"
    print("PASS: 9 KB body returned 413.")

    with patch("utils.api_security.verify_supabase_jwt", new=AsyncMock(return_value=MOCK_JWT_PAYLOAD)):
        # 2. 501-character query returns 400
        print("\n[2] Testing 501-character query (Max: 500 chars)...")
        long_query_body = {"query": "W" * 501, "thread_id": str(uuid.uuid4())}
        resp_501 = client.post("/api/query", json=long_query_body, headers=AUTH_HEADERS)
        assert resp_501.status_code == 400, f"Expected 400, got {resp_501.status_code}"
        assert "exceeds 500 characters" in resp_501.json().get("detail", "")
        print("PASS: 501-character query returned 400 Bad Request.")

        # 3. Bad thread_id returns 400
        print("\n[3] Testing invalid thread_id (Not a valid UUID)...")
        bad_thread_body = {"query": "What is autonomous systems?", "thread_id": "not-a-valid-uuid-999"}
        resp_bad_thread = client.post("/api/query", json=bad_thread_body, headers=AUTH_HEADERS)
        assert resp_bad_thread.status_code == 400, f"Expected 400, got {resp_bad_thread.status_code}"
        assert "must be a valid UUID" in resp_bad_thread.json().get("detail", "")
        print("PASS: Bad thread_id returned 400 Bad Request.")

        # 4. 11th authenticated query in an hour returns 429 with Retry-After
        print("\n[4] Testing 11th query for same user in an hour (Limit: 10 queries/hour)...")
        test_uid = MOCK_JWT_PAYLOAD["id"]
        _user_query_history[test_uid] = []
        _daily_counter["count"] = 0

        for _ in range(10):
            allowed, _, _ = check_user_rate_limit(test_uid, is_feedback=False)
            assert allowed is True
            record_user_request(test_uid, is_feedback=False)

        allowed_11, retry_after_11, msg_11 = check_user_rate_limit(test_uid, is_feedback=False)
        assert allowed_11 is False, "11th query must be rejected!"
        assert retry_after_11 > 0
        assert "10 queries per hour" in msg_11

        resp_429 = client.post(
            "/api/query",
            json={"query": "Test query 11", "thread_id": str(uuid.uuid4())},
            headers={**AUTH_HEADERS, "x-forwarded-for": "192.0.2.150"},
        )
        assert resp_429.status_code == 429, f"Expected 429, got {resp_429.status_code}"
        assert resp_429.headers.get("retry-after") is not None
        print("PASS: 11th query returned 429 with Retry-After and plain message.")

    print("\n" + "=" * 80)
    print("ALL B.1 & B.2 CHECKS PASSED SUCCESSFULLY")
    print("=" * 80)


if __name__ == "__main__":
    test_client_ip_determination()
    test_api_limits()
