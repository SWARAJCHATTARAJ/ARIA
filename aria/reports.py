from __future__ import annotations

from html import escape
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from aria.models import ResearchResult


def build_markdown_report(result: ResearchResult) -> str:
    evidence_lines = []
    for index, item in enumerate(result.evidence, start=1):
        link = f" - {item.url}" if item.url else ""
        evidence_lines.append(f"{index}. **{item.title}** ({item.source_type}){link}")

    plan_lines = "\n".join(f"- {query}" for query in result.plan)
    evidence_block = "\n".join(evidence_lines) or "No evidence collected."

    confidence = confidence_label(result)

    return f"""# ARIA Research Brief

## Research Question

{result.question}

## Analyst Confidence

{confidence}

## Search Strategy

{plan_lines}

## Executive Brief

{result.answer}

## Verification

{result.verification}

## Evidence Register

{evidence_block}
"""


def markdown_to_pdf_bytes(markdown: str) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []
    for line in markdown.splitlines():
        if not line.strip():
            story.append(Spacer(1, 8))
            continue
        style = styles["Heading1"] if line.startswith("# ") else styles["BodyText"]
        text = escape(line.lstrip("#").strip())
        story.append(Paragraph(text, style))
    doc.build(story)
    return buffer.getvalue()


def confidence_label(result: ResearchResult) -> str:
    count = len(result.evidence)
    high_signal = sum(
        1 for item in result.evidence if item.source_type in {"pdf", "research", "finance"}
    )
    if count >= 8 and high_signal >= 2:
        return "Medium-High: multiple sources collected, including document/research/market evidence."
    if count >= 4:
        return "Medium: enough sources for a useful brief, but more official PDFs would improve confidence."
    if count > 0:
        return "Low-Medium: preliminary evidence collected; add PDFs or more sources before making decisions."
    return "Low: no evidence collected."
