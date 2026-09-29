from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/okf", tags=["okf"])

class OKFDoc(BaseModel):
    title: str
    content: str
    type: str # definition, finding, note, source-summary, method
    topic: List[str]
    source: Optional[str] = None
    related: Optional[List[str]] = []
    owner: str = "personal"
    confidence: str = "draft"

@router.post("/sync")
def sync_personal_okf(doc: OKFDoc):
    """
    Syncs a new personal OKF note to Supabase.
    (Placeholder: actual Supabase client integration required)
    """
    doc_id = str(uuid.uuid4())
    
    # Example logic that would interface with the supabase client:
    # supabase.table("okf_docs").insert({ ... }).execute()
    
    return {
        "status": "synced",
        "doc_id": doc_id,
        "message": f"Saved '{doc.title}' to personal OKF workspace."
    }

@router.get("/list")
def list_personal_okf(user_id: str):
    """
    Retrieves the user's personal OKF notes.
    """
    # Placeholder for: supabase.table("okf_docs").select("*").eq("owner", "personal").execute()
    return {
        "status": "success",
        "data": [
            {
                "id": str(uuid.uuid4()),
                "title": "Example Personal Note",
                "type": "note",
                "confidence": "draft",
                "created_at": datetime.now().isoformat()
            }
        ]
    }
