import os
import json
import sqlite3
from datetime import datetime, timezone
import numpy as np
import chromadb.utils.embedding_functions as ef
from .auth import get_db_connection
from .sessions import is_db_mode, result_to_dict, result_from_dict
from .core import ResearchResult

_EMBEDDING_FN = None

def get_embedding_fn():
    global _EMBEDDING_FN
    if _EMBEDDING_FN is None:
        _EMBEDDING_FN = ef.DefaultEmbeddingFunction()
    return _EMBEDDING_FN


def check_cache(question: str) -> ResearchResult | None:
    """Checks the query cache for a semantically similar question (cosine similarity >= 0.95) within 24 hours."""
    if not question:
        return None

    try:
        # Calculate question embedding and cast to Python float list
        emb_fn = get_embedding_fn()
        raw_emb = emb_fn([question])[0]
        emb = [float(x) for x in raw_emb]
        
        if is_db_mode():
            # Supabase PostgreSQL Mode: use pgvector (<=> cosine distance operator)
            # Cosine distance <= 0.05 is equivalent to cosine similarity >= 0.95
            conn = get_db_connection()
            try:
                emb_str = f"[{','.join(map(str, emb))}]"
                cur = conn.cursor()
                try:
                    cur.execute(
                        """
                        SELECT result, created_at, (embedding <=> %s) as distance
                        FROM query_cache
                        WHERE created_at > NOW() - INTERVAL '24 hours'
                          AND (embedding <=> %s) <= 0.05
                        ORDER BY distance ASC
                        LIMIT 1
                        """,
                        (emb_str, emb_str)
                    )
                    row = cur.fetchone()
                    if row:
                        result_data = row[0]
                        # In psycopg2, JSONB fields might be auto-parsed into dicts
                        if isinstance(result_data, str):
                            result_data = json.loads(result_data)
                        res = result_from_dict(result_data)
                        res.cached = True
                        return res
                finally:
                    cur.close()
            finally:
                conn.close()
        else:
            # SQLite local fallback mode: load candidate cache entries and compute similarity locally
            conn = get_db_connection()
            try:
                cur = conn.cursor()
                try:
                    # SQLite DATETIME('now', '-24 hours') fetches recent logs
                    cur.execute(
                        """
                        SELECT question, embedding, result, created_at
                        FROM query_cache
                        WHERE created_at > DATETIME('now', '-24 hours')
                        """
                    )
                    rows = cur.fetchall()
                    
                    best_sim = -1.0
                    best_result_str = None
                    
                    for q_text, emb_str, res_str, created_at in rows:
                        cached_emb = np.array(json.loads(emb_str))
                        query_emb = np.array(emb)
                        
                        norm_q = np.linalg.norm(query_emb)
                        norm_c = np.linalg.norm(cached_emb)
                        
                        if norm_q > 0 and norm_c > 0:
                            sim = np.dot(query_emb, cached_emb) / (norm_q * norm_c)
                        else:
                            sim = 0.0
                            
                        if sim > best_sim:
                            best_sim = sim
                            best_result_str = res_str
                            
                    if best_sim >= 0.95 and best_result_str:
                        res = result_from_dict(json.loads(best_result_str))
                        res.cached = True
                        return res
                finally:
                    cur.close()
            finally:
                conn.close()
    except Exception as e:
        print(f"[Warning] Query cache lookup failed: {e}")
        
    return None


def store_cache(question: str, result: ResearchResult) -> None:
    """Stores the research result into the query cache."""
    if not question or not result:
        return

    # Never cache a result unless the verifier passed it
    verification = result.verification or ""
    if "PASSED" not in verification.upper():
        print(f"[Info] Skipping query caching because verification status is not PASSED: {verification.splitlines()[0] if verification else 'None'}")
        return

    try:
        # Calculate question embedding and cast to Python float list
        emb_fn = get_embedding_fn()
        raw_emb = emb_fn([question])[0]
        emb = [float(x) for x in raw_emb]
        
        result_dict = result_to_dict(result)
        # Ensure cached field is set to True inside the stored payload if it's cached, 
        # but here we store the fresh result.
        result_dict["cached"] = True
        
        if is_db_mode():
            conn = get_db_connection()
            try:
                emb_str = f"[{','.join(map(str, emb))}]"
                cur = conn.cursor()
                try:
                    cur.execute(
                        """
                        INSERT INTO query_cache (question, embedding, result)
                        VALUES (%s, %s, %s)
                        """,
                        (question, emb_str, json.dumps(result_dict))
                    )
                    conn.commit()
                finally:
                    cur.close()
            finally:
                conn.close()
        else:
            conn = get_db_connection()
            try:
                cur = conn.cursor()
                try:
                    cur.execute(
                        """
                        INSERT INTO query_cache (question, embedding, result)
                        VALUES (?, ?, ?)
                        """,
                        (question, json.dumps(emb), json.dumps(result_dict))
                    )
                    conn.commit()
                finally:
                    cur.close()
            finally:
                conn.close()
    except Exception as e:
        print(f"[Warning] Failed to store result in query cache: {e}")
