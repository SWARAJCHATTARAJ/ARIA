import sys
import os
import uuid
import httpx

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from fastapi import Request
from main import app
from utils.api_security import get_client_ip, _ip_query_history, _daily_counter

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

    # Case A: Behind Caddy reverse proxy (direct peer is 127.0.0.1)
    req_proxy = DummyRequest(client_host="127.0.0.1", x_forwarded_for="203.0.113.42, 10.0.0.1")
    ip_proxy = get_client_ip(req_proxy)
    print(f"Case A: Direct peer=127.0.0.1, X-Forwarded-For='203.0.113.42, 10.0.0.1'")
    print(f" -> Resolved Client IP: {ip_proxy}")
    assert ip_proxy == "203.0.113.42", f"Expected 203.0.113.42, got {ip_proxy}"
    print(" [PASS] Forwarded address used because direct peer is 127.0.0.1 (Caddy)")

    # Case B: Direct peer is an external IP attempting to spoof X-Forwarded-For
    req_spoof = DummyRequest(client_host="198.51.100.77", x_forwarded_for="1.1.1.1")
    ip_spoof = get_client_ip(req_spoof)
    print(f"\nCase B: Direct peer=198.51.100.77 (not 127.0.0.1), Spoofed X-Forwarded-For='1.1.1.1'")
    print(f" -> Resolved Client IP: {ip_spoof}")
    assert ip_spoof == "198.51.100.77", f"Expected 198.51.100.77, got {ip_spoof}"
    print(" [PASS] X-Forwarded-For ignored because direct peer is NOT 127.0.0.1")


def test_api_limits():
    print("\n" + "=" * 80)
    print("TEST B.2: API HARDENING & LIMITS VERIFICATION")
    print("=" * 80)

    client = TestClient(app, client=("127.0.0.1", 50000))

    # 1. 9 KB body returns 413
    print("\n[1] Testing 9 KB request body (Body Limit: 8 KB)...")
    large_body = {"query": "A" * 9216, "thread_id": str(uuid.uuid4())}
    resp_413 = client.post("/api/query", json=large_body)
    print(f"Status Code: {resp_413.status_code}")
    print(f"Response Text: {resp_413.text}")
    assert resp_413.status_code == 413, f"Expected 413, got {resp_413.status_code}"
    print("PASS: 9 KB body returned 413 Content Too Large / Entity Too Large.")

    # 2. 501-character query returns 400
    print("\n[2] Testing 501-character query (Max: 500 chars)...")
    long_query_body = {"query": "W" * 501, "thread_id": str(uuid.uuid4())}
    resp_501 = client.post("/api/query", json=long_query_body)
    print(f"Status Code: {resp_501.status_code}")
    print(f"Response Detail: {resp_501.json().get('detail')}")
    assert resp_501.status_code == 400, f"Expected 400, got {resp_501.status_code}"
    assert "exceeds 500 characters" in resp_501.json().get("detail", "")
    print("PASS: 501-character query returned 400 Bad Request.")

    # 3. Bad thread_id returns 400
    print("\n[3] Testing invalid thread_id (Not a valid UUID)...")
    bad_thread_body = {"query": "What is autonomous systems?", "thread_id": "not-a-valid-uuid-999"}
    resp_bad_thread = client.post("/api/query", json=bad_thread_body)
    print(f"Status Code: {resp_bad_thread.status_code}")
    print(f"Response Detail: {resp_bad_thread.json().get('detail')}")
    assert resp_bad_thread.status_code == 400, f"Expected 400, got {resp_bad_thread.status_code}"
    assert "must be a valid UUID" in resp_bad_thread.json().get("detail", "")
    print("PASS: Bad thread_id returned 400 Bad Request.")

    # 4. 6th anonymous query in an hour returns 429 with Retry-After
    print("\n[4] Testing 6th anonymous query in an hour (Limit: 5 queries/hour)...")
    test_ip = "192.0.2.150"
    _ip_query_history[test_ip] = []
    _daily_counter["count"] = 0

    headers = {"X-Forwarded-For": test_ip}

    # Simulate first 5 queries
    from utils.api_security import check_anonymous_rate_limit, record_anonymous_request
    for i in range(1, 6):
        allowed, retry_after, msg = check_anonymous_rate_limit(test_ip, is_feedback=False)
        record_anonymous_request(test_ip, is_feedback=False)
        print(f" Query {i}/5: allowed={allowed}")

    # Now make the 6th call via HTTP endpoint
    allowed_6, retry_after_6, msg_6 = check_anonymous_rate_limit(test_ip, is_feedback=False)
    print(f" Query 6/5 check: allowed={allowed_6}, Retry-After={retry_after_6}s")
    print(f" Error message: '{msg_6}'")
    assert allowed_6 is False, "6th query must be rejected!"
    assert retry_after_6 > 0, "Retry-After must be positive"
    assert "5 requests per hour" in msg_6

    # Verify HTTP response from endpoint directly with mock ip
    resp_429 = client.post(
        "/api/query",
        json={"query": "Test query 6", "thread_id": str(uuid.uuid4())},
        headers={"x-forwarded-for": test_ip}
    )
    print(f" HTTP Status: {resp_429.status_code}")
    print(f" Retry-After Header: {resp_429.headers.get('retry-after')}")
    print(f" Response Text: {resp_429.text}")
    assert resp_429.status_code == 429, f"Expected 429, got {resp_429.status_code}"
    assert resp_429.headers.get("retry-after") is not None
    print("PASS: 6th query returned 429 with Retry-After and plain message.")

    print("\n" + "=" * 80)
    print("ALL B.1 & B.2 CHECKS PASSED SUCCESSFULLY")
    print("=" * 80)

if __name__ == "__main__":
    test_client_ip_determination()
    test_api_limits()
