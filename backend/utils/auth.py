import secrets
import string
import hashlib
from typing import Tuple

def generate_base62(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_api_key(environment: str = "live") -> Tuple[str, str]:
    """
    Generates an API key and returns (raw_key, key_hash).
    `environment` should be "live" or "test".
    Returns:
        raw_key: To be shown once to the user (e.g. 'aria_live_abc123...')
        key_hash: SHA-256 hash to be stored in the database
    """
    if environment not in ["live", "test"]:
        raise ValueError("Environment must be 'live' or 'test'")
        
    random_part = generate_base62(32)
    raw_key = f"aria_{environment}_{random_part}"
    
    # We only store the hash
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    
    return raw_key, key_hash

def verify_api_key(raw_key: str, stored_hash: str) -> bool:
    """
    Verifies if a raw API key matches the stored hash.
    Also allows fast prefix checking before DB lookup.
    """
    if not (raw_key.startswith("aria_live_") or raw_key.startswith("aria_test_")):
        return False
        
    computed_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    return secrets.compare_digest(computed_hash, stored_hash)
