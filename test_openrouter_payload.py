"""Verify OpenRouter request payload uses valid model + temperature 0.7."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from aria.core import Settings
from aria.agent import LLMClient

# Build settings with OpenRouter configured
settings = Settings(
    llm_provider="openrouter",
    model="openrouter/free",
    collection_name="aria_research_memory",
    memory_path=".aria_chroma_db",
)
client = LLMClient(settings, openrouter_api_key="sk-test-key")

print("=" * 60)
print("TEST 1: OpenRouter payload uses temperature 0.7 + valid model")

# Mock the session.post to capture the payload
captured = {}

def fake_post(url, headers=None, json=None, timeout=None):
    captured["url"] = url
    captured["payload"] = json
    captured["headers"] = headers

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": "Mock response"}}]}

    return FakeResponse()

with patch.object(client.session, "post", side_effect=fake_post):
    result = client._openrouter("system prompt", "user question")

print(f"URL: {captured['url']}")
print(f"Model: {captured['payload']['model']}")
print(f"Temperature: {captured['payload']['temperature']}")
assert captured["url"] == "https://openrouter.ai/api/v1/chat/completions"
assert captured["payload"]["model"] == "openrouter/free", (
    f"Model was {captured['payload']['model']}, expected openrouter/free"
)
assert captured["payload"]["temperature"] == 0.7, (
    f"Temperature was {captured['payload']['temperature']}, expected 0.7"
)
assert captured["headers"]["Authorization"] == "Bearer sk-test-key"
print("PASS: OpenRouter payload uses valid model + temperature 0.7\n")

print("=" * 60)
print("TEST 2: HTTP 400 error includes provider/model context")

class Fake400Response:
    status_code = 400

    def raise_for_status(self):
        pass

    def json(self):
        return {"error": {"message": "The model `local-extractive` does not exist"}}

def fake_post_400(url, headers=None, json=None, timeout=None):
    return Fake400Response()

with patch.object(client.session, "post", side_effect=fake_post_400):
    try:
        client._openrouter("system", "user")
        assert False, "Expected RuntimeError for HTTP 400"
    except RuntimeError as e:
        msg = str(e)
        print(f"Error message: {msg}")
        assert "provider=openrouter" in msg, f"Missing provider context: {msg}"
        assert "model=openrouter/free" in msg, f"Missing model context: {msg}"
        print("PASS: HTTP 400 error includes [provider=openrouter model=openrouter/free]\n")

print("=" * 60)
print("ALL OPENROUTER PAYLOAD TESTS PASSED")
