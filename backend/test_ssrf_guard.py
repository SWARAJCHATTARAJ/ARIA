import sys
import os
import asyncio
import httpx
from unittest.mock import patch, MagicMock

# Ensure backend in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.ssrf_guard import is_safe_url
from utils.academic_search import fetch_readable_text

async def main():
    print("=" * 80)
    print("RUNNING SSRF GUARD VERIFICATION TESTS")
    print("=" * 80)

    test_targets = [
        ("127.0.0.1", "http://127.0.0.1", False),
        ("localhost", "http://localhost", False),
        ("10.0.0.1", "http://10.0.0.1", False),
        ("172.16.0.1", "http://172.16.0.1", False),
        ("192.168.1.1", "http://192.168.1.1", False),
        ("169.254.169.254", "http://169.254.169.254", False),
        ("[::1]", "http://[::1]", False),
        ("Disallowed scheme (ftp)", "ftp://example.com/file", False),
        ("Disallowed port (8080)", "http://example.com:8080", False),
        ("Normal public URL", "https://example.com", True),
    ]

    print("\n--- 1. STATIC & DNS RESOLUTION TESTS (is_safe_url) ---")
    all_passed = True
    for label, url, expected_safe in test_targets:
        safe, reason = is_safe_url(url)
        status = "PASS" if safe == expected_safe else "FAIL"
        if safe != expected_safe:
            all_passed = False
        outcome = "ALLOWED" if safe else "BLOCKED"
        print(f"[{status}] {label:28} | URL: {url:28} | Result: {outcome:7} | Reason: {reason}")

    print("\n--- 2. REDIRECT HOP SSRF GUARD TEST (Public URL -> 169.254.169.254) ---")
    # Simulate a public URL returning a 302 redirect to http://169.254.169.254
    redirect_target = "http://169.254.169.254/metadata/v1"
    
    # We test fetch_readable_text with a mocked response that redirects to 169.254.169.254
    mock_resp_302 = MagicMock()
    mock_resp_302.status_code = 302
    mock_resp_302.headers = {"location": redirect_target}
    
    with patch("httpx.AsyncClient.get", return_value=mock_resp_302) as mock_get:
        res = await fetch_readable_text("https://example.com/redirect-test", "test query", fallback_snippet="FALLBACK")
        redirect_blocked = (res == "FALLBACK")
        status = "PASS" if redirect_blocked else "FAIL"
        print(f"[{status}] Redirect to {redirect_target} | Result: {'BLOCKED (returned fallback)' if redirect_blocked else 'LEAKED'}")
        if not redirect_blocked:
            all_passed = False

    print("\n--- 3. LIVE END-TO-END PUBLIC FETCH TEST ---")
    normal_url = "https://example.com"
    fetched = await fetch_readable_text(normal_url, "example domain", fallback_snippet="FALLBACK")
    fetch_success = (fetched != "FALLBACK" and "example" in fetched.lower())
    status = "PASS" if fetch_success else "FAIL"
    print(f"[{status}] Normal public URL ({normal_url}) | Fetched {len(fetched)} chars: '{fetched[:60]}...'")
    if not fetch_success:
        all_passed = False

    print("\n" + "=" * 80)
    print(f"OVERALL SSRF TEST RESULT: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    print("=" * 80)
    return all_passed

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
