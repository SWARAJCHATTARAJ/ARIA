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

# ONNX Runtime memory optimization patch for low-RAM hosts (Render Free Tier 512MB)
try:
    import onnxruntime as ort
    original_init = ort.InferenceSession.__init__
    def patched_init(self, *args, **kwargs):
        sess_options = kwargs.get("sess_options") or ort.SessionOptions()
        sess_options.intra_op_num_threads = 1
        sess_options.inter_op_num_threads = 1
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        sess_options.enable_cpu_mem_arena = False
        kwargs["sess_options"] = sess_options
        original_init(self, *args, **kwargs)
    ort.InferenceSession.__init__ = patched_init
except ImportError:
    pass

from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Depends, status, Request
from fastapi.responses import Response, StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
import logging

load_dotenv()

# Configure structured-like console logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("aria.api")

from aria.agent import ResearchAgent, generate_research_diff
from aria.core import Settings, validate_pdf_upload, estimate_tokens
from aria.rag import VectorMemory
from aria.reports import build_markdown_report, build_pdf_report, build_trace_report
from aria.sessions import find_session_path, is_admin_user, list_sessions, load_session, save_session, result_to_dict
from aria.auth import get_current_user, verify_password, create_access_token, get_auth_settings, get_user_hash, create_user, oauth2_scheme


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


def redact_secrets(text: str) -> str:
    if not text:
        return text
    for key in ["OPENROUTER_API_KEY", "DATABASE_URL", "ARIA_JWT_SECRET", "ARIA_PASSWORD_HASH"]:
        val = os.getenv(key, "").strip()
        if val and len(val) > 4 and not val.startswith("your_"):
            text = text.replace(val, f"[{key}_REDACTED]")
    return text

# Configure CORS origins securely (can be configured via environment variable)
allowed_origins_str = os.getenv("ARIA_ALLOWED_ORIGINS", "https://aria.swarajchattaraj.tech,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8501,http://127.0.0.1:8501")
origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_memory_usage_mb() -> float:
    try:
        import psutil
        import os
        process = psutil.Process(os.getpid())
        return process.memory_info().rss / (1024 * 1024)
    except ImportError:
        try:
            with open('/proc/self/status', 'r') as f:
                for line in f:
                    if line.startswith('VmRSS:'):
                        return float(line.split()[1]) / 1024.0
        except Exception:
            pass
        return 0.0

def get_memory() -> VectorMemory:
    return VectorMemory(Settings.from_env())

def get_agent(openrouter_api_key: str | None = None, event_callback: callable | None = None) -> ResearchAgent:
    settings = Settings.from_env()
    return ResearchAgent(settings=settings, memory=get_memory(), openrouter_api_key=openrouter_api_key, event_callback=event_callback)


def result_metrics(result) -> dict[str, int | float | str]:
    return {
        "evidence_items": len(result.evidence),
        "answer_tokens_est": estimate_tokens(result.answer),
        "verification_tokens_est": estimate_tokens(result.verification),
        "total_output_tokens_est": estimate_tokens(result.answer) + estimate_tokens(result.verification),
    }

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str

class ResearchRequest(BaseModel):
    question: str
    use_local: bool = True
    use_web: bool = True
    use_finance: bool = False
    max_iterations: int = 1
    custom_plan: list[str] | None = None
    field_focus: str = "all"
    user_id: str | None = None
    session_id: str | None = None
    local_only: bool = False

class InMemoryRateLimiter:
    def __init__(self, limit_per_minute: int = 5):
        self.limit = limit_per_minute
        from collections import defaultdict
        self.history = defaultdict(list)
        from threading import Lock
        self.lock = Lock()
        
    def check_rate_limit(self, user_id: str) -> None:
        with self.lock:
            now = time.time()
            self.history[user_id] = [t for t in self.history[user_id] if now - t < 60]
            if len(self.history[user_id]) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Rate limit exceeded. Please try again in a minute."
                )
            self.history[user_id].append(now)

research_limiter = InMemoryRateLimiter(limit_per_minute=5)
ingest_limiter = InMemoryRateLimiter(limit_per_minute=10)

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

@app.post("/api/auth/login")
async def login(request: LoginRequest):
    username = request.username.strip().lower()
    db_hash = get_user_hash(username)
    
    print(f"[Auth Debug] Login attempt for username: '{username}'")
    print(f"[Auth Debug] Hash found in DB: {'Yes' if db_hash else 'No'}")
    
    if db_hash:
        is_verified = verify_password(request.password, db_hash)
        print(f"[Auth Debug] Password verified: {is_verified}")
        
    if not db_hash or not verify_password(request.password, db_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    import re
    username = request.username.strip().lower()
    if not re.match(r"^[a-zA-Z0-9_\-]+$", username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username can only contain alphanumeric characters, underscores, and hyphens."
        )
    if len(username) < 3 or len(username) > 30:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be between 3 and 30 characters."
        )
    password = request.password
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )
    if not any(c.isalpha() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one letter."
        )
    if not any(c.isdigit() for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one number."
        )
    special_chars = set("!@#$%^&*(),.?\":{}|<>-_+=~`[]\\/;:'")
    if not any(c in special_chars for c in password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must contain at least one special character."
        )
    
    success = create_user(username, request.password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken."
        )
    
    return {"status": "success", "message": "User registered successfully."}

GUEST_LIMITER = {}

def get_client_ip(request: Request) -> str:
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def check_guest_rate_limit(ip: str):
    import time
    now = time.time()
    if ip in GUEST_LIMITER:
        GUEST_LIMITER[ip] = [t for t in GUEST_LIMITER[ip] if now - t < 86400]
    else:
        GUEST_LIMITER[ip] = []
        
    if len(GUEST_LIMITER[ip]) >= 3:
        raise HTTPException(
            status_code=429,
            detail="Guest limit exceeded (3 requests/day). Please register or login for unlimited access."
        )
    GUEST_LIMITER[ip].append(now)

def get_current_user_or_guest(token: str | None = Depends(oauth2_scheme)) -> str:
    if not token:
        return "guest"
    try:
        return get_current_user(token)
    except Exception:
        return "guest"

@app.post("/api/research")
async def run_research(
    request: ResearchRequest,
    fastapi_request: Request,
    x_openrouter_key: str | None = Header(None),
    current_user: str = Depends(get_current_user_or_guest)
):
    """Run research loop and stream the progress as SSE."""
    if current_user == "guest":
        client_ip = get_client_ip(fastapi_request)
        check_guest_rate_limit(client_ip)
    else:
        research_limiter.check_rate_limit(current_user)
    
    # Enforce that the user ID used is the authenticated current_user
    request.user_id = current_user

    async def sse_generator():
        try:
            import asyncio
            from queue import Queue
            from threading import Thread
            
            q = Queue()
            
            def on_node_start(node_name: str):
                q.put(("node_start", node_name))

            # Yield init
            yield f"event: init\ndata: {json.dumps({'message': 'Initializing ARIA Research Workspace...'})}\n\n"
            
            logger.info(f"Starting research loop for question: '{request.question}' (User: {request.user_id})")
            
            # Initialize agent inside the generator to catch any startup errors
            agent = get_agent(openrouter_api_key=x_openrouter_key, event_callback=on_node_start)
            
            previous_history = []
            previous_evidence = []
            if request.session_id:
                from aria.sessions import find_session_path, load_session
                try:
                    path = find_session_path(request.session_id, user_id=request.user_id)
                    if path:
                        prev_result = load_session(path)
                        previous_history = list(getattr(prev_result, "history", [])) + [
                            {"question": prev_result.question, "answer": prev_result.answer}
                        ]
                        previous_evidence = prev_result.evidence
                except Exception as e:
                    logger.warning(f"Failed to load previous session: {e}", exc_info=True)
            
            # Limit max_iterations to 2 on free hosting plans to prevent timeouts
            max_iters = min(request.max_iterations, 2)
            if request.max_iterations > 2:
                logger.warning(f"Requested max_iterations {request.max_iterations} capped at 2 to fit within proxy timeouts.")
                    
            initial_state = {
                "question": request.question,
                "plan": request.custom_plan if request.custom_plan else [],
                "evidence": previous_evidence,
                "answer": "",
                "verification": "No verification run.",
                "events": [],
                "iteration": 0,
                "use_web": request.use_web,
                "use_local": request.use_local,
                "use_finance": request.use_finance,
                "max_iterations": max_iters,
                "field_focus": request.field_focus,
                "history": previous_history,
                "validation_warning": False,
                "local_only": request.local_only
            }
            
            # Check query cache
            from aria.cache import check_cache, store_cache
            cached_result = check_cache(request.question)
            if cached_result:
                logger.info("Query cache hit. Returning cached results.")
                yield f"event: stage_complete\ndata: {json.dumps({'stage': 'cache_hit', 'elapsed': 0.0, 'events': ['Retrieved results from query cache (embedding similarity hit).']})}\n\n"
                session = save_session(cached_result, user_id=request.user_id)
                yield f"event: result\ndata: {json.dumps({'session_id': session['id'], 'result': result_to_dict(cached_result)})}\n\n"
                return

            def run_graph():
                try:
                    logger.info("LangGraph thread started execution.")
                    for output in agent.graph.stream(initial_state):
                        q.put(("output", output))
                    q.put(("done", None))
                    logger.info("LangGraph thread execution completed successfully.")
                except Exception as exc:
                    logger.exception("Error in LangGraph execution thread:")
                    q.put(("error", exc))
                    
            t = Thread(target=run_graph, daemon=True)
            t.start()
            
            final_state = initial_state
            node_started_at = time.perf_counter()
            
            last_ping_time = time.perf_counter()
            while True:
                while q.empty():
                    await asyncio.sleep(0.2)
                    # Check if thread is still alive
                    if not t.is_alive() and q.empty():
                        logger.error("ARIA research engine thread terminated unexpectedly.")
                        raise RuntimeError("ARIA research engine thread terminated unexpectedly. This might be due to an Out-of-Memory (OOM) kill or process crash.")
                    # Keep-alive ping to prevent proxy/load balancer timeouts
                    if time.perf_counter() - last_ping_time > 15:
                        yield f"event: ping\ndata: {json.dumps({'message': 'keep-alive'})}\n\n"
                        last_ping_time = time.perf_counter()
                
                status, val = q.get()
                if status == "done":
                    break
                elif status == "error":
                    logger.error(f"Error received from research engine thread: {val}")
                    raise val
                elif status == "node_start":
                    node_name = val
                    node_started_at = time.perf_counter()
                    mem = get_memory_usage_mb()
                    logger.info(f"Pipeline stage started: {node_name}. Memory: {mem:.2f} MB")
                    yield f"event: stage_start\ndata: {json.dumps({'stage': node_name, 'memory_mb': round(mem, 2)})}\n\n"
                    # Reset ping timer
                    last_ping_time = time.perf_counter()
                elif status == "output":
                    for node_name, state_update in val.items():
                        elapsed = time.perf_counter() - node_started_at
                        final_state = {**final_state, **state_update}
                        mem = get_memory_usage_mb()
                        logger.info(f"Pipeline stage completed: {node_name} in {elapsed:.2f} seconds. Memory: {mem:.2f} MB")
                        yield f"event: stage_complete\ndata: {json.dumps({'stage': node_name, 'elapsed': round(elapsed, 2), 'memory_mb': round(mem, 2), 'events': state_update.get('events', [])})}\n\n"
                        # Reset ping timer when we output a stage
                        last_ping_time = time.perf_counter()
            
            # Post-process final state
            from aria.agent import dedupe_evidence
            from aria.core import ResearchResult
            
            logger.info("Post-processing final state and generating ResearchResult.")
            result = ResearchResult(
                question=final_state["question"],
                plan=final_state["plan"],
                answer=final_state["answer"],
                verification=final_state["verification"],
                evidence=dedupe_evidence(final_state["evidence"]),
                events=final_state["events"],
                history=final_state.get("history", []),
                validation_warning=final_state.get("validation_warning", False)
            )
            result.metrics = result_metrics(result)
            if hasattr(agent, "_latencies"):
                result.metrics.update(agent._latencies)
            
            # Save session
            session = save_session(result, user_id=request.user_id)
            
            # Store in cache
            store_cache(request.question, result)
            
            logger.info("Research loop completed successfully. Sending final result.")
            yield f"event: result\ndata: {json.dumps({'session_id': session['id'], 'result': result_to_dict(result)})}\n\n"
            
        except Exception as e:
            logger.exception("Exception occurred in sse_generator:")
            yield f"event: error\ndata: {json.dumps({'error': redact_secrets(str(e))})}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.post("/api/research/plan")
async def generate_plan(request: ResearchRequest, x_openrouter_key: str | None = Header(None), current_user: str = Depends(get_current_user)):
    research_limiter.check_rate_limit(current_user)
    try:
        agent = get_agent(openrouter_api_key=x_openrouter_key)
        queries = agent._plan(request.question)
        return {"queries": queries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.post("/api/ingest/pdf")
async def ingest_pdf(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    """Upload and index a PDF file into the local vector database."""
    ingest_limiter.check_rate_limit(current_user)
    try:
        # Read the first 4 bytes to check magic header
        header = await file.read(4)
        await file.seek(0)
        if header != b"%PDF":
            raise ValueError("Invalid PDF format: file must be a valid PDF document.")
            
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
        raise HTTPException(status_code=400, detail=redact_secrets(str(exc)))
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.post("/api/ingest/url")
async def ingest_url(request: IngestUrlRequest, current_user: str = Depends(get_current_user)):
    """Fetch content from a URL and index it."""
    ingest_limiter.check_rate_limit(current_user)
    try:
        source_name, text = fetch_url_text(request.url)
        memory = get_memory()
        count = memory.ingest_text(text, source_name=source_name, source_type="web")
        return {"message": f"Successfully indexed content from {source_name}", "chunks": count}
    except (ValueError, requests.RequestException) as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.post("/api/ingest/text")
async def ingest_text(request: IngestTextRequest, current_user: str = Depends(get_current_user)):
    """Index manual note or pasted text."""
    ingest_limiter.check_rate_limit(current_user)
    try:
        memory = get_memory()
        count = memory.ingest_text(request.text, source_name=request.source_name, source_type=request.source_type)
        if not count:
            raise HTTPException(status_code=400, detail="Text to index must not be empty.")
        return {"message": "Successfully indexed manual note", "chunks": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.get("/api/memory/count")
async def get_memory_count():
    """Get the total number of indexed chunks."""
    try:
        memory = get_memory()
        return {"count": memory.count()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.post("/api/memory/clear")
async def clear_memory(user_id: str | None = None, current_user: str = Depends(get_current_user)):
    """Clear local vector memory and optionally user's session history."""
    try:
        if is_admin_user(user_id):
            memory = get_memory()
            memory.reset()
        from aria.sessions import clear_sessions
        clear_sessions(user_id=user_id)
        return {"message": "Memory cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.get("/api/sessions")
async def get_sessions(user_id: str | None = None, limit: int = 50, current_user: str = Depends(get_current_user)):
    """Retrieve list of saved research sessions isolated by user."""
    try:
        sessions = list_sessions(limit=limit, user_id=user_id)
        return {"sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str, user_id: str | None = None, current_user: str = Depends(get_current_user)):
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
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.get("/api/sessions/{session_id}/download/pdf")
async def download_session_pdf(session_id: str, user_id: str | None = None, current_user: str = Depends(get_current_user)):
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
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.get("/api/sessions/{session_id}/download/md")
async def download_session_md(session_id: str, user_id: str | None = None, current_user: str = Depends(get_current_user)):
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
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

@app.get("/api/sessions/{session_id}/download/trace")
async def download_session_trace(session_id: str, user_id: str | None = None, current_user: str = Depends(get_current_user)):
    """Download research trace/audit log of a session as a Markdown file."""
    try:
        path = find_session_path(session_id, user_id=user_id)
        if not path:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        result = load_session(path)
        return Response(
            content=build_trace_report(result).encode("utf-8"),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="aria_trace_{session_id}.md"'},
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))

class RecurringRequest(BaseModel):
    interval: str | None = None # "minutely", "hourly", "daily", "weekly", "debug", or None

@app.post("/api/sessions/{session_id}/recurring")
async def configure_recurring(session_id: str, request: RecurringRequest, user_id: str | None = None, current_user: str = Depends(get_current_user)):
    """Configure recurring interval for a session."""
    try:
        path = find_session_path(session_id, user_id=user_id)
        if not path:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        result = load_session(path)
        
        # Check valid intervals
        valid_intervals = {None, "minutely", "hourly", "daily", "weekly", "debug"}
        if request.interval not in valid_intervals:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid interval. Must be one of: {', '.join(str(i) for i in valid_intervals)}"
            )
            
        result.recurring_interval = request.interval
        if request.interval:
            from datetime import datetime, timezone
            result.last_run_at = datetime.now(timezone.utc).isoformat()
            
        save_session(result, session_id=session_id, user_id=user_id or current_user)
        return {"status": "success", "message": f"Recurring interval set to {request.interval}"}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=redact_secrets(str(e)))


def run_scheduler_loop():
    import threading
    
    def scheduler_loop():
        time.sleep(5)
        print("[Scheduler] Started background recurring research scheduler thread.")

        while True:
            try:
                # Retrieve all user sessions
                sessions_list = list_sessions(user_id="admin", limit=100)
                for s in sessions_list:
                    session_id = s.get("id")
                    user_id = s.get("user_id")
                    
                    path = find_session_path(session_id, user_id=user_id)
                    if not path:
                        continue
                    try:
                        result = load_session(path)
                    except Exception:
                        continue
                        
                    interval = getattr(result, "recurring_interval", None)
                    if not interval:
                        continue
                        
                    last_run_str = getattr(result, "last_run_at", None)
                    created_at_str = s.get("created_at")
                    
                    base_time_str = last_run_str or created_at_str
                    if not base_time_str:
                        continue
                        
                    try:
                        from datetime import datetime, timezone
                        base_time = datetime.fromisoformat(base_time_str.replace("Z", "+00:00"))
                    except Exception:
                        continue
                        
                    now = datetime.now(timezone.utc)
                    delta = now - base_time
                    
                    should_run = False
                    if interval == "minutely":
                        should_run = delta.total_seconds() >= 60
                    elif interval == "hourly":
                        should_run = delta.total_seconds() >= 3600
                    elif interval == "daily":
                        should_run = delta.total_seconds() >= 86400
                    elif interval == "weekly":
                        should_run = delta.total_seconds() >= 604800
                    elif interval == "debug":
                        should_run = delta.total_seconds() >= 10
                        
                    if should_run:
                        print(f"[Scheduler] Running recurring job for session {session_id} (interval: {interval})")
                        
                        result.last_run_at = now.isoformat()
                        save_session(result, session_id=session_id, user_id=user_id)
                        
                        agent = get_agent()
                        try:
                            # Re-run the research question
                            new_result = agent.run(result.question, history=getattr(result, "history", []))
                            
                            # Generate diff
                            diff = generate_research_diff(result, new_result, agent)
                            
                            new_events = list(new_result.events)
                            if diff["is_changed"]:
                                new_events.append(f"Scheduler Diff: Found updates. Changes: {diff['changes']}")
                            else:
                                new_events.append("Scheduler Diff: Checked. No changes found.")
                                
                            new_result.events = new_events
                            new_result.recurring_interval = interval
                            new_result.last_run_at = now.isoformat()
                            
                            save_session(new_result, session_id=session_id, user_id=user_id)
                            print(f"[Scheduler] Recurring job completed for session {session_id}")
                        except Exception as e:
                            print(f"[Scheduler Error] Job failed for session {session_id}: {e}")
            except Exception as outer_err:
                print(f"[Scheduler Error] Outer loop exception: {outer_err}")
            
            time.sleep(30)
            
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()


@app.on_event("startup")
def startup_event():
    run_scheduler_loop()


@app.get("/api/settings")
async def get_settings(x_openrouter_key: str | None = Header(None), current_user: str = Depends(get_current_user)):
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
async def update_settings(request: SettingsRequest, current_user: str = Depends(get_current_user)):
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
