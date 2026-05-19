from __future__ import annotations

import os

import requests

from aria.config import Settings


class LLMClient:
    """Optional free-tier API client with a deterministic local fallback."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")

    def complete(self, system: str, user: str) -> str:
        if self.settings.llm_provider == "openrouter" and self.openrouter_api_key:
            response = self._openrouter(system, user)
            if response:
                return response
        return self._fallback(user)

    def _openrouter(self, system: str, user: str) -> str:
        payload = {
            "model": self.settings.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.2,
        }
        try:
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:8501",
                    "X-Title": "ARIA Free Research Demo",
                },
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except (requests.RequestException, KeyError, IndexError):
            return ""

    def _fallback(self, user: str) -> str:
        evidence = user.split("Evidence:", 1)[-1].strip()
        snippets = [block.strip() for block in evidence.split("\n\n") if block.strip()]
        if not snippets:
            return (
                "### Executive View\n\n"
                "No usable evidence was collected yet.\n\n"
                "### Required Action\n\n"
                "- Enable free web research and confirm internet access.\n"
                "- Upload official PDFs or reports for local retrieval.\n"
                "- Re-run the same question after at least one source is available."
            )

        source_blocks = [
            item for item in snippets if "search unavailable" not in item.lower()
        ]
        if not source_blocks:
            source_blocks = snippets

        top = source_blocks[:6]
        bullets = []
        for item in top:
            first_line, _, rest = item.partition("\n")
            sentence = first_sentence(rest or first_line)
            bullets.append(f"- {sentence}")
        return (
            "### Executive View\n\n"
            "ARIA found the following evidence-backed points:\n\n"
            + "\n".join(bullets)
            + "\n\n### Source Coverage\n\n"
            f"- Evidence items reviewed: {len(snippets)}\n"
            "- Synthesis mode: lightweight extractive analysis\n\n"
            "### Analyst Caveat\n\n"
            "This zero-cost mode uses extractive synthesis, so it avoids inventing claims. "
            "For presentation-quality prose, add an optional free-tier OpenRouter key and keep the same lightweight stack."
        )


def first_sentence(text: str) -> str:
    text = " ".join(text.split())
    if not text:
        return "Evidence item collected, but no summary text was available."
    for marker in [". ", "? ", "! "]:
        if marker in text:
            return text.split(marker, 1)[0].strip() + marker.strip()
    return text[:240]
