"""Thorough API endpoint test for /api/settings (GET/POST) using TestClient."""
import os
import sys
from pathlib import Path

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).parent))

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

print("=" * 60)
print("TEST 1: GET /api/settings (no auth)")
r = client.get("/api/settings")
print(f"Status: {r.status_code}")
print(f"Body: {r.json()}")
assert r.status_code == 200, f"Expected 200, got {r.status_code}"
data = r.json()
assert "llm_provider" in data, "Response missing llm_provider"
assert "model" in data, "Response missing model"
print("PASS: GET /api/settings returns llm_provider and model\n")

print("=" * 60)
print("TEST 2: POST /api/settings (set OpenRouter key, provider, model)")
payload = {
    "openrouter_api_key": "sk-or-test-key-12345",
    "llm_provider": "openrouter",
    "model": "openrouter/free",
}
r = client.post("/api/settings", json=payload)
print(f"Status: {r.status_code}")
print(f"Body: {r.json()}")
assert r.status_code == 200, f"Expected 200, got {r.status_code}"

# Verify the env vars were persisted
assert os.environ.get("ARIA_LLM_PROVIDER") == "openrouter", (
    f"ARIA_LLM_PROVIDER not set in os.environ: {os.environ.get('ARIA_LLM_PROVIDER')}"
)
assert os.environ.get("ARIA_MODEL") == "openrouter/free", (
    f"ARIA_MODEL not set in os.environ: {os.environ.get('ARIA_MODEL')}"
)
print("PASS: POST /api/settings persisted provider/model to os.environ\n")

print("=" * 60)
print("TEST 3: GET /api/settings reflects new provider/model")
r = client.get("/api/settings")
print(f"Status: {r.status_code}")
print(f"Body: {r.json()}")
data = r.json()
assert data["llm_provider"] == "openrouter", f"llm_provider={data['llm_provider']}"
assert data["model"] == "openrouter/free", f"model={data['model']}"
print("PASS: GET reflects persisted openrouter/openrouter/free\n")

print("=" * 60)
print("TEST 4: POST /api/settings (invalid provider rejected)")
bad_payload = {
    "openrouter_api_key": "",
    "llm_provider": "not-a-real-provider",
    "model": "foo",
}
r = client.post("/api/settings", json=bad_payload)
print(f"Status: {r.status_code}")
print(f"Body: {r.json()}")
assert r.status_code in (400, 422), f"Expected 4xx, got {r.status_code}"
print("PASS: Invalid provider rejected\n")

print("=" * 60)
print("TEST 5: POST /api/settings (reset back to local-extractive)")
payload = {
    "openrouter_api_key": "",
    "llm_provider": "local-extractive",
    "model": "local-extractive",
}
r = client.post("/api/settings", json=payload)
print(f"Status: {r.status_code}")
print(f"Body: {r.json()}")
assert r.status_code == 200, f"Expected 200, got {r.status_code}"
assert os.environ.get("ARIA_LLM_PROVIDER") == "local-extractive"
assert os.environ.get("ARIA_MODEL") == "local-extractive"
print("PASS: Reset to local-extractive\n")

print("=" * 60)
print("ALL API SETTINGS TESTS PASSED")
