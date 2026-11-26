from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Optional
import uuid
from utils.supabase_client import insert_okf_doc, list_okf_docs
from utils.api_security import require_authenticated_user

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

@router.post("/sync")
async def sync_personal_okf(doc: OKFDoc, request: Request):
    """
    Syncs a new personal OKF note to Supabase okf_docs table.
    Requires authenticated user.
    """
    user_payload = await require_authenticated_user(request)
    user_id = user_payload["verified_user_id"]

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
    return {
        "status": "pending",
        "doc_id": str(uuid.uuid4()),
        "message": f"Saved '{doc.title}'."
    }

@router.get("/list")
async def list_personal_okf(request: Request):
    """
    Retrieves personal OKF notes from Supabase for the authenticated user.
    """
    user_payload = await require_authenticated_user(request)
    user_id = user_payload["verified_user_id"]

    docs = await list_okf_docs(user_id=user_id)
    return {
        "status": "success",
        "count": len(docs),
        "data": docs
    }

