from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

MAX_UPLOAD_MB = 15
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_PDF_PAGES = 80


@dataclass(frozen=True)
class Settings:
    llm_provider: str
    model: str
    collection_name: str
    memory_path: str

    @classmethod
    def from_env(cls) -> Settings:
        provider = os.getenv("ARIA_LLM_PROVIDER", "free").strip().lower()
        return cls(
            llm_provider=provider,
            model=os.getenv("ARIA_MODEL", "local-extractive"),
            collection_name=os.getenv("ARIA_COLLECTION", "aria_research_memory"),
            memory_path=os.getenv("ARIA_MEMORY_PATH", ".aria_chroma_db"),
        )


@dataclass
class Evidence:
    title: str
    summary: str
    source_type: str
    url: str | None = None
    score: float = 0.75
    source_id: str | None = None
    retrieved_via: str | None = None
    query: str | None = None


@dataclass
class ResearchResult:
    question: str
    plan: list[str]
    answer: str
    verification: str
    evidence: list[Evidence]
    events: list[str] = field(default_factory=list)
    metrics: dict[str, int | float | str] = field(default_factory=dict)


def validate_pdf_upload(name: str, size: int) -> None:
    if not name or Path(name).name != name:
        raise ValueError("PDF filename is invalid.")
    if not name.lower().endswith(".pdf"):
        raise ValueError("Only PDF files are accepted.")
    if size <= 0:
        raise ValueError("PDF file is empty.")
    if size > MAX_UPLOAD_BYTES:
        raise ValueError(f"PDF is too large. Limit is {MAX_UPLOAD_MB} MB per file.")


def safe_temp_pdf_path(path: Path) -> Path:
    resolved = path.resolve()
    if resolved.suffix.lower() != ".pdf":
        raise ValueError("Temporary upload path must be a PDF.")
    return resolved
