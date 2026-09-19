from __future__ import annotations

import json
import os
import requests
from pathlib import Path
from uuid import uuid4

from .core import MAX_PDF_PAGES, Evidence, Settings, safe_temp_pdf_path
from .auth import get_db_connection
from .retrieval_logger import log_retrieval_call


def get_openai_embeddings(texts: list[str]) -> list[list[float]]:
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        # Fallback to empty if not set, to not crash immediately if they don't have a key right away
        return [[0.0]*1536 for _ in texts]
        
    response = requests.post(
        "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"input": texts, "model": "text-embedding-3-small"}
    )
    if response.status_code != 200:
        return [[0.0]*1536 for _ in texts]
    data = response.json()
    return [item["embedding"] for item in data["data"]]


class VectorMemory:
    """Persistent vector memory backed ONLY by Supabase/pgvector and OpenAI Embeddings."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        # We assume Supabase mode is ALWAYS active now

    def ingest_pdf(self, path: Path, source_name: str) -> int:
        import fitz
        documents = []
        metadatas = []
        ids = []

        try:
            doc = fitz.open(safe_temp_pdf_path(path))
        except Exception as exc:
            raise ValueError(f"Could not open PDF '{source_name}': {exc}")

        with doc:
            if doc.page_count > MAX_PDF_PAGES:
                raise ValueError(f"PDF has {doc.page_count} pages. Limit is {MAX_PDF_PAGES} pages.")

            for page_index, page in enumerate(doc, start=1):
                text = page.get_text("text").strip()
                for chunk in split_text(text):
                    documents.append(chunk)
                    metadatas.append({"source": source_name, "page": page_index, "source_type": "pdf"})
                    ids.append(str(uuid4()))

        if not documents:
            return 0

        embeddings = get_openai_embeddings(documents)
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                for doc_id, doc_text, meta, emb in zip(ids, documents, metadatas, embeddings):
                    emb_str = f"[{','.join(map(str, emb))}]"
                    cursor.execute(
                        """
                        INSERT INTO vector_memory (id, document, metadata, embedding)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                        SET document = EXCLUDED.document, metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding
                        """,
                        (doc_id, doc_text, json.dumps(meta), emb_str)
                    )
                conn.commit()
        finally:
            conn.close()
        return len(documents)

    def ingest_text(self, text: str, source_name: str, source_type: str = "document") -> int:
        documents = split_text(text)
        if not documents:
            return 0

        ids = [str(uuid4()) for _ in documents]
        metadatas = [
            {"source": source_name, "page": index, "source_type": source_type}
            for index, _ in enumerate(documents, start=1)
        ]

        embeddings = get_openai_embeddings(documents)
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                for doc_id, doc_text, meta, emb in zip(ids, documents, metadatas, embeddings):
                    emb_str = f"[{','.join(map(str, emb))}]"
                    cursor.execute(
                        """
                        INSERT INTO vector_memory (id, document, metadata, embedding)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (id) DO UPDATE
                        SET document = EXCLUDED.document, metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding
                        """,
                        (doc_id, doc_text, json.dumps(meta), emb_str)
                    )
                conn.commit()
        finally:
            conn.close()
        return len(documents)

    def count(self) -> int:
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM vector_memory")
                row = cursor.fetchone()
                return row[0] if row else 0
        except Exception:
            return 0
        finally:
            conn.close()

    def reset(self) -> None:
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("TRUNCATE TABLE vector_memory")
                conn.commit()
        except Exception:
            pass
        finally:
            conn.close()

    def retrieve(self, query: str, n_results: int = 5) -> list[Evidence]:
        total_count = self.count()
        if not total_count:
            log_retrieval_call(query, [])
            return []

        query_embeddings = get_openai_embeddings([query])
        if not query_embeddings:
            log_retrieval_call(query, [])
            return []
            
        query_emb = query_embeddings[0]
        query_emb_str = f"[{','.join(map(str, query_emb))}]"
        limit = min(n_results, total_count)

        conn = get_db_connection()
        evidence: list[Evidence] = []
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT document, metadata, embedding <=> %s AS distance
                    FROM vector_memory
                    ORDER BY distance ASC
                    LIMIT %s
                    """,
                    (query_emb_str, limit)
                )
                rows = cursor.fetchall()
                for row in rows:
                    doc = row[0]
                    meta = row[1]
                    if isinstance(meta, str):
                        meta = json.loads(meta)
                    dist = row[2] if row[2] is not None else 0.5
                    
                    score = round(1.0 / (1.0 + dist), 2)
                    score = max(0.0, min(1.0, score))
                    
                    source = meta.get("source", "Memory source")
                    section = meta.get("page", "?")
                    source_type = meta.get("source_type", "pdf")
                    
                    evidence.append(
                        Evidence(
                            title=f"{source} p.{section}",
                            summary=doc,
                            source_type=source_type,
                            score=score,
                            source_id=f"{source}:p{section}",
                            retrieved_via="supabase_pgvector",
                        )
                    )
            log_retrieval_call(query, evidence)
            return evidence
        except Exception:
            return []
        finally:
            conn.close()

    def retrieve_all(self, limit: int = 30) -> list[Evidence]:
        total_count = self.count()
        if not total_count:
            return []

        conn = get_db_connection()
        evidence: list[Evidence] = []
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT document, metadata FROM vector_memory
                    LIMIT %s
                    """,
                    (limit,)
                )
                rows = cursor.fetchall()
                for row in rows:
                    doc = row[0]
                    meta = row[1]
                    if isinstance(meta, str):
                        meta = json.loads(meta)
                    meta = meta or {}
                    source = meta.get("source", "Memory source")
                    section = meta.get("page", "?")
                    source_type = meta.get("source_type", "pdf")
                    evidence.append(
                        Evidence(
                            title=f"{source} p.{section}",
                            summary=doc,
                            source_type=source_type,
                            score=1.0,
                            source_id=f"{source}:p{section}",
                            retrieved_via="supabase_pgvector",
                        )
                    )
            return evidence
        except Exception:
            return []
        finally:
            conn.close()


def split_text(text: str, chunk_size: int = 1000, overlap: int = 120) -> list[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0.")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be non-negative and smaller than chunk_size.")

    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    chunks = []
    start = 0
    while start < len(cleaned):
        end = start + chunk_size
        if end < len(cleaned):
            space_idx = cleaned.rfind(" ", start, end)
            if space_idx > start:
                end = space_idx
        chunks.append(cleaned[start:end])
        next_start = end - overlap
        if next_start > start and next_start < len(cleaned):
            space_idx = cleaned.find(" ", next_start, min(end, len(cleaned)))
            if space_idx != -1:
                next_start = space_idx + 1
        start = max(next_start, start + 1)
    return chunks
