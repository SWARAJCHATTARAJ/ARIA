import sys
from pathlib import Path
import uuid
from unittest.mock import patch, AsyncMock

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from fastapi.responses import Response
from main import app
from utils.api_security import _ip_query_history, _user_query_history, _daily_counter

client = TestClient(app, base_url="http://testserver")

def mock_stream_response(gen, media_type="text/event-stream", headers=None):
    return Response(content="data: {\"event\": \"start\"}\n\n", media_type=media_type, headers=headers)

def test_query_guest_and_authenticated_states():
    print("=" * 80)
    print("VERIFYING /api/query: GUEST & AUTHENTICATED STATES")
    print("=" * 80)

    # Reset rate limits
    _ip_query_history.clear()
    _user_query_history.clear()
    _daily_counter["count"] = 0

    with patch("main.StreamingResponse", side_effect=mock_stream_response):
        # 1. GUEST STATE (with X-Anonymous-User: true)
        print("\n[1] Submitting query as Guest (X-Anonymous-User: true)...")
        guest_res = client.post(
            "/api/query",
            json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
            headers={"X-Anonymous-User": "true", "X-Forwarded-For": "198.51.100.22"}
        )
        print(f"Guest status: {guest_res.status_code}")
        assert guest_res.status_code == 200, f"Expected 200 OK for guest query, got {guest_res.status_code}"
        assert "text/event-stream" in guest_res.headers.get("content-type", "")
        print("[PASS] Guest query returned 200 OK with text/event-stream.")

        # 2. GUEST STATE (without any auth headers)
        print("\n[2] Submitting query without any auth header (anonymous fallback)...")
        anon_res = client.post(
            "/api/query",
            json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
            headers={"X-Forwarded-For": "198.51.100.23"}
        )
        print(f"Anonymous status: {anon_res.status_code}")
        assert anon_res.status_code == 200, f"Expected 200 OK for anonymous query, got {anon_res.status_code}"
        assert "text/event-stream" in anon_res.headers.get("content-type", "")
        print("[PASS] Anonymous query returned 200 OK with text/event-stream.")

        # 3. AUTHENTICATED STATE (with valid Bearer token)
        print("\n[3] Submitting query as Authenticated User (valid Supabase JWT)...")
        mock_payload = {
            "id": "user-uuid-12345-abcde",
            "sub": "user-uuid-12345-abcde",
            "email": "researcher@university.edu",
            "role": "authenticated"
        }
        with patch("main.verify_supabase_jwt", new=AsyncMock(return_value=mock_payload)):
            auth_res = client.post(
                "/api/query",
                json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
                headers={"Authorization": "Bearer valid_supabase_jwt_token"}
            )
            print(f"Authenticated status: {auth_res.status_code}")
            assert auth_res.status_code == 200, f"Expected 200 OK for authenticated query, got {auth_res.status_code}"
            assert "text/event-stream" in auth_res.headers.get("content-type", "")
            print("[PASS] Authenticated query returned 200 OK with text/event-stream.")

        # 4. INVALID TOKEN (must return 401 Unauthorized)
        print("\n[4] Submitting query with invalid/expired token...")
        inv_res = client.post(
            "/api/query",
            json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
            headers={"Authorization": "Bearer invalid_expired_jwt_signature"}
        )
        print(f"Invalid token status: {inv_res.status_code}")
        assert inv_res.status_code == 401, f"Expected 401 Unauthorized for invalid token, got {inv_res.status_code}"
        print("[PASS] Invalid token properly rejected with 401 Unauthorized.")

    print("\n" + "=" * 80)
    print("ALL GUEST & AUTHENTICATED STATE TESTS PASSED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == "__main__":
    test_query_guest_and_authenticated_states()
