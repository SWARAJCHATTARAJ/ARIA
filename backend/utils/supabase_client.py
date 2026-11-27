import logging
import re
import time
import uuid
from typing import List, Optional, Dict, Any
import httpx
from config import settings

logger = logging.getLogger(__name__)

class SharedEmbeddingsCache:
    """In-memory cache for shared okf_docs embeddings with 10-minute (600s) TTL."""
    def __init__(self, ttl_seconds: float = 600.0):
        self.ttl = ttl_seconds
        self._cached_docs: Optional[List[Dict[str, Any]]] = None
        self._last_fetched: float = 0.0

    def is_valid(self) -> bool:
        return self._cached_docs is not None and (time.time() - self._last_fetched) < self.ttl

    def get(self) -> Optional[List[Dict[str, Any]]]:
        if self.is_valid():
            return self._cached_docs
        return None

    def set(self, docs: List[Dict[str, Any]]) -> None:
        self._cached_docs = docs
        self._last_fetched = time.time()

    def clear(self) -> None:
        self._cached_docs = None
        self._last_fetched = 0.0

shared_embeddings_cache = SharedEmbeddingsCache(ttl_seconds=600.0)

async def fetch_shared_okf_docs(client: httpx.AsyncClient, headers: Dict[str, str]) -> List[Dict[str, Any]]:
    """
    Fetches all shared okf_docs (user_id is null, embedding not null) in pages of 200.
    Logs a warning if more than 500 rows are returned.
    """
    url = f"{settings.supabase_url}/rest/v1/okf_docs"
    page_size = 200
    offset = 0
    all_docs: List[Dict[str, Any]] = []

    while True:
        params = {
            "select": "id,file_path,type,topic,source,content,embedding",
            "embedding": "not.is.null",
            "user_id": "is.null",
            "limit": page_size,
            "offset": offset,
            "order": "id.asc"
        }
        resp = await client.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            logger.warning(f"Error fetching shared okf_docs page (offset={offset}): {resp.status_code} {resp.text}")
            break
        page = resp.json()
        if not page:
            break
        all_docs.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    if len(all_docs) > 500:
        logger.warning(f"More than 500 rows returned from okf_docs ({len(all_docs)} rows).")

    return all_docs

def get_supabase_headers() -> Dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

_embed_model = None

class DeterministicHashEmbedder:
    """384-dimensional deterministic fallback embedder when local ONNX weights are not cached."""
    def embed(self, texts):
        import hashlib
        import numpy as np
        embeddings = []
        for text in texts:
            vec = np.zeros(384, dtype=np.float32)
            for word in text.lower().split():
                h = int(hashlib.md5(word.encode()).hexdigest(), 16)
                idx = h % 384
                vec[idx] += 1.0
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            embeddings.append(vec)
        return embeddings

def get_embed_model():
    global _embed_model
    if _embed_model is None:
        import os
        cache_dir = os.environ.get("FASTEMBED_CACHE_PATH") or getattr(settings, "fastembed_cache_path", None) or os.path.expanduser("~/.cache/fastembed")
        try:
            from fastembed import TextEmbedding
            _embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", cache_dir=cache_dir)
            logger.info(f"Initialized real FastEmbed ONNX model (BAAI/bge-small-en-v1.5) using cache_dir: {cache_dir}")
        except Exception as e:
            logger.warning(f"FastEmbed ONNX model failed to load at runtime: {e}; falling back to DeterministicHashEmbedder.")
            _embed_model = DeterministicHashEmbedder()
    return _embed_model

async def search_pgvector(
    query_text: str,
    user_id: Optional[str] = None,
    threshold: float = 0.4,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """
    Executes pgvector cosine similarity search over Supabase okf_docs using real FastEmbed ONNX vectors.
    1. Generates 384-dimensional dense vector using fastembed (BAAI/bge-small-en-v1.5).
    2. Attempts PostgREST RPC call to match_okf_docs.
    3. If RPC is not registered, computes vector cosine similarity directly across okf_docs embeddings.
    4. Text-fallback path is kept strictly as a secondary fallback if the ONNX model fails to load at runtime.
    Returns matched documents with their 'similarity' float scores.
    """
    if not settings.supabase_url or settings.supabase_url == "default":
        logger.warning("Supabase URL not configured; skipping vector search.")
        return []

    try:
        model = get_embed_model()
        is_fallback_embedder = isinstance(model, DeterministicHashEmbedder)
        if is_fallback_embedder:
            logger.warning(
                "search_pgvector: ONNX embedder unavailable at runtime; falling back to secondary okf_text_fallback in production."
            )
            kw_docs = await search_okf_docs(query_text=query_text, user_id=user_id, limit=limit)
            for d in kw_docs:
                d["similarity"] = None
                d["source_type"] = "okf_text_fallback"
            return kw_docs

        query_vec = list(model.embed([query_text]))[0]
        query_vec_list = query_vec.tolist() if hasattr(query_vec, "tolist") else list(query_vec)
        
        # 1. Try Supabase PostgREST RPC call
        rpc_url = f"{settings.supabase_url}/rest/v1/rpc/match_okf_docs"
        headers = get_supabase_headers()
        rpc_payload = {
            "query_embedding": query_vec_list,
            "match_threshold": threshold,
            "match_count": limit
        }
        
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(rpc_url, headers=headers, json=rpc_payload)
            if resp.status_code == 200:
                results = resp.json()
                logger.info(f"Supabase pgvector RPC returned {len(results)} matches.")
                return results

            # 2. Vector similarity over okf_docs embeddings
            logger.info("Supabase RPC match_okf_docs unavailable; computing cosine similarity directly from okf_docs...")
            
            # Check in-memory cache for shared embeddings (10-minute TTL)
            cached_shared = shared_embeddings_cache.get()
            if cached_shared is not None:
                logger.info(f"search_pgvector: Cache HIT for shared okf_docs embeddings ({len(cached_shared)} docs in cache).")
                docs = list(cached_shared)
                used_cache = True
            else:
                logger.info("search_pgvector: Cache MISS for shared okf_docs embeddings; fetching from Supabase in pages of 200...")
                docs = await fetch_shared_okf_docs(client, headers)
                shared_embeddings_cache.set(docs)
                used_cache = False

            logger.info(f"search_pgvector: Query used shared embeddings cache: {used_cache} (total shared docs: {len(docs)})")

            # If user_id is provided, also fetch user-specific docs
            if user_id:
                user_params = {
                    "select": "id,file_path,type,topic,source,content,embedding",
                    "embedding": "not.is.null",
                    "user_id": f"eq.{user_id}",
                    "limit": 200
                }
                user_resp = await client.get(f"{settings.supabase_url}/rest/v1/okf_docs", headers=headers, params=user_params)
                if user_resp.status_code == 200:
                    docs = docs + user_resp.json()

            if not docs:
                return []

            import json, numpy as np
            q_norm = np.linalg.norm(query_vec)
            if q_norm == 0:
                return []

            scored = []
            for doc in docs:
                raw_emb = doc.get("embedding")
                if not raw_emb:
                    continue
                if isinstance(raw_emb, str):
                    try:
                        emb = json.loads(raw_emb)
                    except Exception:
                        continue
                else:
                    emb = raw_emb

                doc_vec = np.array(emb, dtype=float)
                d_norm = np.linalg.norm(doc_vec)
                if d_norm == 0:
                    continue

                sim = float(np.dot(query_vec, doc_vec) / (q_norm * d_norm))
                if sim >= threshold:
                    doc_copy = dict(doc)
                    if "embedding" in doc_copy:
                        del doc_copy["embedding"]
                    doc_copy["similarity"] = round(sim, 4)
                    scored.append(doc_copy)

            scored.sort(key=lambda x: x["similarity"], reverse=True)
            return scored[:limit]

    except Exception as e:
        logger.warning(f"search_pgvector: Vector search error ({e}); falling back to secondary okf_text_fallback in production.")
        try:
            kw_docs = await search_okf_docs(query_text=query_text, user_id=user_id, limit=limit)
            for d in kw_docs:
                d["similarity"] = None
                d["source_type"] = "okf_text_fallback"
            return kw_docs
        except Exception as fallback_err:
            logger.error(f"search_pgvector: Secondary text fallback also failed: {fallback_err}")
            return []

async def search_okf_docs(query_text: str, user_id: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Queries okf_docs table in Supabase via PostgREST.
    Supports keyword/ilike search across content, topic, and file_path.
    Guarantees strict relevance: only returns documents matching query terms.
    """
    if not settings.supabase_url or settings.supabase_url == "default":
        logger.warning("Supabase URL not configured; skipping Supabase search.")
        return []

    # Clean query terms for search (support 2+ char acronyms like 'llm', 'pvc', 'ai')
    raw_tokens = re.findall(r'\b[a-zA-Z0-9_-]{2,}\b', query_text.lower())
    stop = {"what", "when", "where", "which", "why", "how", "the", "and", "for", "are", "can", "with", "from"}
    terms = [t for t in raw_tokens if t not in stop]
    
    # If no substantive terms exist, NEVER run an unfiltered SELECT limit 5!
    if not terms:
        return []

    url = f"{settings.supabase_url}/rest/v1/okf_docs"
    headers = get_supabase_headers()
    
    # Match any of the substantive query terms in content, topic, or file_path
    ilike_clauses = ",".join([f"content.ilike.*{term}*,topic.ilike.*{term}*,file_path.ilike.*{term}*" for term in terms[:3]])
    params: Dict[str, Any] = {
        "select": "id,file_path,type,topic,source,related_links,content,created_at",
        "or": f"({ilike_clauses})",
        "limit": limit
    }

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 200:
                raw_docs = resp.json()
                # Verify that each returned document actually contains at least one query term
                verified_docs = []
                for doc in raw_docs:
                    doc_text = f"{doc.get('topic', '')} {doc.get('file_path', '')} {doc.get('content', '')}".lower()
                    if any(t in doc_text for t in terms):
                        verified_docs.append(doc)
                return verified_docs
            else:
                logger.warning(f"Supabase okf_docs query returned {resp.status_code}: {resp.text}")
                return []
    except Exception as e:
        logger.error(f"Error querying Supabase okf_docs: {e}")
        return []

async def insert_okf_doc(doc: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Inserts a new OKF document into the okf_docs table.
    """
    if not settings.supabase_url or settings.supabase_url == "default":
        return None

    url = f"{settings.supabase_url}/rest/v1/okf_docs"
    headers = get_supabase_headers()

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(url, headers=headers, json=doc)
            if resp.status_code in (200, 201):
                results = resp.json()
                return results[0] if results else doc
            else:
                logger.warning(f"Failed to insert into okf_docs ({resp.status_code}): {resp.text}")
                return None
    except Exception as e:
        logger.error(f"Error inserting okf_doc to Supabase: {e}")
        return None

async def list_okf_docs(user_id: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Lists OKF docs from Supabase.
    """
    if not settings.supabase_url or settings.supabase_url == "default":
        return []

    url = f"{settings.supabase_url}/rest/v1/okf_docs"
    headers = get_supabase_headers()
    params = {
        "select": "id,file_path,type,topic,source,content,created_at",
        "order": "created_at.desc",
        "limit": limit
    }
    if user_id:
        params["user_id"] = f"eq.{user_id}"

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code == 200:
                return resp.json()
            return []
    except Exception as e:
        logger.error(f"Error listing okf_docs: {e}")
        return []

async def check_retractions(sources_or_dois: List[str]) -> List[Dict[str, Any]]:
    """
    Checks if any DOI, arxiv_id, or title matches known retractions in Supabase.
    """
    if not settings.supabase_url or settings.supabase_url == "default" or not sources_or_dois:
        return []

    url = f"{settings.supabase_url}/rest/v1/retractions"
    headers = get_supabase_headers()

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            # Check matches against doi or arxiv_id
            for source in sources_or_dois[:5]:
                clean = source.strip()
                if "doi.org/" in clean or "arxiv.org/" in clean or len(clean) > 5:
                    resp = await client.get(url, headers=headers, params={
                        "or": f"(doi.eq.{clean},arxiv_id.eq.{clean})",
                        "limit": 1
                    })
                    if resp.status_code == 200 and resp.json():
                        return resp.json()
            return []
    except Exception as e:
        logger.error(f"Error checking retractions: {e}")
        return []

async def log_query_run(
    query: str,
    response: str,
    tiers_fired: List[str],
    dristi_engine: str,
    thread_id: Optional[str] = None,
    user_id: Optional[str] = None
) -> None:
    """
    Logs query execution to public.query_logs.
    Uses upsert (resolution=merge-duplicates) and fresh UUIDs to prevent 409 Conflict.
    """
    if not settings.supabase_url or settings.supabase_url == "default":
        return

    # Check for valid UUID user_id (required by query_logs schema NOT NULL and foreign key)
    if not user_id:
        logger.debug("Skipping query_logs insertion without authenticated user_id.")
        return

    try:
        uuid.UUID(str(user_id))
    except (ValueError, TypeError):
        logger.debug(f"Skipping query_logs: user_id '{user_id}' is not a valid UUID.")
        return

    url = f"{settings.supabase_url}/rest/v1/query_logs"
    headers = get_supabase_headers()
    # Use upsert header to ensure duplicate keys/conflicts never throw HTTP 409
    headers["Prefer"] = "resolution=merge-duplicates"

    payload = {
        "id": str(uuid.uuid4()),
        "user_id": str(user_id),
        "query": query,
        "response": response,
        "tiers_fired": tiers_fired,
        "dristi_engine": dristi_engine
    }
    if thread_id:
        try:
            uuid.UUID(str(thread_id))
            payload["thread_id"] = str(thread_id)
        except (ValueError, TypeError):
            pass

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code in (200, 201, 204):
                return
            elif resp.status_code == 409:
                logger.info(f"Supabase query_logs skipped (409 Conflict / foreign key constraint for user_id={user_id}).")
            else:
                logger.warning(f"Supabase query_logs returned status {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.error(f"Failed to log query: {e}")

async def insert_feedback(feedback_data: Dict[str, Any]) -> bool:
    """
    Inserts a user feedback record into public.feedback.
    Returns True on HTTP 200/201 success, False otherwise.
    """
    if not settings.supabase_url or settings.supabase_url == "default":
        logger.warning("Supabase URL not configured; cannot store feedback.")
        return False

    url = f"{settings.supabase_url}/rest/v1/feedback"
    headers = get_supabase_headers()

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(url, headers=headers, json=feedback_data)
            if resp.status_code in (200, 201):
                logger.info(f"Feedback stored successfully in Supabase for message_id {feedback_data.get('message_id')}")
                return True
            else:
                logger.error(f"Failed to insert feedback ({resp.status_code}): {resp.text}")
                return False
    except Exception as e:
        logger.error(f"Error inserting feedback to Supabase: {e}")
        return False


async def permanently_delete_user_account(user_id: str) -> Dict[str, Any]:
    """
    Permanently deletes all user-owned rows from Supabase PostgreSQL tables and then
    deletes the auth user via the Supabase Auth Admin API using SUPABASE_SERVICE_ROLE_KEY.
    Never exposes secrets or tokens.
    """
    if not user_id:
        raise ValueError("user_id is required for account deletion.")
    try:
        uuid.UUID(str(user_id))
    except (ValueError, TypeError) as exc:
        raise ValueError("user_id must be a valid UUID.") from exc

    if not settings.supabase_url or settings.supabase_url == "default" or not settings.supabase_service_role_key or settings.supabase_service_role_key == "default":
        raise RuntimeError("Supabase service configuration is incomplete.")

    base_url = settings.supabase_url.rstrip("/")
    headers = get_supabase_headers()

    user_scoped_tables = [
        ("api_keys", "user_id"),
        ("query_logs", "user_id"),
        ("threads", "user_id"),
        ("collections", "user_id"),
        ("okf_docs", "user_id"),
        ("feedback", "user_id"),
        ("profiles", "id"),
    ]

    async with httpx.AsyncClient(timeout=8.0) as client:
        for table, col in user_scoped_tables:
            del_url = f"{base_url}/rest/v1/{table}"
            resp = await client.delete(del_url, headers=headers, params={col: f"eq.{user_id}"})
            if resp.status_code not in (200, 204, 400, 404):
                logger.warning(f"Table cleanup warning for {table} (user={str(user_id)[:8]}): HTTP {resp.status_code}")

        admin_url = f"{base_url}/auth/v1/admin/users/{user_id}"
        admin_resp = await client.delete(admin_url, headers=headers)
        if admin_resp.status_code not in (200, 204):
            logger.error(f"Supabase Admin user delete failed (user={str(user_id)[:8]}): HTTP {admin_resp.status_code}")
            raise RuntimeError(f"Auth provider deletion failed with status {admin_resp.status_code}.")

    return {"deleted": True}
