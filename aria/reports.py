from __future__ import annotations

from datetime import datetime
from html import escape
from io import BytesIO
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
)
from reportlab.pdfgen import canvas

from .core import ResearchResult, Evidence


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute total page count and draw
    matching professional running headers, footers, and page numbers.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        width, height = A4

        # Header (Only on pages 2+)
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#475569"))
            self.drawString(40, height - 35, "ARIA RESEARCH BRIEF")

            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#64748B"))
            self.drawRightString(width - 40, height - 35, "Autonomous Research Intelligence Analyst")

            # Thin header line
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(40, height - 42, width - 40, height - 42)

        # Footer (On all pages)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(40, 50, width - 40, 50)

        # Footer Text (Left: Swaraj Chattaraj, Right: Page X of Y)
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#475569"))
        self.drawString(40, 35, "Architect:")
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(85, 35, "Swaraj Chattaraj")

        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(width - 40, 35, page_text)

        self.restoreState()


def clean_markdown_text(text: str) -> str:
    """
    Safely escapes characters and translates basic Markdown styling (bold, italic, code)
    into ReportLab-compatible HTML tags.
    """
    text = escape(text)
    # Convert bold (**text** or __text__) to <b>
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'__(.*?)__', r'<b>\1</b>', text)
    # Convert italic (*text* or _text_) to <i>
    text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
    text = re.sub(r'_(.*?)_', r'<i>\1</i>', text)
    # Convert inline code (`code`) to a styled fixed-width font
    text = re.sub(
        r'`(.*?)`',
        r'<font name="Courier" size="9" color="#1E293B"><b>\1</b></font>',
        text
    )
    return text


def confidence_label(result: ResearchResult) -> str:
    """
    Computes a qualitative confidence label based on the quantity and quality of evidence.
    """
    count = len(result.evidence)
    high_signal = sum(
        1 for item in result.evidence if item.source_type in {"pdf", "research", "finance"}
    )
    if count >= 8 and high_signal >= 2:
        return "High"
    if count >= 4:
        return "Medium"
    if count > 0:
        return "Low-Medium"
    return "Low"


def text_to_flowables(text: str, styles) -> list:
    """
    Parses a block of text containing multiple paragraphs, headers, and bullet points
    into styled Flowables.
    """
    flowables = []
    paragraphs = text.split('\n\n')

    # Custom styles
    subheading_style = ParagraphStyle(
        'SubHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1E3A8A"),
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )
    
    subsubheading_style = ParagraphStyle(
        'SubSubHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    bullet_style = ParagraphStyle(
        'BulletList',
        parent=styles['Normal'],
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        lines = para.split('\n')
        is_bullet_list = all(line.strip().startswith(('-', '*', '+')) for line in lines if line.strip())

        if is_bullet_list:
            for line in lines:
                line_str = line.strip().lstrip('-*+').strip()
                if line_str:
                    bullet_text = f"&bull; {clean_markdown_text(line_str)}"
                    flowables.append(Paragraph(bullet_text, bullet_style))
            flowables.append(Spacer(1, 6))
        else:
            if para.startswith('### '):
                header_text = clean_markdown_text(para[4:].strip())
                flowables.append(Paragraph(header_text, subsubheading_style))
            elif para.startswith('## '):
                header_text = clean_markdown_text(para[3:].strip())
                flowables.append(Paragraph(header_text, subheading_style))
            else:
                clean_lines = [line.strip() for line in lines if line.strip()]
                clean_para_text = " ".join(clean_lines)
                flowables.append(Paragraph(clean_markdown_text(clean_para_text), styles['BodyText']))
                flowables.append(Spacer(1, 6))

    return flowables


def build_markdown_report(result: ResearchResult) -> str:
    """
    Constructs a clean Markdown representation of the research result.
    """
    evidence_lines = []
    for index, item in enumerate(result.evidence, start=1):
        link = f" - {item.url}" if item.url else ""
        evidence_lines.append(f"{index}. **{item.title}** ({item.source_type}){link}")

    plan_lines = "\n".join(f"- {query}" for query in result.plan)
    evidence_block = "\n".join(evidence_lines) or "No evidence collected."
    confidence = confidence_label(result)

    return f"""# Aria Research Brief

## Research Question

{result.question}

## Verification Confidence

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


def build_pdf_report(result: ResearchResult) -> bytes:
    """
    Constructs a premium, formatted PDF document from a ResearchResult object.
    """
    buffer = BytesIO()
    # Margins: Left/Right 40pt, Top 50pt, Bottom 60pt
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=50,
        bottomMargin=60
    )

    styles = getSampleStyleSheet()

    # Modify standard styles to match our design system
    styles['Normal'].textColor = colors.HexColor("#334155")
    styles['Normal'].fontSize = 10
    styles['Normal'].leading = 14

    styles['BodyText'].textColor = colors.HexColor("#334155")
    styles['BodyText'].fontSize = 10
    styles['BodyText'].leading = 14

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.white,
        spaceAfter=2
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#94A3B8"),
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    metadata_label = ParagraphStyle(
        'MetaLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569")
    )

    metadata_val = ParagraphStyle(
        'MetaValue',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1E293B")
    )

    bullet_style = ParagraphStyle(
        'BulletList',
        parent=styles['Normal'],
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=4
    )

    story = []

    # 1. Main Header Title block (Deep Slate Hex #0F172A background)
    title_data = [
        [
            Paragraph("A R I A", title_style),
            Paragraph("RESEARCH BRIEF", ParagraphStyle(
                'BriefHeading',
                parent=styles['Normal'],
                fontName='Helvetica-Bold',
                fontSize=14,
                leading=18,
                textColor=colors.white,
                alignment=2  # Right aligned
            ))
        ],
        [
            Paragraph("Autonomous Research Intelligence Analyst", subtitle_style),
            Paragraph("Generated by ARIA Research Agent", ParagraphStyle(
                'BriefSubtitle',
                parent=styles['Normal'],
                fontName='Helvetica',
                fontSize=8,
                leading=10,
                textColor=colors.HexColor("#64748B"),
                alignment=2
            ))
        ]
    ]
    title_table = Table(title_data, colWidths=[300, 215])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#0F172A")),
        ('PADDING', (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(title_table)
    story.append(Spacer(1, 10))

    # 2. Metadata details
    confidence = confidence_label(result)
    date_str = datetime.now().strftime("%B %d, %Y")

    metadata_data = [
        [
            Paragraph("<b>Analyst:</b>", metadata_label),
            Paragraph("Swaraj Chattaraj", metadata_val),
            Paragraph("<b>Confidence Level:</b>", metadata_label),
            Paragraph(confidence, metadata_val),
        ],
        [
            Paragraph("<b>Date Generated:</b>", metadata_label),
            Paragraph(date_str, metadata_val),
            Paragraph("<b>Evidence Count:</b>", metadata_label),
            Paragraph(f"{len(result.evidence)} Sources Verified", metadata_val),
        ]
    ]
    metadata_table = Table(metadata_data, colWidths=[90, 160, 100, 165])
    metadata_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
        ('PADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(metadata_table)
    story.append(Spacer(1, 12))

    # 3. Question Block (Callout styling with left blue accent border)
    question_style = ParagraphStyle(
        'QuestionText',
        parent=styles['Normal'],
        fontName='Helvetica-BoldOblique',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#1E3A8A")
    )
    question_data = [
        [
            Paragraph("<b>RESEARCH OBJECTIVE:</b>", ParagraphStyle('QTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, textColor=colors.HexColor("#475569"))),
        ],
        [
            Paragraph(clean_markdown_text(result.question), question_style)
        ]
    ]
    question_table = Table(question_data, colWidths=[515])
    question_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ('BOX', (0, 0), (-1, -1), 1.0, colors.HexColor("#BFDBFE")),
        ('LINELEFT', (0, 0), (-1, -1), 3.0, colors.HexColor("#3B82F6")),
        ('PADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (0, 0), 8),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 10),
    ]))
    story.append(question_table)
    story.append(Spacer(1, 10))

    # Simple Divider line helper
    def add_divider():
        div = Table([[""]], colWidths=[515], rowHeights=[1])
        div.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, -1), 0.75, colors.HexColor("#E2E8F0")),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
        ]))
        return div

    # 4. Executive Summary
    story.append(Paragraph("Executive Brief", section_heading))
    story.append(add_divider())
    story.append(Spacer(1, 6))
    story.extend(text_to_flowables(result.answer, styles))
    story.append(Spacer(1, 10))

    # 5. Search Strategy
    story.append(Paragraph("Search Strategy", section_heading))
    story.append(add_divider())
    story.append(Spacer(1, 6))
    for query in result.plan:
        query_para = Paragraph(f"&bull; <i>{clean_markdown_text(query)}</i>", bullet_style)
        story.append(query_para)
    story.append(Spacer(1, 10))

    # 6. Verification
    if result.verification:
        story.append(Paragraph("Verification", section_heading))
        story.append(add_divider())
        story.append(Spacer(1, 6))
        story.extend(text_to_flowables(result.verification, styles))
        story.append(Spacer(1, 10))

    # 7. Evidence Register Table
    story.append(Paragraph("Evidence Register", section_heading))
    story.append(add_divider())
    story.append(Spacer(1, 8))

    if result.evidence:
        table_data = [[
            Paragraph("<b>#</b>", ParagraphStyle('TH_Num', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=colors.white)),
            Paragraph("<b>Source Title & Details</b>", ParagraphStyle('TH_Title', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=colors.white)),
            Paragraph("<b>Type</b>", ParagraphStyle('TH_Type', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, textColor=colors.white))
        ]]

        for idx, item in enumerate(result.evidence, start=1):
            if item.url:
                escaped_url = escape(item.url)
                link_str = f'<br/><font color="#3B82F6" size="8">URL: <a href="{escaped_url}">{escaped_url}</a></font>'
            else:
                link_str = ""
            title_text = f"<b>{clean_markdown_text(item.title)}</b>{link_str}"

            table_data.append([
                Paragraph(str(idx), ParagraphStyle('TD_Num', parent=styles['Normal'], fontSize=9)),
                Paragraph(title_text, ParagraphStyle('TD_Title', parent=styles['Normal'], fontSize=9, leading=12)),
                Paragraph(escape(item.source_type.upper()), ParagraphStyle('TD_Type', parent=styles['Normal'], fontSize=9))
            ])

        evidence_table = Table(table_data, colWidths=[25, 415, 75])

        t_style = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#0F172A")),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
        ]

        # Alternating row colors
        for r in range(1, len(table_data)):
            bg_color = colors.HexColor("#F8FAFC") if r % 2 == 1 else colors.white
            t_style.append(('BACKGROUND', (0, r), (-1, r), bg_color))

        evidence_table.setStyle(TableStyle(t_style))
        story.append(KeepTogether([evidence_table]))
    else:
        story.append(Paragraph("<i>No evidence registered.</i>", styles['BodyText']))

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


def markdown_to_pdf_bytes(markdown: str) -> bytes:
    """
    Parses a compiled markdown report back into structured components
    and delegates to the rich ReportLab PDF generator.
    """
    lines = markdown.splitlines()
    sections = {}
    current_section = None
    current_content = []

    for line in lines:
        if line.startswith("# "):
            if current_section:
                sections[current_section] = "\n".join(current_content).strip()
            current_section = "Title"
            current_content = []
        elif line.startswith("## "):
            if current_section:
                sections[current_section] = "\n".join(current_content).strip()
            current_section = line.lstrip("#").strip()
            current_content = []
        else:
            current_content.append(line)
    if current_section:
        sections[current_section] = "\n".join(current_content).strip()

    question = (
        sections.get("Engineering Design Query") or 
        sections.get("Research Question", "Unknown Research Objective")
    )

    # Parse search strategy queries
    plan_raw = (
        sections.get("Search & Engineering Strategy") or 
        sections.get("Search Strategy", "")
    )
    plan = []
    for line in plan_raw.splitlines():
        line = line.strip()
        if line.startswith("- "):
            plan.append(line[2:])
        elif line.startswith("* "):
            plan.append(line[2:])
        elif line:
            plan.append(line)

    answer = (
        sections.get("Synthesized Engineering Brief") or 
        sections.get("Executive Brief", "")
    )
    verification = (
        sections.get("Technical Verification & Safety Check") or 
        sections.get("Verification", "")
    )

    # Parse evidence register
    evidence_raw = sections.get("Evidence Register", "")
    evidence = []
    # Matching: "1. **title** (source_type) - url" or "1. **title** (source_type)"
    evidence_pattern = re.compile(r'^\d+\.\s+\*\*(.*?)\*\*\s+\((.*?)\)(?:\s+-\s+(http\S+))?$')
    
    for line in evidence_raw.splitlines():
        line = line.strip()
        if not line:
            continue
        match = evidence_pattern.match(line)
        if match:
            title, source_type, url = match.groups()
            evidence.append(Evidence(
                title=title,
                summary="",
                source_type=source_type,
                url=url
            ))
        else:
            clean_line = line.lstrip("0123456789. *-").strip()
            if clean_line:
                evidence.append(Evidence(
                    title=clean_line,
                    summary="",
                    source_type="web"
                ))

    result = ResearchResult(
        question=question,
        plan=plan,
        answer=answer,
        verification=verification,
        evidence=evidence
    )

    return build_pdf_report(result)
