import sys
import os
import time
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from utils.api_security import (
    check_user_rate_limit,
    record_user_request,
    MAX_USER_QUERIES_PER_HOUR,
    _user_query_history
)

def run_tests():
    print("=== TEST 1: Clean initial state ===")
    _user_query_history.clear()
    user_a = "00000000-0000-0000-0000-user-a-1111"
    user_b = "00000000-0000-0000-0000-user-b-2222"

    print(f"MAX_USER_QUERIES_PER_HOUR = {MAX_USER_QUERIES_PER_HOUR}")

    print("\n=== TEST 2: User A makes 10 queries (all should succeed) ===")
    for i in range(1, 11):
        allowed, retry_after, msg = check_user_rate_limit(user_a, is_feedback=False)
        assert allowed is True, f"Query {i} should be allowed but got {msg}"
        record_user_request(user_a, is_feedback=False)
        print(f"  User A query {i}/10: allowed=True")

    print("\n=== TEST 3: User A makes 11th query (should be rate-limited 429) ===")
    allowed, retry_after, msg = check_user_rate_limit(user_a, is_feedback=False)
    print(f"  User A query 11: allowed={allowed}, retry_after={retry_after}s, msg='{msg}'")
    assert allowed is False, "11th query for User A must be blocked!"
    assert retry_after > 0, "retry_after must be > 0"
    assert "10 queries per hour per user" in msg, f"Message should specify 10 queries per hour per user, got: {msg}"

    print("\n=== TEST 4: User B makes 1st query from same IP/session (should SUCCEED) ===")
    allowed_b, retry_after_b, msg_b = check_user_rate_limit(user_b, is_feedback=False)
    print(f"  User B query 1: allowed={allowed_b}, retry_after={retry_after_b}s")
    assert allowed_b is True, "User B must NOT be affected by User A's rate limit! (Proves per-user, not per-IP)"
    record_user_request(user_b, is_feedback=False)

    print("\n=== TEST 5: Anonymous / Empty user_id is rejected ===")
    allowed_none, _, msg_none = check_user_rate_limit("", is_feedback=False)
    print(f"  Empty user_id: allowed={allowed_none}, msg='{msg_none}'")
    assert allowed_none is False, "Empty user_id must be rejected"

    print("\nALL RATE LIMIT UNIT TESTS PASSED!")
    return True

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
