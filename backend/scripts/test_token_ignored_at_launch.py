import os
import sys
import time
from fastapi.testclient import TestClient
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
load_dotenv("backend/.env")

from config import settings
from main import app
from utils import api_security

def run_test():
    print("=" * 80)
    print("TEST: Section D - TOKENS IGNORED AT LAUNCH")
    print("=" * 80)
    print(f"settings.jwt_auth_enabled: {settings.jwt_auth_enabled} (Default: False)")
    
    # Reset in-memory rate limiting stores for a clean test
    api_security._ip_query_history.clear()
    api_security._daily_counter["count"] = 0
    
    client = TestClient(app)
    fake_ip = "198.51.100.42"
    
    # A valid-looking mock Bearer JWT constructed dynamically for testing
    import base64
    _h = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').decode().rstrip('=')
    _p = base64.urlsafe_b64encode(b'{"sub":"1234567890","name":"Alice Researcher","role":"authenticated","iat":1516239022}').decode().rstrip('=')
    valid_looking_token = f"{_h}.{_p}.dummy_sig"
    headers = {
        "Authorization": f"Bearer {valid_looking_token}",
        "X-Forwarded-For": fake_ip
    }
    
    print("\nSending requests with valid-looking Bearer token and checking rate limiting behavior:")
    for i in range(1, 7):
        # We test feedback endpoint as it uses check_anonymous_rate_limit directly
        payload = {
            "message_id": f"msg-{i}",
            "verdict": "positive"
        }
        resp = client.post("/api/feedback", json=payload, headers=headers)
        print(f"Request #{i}: Status = {resp.status_code} | Body = {resp.text.strip()}")
        if i == 6:
            assert resp.status_code == 429, f"Expected 429 on request 6, got {resp.status_code}"
            assert "Please authenticate with Supabase" not in resp.text, "Error text should NOT contain 'Please authenticate with Supabase'"
            print("\nSUCCESS: Request with valid-looking token was subject to anonymous limit (capped at 5/hr).")
            print("Verified: 'Please authenticate with Supabase' was removed from 429 response.")
            
    print("=" * 80)

if __name__ == "__main__":
    run_test()
