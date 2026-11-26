import sys
from pathlib import Path
import uuid
from unittest.mock import patch, AsyncMock

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from fastapi.responses import Response
from main import app
from utils.api_security import _user_query_history, _daily_counter

client = TestClient(app, base_url="http://testserver")


def mock_stream_response(gen, media_type="text/event-stream", headers=None):
    return Response(content='data: {"event": "start"}\n\n', media_type=media_type, headers=headers)


def test_query_strict_auth_and_no_guest():
    print("=" * 80)
    print("VERIFYING /api/query: STRICT JWT AUTH & NO GUEST FALLBACK")
    print("=" * 80)

    _user_query_history.clear()
    _daily_counter["count"] = 0

    with patch("main.StreamingResponse", side_effect=mock_stream_response):
        # 1. GUEST HEADER MUST BE REJECTED (401)
        print("\n[1] Submitting query with X-Anonymous-User: true (must be 401)...")
        guest_res = client.post(
            "/api/query",
            json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
            headers={"X-Anonymous-User": "true", "X-Forwarded-For": "198.51.100.22"},
        )
        assert guest_res.status_code == 401, f"Expected 401 for X-Anonymous-User, got {guest_res.status_code}"
        print("[PASS] X-Anonymous-User rejected with 401 Unauthorized.")

        # 2. NO AUTH HEADER MUST BE REJECTED (401)
        print("\n[2] Submitting query without any auth header (must be 401)...")
        anon_res = client.post(
            "/api/query",
            json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
            headers={"X-Forwarded-For": "198.51.100.23"},
        )
        assert anon_res.status_code == 401, f"Expected 401 for missing token, got {anon_res.status_code}"
        print("[PASS] Missing Authorization header rejected with 401 Unauthorized.")

        # 3. AUTHENTICATED STATE (with valid Bearer token)
        print("\n[3] Submitting query as Authenticated User (valid Supabase JWT)...")
        mock_payload = {
            "id": "user-uuid-12345-abcde",
            "sub": "user-uuid-12345-abcde",
            "email": "researcher@university.edu",
            "role": "authenticated",
        }
        with patch("utils.api_security.verify_supabase_jwt", new=AsyncMock(return_value=mock_payload)):
            auth_res = client.post(
                "/api/query",
                json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
                headers={"Authorization": "Bearer valid_supabase_jwt_token"},
            )
            assert auth_res.status_code == 200, f"Expected 200 OK for authenticated query, got {auth_res.status_code}"
            assert "text/event-stream" in auth_res.headers.get("content-type", "")
            print("[PASS] Authenticated query returned 200 OK with text/event-stream.")

        # 4. INVALID TOKEN (must return 401 Unauthorized)
        print("\n[4] Submitting query with invalid/expired token...")
        inv_res = client.post(
            "/api/query",
            json={"query": "What is topological quantum memory?", "thread_id": str(uuid.uuid4())},
            headers={"Authorization": "Bearer invalid_expired_jwt_signature"},
        )
        assert inv_res.status_code == 401, f"Expected 401 Unauthorized for invalid token, got {inv_res.status_code}"
        print("[PASS] Invalid token properly rejected with 401 Unauthorized.")

    print("\nALL STRICT AUTH & NO-GUEST TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_query_strict_auth_and_no_guest()
