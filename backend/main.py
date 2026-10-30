import asyncio
import time
import json
import logging
import re
import uuid
import traceback
import urllib.parse
from typing import Optional, List, Dict, Any
import httpx

from fastapi import FastAPI, Depends, HTTPException, Header, Request, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from config import settings
from routers import export, okf
from utils.api_security import (
    get_client_ip,
    verify_supabase_jwt,
    check_anonymous_rate_limit,
    record_anonymous_request,
    validate_uuid,
    ALLOWED_VERDICTS,
    MAX_BODY_SIZE_BYTES,
    MAX_QUERY_LENGTH,
    MAX_STREAM_DURATION_SECONDS
)

# Initialize FastAPI
app = FastAPI(title="ARIA API", version="2.0.0")

# Include routers
app.include_router(export.router)
app.include_router(okf.router)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aria.swarajchattaraj.tech",
        "https://swarajchattaraj.tech",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Security Middleware: Request ID, nosniff, and max body size check
@app.middleware("http")
async def security_and_limits_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    # Check request body size (cap at 8 KB, or 1 MB for PDF export)
    max_bytes = 1024 * 1024 if request.url.path == "/api/export/pdf" else MAX_BODY_SIZE_BYTES
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_bytes:
        return Response(
            content=f"Request body exceeds {max_bytes // 1024} KB limit.",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            media_type="text/plain",
            headers={"X-Content-Type-Options": "nosniff", "X-Request-ID": request_id}
        )

    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(f"[{request_id}] Unhandled error during request processing: {exc}\n{traceback.format_exc()}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An internal server error occurred.", "request_id": request_id},
            headers={"X-Content-Type-Options": "nosniff", "X-Request-ID": request_id}
        )

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Request-ID"] = request_id
    return response

# Global Exception Handler: never leak stack traces or env values
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    logger.error(f"[{req_id}] Global exception: {exc}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred.", "request_id": req_id},
        headers={"X-Content-Type-Options": "nosniff", "X-Request-ID": req_id}
    )

class QueryRequest(BaseModel):
    query: str
    thread_id: Optional[str] = None
    user_id: Optional[str] = None
    compare_mode: bool = False
    # v3 Part 2: flexible research modes, discipline filters, custom context
    research_mode: Optional[str] = None
    discipline: Optional[str] = None
    custom_context: Optional[str] = None

class FeedbackRequest(BaseModel):
    message_id: str
    thread_id: Optional[str] = None
    verdict: str
    query: Optional[str] = None
    tiers: Optional[List[str]] = None
    route_engine: Optional[str] = None

@app.get("/health")
def health_check():
    return {"status": "healthy", "version": "2.0.0"}

from pipeline.graph import app_graph

@app.post("/api/query")
async def query_pipeline(req: QueryRequest, request: Request):
    """
    Main endpoint for ARIA query pipeline.
    Requires Supabase JWT, or enforces per-IP 5/hr limit + DAILY_QUERY_CAP for anonymous demo use.
    Enforces 8 KB body size, 500 char query length, UUID thread_id, and 90s stream limit.
    """
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    # 1. Validation
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    if len(req.query.strip()) > MAX_QUERY_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Query length exceeds {MAX_QUERY_LENGTH} characters limit (received {len(req.query.strip())})."
        )
    validate_uuid(req.thread_id, "thread_id")

    # v3 Part 2: normalize research mode + discipline, clamp custom context
    from pipeline.nodes import RESEARCH_MODE_DEFAULT, normalize_research_mode, DISCIPLINES, MAX_CUSTOM_CONTEXT_CHARS
    from pipeline import nodes as _nodes_pkg  # namespace for BYOK override accessors
    effective_research_mode = normalize_research_mode(req.research_mode)
    effective_discipline = str(req.discipline or "auto").strip().lower()
    if effective_discipline not in DISCIPLINES:
        effective_discipline = "auto"
    effective_custom_context = (req.custom_context or "").strip()[:MAX_CUSTOM_CONTEXT_CHARS]

    # v3 Part 2.3: BYOK per-request key override (X-Custom-API-Key / X-Custom-Provider)
    byok_key = (request.headers.get("x-custom-api-key") or "").strip()
    byok_provider = (request.headers.get("x-custom-provider") or "").strip().lower()
    byok_active = False
    if byok_key and byok_provider:
        byok_active = _nodes_pkg.set_request_llm_override(byok_provider, byok_key)

    # 2. Authentication & Rate Limiting
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else None
    client_ip = get_client_ip(request)

    is_authenticated = False
    if settings.jwt_auth_enabled and token:
        user_payload = await verify_supabase_jwt(token)
        if user_payload:
            is_authenticated = True

    if not is_authenticated:
        allowed, retry_after, limit_msg = check_anonymous_rate_limit(client_ip, is_feedback=False)
        if not allowed:
            return Response(
                content=limit_msg,
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                media_type="text/plain",
                headers={
                    "Retry-After": str(retry_after),
                    "X-Content-Type-Options": "nosniff",
                    "X-Request-ID": request_id
                }
            )
        record_anonymous_request(client_ip, is_feedback=False)

    # 3. Session memory configuration
    from utils.token_tracker import TokenTracker, token_rate_limiter
    from utils.query_queue import global_query_queue
    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    token_tracker = TokenTracker(query_id=thread_id)
    
    initial_state = {
        "query": req.query,
        "thread_id": thread_id,
        "user_id": req.user_id,
        "compare_mode": req.compare_mode,
        "research_mode": effective_research_mode,
        "discipline": effective_discipline,
        "custom_context": effective_custom_context,
        "chat_history": [{"role": "user", "content": req.query}],
        "token_tracker": token_tracker
    }
    
    async def pipeline_events():
        start_time = time.time()
        yield f"data: {json.dumps({'event': 'start', 'thread_id': thread_id})}\n\n"
        
        # Single global live query queue with position SSE events (max wait 60s)
        queue_events = asyncio.Queue()

        async def on_queued(pos: int):
            await queue_events.put(pos)

        acquire_task = asyncio.create_task(
            global_query_queue.acquire(request_id, on_queued=on_queued)
        )

        while not acquire_task.done():
            try:
                pos = await asyncio.wait_for(queue_events.get(), timeout=0.2)
                yield f"data: {json.dumps({'event': 'queued', 'position': pos})}\n\n"
            except asyncio.TimeoutError:
                pass

        while not queue_events.empty():
            pos = queue_events.get_nowait()
            yield f"data: {json.dumps({'event': 'queued', 'position': pos})}\n\n"

        slot_acquired = await acquire_task
        if not slot_acquired:
            logger.warning(f"[{request_id}] Exceeded 60s queue wait timeout.")
            yield f"data: {json.dumps({'event': 'error', 'message': 'ARIA is busy right now, try again in a few minutes', 'request_id': request_id})}\n\n"
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
            return

        try:
            current_state = dict(initial_state)

            # Check 90s timeout
            if time.time() - start_time > MAX_STREAM_DURATION_SECONDS:
                logger.warning(f"[{request_id}] Stream exceeded {MAX_STREAM_DURATION_SECONDS}s limit before route.")
                yield f"data: {json.dumps({'event': 'error', 'message': 'Stream exceeded 90s duration limit.'})}\n\n"
                yield f"data: {json.dumps({'event': 'done'})}\n\n"
                return

            # 1. Route Phase
            from pipeline.nodes import route_query, plan_retrieval, retrieve_cascade, audit_answer, groq_llm
            from langchain_core.messages import HumanMessage, SystemMessage

            route_res = await route_query(current_state)
            current_state.update(route_res)
            route_evt = {
                "event": "route",
                "route_decision": "cascade"
            }
            yield f"data: {json.dumps(route_evt)}\n\n"

            # Check 90s timeout
            if time.time() - start_time > MAX_STREAM_DURATION_SECONDS:
                logger.warning(f"[{request_id}] Stream exceeded {MAX_STREAM_DURATION_SECONDS}s limit after route.")
                yield f"data: {json.dumps({'event': 'error', 'message': 'Stream exceeded 90s duration limit.'})}\n\n"
                yield f"data: {json.dumps({'event': 'done'})}\n\n"
                return

            # 2. Plan Phase
            plan_res = plan_retrieval(current_state)
            current_state.update(plan_res)

            # 3. Retrieve Phase
            retrieval_start_time = time.time()
            retrieve_res = await retrieve_cascade(current_state)
            retrieval_end_time = time.time()
            retrieval_seconds = round(retrieval_end_time - retrieval_start_time, 2)
            current_state.update(retrieve_res)

            # v3 Part 2.3: inject user-provided notes/links as primary grounding
            # chunks "[0] User Provided Context" ahead of the retrieved literature.
            if effective_custom_context:
                user_chunks = _nodes_pkg.build_custom_context_chunks(effective_custom_context)
                if user_chunks:
                    current_state["retrieved_chunks"] = user_chunks + list(current_state.get("retrieved_chunks", []))

            chunks = current_state.get("retrieved_chunks", [])
            sources_summary = [
                {
                    "source": c.get("source"),
                    "source_type": c.get("source_type", "unknown"),
                    "tier": c.get("tier", "LIVE"),
                    "similarity": c.get("similarity"),
                    "is_retracted": c.get("is_retracted", False),
                    "rank": c.get("rank"),
                    "published": c.get("published"),
                    "cited": False
                }
                for c in chunks
            ]
            retrieve_evt = {
                "event": "retrieve",
                "tiers": current_state.get("tiers_fired", []),
                "okf_node_paths": current_state.get("okf_node_paths", []),
                "rag_scores": current_state.get("rag_scores", []),
                "sources": sources_summary
            }
            yield f"data: {json.dumps(retrieve_evt)}\n\n"

            # 4. Citation Events
            for i, chunk in enumerate(chunks):
                rev_status = chunk.get("review_status")
                if not rev_status:
                    if chunk.get("tier") == "OKF":
                        rev_status = "draft" if chunk.get("confidence") == "draft" else "verified"
                    elif chunk.get("tier") == "RAG":
                        rev_status = "draft" if chunk.get("confidence") == "draft" else "verified"
                    elif chunk.get("source_type") == "openalex":
                        rev_status = "scholarly"
                    elif chunk.get("source_type") == "arxiv":
                        rev_status = "preprint"
                    else:
                        rev_status = "unreviewed_web"

                citation_payload = {
                    "event": "citation",
                    "id": i,
                    "title": chunk.get("title") or None,
                    "path": chunk.get("path") or chunk.get("node_path") or None,
                    "url": chunk.get("url") or None,
                    "authors": chunk.get("authors") or None,
                    "year": chunk.get("year") or None,
                    "venue": chunk.get("venue") or None,
                    "snippet": chunk.get("snippet") or chunk.get("content") or None,
                    "source_type": chunk.get("source_type") or "unknown",
                    "tier": chunk.get("tier") or "LIVE",
                    "doi": chunk.get("doi") or None,
                    "arxiv_id": chunk.get("arxiv_id") or None,
                    "is_retracted": bool(chunk.get("is_retracted", False)),
                    "review_status": rev_status,
                    "similarity": chunk.get("similarity"),
                    "cited": False,
                    "rank": chunk.get("rank"),
                    "published": chunk.get("published")
                }
                yield f"data: {json.dumps(citation_payload)}\n\n"

            # Check 90s timeout
            if time.time() - start_time > MAX_STREAM_DURATION_SECONDS:
                logger.warning(f"[{request_id}] Stream exceeded {MAX_STREAM_DURATION_SECONDS}s limit before token synthesis.")
                yield f"data: {json.dumps({'event': 'error', 'message': 'Stream exceeded 90s duration limit.'})}\n\n"
                yield f"data: {json.dumps({'event': 'done'})}\n\n"
                return

            # 5. Token Events
            context = "\n\n".join([
                f"[[c:{i}]] {chunk.get('title', 'Unknown')} ({chunk.get('venue', chunk.get('source', 'Unknown'))})\n{chunk.get('snippet', chunk.get('content', ''))}" 
                for i, chunk in enumerate(chunks)
            ])
            # v3 Part 2.1/2.2: shared mode/discipline-aware synthesis prompt builder
            synthesis_prompt = _nodes_pkg.build_synthesis_prompt(
                current_state.get("research_mode") or RESEARCH_MODE_DEFAULT,
                current_state.get("discipline") or "auto"
            )
            messages = [
                SystemMessage(content=synthesis_prompt),
                HumanMessage(content=f"Query: {current_state['query']}\n\nContext:\n{context}")
            ]
            full_answer = ""
            full_resp = None
            first_token_time = None
            try:
                allowed_pace, pace_msg = await token_rate_limiter.check_and_pace(settings.groq_writer_model, estimated_tokens=1200)
                if not allowed_pace:
                    logger.warning(f"[{request_id}] Pacing limit reached before synthesis.")
                    yield f"data: {json.dumps({'event': 'error', 'message': pace_msg, 'request_id': request_id})}\n\n"
                    yield f"data: {json.dumps({'event': 'done'})}\n\n"
                    return

                async for chunk in _nodes_pkg.current_writer_llm().astream(messages, max_tokens=1200):
                    if time.time() - start_time > MAX_STREAM_DURATION_SECONDS:
                        logger.warning(f"[{request_id}] Stream exceeded 90s limit during token streaming.")
                        break
                    full_resp = chunk if full_resp is None else full_resp + chunk
                    delta = chunk.content
                    if delta:
                        if first_token_time is None and delta.strip():
                            first_token_time = time.time()
                        delta = delta.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
                        delta = delta.replace("【", "[[").replace("】", "]]")
                        full_answer += delta
                        yield f"data: {json.dumps({'event': 'token', 'delta': delta})}\n\n"
            except Exception as stream_err:
                err_str = str(stream_err).lower()
                is_busy = "429" in err_str or "rate limit" in err_str or "ratelimit" in err_str or "timeout" in err_str or "timed out" in err_str or isinstance(stream_err, (asyncio.TimeoutError, httpx.TimeoutException))
                if is_busy:
                    headers = getattr(stream_err, "response", None)
                    hdr_dict = dict(headers.headers) if headers and hasattr(headers, "headers") else {}
                    token_rate_limiter.log_groq_429(settings.groq_writer_model, hdr_dict, str(stream_err))
                    logger.warning(f"[{request_id}] Groq busy mid-stream: {stream_err}")
                    yield f"data: {json.dumps({'event': 'error', 'message': 'ARIA is busy right now, try again in a few minutes', 'request_id': request_id})}\n\n"
                    yield f"data: {json.dumps({'event': 'done'})}\n\n"
                    return
                raise stream_err

            time_to_first_token = round(first_token_time - start_time, 2) if first_token_time else 0.0

            if full_resp:
                synth_finish_reason = full_resp.response_metadata.get("finish_reason") or "stop"
                logger.info(f"Groq [synthesis_stream]: finish_reason='{synth_finish_reason}'")
                token_tracker.record_from_response("synthesis_stream", full_resp, model_name=settings.groq_writer_model, finish_reason=synth_finish_reason)

            from pipeline.nodes import sanitize_answer
            clean_answer = sanitize_answer(full_answer, len(chunks))
            current_state["draft_answer"] = clean_answer
            current_state["answer_final"] = clean_answer

            # Check 90s timeout
            if time.time() - start_time > MAX_STREAM_DURATION_SECONDS:
                logger.warning(f"[{request_id}] Stream exceeded 90s limit before audit phase.")
                yield f"data: {json.dumps({'event': 'error', 'message': 'Stream exceeded 90s duration limit.'})}\n\n"
                yield f"data: {json.dumps({'event': 'done'})}\n\n"
                return

            # 6. Audit Phase
            audit_res = await audit_answer(current_state)
            current_state.update(audit_res)
            final_answer = audit_res.get("answer_final", clean_answer)
            cited_ids = set(int(m) for m in re.findall(r'\[+c:(\d+)\]+', final_answer))
            sources_with_cited = [
                {**s, "cited": (idx in cited_ids)}
                for idx, s in enumerate(sources_summary)
            ]
            audit_evt = {
                "event": "audit",
                "answer_final": final_answer,
                "claims": audit_res.get("claims", []),
                "removed_claims": audit_res.get("removed_claims", []),
                "conflicts": audit_res.get("conflicts_found", []),
                "retractions": audit_res.get("retractions_found", []),
                "confidence": audit_res.get("confidence") if audit_res.get("confidence") is not None else 0.85,
                "tier_agreement": audit_res.get("tier_agreement"),
                "repaired": bool(audit_res.get("repaired", False)),
                "sources": sources_with_cited
            }
            yield f"data: {json.dumps(audit_evt)}\n\n"

            # Query timing & token logging
            total_seconds = round(time.time() - start_time, 2)
            tok_summary = token_tracker.summary()
            logger.info(
                f"[{request_id}] Query Timing: retrieval_seconds={retrieval_seconds}s, "
                f"time_to_first_token={time_to_first_token}s, total_seconds={total_seconds}s"
            )
            logger.info(
                f"[{request_id}] Query completed: model_calls={tok_summary['model_calls']}, "
                f"prompt_tokens={tok_summary['prompt_tokens']}, "
                f"completion_tokens={tok_summary['completion_tokens']}, "
                f"total_tokens={tok_summary['total_tokens']}"
            )

            # 7. Done Event
            yield f"data: {json.dumps({'event': 'done', 'unanswerable': bool(current_state.get('unanswerable', False)), 'timing': {'retrieval_seconds': retrieval_seconds, 'time_to_first_token': time_to_first_token, 'total_seconds': total_seconds}, 'tokens': tok_summary})}\n\n"

        except Exception as e:
            err_str = str(e).lower()
            is_busy = "429" in err_str or "rate limit" in err_str or "ratelimit" in err_str or "timeout" in err_str or "timed out" in err_str or isinstance(e, (asyncio.TimeoutError, httpx.TimeoutException))
            if is_busy:
                logger.warning(f"[{request_id}] Groq busy / rate limit / timeout: {e}")
                yield f"data: {json.dumps({'event': 'error', 'message': 'ARIA is busy right now, try again in a few minutes', 'request_id': request_id})}\n\n"
                yield f"data: {json.dumps({'event': 'done'})}\n\n"
                return
            logger.error(f"[{request_id}] Pipeline execution error: {e}\n{traceback.format_exc()}")
            # Never leak stack traces, file paths, or env details to clients
            yield f"data: {json.dumps({'event': 'error', 'message': 'An internal error occurred during query processing.', 'request_id': request_id})}\n\n"
            yield f"data: {json.dumps({'event': 'done'})}\n\n"
        finally:
            await global_query_queue.release()
            # Always drop the per-request BYOK override (module-global state)
            _nodes_pkg.clear_request_llm_override()

    # SSE Heartbeat wrapper (Part 1.4):
    # Runs the pipeline producer as a background task and forwards its events.
    # Whenever no event is ready (LLM synthesis stalling, slow external APIs, Vercel
    # proxy buffering), a `: heartbeat` SSE comment is emitted every 2 seconds so
    # proxies and browsers never ERR_CONNECTION_RESET before the audit stage.
    async def event_stream():
        sse_queue: asyncio.Queue = asyncio.Queue()
        STREAM_END = "__ARIA_SSE_END__"

        async def producer():
            try:
                async for chunk in pipeline_events():
                    await sse_queue.put(chunk)
            except Exception as producer_exc:
                logger.error(f"[{request_id}] SSE producer failure: {producer_exc}\n{traceback.format_exc()}")
                await sse_queue.put(
                    f"data: {json.dumps({'event': 'error', 'message': 'An internal error occurred during query processing.', 'request_id': request_id})}\n\n"
                )
                await sse_queue.put(f"data: {json.dumps({'event': 'done'})}\n\n")
            finally:
                await sse_queue.put(STREAM_END)

        producer_task = asyncio.create_task(producer())
        try:
            while True:
                try:
                    chunk = await asyncio.wait_for(sse_queue.get(), timeout=2.0)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    continue
                if chunk == STREAM_END:
                    break
                yield chunk
        finally:
            if not producer_task.done():
                producer_task.cancel()
                try:
                    await producer_task
                except (asyncio.CancelledError, Exception):
                    pass

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"X-Content-Type-Options": "nosniff", "X-Request-ID": request_id}
    )

@app.get("/api/test-queue")
async def test_queue_endpoint(request: Request):
    """
    Test-only endpoint that goes through global_query_queue and sleeps 5 s.
    Emits SSE events: 'queued' (if waiting), 'start', 'completed', 'done'.
    """
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    from utils.query_queue import global_query_queue

    async def event_stream():
        queue_events = asyncio.Queue()

        async def on_queued(pos: int):
            await queue_events.put(pos)

        acquire_task = asyncio.create_task(
            global_query_queue.acquire(request_id, on_queued=on_queued)
        )

        while not acquire_task.done():
            try:
                pos = await asyncio.wait_for(queue_events.get(), timeout=0.1)
                yield f"data: {json.dumps({'event': 'queued', 'position': pos, 'request_id': request_id, 'timestamp': round(time.time(), 3)})}\n\n"
            except asyncio.TimeoutError:
                pass

        while not queue_events.empty():
            pos = queue_events.get_nowait()
            yield f"data: {json.dumps({'event': 'queued', 'position': pos, 'request_id': request_id, 'timestamp': round(time.time(), 3)})}\n\n"

        slot_acquired = await acquire_task
        if not slot_acquired:
            yield f"data: {json.dumps({'event': 'error', 'message': 'Queue wait timeout', 'request_id': request_id, 'timestamp': round(time.time(), 3)})}\n\n"
            yield f"data: {json.dumps({'event': 'done', 'timestamp': round(time.time(), 3)})}\n\n"
            return

        try:
            yield f"data: {json.dumps({'event': 'start', 'request_id': request_id, 'timestamp': round(time.time(), 3)})}\n\n"
            logger.info(f"[{request_id}] Test-queue slot acquired. Sleeping 5 seconds...")
            await asyncio.sleep(5.0)
            yield f"data: {json.dumps({'event': 'completed', 'request_id': request_id, 'timestamp': round(time.time(), 3)})}\n\n"
            yield f"data: {json.dumps({'event': 'done', 'timestamp': round(time.time(), 3)})}\n\n"
        finally:
            await global_query_queue.release()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"X-Content-Type-Options": "nosniff", "X-Request-ID": request_id}
    )

@app.post("/api/feedback")
async def submit_feedback(req: FeedbackRequest, request: Request):
    """
    Stores feedback into Supabase feedback table.
    Enforces same validation and limits:
    - 8 KB body size
    - Supabase JWT or anonymous 5/hr rate limit
    - UUID thread_id
    - Verdict enum validation
    - String length limits
    """
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

    # 1. Parameter Validation
    validate_uuid(req.thread_id, "thread_id")
    if not req.message_id or len(req.message_id) > 100:
        raise HTTPException(status_code=400, detail="message_id must be between 1 and 100 characters.")
    
    clean_verdict = req.verdict.strip().lower()
    if clean_verdict not in ALLOWED_VERDICTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid verdict '{req.verdict}'. Allowed values: {', '.join(sorted(ALLOWED_VERDICTS))}."
        )

    if req.query and len(req.query.strip()) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=400, detail=f"query exceeds {MAX_QUERY_LENGTH} characters.")
    if req.route_engine and len(req.route_engine.strip()) > 50:
        raise HTTPException(status_code=400, detail="route_engine exceeds 50 characters.")

    # 2. Authentication & Rate Limiting
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else None
    client_ip = get_client_ip(request)

    is_authenticated = False
    if settings.jwt_auth_enabled and token:
        user_payload = await verify_supabase_jwt(token)
        if user_payload:
            is_authenticated = True

    if not is_authenticated:
        allowed, retry_after, limit_msg = check_anonymous_rate_limit(client_ip, is_feedback=True)
        if not allowed:
            return Response(
                content=limit_msg,
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                media_type="text/plain",
                headers={
                    "Retry-After": str(retry_after),
                    "X-Content-Type-Options": "nosniff",
                    "X-Request-ID": request_id
                }
            )
        record_anonymous_request(client_ip, is_feedback=True)

    # 3. Store Feedback
    from utils.supabase_client import insert_feedback
    payload = {
        "message_id": req.message_id,
        "thread_id": req.thread_id,
        "verdict": clean_verdict,
        "query": req.query,
        "tiers": req.tiers or [],
        "route_engine": req.route_engine
    }
    success = await insert_feedback(payload)
    if not success:
        logger.error(f"[{request_id}] Failed to insert feedback into Supabase.")
        raise HTTPException(status_code=500, detail="Failed to store feedback in database.")
    return {"status": "stored", "request_id": request_id}


# ==============================================================================
# VISUAL CONCEPT CARD, MULTI-PAGE PDF REPORT EXPORT & OKF GRAPH ENDPOINTS
# ==============================================================================

# Domain-agnostic academic-integrity blocklist for Wikipedia visual candidates.
# Matches title, description, extract, or category names on ANY topic.
MEDIA_REJECT_PATTERNS = (
    "clothing", "fashion", "costume", "album", "film", "movie", "television",
    "tv series", "telenovela", "song", "band", "actor", "actress", "celebrity",
    "reality show", "video game", "board game", "anime series", "manga series",
    "sports team", "football club", "company", "brand", "retailer", "shopping",
    "shopping mall", "store", "outlet", "hotel", "restaurant", "tour "
)


def _extract_golden_terms(*texts: str) -> List[str]:
    """Universal content-term extractor used for visual-concept verification."""
    from pipeline.nodes import STOPWORDS
    blob = " ".join(t for t in texts if t).lower()
    terms = []
    for w in re.findall(r'\b[a-z0-9_-]{3,}\b', blob):
        if w in STOPWORDS or w in terms:
            continue
        terms.append(w)
    return terms[:25]


def _clean_core_topic(query: str) -> str:
    topic = query.strip()
    for prefix in [
        "what is the", "what are the", "what is a", "what is an", "what is", "what are",
        "how does", "how do", "how did", "explain the", "explain", "describe",
        "tell me about", "overview of", "analyze the", "analyze", "discuss"
    ]:
        if topic.lower().startswith(prefix):
            topic = topic[len(prefix):].strip(" ?.:")
            break
    return re.sub(r'\s+', ' ', topic).strip(" ?.:,")


def _validate_visual_candidate(golden_terms: List[str],
                              title: str, categories: List[str],
                              extract: str, description: str) -> tuple:
    """
    Universal visual verification (Part 1.3):
    1. Reject non-academic/pop-culture/NSFW pages by title, description, categories,
       and (for the strongest signals) the intro extract.
    2. Require at least 2 key terms from the disambiguated academic query in the
       article's first paragraph.
    Returns the DOMINANT failure reason, or "" when the candidate passes.
    """
    title_l = (title or "").lower()
    desc_l = (description or "").lower()
    category_l = " ".join(categories).lower()
    extract_l = (extract or "").lower()

    # Strong signals: anywhere, including the article intro
    if "disambiguation" in title_l or "may refer to" in extract_l[:200]:
        return "disambiguation page"
    if any(p in f"{title_l} {desc_l} {extract_l[:400]}" for p in ("fetish", "erotic", "pornograph", "lingerie")):
        return "nsfw page pattern"

    # Pop-culture / commercial signals: title, description, and categories only
    # (substring match also handles plurals like 'Films' / 'Video game characters'),
    # so legitimate technical subjects (e.g. thin-film physics) are never wrongly rejected.
    media_blob = f" {title_l} {desc_l} {category_l} "
    for pattern in MEDIA_REJECT_PATTERNS:
        p = pattern.strip()
        if f" {p} " in media_blob or f"{p}s" in f" {media_blob} ":
            return f"non-academic page pattern '{p}'"

    if not golden_terms:
        return ""
    matched = sum(1 for t in golden_terms if t in extract_l or t in title_l or t in desc_l)
    if matched < 2:
        return f"intro term overlap too low ({matched}/{len(golden_terms)})"
    return ""


async def _reformulate_for_visual(query: str) -> Dict[str, Any]:
    """Disambiguates the visual-card query via the universal reformulator under a strict timeout."""
    try:
        from pipeline.nodes import reformulate_query
        return await asyncio.wait_for(reformulate_query(query), timeout=7.0)
    except Exception as e:
        logger.warning(f"visual-card reformulation fallback: {type(e).__name__}")
        from pipeline.nodes import heuristic_reformulation
        return heuristic_reformulation(query)


@app.get("/api/visual-card")
async def get_visual_card(query: str):
    """
    Given a query or technical concept, resolves it to the disambiguated canonical
    academic subject, queries Wikipedia for a verified technical diagram/thumbnail,
    and applies the domain-agnostic visual verification gate (Part 1.3):
      - candidates filtered by pop-culture/NSFW/commercial patterns in title,
        extract, and categories
      - requires >=2 key terms from the academic query in the article intro
    If no strictly verified image passes, returns found: False / image_url: None so
    the frontend falls back to the Live Interactive Citation & Entailment Topology Graph.
    """
    empty = {"found": False, "image_url": None}
    if not query or not query.strip():
        return empty

    headers = {
        "User-Agent": "ARIA-Scientific-Assistant/2.0 (https://aria.swarajchattaraj.tech; contact@swarajchattaraj.tech)"
    }

    # 1. Universal disambiguation (never trust the raw short string)
    plan = await _reformulate_for_visual(query)
    canonical_topic = plan.get("canonical_topic") or _clean_core_topic(query) or query.strip()
    wikipedia_title = plan.get("wikipedia_exact_title") or ""
    academic_q = plan.get("academic_search_query") or ""
    golden_terms = _extract_golden_terms(academic_q, canonical_topic)

    # Candidate article titles: exact reformulated title first, then heuristic topic
    candidate_titles: List[str] = []
    for t in [wikipedia_title, _clean_core_topic(query), query.strip()]:
        if t and t not in candidate_titles:
            candidate_titles.append(t)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # 2. Expand candidates with opensearch using the disambiguated topic
            try:
                search_url = (
                    f"https://en.wikipedia.org/w/api.php?action=opensearch"
                    f"&search={urllib.parse.quote(canonical_topic)}&limit=4&namespace=0&format=json"
                )
                s_resp = await client.get(search_url, headers=headers)
                if s_resp.status_code == 200:
                    s_data = s_resp.json()
                    for t in (s_data[1] if len(s_data) > 1 else []):
                        if t not in candidate_titles:
                            candidate_titles.append(t)
            except Exception as e:
                logger.warning(f"visual-card opensearch failed: {e}")

            # 3. For each candidate: fetch intro extract + categories, verify, then get image
            for title in candidate_titles[:6]:
                tl = title.lower()
                if "(disambiguation)" in tl:
                    continue
                slug = urllib.parse.quote(title.replace(' ', '_'))
                try:
                    # 3a. Intro extract + categories in a single call
                    val_url = (
                        f"https://en.wikipedia.org/w/api.php?action=query&format=json"
                        f"&titles={urllib.parse.quote(title)}&prop=extracts%7Ccategories"
                        f"&exintro=1&explaintext=1&cllimit=25&clshow=!hidden&redirects=1"
                    )
                    v_resp = await client.get(val_url, headers=headers)
                    if v_resp.status_code != 200:
                        continue
                    v_data = v_resp.json()
                    pages = (v_data.get("query") or {}).get("pages") or {}
                    page_obj = next(iter(pages.values()), None)
                    if not page_obj or page_obj.get("missing") is not None:
                        continue
                    extract = page_obj.get("extract") or ""
                    categories = [
                        c.get("title", "").replace("Category:", "").replace("_", " ")
                        for c in page_obj.get("categories") or []
                    ]
                    resolved_title = page_obj.get("title") or title

                    # 3b. Universal visual verification gate
                    reject_reason = _validate_visual_candidate(
                        {}, golden_terms, resolved_title, categories, extract, ""
                    )
                    if reject_reason:
                        logger.info(f"visual-card candidate rejected ({reject_reason}): {resolved_title}")
                        continue

                    # 3c. Fetch the REST summary for thumbnail / image URLs
                    summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}"
                    resp = await client.get(summary_url, headers=headers)
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    img = data.get("thumbnail") or data.get("originalimage")
                    img_src = (img or {}).get("source")
                    if not img_src:
                        # Google-provided page may exist but has no image -> not an error
                        original = (data.get("originalimage") or {}).get("source")
                        if not original:
                            continue
                        img_src = original

                    return {
                        "found": True,
                        "canonical_topic": canonical_topic,
                        "wikipedia_exact_title": resolved_title,
                        "title": data.get("title") or resolved_title,
                        "description": data.get("description"),
                        "image_url": img_src,
                        "thumbnail_url": (data.get("thumbnail") or {}).get("source"),
                        "original_image_url": (data.get("originalimage") or {}).get("source"),
                        "extract": extract or data.get("extract"),
                        "page_url": (data.get("content_urls") or {}).get("desktop", {}).get("page")
                    }
                except Exception as e:
                    logger.debug(f"visual-card candidate '{title}' failed: {e}")
                    continue
    except Exception as e:
        logger.warning(f"visual-card outer failure: {e}")

    # No strictly verified technical diagram found -> explicit null image
    return {
        "found": False,
        "image_url": None,
        "canonical_topic": canonical_topic,
        "wikipedia_exact_title": wikipedia_title
    }


class ExportPdfRequest(BaseModel):
    query: str
    answer_final: str
    canonical_topic: Optional[str] = None
    confidence: Optional[float] = 0.85
    tiers: Optional[List[str]] = []
    claims: Optional[List[Dict[str, Any]]] = []
    sources: Optional[List[Dict[str, Any]]] = []
    timing: Optional[Dict[str, Any]] = None
    tokens: Optional[Dict[str, Any]] = None
    # v3 Part 1: export toggles from the Settings Control Center
    full_ledger: bool = True
    clickable_urls: bool = True

@app.post("/api/export/pdf")
async def export_pdf_report(req: ExportPdfRequest):
    """
    Generates and returns a multi-page PDF research report via PyMuPDF (fitz).
    """
    from utils.pdf_generator import generate_research_pdf
    try:
        pdf_bytes = generate_research_pdf(
            query=req.query,
            answer_final=req.answer_final,
            confidence=req.confidence if req.confidence is not None else 0.85,
            tiers=req.tiers or [],
            claims=req.claims or [],
            sources=req.sources or [],
            timing=req.timing,
            tokens=req.tokens,
            canonical_topic=req.canonical_topic,
            full_ledger=req.full_ledger,
            clickable_urls=req.clickable_urls,
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="aria-research-report.pdf"',
                "X-Content-Type-Options": "nosniff"
            }
        )
    except Exception as e:
        logger.error(f"PDF export generation failed: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF report: {e}")


@app.get("/api/okf/graph")
async def get_okf_graph():
    """
    Parses all 25 OKF markdown files in data/okf and returns nodes and directional related edges.
    """
    from pipeline.okf_parser import parse_okf_file
    import os
    
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "okf")
    if not os.path.isdir(data_dir):
        data_dir = "D:/aria/data/okf"
        
    files = [f for f in os.listdir(data_dir) if f.endswith('.md')] if os.path.isdir(data_dir) else []
    valid_files = set(files)
    nodes = []
    edges = []
    
    for f in sorted(files):
        path = os.path.join(data_dir, f)
        try:
            note = parse_okf_file(path)
            meta = note.get("metadata", {})
            content = note.get("content", "")
            updated_val = meta.get("updated", "")
            updated_str = updated_val.isoformat() if hasattr(updated_val, "isoformat") else str(updated_val)
            nodes.append({
                "id": f,
                "note_id": meta.get("id") or f.replace('.md', ''),
                "title": meta.get("title") or f,
                "type": meta.get("type", "note"),
                "topic": meta.get("topic", []),
                "confidence": meta.get("confidence", "verified"),
                "source": meta.get("source", ""),
                "updated": updated_str,
                "snippet_preview": content[:300].strip(),
                "content": content
            })
            for r in meta.get("related", []):
                r_f = r if r.endswith('.md') else f"{r}.md"
                if r_f in valid_files:
                    edges.append({"source": f, "target": r_f})
        except Exception as err:
            logger.warning(f"Error parsing note {f}: {err}")
            
    return {
        "nodes": nodes,
        "edges": edges,
        "total_nodes": len(nodes),
        "total_edges": len(edges)
    }

