from fastapi import FastAPI, Depends, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import json
import logging
from config import settings

from routers import export, okf

# Initialize FastAPI
app = FastAPI(title="ARIA API", version="2.0.0")

# Include routers
app.include_router(export.router)
app.include_router(okf.router)

# Setup CORS
origins = settings.get_allowed_origins_list()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class QueryRequest(BaseModel):
    query: str
    thread_id: Optional[str] = None
    user_id: Optional[str] = None
    compare_mode: bool = False

class FeedbackRequest(BaseModel):
    query_log_id: str
    is_positive: bool
    comments: Optional[str] = None

@app.get("/health")
def health_check():
    return {"status": "healthy", "version": "2.0.0"}

@app.post("/api/query")
async def query_pipeline(req: QueryRequest, x_api_key: str = Header(None)):
    """
    Main endpoint for ARIA query pipeline.
    Streams the response back to the client.
    """
    # TODO: Validate x_api_key against Supabase
    
    # Placeholder for streaming LangGraph pipeline
    async def event_stream():
        yield f"data: {json.dumps({'event': 'start', 'dristi_engine': 'V1'})}\n\n"
        yield f"data: {json.dumps({'event': 'retrieve', 'tiers': ['OKF']})}\n\n"
        yield f"data: {json.dumps({'event': 'token', 'text': 'This is a mocked streaming response from ARIA v2. '})}\n\n"
        yield f"data: {json.dumps({'event': 'citation', 'tier': 'OKF', 'source': 'okf_docs/example.md', 'id': 1})}\n\n"
        yield f"data: {json.dumps({'event': 'done'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

@app.post("/api/feedback")
def submit_feedback(req: FeedbackRequest):
    """
    Pipes feedback into Dristi's /feedback endpoint for V1/V2 retraining.
    """
    # TODO: Relay to DRISTI_URL/feedback
    return {"status": "received"}
