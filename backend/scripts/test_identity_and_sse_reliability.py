import json
import re
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
try:
    from pipeline.nodes import is_identity_query, get_identity_response_payload
except ImportError:
    from backend.pipeline.nodes import is_identity_query, get_identity_response_payload

def test_identity_intent_matching():
    # Direct matching cases
    positive_queries = [
        "who built you",
        "who made you",
        "who created aria",
        "who is swaraj chattaraj",
        "what is aria",
        "what does aria do",
        "how does aria work",
        "about aria",
        "who is swaraj",
        "swaraj chattaraj",
        "who created you",
        "who designed aria",
        "who is your creator",
        "who developed aria",
        "what is aria v2",
        "who made u",
        "who built u",
        "who are you",
        "tell me about aria",
    ]

    for q in positive_queries:
        assert is_identity_query(q) is True, f"Expected '{q}' to match identity intent, got False"

    # Negative non-matching cases (scientific queries, operas, other people)
    negative_queries = [
        "What is the Milky Way galaxy?",
        "How do off-target mitigation strategies for CRISPR work?",
        "Who was Albert Einstein?",
        "Who discovered penicillin?",
        "What is an aria in Puccini's opera Tosca?",
        "How does quantum error correction work?",
        "What are the thermodynamic phases of PVC?",
    ]

    for q in negative_queries:
        assert is_identity_query(q) is False, f"Expected '{q}' to NOT match identity intent, got True"

    print("ALL IDENTITY INTENT TEST CASES PASSED!")

def test_identity_payload_structure():
    payload = get_identity_response_payload()
    assert "content" in payload
    assert "Swaraj Chattaraj" in payload["content"]
    assert "ARIA v2.0" in payload["content"]
    assert "Tri-Tier Evidence Cascade" in payload["content"]
    assert "claims" in payload and len(payload["claims"]) >= 3
    assert "sources" in payload and len(payload["sources"]) == 1
    assert payload["sources"][0]["source"] == "ARIA System Profile"
    assert "citation" in payload
    assert payload["citation"]["authors"] == ["Swaraj Chattaraj"]
    print("IDENTITY PAYLOAD STRUCTURE VERIFIED!")

def test_sse_framing_parser():
    # Emulate the frontend SSE chunk parser logic with \r\n\r\n and : keep-alive
    sample_stream = (
        b": keep-alive\r\n\r\n"
        b"data: {\"event\": \"start\", \"thread_id\": \"test-123\"}\r\n\r\n"
        b": keep-alive\n\n"
        b"data: {\"event\": \"token\", \"delta\": \"Hello \"}\n\n"
        b"data: {\"event\": \"token\", \"delta\": \"world!\"}\r\n\r\n"
        b": keep-alive\r\n\r\n"
        b"data: {\"event\": \"done\"}\n\n"
    )

    buffer = ""
    received_events = []
    decoder_parts = [sample_stream[:15], sample_stream[15:45], sample_stream[45:80], sample_stream[80:]]

    for chunk in decoder_parts:
        buffer += chunk.decode('utf-8')
        while True:
            m = re.search(r'\r?\n\r?\n', buffer)
            if not m:
                break
            idx = m.start()
            delimiter_len = len(m.group(0))
            frame = buffer[:idx]
            buffer = buffer[idx + delimiter_len:]

            trimmed = frame.strip()
            if not trimmed:
                continue

            lines = re.split(r'\r?\n', trimmed)
            event_data = ""
            for raw_line in lines:
                line = raw_line.trim() if hasattr(raw_line, 'trim') else raw_line.strip()
                if line.startswith(':'):
                    continue
                if line.startswith('data:'):
                    chunk_data = line[5:].strip()
                    event_data = f"{event_data}\n{chunk_data}" if event_data else chunk_data

            if event_data:
                received_events.append(json.loads(event_data))

    assert len(received_events) == 4
    assert received_events[0]["event"] == "start"
    assert received_events[1]["delta"] == "Hello "
    assert received_events[2]["delta"] == "world!"
    assert received_events[3]["event"] == "done"
    print("SSE FRAMING AND KEEP-ALIVE PARSER VERIFIED!")

if __name__ == "__main__":
    test_identity_intent_matching()
    test_identity_payload_structure()
    test_sse_framing_parser()
    print("ALL TESTS PASSED SUCCESSFULLY!")
