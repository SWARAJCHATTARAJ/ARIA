from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import sqlite3
if sqlite3.sqlite_version_info < (3, 35, 0):
    try:
        import pysqlite3
        import sys
        sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
    except ImportError:
        pass

import os

from .core import Settings, Evidence, MAX_PDF_PAGES, safe_temp_pdf_path


def is_db_mode() -> bool:
    db_url = os.getenv("DATABASE_URL")
    return bool(db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")))


class VectorMemory:
    """Persistent vector memory backed by Supabase/pgvector or local ChromaDB."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        if is_db_mode():
            self.client = None
            self.collection = None
        else:
            import chromadb
            from chromadb.config import Settings as ChromaSettings
            self.path = Path(settings.memory_path)
            self.path.mkdir(parents=True, exist_ok=True)
            
            self.client = chromadb.PersistentClient(
                path=str(self.path),
                settings=ChromaSettings(anonymized_telemetry=False)
            )
            self.collection = self.client.get_or_create_collection(
                name=settings.collection_name or "aria_memory"
            )

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

        if is_db_mode():
            import chromadb.utils.embedding_functions as ef
            embedding_fn = ef.DefaultEmbeddingFunction()
            embeddings = embedding_fn(documents)

            from .auth import get_db_connection
            import json
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
        else:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
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

        if is_db_mode():
            import chromadb.utils.embedding_functions as ef
            embedding_fn = ef.DefaultEmbeddingFunction()
            embeddings = embedding_fn(documents)

            from .auth import get_db_connection
            import json
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
        else:
            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            return len(documents)

    def count(self) -> int:
        if is_db_mode():
            from .auth import get_db_connection
            conn = get_db_connection()
            try:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT COUNT(*) FROM vector_memory")
                    row = cursor.fetchone()
                    return row[0] if row else 0
            finally:
                conn.close()
        else:
            return self.collection.count()

    def reset(self) -> None:
        if is_db_mode():
            from .auth import get_db_connection
            conn = get_db_connection()
            try:
                with conn.cursor() as cursor:
                    cursor.execute("TRUNCATE TABLE vector_memory")
                    conn.commit()
            finally:
                conn.close()
        else:
            name = self.settings.collection_name or "aria_memory"
            try:
                self.client.delete_collection(name)
            except ValueError:
                pass
            self.collection = self.client.get_or_create_collection(name=name)

    def retrieve(self, query: str, n_results: int = 5) -> list[Evidence]:
        if is_db_mode():
            from .retrieval_logger import log_retrieval_call
            total_count = self.count()
            if not total_count:
                log_retrieval_call(query, [])
                return []

            import chromadb.utils.embedding_functions as ef
            embedding_fn = ef.DefaultEmbeddingFunction()
            query_embeddings = embedding_fn([query])
            if not query_embeddings:
                log_retrieval_call(query, [])
                return []
            query_emb = query_embeddings[0]
            query_emb_str = f"[{','.join(map(str, query_emb))}]"

            limit = min(n_results, total_count)
            from .auth import get_db_connection
            import json
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
                                retrieved_via="local_vector_memory",
                            )
                        )
                from .retrieval_logger import log_retrieval_call
                log_retrieval_call(query, evidence)
                return evidence
            finally:
                conn.close()
        else:
            from .retrieval_logger import log_retrieval_call
            if not self.collection.count():
                log_retrieval_call(query, [])
                return []
                
            results = self.collection.query(
                query_texts=[query],
                n_results=min(n_results, self.collection.count())
            )
            
            evidence: list[Evidence] = []
            if not results["documents"] or not results["documents"][0]:
                log_retrieval_call(query, [])
                return evidence
                
            docs = results["documents"][0]
            metas = results["metadatas"][0]
            distances = results.get("distances", [[]])[0] if results.get("distances") else []
            
            for i, (doc, meta) in enumerate(zip(docs, metas)):
                source = meta.get("source", "Memory source")
                section = meta.get("page", "?")
                source_type = meta.get("source_type", "pdf")
                
                dist = distances[i] if i < len(distances) else 0.5
                score = round(1.0 / (1.0 + dist), 2)
                score = max(0.0, min(1.0, score))
                
                evidence.append(
                    Evidence(
                        title=f"{source} p.{section}",
                        summary=doc,
                        source_type=source_type,
                        score=score,
                        source_id=f"{source}:p{section}",
                        retrieved_via="local_vector_memory",
                    )
                )
            log_retrieval_call(query, evidence)
            return evidence

    def retrieve_all(self, limit: int = 30) -> list[Evidence]:
        if is_db_mode():
            total_count = self.count()
            if not total_count:
                return []

            from .auth import get_db_connection
            import json
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
                                retrieved_via="local_vector_memory",
                            )
                        )
                return evidence
            finally:
                conn.close()
        else:
            if not self.collection.count():
                return []
                
            results = self.collection.get(
                limit=limit
            )
            
            evidence: list[Evidence] = []
            if not results["documents"]:
                return evidence
                
            docs = results["documents"]
            metas = results["metadatas"]
            
            for doc, meta in zip(docs, metas):
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
                        retrieved_via="local_vector_memory",
                    )
                )
            return evidence


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
        
        # If we are not at the end of the text, try to find a space boundary
        if end < len(cleaned):
            space_idx = cleaned.rfind(" ", start, end)
            if space_idx > start:
                end = space_idx
                
        chunks.append(cleaned[start:end])
        
        # Determine next start
        next_start = end - overlap
        if next_start > start and next_start < len(cleaned):
            # Align next_start to space boundary if possible
            space_idx = cleaned.find(" ", next_start, min(end, len(cleaned)))
            if space_idx != -1:
                next_start = space_idx + 1
        
        start = max(next_start, start + 1)
    return chunks
