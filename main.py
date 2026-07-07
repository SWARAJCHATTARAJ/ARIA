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

from fastapi import FastAPI, UploadFile, File, HTTPException, Header
from fastapi.responses import Response, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from aria.agent import ResearchAgent
from aria.core import Settings, validate_pdf_upload, estimate_tokens
from aria.rag import VectorMemory
from aria.reports import build_markdown_report, build_pdf_report
from aria.sessions import find_session_path, is_admin_user, list_sessions, load_session, save_session, result_to_dict

load_dotenv()

app = FastAPI(title="ARIA API", description="FastAPI backend for ARIA Agentic RAG System")

@app.get("/.well-known/assetlinks.json")
async def get_assetlinks():
    return [
        {
            "relation": [
                "delegate_permission/common.handle_all_urls"
            ],
            "target": {
                "namespace": "android_app",
                "package_name": "com.swarajchattaraj.aria",
                "sha256_cert_fingerprints": [
                    "20:A0:87:84:C8:8F:7A:69:99:86:C5:2A:BC:0A:0B:5B:2B:C6:B6:6C:52:5C:12:E8:B9:D7:02:CD:2C:57:2C:28"
                ]
            }
        }
    ]


# Configure CORS origins securely (can be configured via environment variable)
allowed_origins_str = os.getenv("ARIA_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8501,http://127.0.0.1:8501")
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

def get_agent(openrouter_api_key: str | None = None) -> ResearchAgent:
    settings = Settings.from_env()
    return ResearchAgent(settings=settings, memory=get_memory(), openrouter_api_key=openrouter_api_key)


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
    field_focus: str = "all"
    user_id: str | None = None

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
async def run_research(request: ResearchRequest, x_openrouter_key: str | None = Header(None)):
    """Run research loop and stream the progress as SSE."""
    agent = get_agent(openrouter_api_key=x_openrouter_key)
    
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
        "max_iterations": request.max_iterations,
        "field_focus": request.field_focus
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
            if hasattr(agent, "_latencies"):
                result.metrics.update(agent._latencies)
            
            # Save session
            session = save_session(result, user_id=request.user_id)
            
            yield f"event: result\ndata: {json.dumps({'session_id': session['id'], 'result': result_to_dict(result)})}\n\n"
            
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.post("/api/research/plan")
async def generate_plan(request: ResearchRequest, x_openrouter_key: str | None = Header(None)):
    """Generate search queries for a research objective without running the full RAG loop."""
    try:
        agent = get_agent(openrouter_api_key=x_openrouter_key)
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
async def clear_memory(user_id: str | None = None):
    """Clear local vector memory and optionally user's session history."""
    try:
        if is_admin_user(user_id):
            memory = get_memory()
            memory.reset()
        from aria.sessions import clear_sessions
        clear_sessions(user_id=user_id)
        return {"message": "Memory cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions")
async def get_sessions(user_id: str | None = None, limit: int = 50):
    """Retrieve list of saved research sessions isolated by user."""
    try:
        sessions = list_sessions(limit=limit, user_id=user_id)
        return {"sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str, user_id: str | None = None):
    """Retrieve detailed research result of a specific session."""
    try:
        path = find_session_path(session_id, user_id=user_id)
        if not path:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        data = json.loads(path.read_text(encoding="utf-8"))
        result = load_session(path)
        return {
            "id": session_id,
            "title": data.get("title") or data.get("result", {}).get("question", "Untitled session"),
            "created_at": data.get("created_at", ""),
            "result": result_to_dict(result)
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}/download/pdf")
async def download_session_pdf(session_id: str, user_id: str | None = None):
    """Download research brief of a session as a formatted PDF."""
    try:
        path = find_session_path(session_id, user_id=user_id)
        if not path:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        result = load_session(path)
        return Response(
            content=build_pdf_report(result),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="aria_brief_{session_id}.pdf"'},
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}/download/md")
async def download_session_md(session_id: str, user_id: str | None = None):
    """Download research brief of a session as a Markdown file."""
    try:
        path = find_session_path(session_id, user_id=user_id)
        if not path:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        result = load_session(path)
        return Response(
            content=build_markdown_report(result).encode("utf-8"),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="aria_brief_{session_id}.md"'},
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settings")
async def get_settings(x_openrouter_key: str | None = Header(None)):
    """Fetch current ARIA configuration."""
    settings = Settings.from_env()
    key = x_openrouter_key.strip() if x_openrouter_key else ""
    if not key:
        key = os.getenv("OPENROUTER_API_KEY", "").strip()
    key_configured = bool(key and not key.startswith("your_"))
    
    return {
        "llm_provider": settings.llm_provider,
        "model": settings.model,
        "collection_name": settings.collection_name,
        "memory_path": settings.memory_path,
        "key_configured": key_configured
    }

class SettingsRequest(BaseModel):
    openrouter_api_key: str | None = None

@app.post("/api/settings")
async def update_settings(request: SettingsRequest):
    """Update current ARIA configuration."""
    if request.openrouter_api_key is not None:
        key = request.openrouter_api_key.strip()
        # Save to os.environ so it's active immediately
        os.environ["OPENROUTER_API_KEY"] = key
        
        # Also write to .env to persist across restarts
        env_path = Path(__file__).parent / ".env"
        if env_path.exists():
            try:
                content = env_path.read_text(encoding="utf-8")
                lines = content.splitlines()
                updated = False
                for i, line in enumerate(lines):
                    if line.startswith("OPENROUTER_API_KEY="):
                        lines[i] = f"OPENROUTER_API_KEY={key}"
                        updated = True
                        break
                if not updated:
                    lines.append(f"OPENROUTER_API_KEY={key}")
                env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            except Exception:
                pass
        else:
            try:
                env_path.write_text(f"OPENROUTER_API_KEY={key}\n", encoding="utf-8")
            except Exception:
                pass
            
    return {"status": "success", "message": "Settings updated successfully"}

@app.get("/downloads/aria.apk")
async def download_apk():
    """Download the prebuilt signed Android APK."""
    apk_path = Path(__file__).parent / "app-release-signed.apk"
    if apk_path.exists():
        return FileResponse(
            path=str(apk_path),
            filename="ARIA.apk",
            media_type="application/vnd.android.package-archive"
        )
    raise HTTPException(status_code=404, detail="APK file not found.")

# Serving frontend build
def get_resource_path(relative_path: str) -> Path:
    try:
        import sys
        if hasattr(sys, "_MEIPASS"):
            return Path(sys._MEIPASS) / relative_path
    except Exception:
        pass
    return Path(__file__).parent / relative_path

dist_path = get_resource_path("frontend/dist")
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("ARIA_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("ARIA_PORT", "8000")))
    uvicorn.run("main:app", host=host, port=port, reload=True)
