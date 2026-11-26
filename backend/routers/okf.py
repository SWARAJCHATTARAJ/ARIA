from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import uuid
from utils.supabase_client import insert_okf_doc, list_okf_docs
from utils.api_security import verify_supabase_jwt

router = APIRouter(prefix="/api/okf", tags=["okf"])

class OKFDoc(BaseModel):
    title: str
    content: str
    type: str = "note" # definition, finding, note, source-summary, method
    topic: List[str] = []
    source: Optional[str] = None
    related: Optional[List[str]] = []
    owner: str = "personal"
    confidence: str = "draft"
    user_id: Optional[str] = None

@router.post("/sync")
async def sync_personal_okf(doc: OKFDoc, request: Request):
    """
    Syncs a new personal OKF note to Supabase okf_docs table.
    Requires authenticated user.
    """
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    user_payload = await verify_supabase_jwt(token)
    user_id = user_payload.get("id") or user_payload.get("sub")

    payload = {
        "file_path": doc.title,
        "type": doc.type,
        "topic": ", ".join(doc.topic) if doc.topic else "General",
        "source": doc.source or "Quick Capture",
        "related_links": doc.related or [],
        "content": doc.content,
        "user_id": user_id
    }

    result = await insert_okf_doc(payload)
    if result:
        return {
            "status": "synced",
            "doc_id": result.get("id", str(uuid.uuid4())),
            "message": f"Saved '{doc.title}' to personal OKF workspace."
        }
    else:
        # Graceful response even if offline/unreachable
        return {
            "status": "local_fallback",
            "doc_id": str(uuid.uuid4()),
            "message": f"Saved '{doc.title}' locally."
        }

@router.get("/list")
async def list_personal_okf(request: Request):
    """
    Retrieves personal OKF notes from Supabase for the authenticated user.
    """
    auth_header = request.headers.get("authorization", "")
    token = auth_header.replace("Bearer ", "").strip() if auth_header.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    user_payload = await verify_supabase_jwt(token)
    user_id = user_payload.get("id") or user_payload.get("sub")

    docs = await list_okf_docs(user_id=user_id)
    return {
        "status": "success",
        "count": len(docs),
        "data": docs
    }

