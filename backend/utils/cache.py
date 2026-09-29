import redis
import json
import hashlib
from config import settings
from typing import Optional

redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)

def generate_cache_key(query: str, thread_id: Optional[str] = None) -> str:
    # Semantics-based cache key? For now, we hash the string, but we should use embeddings.
    # To properly cache by semantics, we'd embed the query and use vector search.
    # We also include thread_id for follow-up context.
    raw = f"{thread_id or 'none'}:{query}"
    return hashlib.sha256(raw.encode()).hexdigest()

def get_cached_response(query: str, thread_id: Optional[str] = None) -> Optional[dict]:
    key = generate_cache_key(query, thread_id)
    cached = redis_client.get(key)
    if cached:
        return json.loads(cached)
    return None

def set_cached_response(query: str, response: dict, thread_id: Optional[str] = None, ttl: int = 3600):
    key = generate_cache_key(query, thread_id)
    redis_client.setex(key, ttl, json.dumps(response))
