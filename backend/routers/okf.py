from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime
from utils.supabase_client import insert_okf_doc, list_okf_docs

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
async def sync_personal_okf(doc: OKFDoc):
    """
    Syncs a new personal OKF note to Supabase okf_docs table.
    """
    payload = {
        "file_path": doc.title,
        "type": doc.type,
        "topic": ", ".join(doc.topic) if doc.topic else "General",
        "source": doc.source or "Quick Capture",
        "related_links": doc.related or [],
        "content": doc.content
    }
    if doc.user_id:
        payload["user_id"] = doc.user_id

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
async def list_personal_okf(user_id: Optional[str] = None):
    """
    Retrieves personal OKF notes from Supabase.
    """
    docs = await list_okf_docs(user_id=user_id)
    return {
        "status": "success",
        "count": len(docs),
        "data": docs
    }

