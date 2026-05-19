from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Evidence:
    title: str
    summary: str
    source_type: str
    url: str | None = None


@dataclass
class ResearchResult:
    question: str
    plan: list[str]
    answer: str
    verification: str
    evidence: list[Evidence]
    events: list[str] = field(default_factory=list)

