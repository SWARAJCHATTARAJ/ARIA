from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("aria.core")

MAX_UPLOAD_MB = 15
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_PDF_PAGES = 80


@dataclass(frozen=True)
class Settings:
    llm_provider: str
    model: str
    collection_name: str
    memory_path: str
    azure_endpoint: str | None = None
    azure_api_key: str | None = None
    azure_deployment_name: str | None = None
    azure_api_version: str = "2024-08-01-preview"

    @classmethod
    def from_env(cls) -> Settings:
        provider = os.getenv("ARIA_LLM_PROVIDER", "azure").strip().lower()
        os.getenv("OPENROUTER_API_KEY", "").strip()
        azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").strip() or None
        azure_api_key = os.getenv("AZURE_OPENAI_API_KEY", "").strip() or None
        azure_deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "").strip() or None
        azure_api_version = os.getenv("AZURE_OPENAI_API_VERSION", "").strip() or "2024-08-01-preview"


        # Security pass: warning if other provider keys are configured
        other_keys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY", "COHERE_API_KEY", "MISTRAL_API_KEY"]
        for key in other_keys:
            val = os.getenv(key, "").strip()
            if val and not val.startswith("your_"):
                msg = f"[Security Warning] LLM credential variable '{key}' is set. ARIA is configured to use OpenRouter or Azure OpenAI ONLY. This credential will be ignored and should be removed to prevent leaks."
                logger.warning(msg)
                logger.info(msg)

        return cls(
            llm_provider=provider,
            model=os.getenv("ARIA_MODEL", "local-extractive"),
            collection_name=os.getenv("ARIA_COLLECTION", "aria_research_memory"),
            memory_path=os.getenv("ARIA_MEMORY_PATH", ".aria_chroma_db"),
            azure_endpoint=azure_endpoint,
            azure_api_key=azure_api_key,
            azure_deployment_name=azure_deployment_name,
            azure_api_version=azure_api_version,
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
    trust_tier: str | None = None
    confidence: float = 1.0

    def __post_init__(self):
        if self.trust_tier is None:
            st = (self.source_type or "").lower()
            if st in {"arxiv", "openalex", "doaj", "pubmed", "research", "academic"}:
                self.trust_tier = "academic"
            elif st in {"wikipedia", "reference", "pdf", "note", "document", "local"}:
                self.trust_tier = "reference"
            elif st in {"yfinance", "market"}:
                self.trust_tier = "market"
            else:
                self.trust_tier = "web"


@dataclass
class ResearchResult:
    question: str
    plan: list[str]
    answer: str
    verification: str
    evidence: list[Evidence]
    events: list[str] = field(default_factory=list)
    metrics: dict[str, int | float | str] = field(default_factory=dict)
    cached: bool = False
    history: list[dict] = field(default_factory=list)
    validation_warning: bool = False
    recurring_interval: str | None = None
    last_run_at: str | None = None
    query_type: str = "research"
    query_subtype: str = "conceptual"
    is_grounded: bool = True


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


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text.split()) * 1.33)) if text else 0
