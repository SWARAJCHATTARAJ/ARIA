import asyncio
import json
import sys
import os
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from fastapi.testclient import TestClient
from main import app

def test_groq_resilience():
    print("=" * 80)
    print("TEST C.2: GROQ 429 & TIMEOUT SSE STREAM RESILIENCE")
    print("Requirement: A Groq 429 or timeout mid-stream sends a friendly SSE error event")
    print("(\"ARIA is busy right now, try again in a few minutes\") and closes the stream cleanly.")
    print("=" * 80)

    client = TestClient(app)

    # -------------------------------------------------------------------------
    # Test 1: Forced Groq 429 Rate Limit mid-stream
    # -------------------------------------------------------------------------
    print("\n[Case 1: Forced Groq 429 Rate Limit mid-stream]")
    async def mock_astream_429(messages):
        # Yield one chunk, then raise 429
        chunk1 = MagicMock()
        chunk1.content = "Initial partial answer... "
        yield chunk1
        raise RuntimeError("Error code: 429 - {'error': {'message': 'Rate limit reached for model', 'type': 'rate_limit_exceeded'}}")

    with patch("langchain_groq.ChatGroq.astream", side_effect=mock_astream_429):
        resp1 = client.post("/api/query", json={"query": "Explain quantum computing algorithms."})
        print(f"HTTP Status: {resp1.status_code}")
        raw_events = [line for line in resp1.text.split("\n\n") if line.strip().startswith("data: ")]
        parsed_events = [json.loads(line.replace("data: ", "")) for line in raw_events]

        print("Received SSE Event types:", [ev.get("event") for ev in parsed_events])
        for ev in parsed_events:
            if ev.get("event") in ("start", "route", "error", "done"):
                print(" ", ev)

        error_events = [e for e in parsed_events if e.get("event") == "error"]
        done_events = [e for e in parsed_events if e.get("event") == "done"]

        assert len(error_events) >= 1, "Expected an SSE error event!"
        assert error_events[0]["message"] == "ARIA is busy right now, try again in a few minutes", \
            f"Expected friendly message, got: {error_events[0]['message']}"
        assert len(done_events) >= 1, "Expected clean stream termination with 'done' event!"
        print("-> PASS: Case 1 correctly returned friendly SSE error and closed stream.")

    # -------------------------------------------------------------------------
    # Test 2: Forced Timeout mid-stream
    # -------------------------------------------------------------------------
    print("\n[Case 2: Forced Timeout mid-stream]")
    async def mock_astream_timeout(messages):
        yield MagicMock(content="Processing query... ")
        raise asyncio.TimeoutError("Request to Groq API timed out after 30.0s")

    with patch("langchain_groq.ChatGroq.astream", side_effect=mock_astream_timeout):
        resp2 = client.post("/api/query", json={"query": "Explain photosynthesis reactions."})
        print(f"HTTP Status: {resp2.status_code}")
        raw_events2 = [line for line in resp2.text.split("\n\n") if line.strip().startswith("data: ")]
        parsed_events2 = [json.loads(line.replace("data: ", "")) for line in raw_events2]

        print("Received SSE Event types:", [ev.get("event") for ev in parsed_events2])
        for ev in parsed_events2:
            if ev.get("event") in ("start", "route", "error", "done"):
                print(" ", ev)

        error_events2 = [e for e in parsed_events2 if e.get("event") == "error"]
        done_events2 = [e for e in parsed_events2 if e.get("event") == "done"]

        assert len(error_events2) >= 1, "Expected an SSE error event on timeout!"
        assert error_events2[0]["message"] == "ARIA is busy right now, try again in a few minutes"
        assert len(done_events2) >= 1, "Expected clean stream termination with 'done' event!"
        print("-> PASS: Case 2 correctly returned friendly SSE error and closed stream.")

    print("\n" + "=" * 80)
    print("ALL GROQ RESILIENCE TESTS PASSED")
    print("=" * 80)

if __name__ == "__main__":
    test_groq_resilience()
