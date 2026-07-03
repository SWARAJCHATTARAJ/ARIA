from __future__ import annotations

import os
import sys
import time
import json
import socket
import requests
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse

os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from aria.agent import ResearchAgent
from aria.core import Settings, MAX_PDF_PAGES, MAX_UPLOAD_MB, validate_pdf_upload, ResearchResult, Evidence, estimate_tokens
from aria.rag import VectorMemory
from aria.reports import build_markdown_report, build_pdf_report
from aria.sessions import list_sessions, load_session, save_session, result_to_dict

load_dotenv()

app = FastAPI(title="ARIA API", description="FastAPI backend for ARIA Agentic RAG System")

# Configure CORS origins securely (can be configured via environment variable)
allowed_origins_str = os.getenv("ARIA_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000")
origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_memory() -> VectorMemory:
    return VectorMemory(Settings.from_env())

def get_agent() -> ResearchAgent:
    settings = Settings.from_env()
    return ResearchAgent(settings=settings, memory=get_memory())


def result_metrics(result) -> dict[str, int | float | str]:
    return {
        "evidence_items": len(result.evidence),
        "answer_tokens_est": estimate_tokens(result.answer),
        "verification_tokens_est": estimate_tokens(result.verification),
        "total_output_tokens_est": estimate_tokens(result.answer) + estimate_tokens(result.verification),
    }

class ResearchRequest(BaseModel):
    question: str
    use_local: bool = True
    use_web: bool = True
    use_finance: bool = False
    max_iterations: int = 2
    custom_plan: list[str] | None = None

class IngestUrlRequest(BaseModel):
    url: str

class IngestTextRequest(BaseModel):
    text: str
    source_name: str = "Manual note"
    source_type: str = "note"

class TextExtractor:
    from html.parser import HTMLParser
    class _Extractor(HTMLParser):
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

def is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"}:
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
            
        # Resolve hostname to all associated IP addresses
        ips = socket.getaddrinfo(hostname, None)
        for ip_info in ips:
            ip = ip_info[4][0]
            # IPv4 checks
            if ip.startswith("127.") or ip.startswith("169.254.") or ip.startswith("10."):
                return False
            if ip.startswith("192.168."):
                return False
            if ip.startswith("172."):
                # 172.16.0.0 to 172.31.255.255
                parts = ip.split('.')
                if len(parts) >= 2 and 16 <= int(parts[1]) <= 31:
                    return False
            # IPv6 checks
            if ip == "::1" or ip.startswith("fe80:") or ip.startswith("fc00:") or ip.startswith("fd00:"):
                return False
        return True
    except Exception:
        return False

def fetch_url_text(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Enter a valid http or https URL.")

    # Guard against SSRF (Server-Side Request Forgery)
    if not is_safe_url(url):
        raise ValueError("The requested URL is pointing to a restricted IP address or hostname.")

    response = requests.get(
        url,
        headers={"User-Agent": "Aria-Agent-Console/1.0"},
        timeout=20,
    )
    response.raise_for_status()
    response.encoding = response.apparent_encoding

    content_type = response.headers.get("content-type", "")
    if "text/html" in content_type:
        extractor = TextExtractor._Extractor()
        try:
            extractor.feed(response.text)
            text = extractor.text()
        except Exception:
            text = response.text
    else:
        text = response.text

    text = " ".join(text.split())
    if len(text) < 200:
        raise ValueError("The URL did not return enough readable text to index.")
    return parsed.netloc, text[:80_000]

@app.post("/api/research")
async def run_research(request: ResearchRequest):
    """Run research loop and stream the progress as SSE."""
    agent = get_agent()
    
    initial_state = {
        "question": request.question,
        "plan": request.custom_plan if request.custom_plan else [],
        "evidence": [],
        "answer": "",
        "verification": "No verification run.",
        "events": [],
        "iteration": 0,
        "use_web": request.use_web,
        "use_local": request.use_local,
        "use_finance": request.use_finance,
        "max_iterations": request.max_iterations
    }

    async def sse_generator():
        # Yield init
        yield f"event: init\ndata: {json.dumps({'message': 'Initializing ARIA Research Workspace...'})}\n\n"
        
        final_state = initial_state
        node_started_at = time.perf_counter()
        
        try:
            # We stream events from the LangGraph graph
            for output in agent.graph.stream(initial_state):
                for node_name, state_update in output.items():
                    elapsed = time.perf_counter() - node_started_at
                    final_state = {**final_state, **state_update}
                    
                    # Yield progress update
                    yield f"event: stage_complete\ndata: {json.dumps({'stage': node_name, 'elapsed': round(elapsed, 2), 'events': state_update.get('events', [])})}\n\n"
                    node_started_at = time.perf_counter()
            
            # Post-process final state
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
            
            # Save session
            session = save_session(result)
            
            yield f"event: result\ndata: {json.dumps({'session_id': session['id'], 'result': result_to_dict(result)})}\n\n"
            
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.post("/api/research/plan")
async def generate_plan(request: ResearchRequest):
    """Generate search queries for a research objective without running the full RAG loop."""
    try:
        agent = get_agent()
        queries = agent._plan(request.question)
        return {"queries": queries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest/pdf")
async def ingest_pdf(file: UploadFile = File(...)):
    """Upload and index a PDF file into the local vector database."""
    try:
        validate_pdf_upload(file.filename, file.size)
        memory = get_memory()
        
        # Save to temporary file for parsing
        with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(await file.read())
            tmp_path = Path(tmp.name)
            
        try:
            count = memory.ingest_pdf(tmp_path, source_name=file.filename)
            return {"message": f"Successfully indexed {file.filename}", "chunks": count}
        finally:
            tmp_path.unlink(missing_ok=True)
            
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest/url")
async def ingest_url(request: IngestUrlRequest):
    """Fetch content from a URL and index it."""
    try:
        source_name, text = fetch_url_text(request.url)
        memory = get_memory()
        count = memory.ingest_text(text, source_name=source_name, source_type="web")
        return {"message": f"Successfully indexed content from {source_name}", "chunks": count}
    except (ValueError, requests.RequestException) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ingest/text")
async def ingest_text(request: IngestTextRequest):
    """Index manual note or pasted text."""
    try:
        memory = get_memory()
        count = memory.ingest_text(request.text, source_name=request.source_name, source_type=request.source_type)
        if not count:
            raise HTTPException(status_code=400, detail="Text to index must not be empty.")
        return {"message": "Successfully indexed manual note", "chunks": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/memory/count")
async def get_memory_count():
    """Get the total number of indexed chunks."""
    try:
        memory = get_memory()
        return {"count": memory.count()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/memory/clear")
async def clear_memory():
    """Clear local vector memory."""
    try:
        memory = get_memory()
        memory.reset()
        return {"message": "Vector memory cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions")
async def get_sessions(limit: int = 50):
    """Retrieve list of saved research sessions."""
    try:
        sessions = list_sessions(limit=limit)
        return {"sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Retrieve detailed research result of a specific session."""
    try:
        sessions = list_sessions(limit=100)
        matching = [s for s in sessions if s["id"] == session_id]
        if not matching:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        result = load_session(matching[0]["path"])
        return {"id": session_id, "title": matching[0]["title"], "created_at": matching[0]["created_at"], "result": result_to_dict(result)}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}/download/pdf")
async def download_session_pdf(session_id: str):
    """Download research brief of a session as a formatted PDF."""
    try:
        sessions = list_sessions(limit=100)
        matching = [s for s in sessions if s["id"] == session_id]
        if not matching:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        result = load_session(matching[0]["path"])
        pdf_bytes = build_pdf_report(result)
        
        # Save temporarily
        temp_dir = Path("temp_downloads")
        temp_dir.mkdir(exist_ok=True)
        pdf_file = temp_dir / f"aria_brief_{session_id}.pdf"
        pdf_file.write_bytes(pdf_bytes)
        
        return FileResponse(
            path=str(pdf_file),
            filename=f"aria_brief_{session_id}.pdf",
            media_type="application/pdf"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}/download/md")
async def download_session_md(session_id: str):
    """Download research brief of a session as a Markdown file."""
    try:
        sessions = list_sessions(limit=100)
        matching = [s for s in sessions if s["id"] == session_id]
        if not matching:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        result = load_session(matching[0]["path"])
        md_text = build_markdown_report(result)
        
        # Save temporarily
        temp_dir = Path("temp_downloads")
        temp_dir.mkdir(exist_ok=True)
        md_file = temp_dir / f"aria_brief_{session_id}.md"
        md_file.write_text(md_text, encoding="utf-8")
        
        return FileResponse(
            path=str(md_file),
            filename=f"aria_brief_{session_id}.md",
            media_type="text/markdown"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settings")
async def get_settings():
    """Fetch current ARIA configuration."""
    settings = Settings.from_env()
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    key_configured = bool(key and not key.startswith("your_"))
    
    return {
        "llm_provider": settings.llm_provider,
        "model": settings.model,
        "collection_name": settings.collection_name,
        "memory_path": settings.memory_path,
        "key_configured": key_configured
    }

# Serving frontend build
dist_path = Path("frontend/dist")
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
