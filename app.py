from __future__ import annotations

import os
import sys

# Force protobuf to use pure Python implementation to prevent descriptor errors on Streamlit Cloud
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

# Streamlit Cloud workaround for ChromaDB SQLite requirement
# Note: ChromaDB requires SQLite >= 3.35.0, but Streamlit Cloud runs on an older Debian base.
# Replacing sys.modules['sqlite3'] with pysqlite3-binary forces Chroma to run on the modern binary,
# preventing a crash on boot. Nasty runtime patch but it works.
try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import streamlit as st
print("--- DEPLOYMENT VERSION: 2026-05-22 ---")

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
from aria.core import Settings, MAX_PDF_PAGES, MAX_UPLOAD_MB, validate_pdf_upload
from aria.rag import VectorMemory
from aria.reports import build_markdown_report, markdown_to_pdf_bytes


load_dotenv()

st.set_page_config(
    page_title="ARIA Agent Console",
    page_icon="🤖",
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
        headers={"User-Agent": "Aria-Agent-Console/1.0"},
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


# Streamlit executes top-to-bottom on every user interaction. To show the agent's progress
# live (Planning -> Retrieval -> Synthesis -> Verification), I hook into the graph stream
# and output UI steps sequentially, otherwise the user is left looking at a frozen page.
def run_research_streamed(question: str, use_local: bool, use_web: bool, use_finance: bool, max_iterations: int) -> None:
    agent = get_agent()
    initial_state = {
        "question": question,
        "plan": [],
        "evidence": [],
        "answer": "",
        "verification": "No verification run.",
        "events": [],
        "iteration": 0,
        "use_web": use_web,
        "use_local": use_local,
        "use_finance": use_finance,
        "max_iterations": max_iterations
    }
    
    # Create empty placeholders for UI
    pipeline_placeholder = st.empty()
    console_placeholder = st.empty()
    
    def render_pipeline(active_step: str):
        steps = ["Planning", "Retrieval", "Synthesis", "Verification", "Complete"]
        step_status = {step: "pending" for step in steps}
        
        # Map node name to pipeline step name
        node_map = {
            "plan": "Planning",
            "search": "Retrieval",
            "draft": "Synthesis",
            "verify": "Verification",
        }
        
        current_step = node_map.get(active_step, active_step)
        
        # Determine status
        for s in steps:
            if s == current_step:
                step_status[s] = "active"
                break
            else:
                step_status[s] = "completed"
                
        if current_step == "Complete":
            for s in steps:
                step_status[s] = "completed"
        
        cols = pipeline_placeholder.columns(len(steps))
        for col, s in zip(cols, steps):
            status = step_status[s]
            if status == "completed":
                badge_style = "background-color: rgba(46, 204, 113, 0.15); border: 1px solid #2ecc71; color: #2ecc71; text-align: center; padding: 10px; border-radius: 8px;"
                icon = "✓"
            elif status == "active":
                badge_style = "background-color: rgba(0, 230, 255, 0.15); border: 1px solid #00e6ff; color: #00e6ff; text-align: center; padding: 10px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 230, 255, 0.3);"
                icon = "⚡"
            else:
                badge_style = "background-color: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); color: #64748b; text-align: center; padding: 10px; border-radius: 8px;"
                icon = "○"
            col.markdown(
                f"""
                <div style="{badge_style}">
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 2px;">{icon}</div>
                    <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Outfit', sans-serif;">{s}</div>
                </div>
                """,
                unsafe_allow_html=True
            )
            
    # Initial status
    render_pipeline("plan")
    
    events_list = ["Initializing ARIA Agent Console..."]
    
    def update_console(new_event: str = None):
        if new_event:
            events_list.append(new_event)
        log_content = "\n".join(f"[ARIA] > {event}" for event in events_list)
        console_placeholder.markdown(
            f"""
            <div class="console-log-window">
                <pre><code>{escape(log_content)}</code></pre>
            </div>
            """,
            unsafe_allow_html=True
        )

    update_console()
    
    # Run the graph streaming events
    final_state = initial_state
    for output in agent.graph.stream(initial_state):
        for node_name, state_update in output.items():
            final_state = {**final_state, **state_update}
            
            # Map node to timeline status
            render_pipeline(node_name)
            
            # Print execution events to our terminal log
            if "events" in state_update:
                for ev in state_update["events"]:
                    update_console(ev)
                    
    # Finished
    render_pipeline("Complete")
    update_console("Design Brief synthesis completed. Evidence registry compiled.")
    
    from aria.agent import dedupe_evidence
    from aria.core import ResearchResult
    
    result = ResearchResult(
        question=final_state["question"],
        plan=final_state["plan"],
        answer=final_state["answer"],
        verification=final_state["verification"],
        evidence=dedupe_evidence(final_state["evidence"]),
        events=final_state["events"]
    )
    st.session_state["aria_result"] = result
    st.session_state["aria_report"] = build_markdown_report(result)
    st.session_state["last_question"] = question
    st.rerun()



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
            file_name="aria_research_brief.md",
            mime="text/markdown",
            use_container_width=True,
        )
        d2.download_button(
            "Download PDF",
            data=markdown_to_pdf_bytes(report),
            file_name="aria_research_brief.pdf",
            mime="application/pdf",
            use_container_width=True,
        )

        with st.expander("Verification"):
            st.write(result.verification)
        with st.expander("Execution Trace"):
            log_lines = "\n".join(f"[ARIA] > {event}" for event in result.events)
            st.markdown(
                f"""
                <div class="console-log-window" style="height: 300px;">
                    <pre><code>{escape(log_lines)}</code></pre>
                </div>
                """,
                unsafe_allow_html=True
            )


    with evidence_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Evidence Register")
        
        # Advanced Filtering & Sorting UI
        source_options = ["all"] + sorted({item.source_type for item in result.evidence})
        
        c1, c2 = st.columns(2)
        selected_source = c1.selectbox("Source Type", source_options, key="ev_source")
        sort_by = c2.selectbox("Sort Order", ["Retrieval Order", "Relevance Score"], key="ev_sort")
        
        c3, c4 = st.columns([1.2, 0.8])
        keyword_filter = c3.text_input("Keyword Search", placeholder="Filter by keyword...", key="ev_keyword")
        score_threshold = c4.slider("Min Relevance", min_value=0.0, max_value=1.0, value=0.0, step=0.05, key="ev_score_slider")
        
        st.markdown("</div>", unsafe_allow_html=True)

        # Filter and sort logic
        filtered_evidence = []
        for item in result.evidence:
            if selected_source != "all" and item.source_type != selected_source:
                continue
            if keyword_filter and (keyword_filter.lower() not in item.title.lower() and keyword_filter.lower() not in item.summary.lower()):
                continue
            if getattr(item, "score", 0.75) < score_threshold:
                continue
            filtered_evidence.append(item)
            
        if sort_by == "Relevance Score":
            # Sort descending by score
            filtered_evidence.sort(key=lambda x: getattr(x, "score", 0.75), reverse=True)

        for item in filtered_evidence:
            title = escape(item.title)
            source_type = escape(item.source_type)
            summary = escape(item.summary[:520] + ("..." if len(item.summary) > 520 else ""))
            link = (
                f'<a href="{escape(item.url, quote=True)}" target="_blank" rel="noopener noreferrer">Open source</a>'
                if item.url
                else ""
            )
            item_score = getattr(item, "score", 0.75)
            score_badge = f'<span style="background: rgba(56, 239, 125, 0.15); border: 1px solid #38ef7d; color: #38ef7d; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 800; margin-left: 8px;">SCORE {item_score:.2f}</span>'
            st.markdown(
                f"""
                <div class="source-card">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <small>{source_type}</small>
                        {score_badge}
                    </div>
                    <h4>{title}</h4>
                    <p>{summary}</p>
                    {link}
                </div>
                """,
                unsafe_allow_html=True,
            )


with open("style.css", "r", encoding="utf-8") as f:
    st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)


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
        
        search_base = st.selectbox(
            "Search Base / Source",
            options=["Hybrid (Local + Web)", "Local Knowledge Base Only", "Web Search Only"],
            index=0,
            help="Select where the agent should look for evidence to answer your query."
        )
        
        use_local = "Local" in search_base or "Hybrid" in search_base
        use_web = "Web" in search_base or "Hybrid" in search_base
        
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
            run_research_streamed(question.strip(), use_local, use_web, use_finance, max_iterations)


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
