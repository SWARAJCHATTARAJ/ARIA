from __future__ import annotations

import os
import sys
import time

os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

import streamlit as st

from collections import Counter
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

from aria.agent import ResearchAgent
from aria.core import Settings, MAX_PDF_PAGES, MAX_UPLOAD_MB, validate_pdf_upload
from aria.rag import VectorMemory
from aria.reports import build_markdown_report, build_pdf_report, linkify_citations_markdown
from aria.sessions import list_sessions, load_session, save_session
from aria.visualizations import generate_network_svg, generate_source_mix_svg, generate_relevance_dist_svg


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


def estimate_tokens(text: str) -> int:
    return max(1, round(len(text.split()) * 1.33)) if text else 0


def result_metrics(result) -> dict[str, int | float | str]:
    return {
        "evidence_items": len(result.evidence),
        "answer_tokens_est": estimate_tokens(result.answer),
        "verification_tokens_est": estimate_tokens(result.verification),
        "total_output_tokens_est": estimate_tokens(result.answer) + estimate_tokens(result.verification),
    }


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
    response.encoding = response.apparent_encoding

    content_type = response.headers.get("content-type", "")
    if "text/html" in content_type:
        parser = TextExtractor()
        try:
            parser.feed(response.text)
            text = parser.text()
        except Exception:
            text = response.text
    else:
        text = response.text

    text = " ".join(text.split())
    if len(text) < 200:
        raise ValueError("The URL did not return enough readable text to index.")
    return parsed.netloc, text[:80_000]


def run_research_streamed(question: str, use_local: bool, use_web: bool, use_finance: bool, max_iterations: int, custom_plan: list[str] = None) -> None:
    agent = get_agent()
    initial_state = {
        "question": question,
        "plan": custom_plan if custom_plan else [],
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
    
    pipeline_placeholder = st.empty()
    console_placeholder = st.empty()
    
    def render_pipeline(active_step: str):
        steps = ["Planning", "Retrieval", "Synthesis", "Verification", "Complete"]
        step_status = {step: "pending" for step in steps}
        
        node_map = {
            "plan": "Planning",
            "search": "Retrieval",
            "draft": "Synthesis",
            "verify": "Verification",
        }
        
        current_step = node_map.get(active_step, active_step)
        
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
            
    render_pipeline("plan")
    
    events_list = ["Initializing ARIA Workspace..."]
    
    def update_console(new_event: str = None):
        if new_event:
            events_list.append(new_event)
            
        formatted_lines = []
        for event in events_list:
            ev_lower = event.lower()
            style = "color: #cbd5e1;" # default light grey
            
            if "planner:" in ev_lower or "plan" in ev_lower:
                style = "color: #00e6ff; font-weight: bold;" # Cyan
            elif "retriever:" in ev_lower or "searching" in ev_lower or "retrieving" in ev_lower:
                style = "color: #f59e0b;" # Amber/orange search
            elif "synthesis:" in ev_lower or "draft" in ev_lower or "completed" in ev_lower:
                style = "color: #2ecc71; font-weight: bold;" # Green
            elif "auditor:" in ev_lower or "verified" in ev_lower:
                style = "color: #ec4899;" # Magenta for verification
            elif "failed" in ev_lower or "error" in ev_lower or "unavailable" in ev_lower:
                style = "color: #ef4444; font-weight: bold;" # Red
                
            formatted_lines.append(f'<span style="{style}">[ARIA] &gt; {escape(event)}</span>')
            
        formatted_lines.append('<span class="console-cursor">_</span>')
        log_content = "<br/>".join(formatted_lines)
        
        console_placeholder.markdown(
            f"""
            <div class="console-log-window">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(88,214,255,0.15); padding-bottom: 6px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="pulse-dot"></span>
                        <span style="font-family: \'Outfit\', sans-serif; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #00e6ff;">RESEARCH ACTIVITY LOG</span>
                    </div>
                    <span style="font-family: \'JetBrains Mono\', monospace; font-size: 9px; color: #64748b;">LOG EVENTS: {len(events_list)}</span>
                </div>
                <pre style="margin: 0; white-space: pre-wrap; font-family: \'JetBrains Mono\', monospace;"><code style="color: inherit;">{log_content}</code></pre>
            </div>
            """,
            unsafe_allow_html=True
        )

    update_console()
    
    final_state = initial_state
    node_started_at = time.perf_counter()
    for output in agent.graph.stream(initial_state):
        for node_name, state_update in output.items():
            elapsed = time.perf_counter() - node_started_at
            final_state = {**final_state, **state_update}
            
            render_pipeline(node_name)
            
            if "events" in state_update:
                for ev in state_update["events"]:
                    update_console(ev)
            update_console(f"Timeline: {node_name} completed in {elapsed:.2f}s")
            final_state["events"] = final_state.get("events", []) + [f"Timeline: {node_name} completed in {elapsed:.2f}s"]
            node_started_at = time.perf_counter()
                    
    render_pipeline("Complete")
    update_console("Research brief synthesis completed. Evidence registry compiled.")
    
    from aria.agent import dedupe_evidence
    from aria.core import ResearchResult
    
    result = ResearchResult(
        question=final_state["question"],
        plan=final_state["plan"],
        answer=final_state["answer"],
        verification=final_state["verification"],
        evidence=dedupe_evidence(final_state["evidence"]),
        events=final_state["events"],
    )
    result.metrics = result_metrics(result)
    st.session_state["aria_result"] = result
    st.session_state["aria_report"] = build_markdown_report(result)
    st.session_state["last_question"] = question
    session = save_session(result)
    st.session_state["current_session_id"] = session["id"]
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
        brief_tab, graph_tab, metrics_tab = st.tabs([
            "📝 Executive Brief", 
            "🕸️ Evidence Network Graph", 
            "📊 Source & Quality Analytics"
        ])
        
        with brief_tab:
            st.markdown('<div class="console-card">', unsafe_allow_html=True)
            st.subheader("Executive Brief")
            st.markdown(linkify_citations_markdown(result.answer, result.evidence))
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
                data=build_pdf_report(result),
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
                
        with graph_tab:
            st.markdown('<div class="console-card">', unsafe_allow_html=True)
            st.subheader("Evidence Network Graph")
            st.markdown("<p style='font-size:12px; color:#94a3b8; margin-bottom:15px;'>Hover over the node endpoints to view source document details (provenance, title, relevance score, and summary snippets).</p>", unsafe_allow_html=True)
            svg_graph = generate_network_svg(result)
            st.markdown(svg_graph, unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
            
        with metrics_tab:
            st.markdown('<div class="console-card">', unsafe_allow_html=True)
            st.subheader("Research Source & Quality Analytics")
            
            mc1, mc2 = st.columns(2)
            with mc1:
                st.markdown("<h5 style='text-align: center; margin-bottom: 15px; font-family: \"Outfit\", sans-serif;'>Source Material Distribution</h5>", unsafe_allow_html=True)
                st.markdown(generate_source_mix_svg(result), unsafe_allow_html=True)
                
            with mc2:
                st.markdown("<h5 style='text-align: center; margin-bottom: 15px; font-family: \"Outfit\", sans-serif;'>Relevance Score Grading</h5>", unsafe_allow_html=True)
                st.markdown(generate_relevance_dist_svg(result), unsafe_allow_html=True)
                
            st.markdown('</div>', unsafe_allow_html=True)
            
            with st.expander("Run Metrics Details", expanded=True):
                metrics = result.metrics or result_metrics(result)
                c1, c2, c3 = st.columns(3)
                c1.metric("Evidence Items", metrics.get("evidence_items", len(result.evidence)))
                c2.metric("Answer Tokens", metrics.get("answer_tokens_est", 0))
                c3.metric("Output Tokens", metrics.get("total_output_tokens_est", 0))


    with evidence_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Evidence Register")
        
        source_options = ["all"] + sorted({item.source_type for item in result.evidence})
        
        c1, c2 = st.columns(2)
        selected_source = c1.selectbox("Source Type", source_options, key="ev_source")
        sort_by = c2.selectbox("Sort Order", ["Retrieval Order", "Relevance Score"], key="ev_sort")
        
        c3, c4 = st.columns([1.2, 0.8])
        keyword_filter = c3.text_input("Keyword Search", placeholder="Filter by keyword...", key="ev_keyword")
        score_threshold = c4.slider("Min Relevance", min_value=0.0, max_value=1.0, value=0.0, step=0.05, key="ev_score_slider")
        
        st.markdown("</div>", unsafe_allow_html=True)

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
            source_id = escape(item.source_id or "local")
            retrieved_via = escape(item.retrieved_via or item.source_type)
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
                    <small>Provenance: {retrieved_via} - {source_id}</small><br/>
                    {link}
                </div>
                """,
                unsafe_allow_html=True,
            )


with open("assets/style.css", "r", encoding="utf-8") as f:
    st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)


if "view" not in st.session_state:
    st.session_state["view"] = "React Console (New)"

memory = get_memory()
settings = Settings.from_env()
counts = source_counts()

with st.sidebar:
    st.title("ARIA")
    st.caption("Agentic research console")
    view = st.radio(
        "Navigation",
        ["React Console (New)", "Research", "Knowledge Base", "Results", "History"],
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
    st.divider()
    st.caption("Saved research sessions")
    saved_sessions = list_sessions(limit=8)
    if saved_sessions:
        labels = {
            f"{item['created_at'][:10]} - {item['title'][:42]}": item["path"]
            for item in saved_sessions
        }
        selected_session = st.selectbox("Load session", [""] + list(labels), label_visibility="collapsed")
        if selected_session and st.button("Resume selected session", use_container_width=True):
            loaded = load_session(labels[selected_session])
            st.session_state["aria_result"] = loaded
            st.session_state["aria_report"] = build_markdown_report(loaded)
            st.session_state["question"] = loaded.question
            st.session_state["view"] = "Results"
            st.rerun()
    else:
        st.caption("No saved sessions yet.")

if view != "React Console (New)":
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


def check_port(host: str, port: int) -> bool:
    import socket
    try:
        with socket.create_connection((host, port), timeout=0.15):
            return True
    except (OSError, ConnectionRefusedError):
        return False


if view == "React Console (New)":
    st.markdown(
        """
        <style>
        /* Modern glassmorphism panels & full viewport scaling for the iframe */
        [data-testid="stAppViewBlockContainer"] {
            max-width: 100% !important;
            padding-left: 1.5rem !important;
            padding-right: 1.5rem !important;
            padding-top: 1rem !important;
            padding-bottom: 1rem !important;
        }
        .status-card {
            background: rgba(10, 25, 47, 0.5);
            border: 1px solid rgba(88, 214, 255, 0.15);
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 20px;
            backdrop-filter: blur(8px);
        }
        .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .status-online {
            background: rgba(0, 230, 255, 0.1);
            color: #00e6ff;
            border: 1px solid rgba(0, 230, 255, 0.3);
            box-shadow: 0 0 8px rgba(0, 230, 255, 0.2);
        }
        .status-offline {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .pulsing-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            margin-right: 6px;
            display: inline-block;
        }
        .pulsing-dot-online {
            background-color: #00e6ff;
            box-shadow: 0 0 6px #00e6ff;
            animation: pulse-badge-dot 2s infinite;
        }
        .pulsing-dot-offline {
            background-color: #ef4444;
        }
        @keyframes pulse-badge-dot {
            0% { transform: scale(0.9); opacity: 0.6; }
            50% { transform: scale(1.1); opacity: 1; }
            100% { transform: scale(0.9); opacity: 0.6; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )

    # Check server statuses
    vite_online = check_port("127.0.0.1", 5173) or check_port("localhost", 5173)
    fastapi_online = check_port("127.0.0.1", 8000) or check_port("localhost", 8000)

    # Header section with server statuses
    st.markdown('<div class="agent-shell" style="padding: 16px 20px; margin-bottom: 16px;">', unsafe_allow_html=True)
    header_col, action_col = st.columns([3, 1], vertical_alignment="center")
    
    with header_col:
        st.markdown(
            """
            <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <h2 style="margin: 0; font-size: 26px;">ARIA React Console</h2>
                <div style="display: flex; gap: 8px;">
            """,
            unsafe_allow_html=True
        )
        
        # Vite Badge
        if vite_online:
            st.markdown('<span class="status-badge status-online"><span class="pulsing-dot pulsing-dot-online"></span>Vite Dev Server (5173)</span>', unsafe_allow_html=True)
        else:
            st.markdown('<span class="status-badge status-offline"><span class="pulsing-dot pulsing-dot-offline"></span>Vite Server Offline</span>', unsafe_allow_html=True)
            
        # FastAPI Badge
        if fastapi_online:
            st.markdown('<span class="status-badge status-online"><span class="pulsing-dot pulsing-dot-online"></span>FastAPI Backend (8000)</span>', unsafe_allow_html=True)
        else:
            st.markdown('<span class="status-badge status-offline"><span class="pulsing-dot pulsing-dot-offline"></span>FastAPI Offline</span>', unsafe_allow_html=True)
            
        st.markdown(
            """
                </div>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">
                Real-time hot-reloaded react environment integrated directly inside your research console.
            </p>
            """,
            unsafe_allow_html=True
        )
        
    with action_col:
        # Default selection logic: if Vite is online, use it; otherwise FastAPI
        default_mode_index = 0 if vite_online else 1
        
        server_mode = st.radio(
            "Target Endpoint:",
            ["Vite Dev Server (5173)", "Production API (8000)"],
            index=default_mode_index,
            horizontal=True,
            label_visibility="collapsed"
        )
        
        url = "http://localhost:5173" if "5173" in server_mode else "http://localhost:8000"
        
    st.markdown('</div>', unsafe_allow_html=True)

    # Handle service state warnings and setup guide
    if not fastapi_online or (not vite_online and "5173" in server_mode):
        st.markdown('<div class="status-card">', unsafe_allow_html=True)
        
        if not fastapi_online:
            st.markdown(
                """
                <h4 style="color: #ef4444; margin-top: 0; display: flex; align-items: center; gap: 8px;">
                    ⚠️ FastAPI Backend is Offline (Port 8000)
                </h4>
                <p style="font-size: 14px; margin-bottom: 12px; color: #cbd5e1;">
                    The React Console requires the FastAPI backend to function. Please start the backend first:
                </p>
                <pre style="background: #020714; padding: 10px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2); color: #e2e8f0; font-family: monospace;">python main.py</pre>
                """,
                unsafe_allow_html=True
            )
            
        if not vite_online and "5173" in server_mode:
            st.markdown(
                """
                <h4 style="color: #ef4444; margin-top: 15px; display: flex; align-items: center; gap: 8px;">
                    ⚠️ Vite Dev Server is Offline (Port 5173)
                </h4>
                <p style="font-size: 14px; margin-bottom: 12px; color: #cbd5e1;">
                    You are trying to view the live reload server but it is not running. Start the dev server in the <code>frontend</code> folder:
                </p>
                <pre style="background: #020714; padding: 10px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2); color: #e2e8f0; font-family: monospace;">cd frontend\nnpm run dev</pre>
                <p style="font-size: 13px; color: #94a3b8; margin-top: 8px;">
                    Alternatively, select the <b>Production API (8000)</b> option above to view the compiled static build.
                </p>
                """,
                unsafe_allow_html=True
            )
        st.markdown('</div>', unsafe_allow_html=True)

    # Render the iframe if the server is responsive or user wants to attempt load
    iframe_col, control_col = st.columns([15, 1])
    with control_col:
        # A tiny utility to open in a new tab if they need
        st.markdown(
            f'<a href="{url}" target="_blank" style="text-decoration: none;">'
            f'<button style="width: 100%; height: 42px; border-radius: 8px; border: 1px solid rgba(88, 214, 255, 0.25); '
            f'background: rgba(10, 25, 47, 0.6); color: #00e6ff; cursor: pointer; display: flex; justify-content: center; '
            f'align-items: center;" title="Open in New Tab">↗</button></a>',
            unsafe_allow_html=True
        )

    # Render iframe stretching to cover height nicely
    st.components.v1.iframe(url, height=920, scrolling=True)

elif view == "Research":
    input_col, ops_col = st.columns([1.75, 1], gap="large")

    with input_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Research Objective")
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
                st.session_state["blueprint_queries"] = [] # Reset queries on preset change
                st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Research Plan Customizer")
        current_question = question.strip()
        
        # Reset queries if the question changes
        if "last_bp_question" not in st.session_state or st.session_state["last_bp_question"] != current_question:
            st.session_state["last_bp_question"] = current_question
            st.session_state["blueprint_queries"] = []
            
        b1, b2 = st.columns([1, 1])
        with b1:
            gen_bp = st.button("Plan Research Queries", use_container_width=True)
        with b2:
            clear_bp = st.button("Clear Plan", use_container_width=True)
            
        if clear_bp:
            st.session_state["blueprint_queries"] = []
            st.rerun()
            
        if gen_bp:
            if not current_question:
                st.warning("Enter a research objective first.")
            else:
                with st.spinner("Analyzing objective and building plan..."):
                     try:
                         agent = get_agent()
                         queries = agent._plan(current_question)
                         st.session_state["blueprint_queries"] = queries
                         st.success("Research plan generated! You can customize the queries below.")
                     except Exception as e:
                         st.error(f"Failed to plan queries: {e}")
                        
        bp_queries = st.session_state.get("blueprint_queries", [])
        if bp_queries:
            st.markdown("<p style='font-size:12px; color:#94a3b8; margin: 5px 0 10px 0;'>Edit or delete the generated search queries to customize what ARIA will research:</p>", unsafe_allow_html=True)
            new_bp_queries = []
            for idx, q in enumerate(bp_queries):
                col_q, col_del = st.columns([9, 1])
                new_q = col_q.text_input(f"Query #{idx+1}", value=q, key=f"bp_q_input_{idx}")
                if col_del.button("✕", key=f"bp_q_del_{idx}"):
                    # Item is deleted by skipping
                    pass
                else:
                    if new_q.strip():
                        new_bp_queries.append(new_q.strip())
            
            if st.button("+ Add Sub-Query", key="bp_q_add"):
                new_bp_queries.append("")
                st.session_state["blueprint_queries"] = new_bp_queries
                st.rerun()
                
            st.session_state["blueprint_queries"] = new_bp_queries
        else:
            st.info("No queries planned yet. ARIA will plan automatically on run, or click 'Plan Research Queries' to build a custom plan first.")
        st.markdown("</div>", unsafe_allow_html=True)

    with ops_col:
        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Research Settings")
        
        search_base = st.selectbox(
            "Search Base / Source",
            options=["Hybrid (Local + Web)", "Local Knowledge Base Only", "Web Search Only"],
            index=0,
            help="Select where the agent should look for evidence to answer your query."
        )
        
        use_local = "Local" in search_base or "Hybrid" in search_base
        use_web = "Web" in search_base or "Hybrid" in search_base
        
        use_finance = st.toggle("Market data snapshots", value=False)
        max_iterations = st.slider("Validation Depth (Passes)", min_value=1, max_value=3, value=2)
        run = st.button("Run Research", type="primary", use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

        st.markdown('<div class="console-card">', unsafe_allow_html=True)
        st.subheader("Research Pipeline")
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
            custom_plan = [q.strip() for q in st.session_state.get("blueprint_queries", []) if q.strip()]
            run_research_streamed(question.strip(), use_local, use_web, use_finance, max_iterations, custom_plan=custom_plan)


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
        st.info("No research report yet. Submit a research objective from the Research tab.")
    else:
        render_results(result, report)

elif view == "History":
    st.markdown('<div class="console-card">', unsafe_allow_html=True)
    st.subheader("Research History")
    sessions = list_sessions(limit=50)
    if not sessions:
        st.info("No saved sessions yet. Completed research runs are saved automatically.")
    else:
        for item in sessions:
            cols = st.columns([1.2, 3, 1])
            cols[0].caption(item["created_at"])
            cols[1].write(item["title"])
            if cols[2].button("Resume", key=f"resume_{item['id']}", use_container_width=True):
                loaded = load_session(item["path"])
                st.session_state["aria_result"] = loaded
                st.session_state["aria_report"] = build_markdown_report(loaded)
                st.session_state["question"] = loaded.question
                st.session_state["view"] = "Results"
                st.rerun()
    st.markdown("</div>", unsafe_allow_html=True)
