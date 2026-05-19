from __future__ import annotations

# Streamlit Cloud workaround for ChromaDB SQLite requirement
try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import streamlit as st
print("--- DEPLOYMENT VERSION: 2026-05-20-V2 ---")

from collections import Counter
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse

import requests
import streamlit as st
from dotenv import load_dotenv
import os

from aria.agent import ResearchAgent
from aria.config import Settings
from aria.rag import VectorMemory
from aria.reports import build_markdown_report, markdown_to_pdf_bytes
from aria.security import MAX_PDF_PAGES, MAX_UPLOAD_MB, validate_pdf_upload


load_dotenv()

st.set_page_config(
    page_title="ARIA Agent Console",
    page_icon="A",
    layout="wide",
    initial_sidebar_state="expanded",
)


SECRET_ENV_KEYS = (
    "ARIA_LLM_PROVIDER",
    "ARIA_MODEL",
    "ARIA_COLLECTION",
    "ARIA_MEMORY_PATH",
    "OPENROUTER_API_KEY",
)


def load_streamlit_secrets() -> None:
    """Expose Streamlit Cloud secrets through the existing environment config path."""
    for key in SECRET_ENV_KEYS:
        try:
            value = st.secrets.get(key)
        except (FileNotFoundError, KeyError, AttributeError):
            return
        if value:
            os.environ[key] = str(value)


load_streamlit_secrets()


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._hidden_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self._hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._hidden_depth:
            text = " ".join(data.split())
            if text:
                self.parts.append(text)

    def text(self) -> str:
        return " ".join(self.parts)


@st.cache_resource
def get_memory() -> VectorMemory:
    return VectorMemory(Settings.from_env())


@st.cache_resource
def get_agent() -> ResearchAgent:
    settings = Settings.from_env()
    return ResearchAgent(settings=settings, memory=get_memory())


def refresh_agent() -> None:
    get_agent.clear()


def ingest_uploads(files) -> list[str]:
    memory = get_memory()
    ingested: list[str] = []
    for uploaded_file in files:
        validate_pdf_upload(uploaded_file.name, uploaded_file.size)
        with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(uploaded_file.getbuffer())
            tmp_path = Path(tmp.name)
        try:
            count = memory.ingest_pdf(tmp_path, source_name=uploaded_file.name)
            ingested.append(f"{uploaded_file.name}: {count} chunks")
        finally:
            tmp_path.unlink(missing_ok=True)
    refresh_agent()
    return ingested


def fetch_url_text(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Enter a valid http or https URL.")

    response = requests.get(
        url,
        headers={"User-Agent": "ARIA-Agent-Console/1.0"},
        timeout=20,
    )
    response.raise_for_status()

    content_type = response.headers.get("content-type", "")
    if "text/html" in content_type:
        parser = TextExtractor()
        parser.feed(response.text)
        text = parser.text()
    else:
        text = response.text

    text = " ".join(text.split())
    if len(text) < 200:
        raise ValueError("The URL did not return enough readable text to index.")
    return parsed.netloc, text[:80_000]


def run_research(question: str, use_web: bool, use_finance: bool, max_iterations: int) -> None:
    result = get_agent().run(
        question=question,
        use_web=use_web,
        use_finance=use_finance,
        max_iterations=max_iterations,
    )
    st.session_state["aria_result"] = result
    st.session_state["aria_report"] = build_markdown_report(result)
    st.session_state["last_question"] = question


def source_counts() -> Counter:
    result = st.session_state.get("aria_result")
    if not result:
        return Counter()
    return Counter(item.source_type for item in result.evidence)


def has_openrouter_key() -> bool:
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    return bool(key and not key.startswith("your_"))


def metric_card(label: str, value: str, note: str = "") -> None:
    st.markdown(
        f"""
        <div class="metric-card">
            <span>{escape(label)}</span>
            <strong>{escape(value)}</strong>
            <small>{escape(note)}</small>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_results(result, report: str) -> None:
    report_col, evidence_col = st.columns([1.35, 1], gap="large")

    with report_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Executive Brief")
        st.markdown(result.answer)
        st.markdown("</div>", unsafe_allow_html=True)

        d1, d2 = st.columns(2)
        d1.download_button(
            "Download Markdown",
            data=report,
            file_name="aria_report.md",
            mime="text/markdown",
            use_container_width=True,
        )
        d2.download_button(
            "Download PDF",
            data=markdown_to_pdf_bytes(report),
            file_name="aria_report.pdf",
            mime="application/pdf",
            use_container_width=True,
        )

        with st.expander("Verification"):
            st.write(result.verification)
        with st.expander("Execution Trace"):
            for event in result.events:
                st.write(event)

    with evidence_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Evidence Register")
        source_options = ["all"] + sorted({item.source_type for item in result.evidence})
        selected_source = st.selectbox("Filter", source_options)
        st.markdown("</div>", unsafe_allow_html=True)

        for item in result.evidence:
            if selected_source != "all" and item.source_type != selected_source:
                continue
            title = escape(item.title)
            source_type = escape(item.source_type)
            summary = escape(item.summary[:520] + ("..." if len(item.summary) > 520 else ""))
            link = (
                f'<a href="{escape(item.url, quote=True)}" target="_blank" rel="noopener noreferrer">Open source</a>'
                if item.url
                else ""
            )
            st.markdown(
                f"""
                <div class="source-card">
                    <small>{source_type}</small>
                    <h4>{title}</h4>
                    <p>{summary}</p>
                    {link}
                </div>
                """,
                unsafe_allow_html=True,
            )


st.markdown(
    """
    <style>
    .stApp {
        background:
            linear-gradient(180deg, rgba(5,12,26,0.96), rgba(9,16,32,0.98)),
            radial-gradient(circle at 20% 0%, rgba(31, 185, 255, 0.14), transparent 32%),
            radial-gradient(circle at 90% 18%, rgba(70, 255, 189, 0.09), transparent 28%);
        color: #d7e3f4;
    }
    .block-container { max-width: 1240px; padding-top: 1.4rem; padding-bottom: 3rem; }
    [data-testid="stSidebar"] {
        background: #07101f;
        border-right: 1px solid rgba(120, 159, 205, 0.22);
    }
    [data-testid="stSidebar"] * { color: #d7e3f4; }
    h1, h2, h3 { color: #f4f8ff; letter-spacing: 0; }
    p, label, .stMarkdown, .stText { color: #c6d3e5; }
    .agent-shell {
        border: 1px solid rgba(99, 179, 237, 0.28);
        background: linear-gradient(135deg, rgba(12, 23, 42, 0.96), rgba(8, 15, 29, 0.96));
        border-radius: 8px;
        padding: 22px 24px;
        margin-bottom: 18px;
        box-shadow: 0 18px 50px rgba(0,0,0,0.28);
    }
    .agent-kicker {
        color: #58d6ff;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .16em;
        text-transform: uppercase;
        margin-bottom: 8px;
    }
    .agent-title {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
    }
    .agent-title h1 { margin: 0; font-size: 42px; line-height: 1; }
    .agent-title p { max-width: 760px; margin: 12px 0 0; color: #9fb0c7; }
    .status-pill {
        border: 1px solid rgba(88, 214, 255, 0.35);
        background: rgba(88, 214, 255, 0.08);
        color: #8ce6ff;
        border-radius: 999px;
        padding: 7px 11px;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
    }
    .metric-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin: 14px 0 20px;
    }
    .metric-card {
        border: 1px solid rgba(120, 159, 205, 0.22);
        background: rgba(9, 19, 36, 0.78);
        border-radius: 8px;
        padding: 14px 16px;
        min-height: 92px;
    }
    .metric-card span {
        color: #8da4c0;
        font-size: 12px;
        text-transform: uppercase;
        font-weight: 800;
        letter-spacing: .08em;
    }
    .metric-card strong {
        display: block;
        color: #f4f8ff;
        font-size: 28px;
        margin-top: 4px;
        line-height: 1.1;
    }
    .metric-card small { color: #7f91aa; }
    .console-card {
        border: 1px solid rgba(120, 159, 205, 0.22);
        background: rgba(6, 13, 25, 0.72);
        border-radius: 8px;
        padding: 18px;
        margin-bottom: 16px;
    }
    .source-card {
        border: 1px solid rgba(120, 159, 205, 0.22);
        background: rgba(7, 15, 30, 0.82);
        border-radius: 8px;
        padding: 15px 16px;
        margin-bottom: 10px;
    }
    .source-card small {
        color: #58d6ff;
        text-transform: uppercase;
        font-weight: 800;
        letter-spacing: .08em;
    }
    .source-card h4 { color: #f4f8ff; margin: 6px 0; }
    .source-card p { color: #aebdd1; margin-bottom: 8px; }
    .source-card a { color: #7ee7c5; font-weight: 700; text-decoration: none; }
    .stButton > button, .stDownloadButton > button {
        border-radius: 8px !important;
        border: 1px solid rgba(88, 214, 255, 0.26) !important;
        font-weight: 800 !important;
    }
    .stTextArea textarea, .stTextInput input {
        background: #07101f !important;
        color: #f4f8ff !important;
        border: 1px solid rgba(120, 159, 205, 0.28) !important;
        border-radius: 8px !important;
    }
    div[data-testid="stExpander"] {
        border-color: rgba(120, 159, 205, 0.22) !important;
        background: rgba(7, 15, 30, 0.45) !important;
    }
    @media (max-width: 900px) {
        .agent-title { display: block; }
        .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .agent-title h1 { font-size: 34px; }
    }
    </style>
    """,
    unsafe_allow_html=True,
)


if "view" not in st.session_state:
    st.session_state["view"] = "Mission"

memory = get_memory()
settings = Settings.from_env()
counts = source_counts()

with st.sidebar:
    st.title("ARIA")
    st.caption("Agentic research console")
    view = st.radio(
        "Navigation",
        ["Mission", "Knowledge Base", "Results"],
        key="view",
        label_visibility="collapsed",
    )
    st.divider()
    st.metric("Indexed chunks", memory.count())
    st.caption(f"Provider: {settings.llm_provider}")
    st.caption(f"Model: {settings.model}")
    if settings.llm_provider == "openrouter" and has_openrouter_key():
        st.success("OpenRouter ready")
    elif settings.llm_provider == "openrouter":
        st.warning("OpenRouter not configured")
    else:
        st.info("Using local fallback synthesis")
    st.divider()
    if st.button("Clear vector memory", use_container_width=True):
        memory.reset()
        refresh_agent()
        st.session_state.pop("aria_result", None)
        st.session_state.pop("aria_report", None)
        st.success("Memory cleared.")
        st.rerun()

st.markdown(
    """
    <section class="agent-shell">
        <div class="agent-title">
            <div>
                <div class="agent-kicker">Autonomous Research Intelligence Analyst</div>
                <h1>ARIA Agent Console</h1>
                <p>Plan, retrieve, synthesize, verify, and export research briefs from live web sources and your local knowledge base.</p>
            </div>
            <div class="status-pill">System Online</div>
        </div>
    </section>
    """,
    unsafe_allow_html=True,
)

st.markdown('<div class="metric-grid">', unsafe_allow_html=True)
m1, m2, m3, m4 = st.columns(4)
with m1:
    metric_card("Memory", str(memory.count()), "chunks indexed")
with m2:
    metric_card("Evidence", str(sum(counts.values())), "items in last run")
with m3:
    metric_card("Source Mix", str(len(counts)), "types collected")
with m4:
    metric_card("Verifier", "Active", "self-check loop")
st.markdown("</div>", unsafe_allow_html=True)


if view == "Mission":
    input_col, ops_col = st.columns([1.75, 1], gap="large")

    with input_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Mission Brief")
        question = st.text_area(
            "Research objective",
            value=st.session_state.get("question", ""),
            placeholder="Ask a precise research question. Example: Compare current AI chip supply chain risks for NVIDIA, AMD, and Intel.",
            height=190,
        )
        preset_cols = st.columns(3)
        presets = [
            "Summarize my indexed documents into an executive brief.",
            "Compare NVIDIA and AMD market risks using current evidence.",
            "Research recent policy signals for AI regulation in the United States.",
        ]
        for col, preset in zip(preset_cols, presets):
            if col.button(preset, use_container_width=True):
                st.session_state["question"] = preset
                st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

    with ops_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Agent Controls")
        use_web = st.toggle("Live web retrieval", value=True)
        use_finance = st.toggle("Market data snapshots", value=False)
        max_iterations = st.slider("Verification passes", min_value=1, max_value=3, value=2)
        run = st.button("Execute mission", type="primary", use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Pipeline")
        st.write("1. Build search plan")
        st.write("2. Retrieve memory and web evidence")
        st.write("3. Draft grounded brief")
        st.write("4. Verify against evidence")
        st.markdown("</div>", unsafe_allow_html=True)

    if run:
        if not question.strip():
            st.warning("Enter a research objective first.")
        else:
            st.session_state["question"] = question.strip()
            with st.status("Agent running", expanded=True) as status:
                st.write("Planning research strategy")
                st.write("Querying vector memory")
                if use_web:
                    st.write("Calling public research endpoints")
                if use_finance:
                    st.write("Checking market snapshots")
                st.write("Synthesizing and verifying report")
                run_research(question.strip(), use_web, use_finance, max_iterations)
                status.update(label="Mission complete", state="complete")

    result = st.session_state.get("aria_result")
    report = st.session_state.get("aria_report")
    if result and report:
        st.divider()
        render_results(result, report)

elif view == "Knowledge Base":
    upload_col, url_col, note_col = st.columns(3, gap="large")

    with upload_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("PDF Ingestion")
        uploaded_files = st.file_uploader(
            "Upload PDFs",
            type=["pdf"],
            accept_multiple_files=True,
            help=f"Maximum {MAX_UPLOAD_MB} MB per PDF and {MAX_PDF_PAGES} pages.",
        )
        if st.button("Index PDFs", type="primary", use_container_width=True):
            if not uploaded_files:
                st.warning("Attach at least one PDF.")
            else:
                try:
                    indexed = ingest_uploads(uploaded_files)
                    st.success("Indexed " + ", ".join(indexed))
                    st.rerun()
                except ValueError as exc:
                    st.error(str(exc))
        st.markdown("</div>", unsafe_allow_html=True)

    with url_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("URL Ingestion")
        url = st.text_input("Source URL", placeholder="https://example.com/report")
        if st.button("Fetch and index URL", use_container_width=True):
            if not url.strip():
                st.warning("Enter a URL.")
            else:
                try:
                    source_name, text = fetch_url_text(url.strip())
                    count = memory.ingest_text(text, source_name=source_name, source_type="web")
                    refresh_agent()
                    st.success(f"Indexed {source_name}: {count} chunks")
                    st.rerun()
                except (ValueError, requests.RequestException) as exc:
                    st.error(f"Could not index URL: {exc}")
        st.markdown("</div>", unsafe_allow_html=True)

    with note_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Paste Intelligence")
        note_name = st.text_input("Source name", value="Manual note")
        note_text = st.text_area("Text to index", height=180)
        if st.button("Index pasted text", use_container_width=True):
            count = memory.ingest_text(note_text, source_name=note_name.strip() or "Manual note", source_type="note")
            refresh_agent()
            if count:
                st.success(f"Indexed {count} chunks.")
                st.rerun()
            else:
                st.warning("Paste more text before indexing.")
        st.markdown("</div>", unsafe_allow_html=True)

elif view == "Results":
    result = st.session_state.get("aria_result")
    report = st.session_state.get("aria_report")

    if not result or not report:
        st.info("No mission report yet. Run a mission from the Mission screen.")
    else:
        render_results(result, report)
