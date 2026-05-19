from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    llm_provider: str
    model: str
    collection_name: str
    memory_path: str

    @classmethod
    def from_env(cls) -> "Settings":
        provider = os.getenv("ARIA_LLM_PROVIDER", "free").strip().lower()
        return cls(
            llm_provider=provider,
            model=os.getenv("ARIA_MODEL", "local-extractive"),
            collection_name=os.getenv("ARIA_COLLECTION", "aria_research_memory"),
            memory_path=os.getenv("ARIA_MEMORY_PATH", ".aria_chroma_db"),
        )
