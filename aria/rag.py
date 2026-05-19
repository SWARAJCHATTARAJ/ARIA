from __future__ import annotations

import math
from pathlib import Path
from uuid import uuid4

# Streamlit Cloud workaround for ChromaDB SQLite requirement
try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import chromadb
from chromadb.config import Settings as ChromaSettings
import fitz

from .config import Settings
from .models import Evidence
from .security import MAX_PDF_PAGES, safe_temp_pdf_path


class VectorMemory:
    """True Vector Retrieval store using ChromaDB and sentence-transformers."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
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
        documents = []
        metadatas = []
        ids = []

        with fitz.open(safe_temp_pdf_path(path)) as doc:
            if doc.page_count > MAX_PDF_PAGES:
                raise ValueError(f"PDF has {doc.page_count} pages. Limit is {MAX_PDF_PAGES} pages.")

            for page_index, page in enumerate(doc, start=1):
                text = page.get_text("text").strip()
                for chunk in split_text(text):
                    documents.append(chunk)
                    metadatas.append({"source": source_name, "page": page_index})
                    ids.append(str(uuid4()))

        if not documents:
            return 0

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

        self.collection.add(
            documents=documents,
            metadatas=[
                {"source": source_name, "page": index, "source_type": source_type}
                for index, _ in enumerate(documents, start=1)
            ],
            ids=[str(uuid4()) for _ in documents],
        )
        return len(documents)

    def count(self) -> int:
        return self.collection.count()

    def reset(self) -> None:
        name = self.settings.collection_name or "aria_memory"
        try:
            self.client.delete_collection(name)
        except ValueError:
            pass
        self.collection = self.client.get_or_create_collection(name=name)

    def retrieve(self, query: str, n_results: int = 5) -> list[Evidence]:
        if not self.collection.count():
            return []
            
        results = self.collection.query(
            query_texts=[query],
            n_results=min(n_results, self.collection.count())
        )
        
        evidence: list[Evidence] = []
        if not results["documents"] or not results["documents"][0]:
            return evidence
            
        docs = results["documents"][0]
        metas = results["metadatas"][0]
        
        for doc, meta in zip(docs, metas):
            source = meta.get("source", "Memory source")
            section = meta.get("page", "?")
            source_type = meta.get("source_type", "pdf")
            evidence.append(
                Evidence(
                    title=f"{source} p.{section}",
                    summary=doc,
                    source_type=source_type,
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
        chunks.append(cleaned[start:end])
        start = max(end - overlap, start + 1)
    return chunks
