from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import datetime

router = APIRouter(prefix="/api/export", tags=["export"])

class Citation(BaseModel):
    title: str
    authors: Optional[List[str]] = None
    year: Optional[int] = None
    url: Optional[str] = None
    doi: Optional[str] = None
    source_tier: str # 'OKF', 'RAG', 'LIVE'

class ExportRequest(BaseModel):
    citations: List[Citation]
    format: str # 'bibtex' or 'ris'

@router.post("/")
def generate_export(req: ExportRequest):
    if req.format.lower() == 'bibtex':
        return {"content": generate_bibtex(req.citations)}
    elif req.format.lower() == 'ris':
        return {"content": generate_ris(req.citations)}
    else:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'bibtex' or 'ris'.")

def generate_bibtex(citations: List[Citation]) -> str:
    bibtex_str = ""
    for idx, cit in enumerate(citations):
        ref_id = f"ref_{idx}_{datetime.datetime.now().year}"
        author_str = " and ".join(cit.authors) if cit.authors else "Unknown"
        bibtex_str += f"@misc{{{ref_id},\n"
        bibtex_str += f"  title = {{{cit.title}}},\n"
        bibtex_str += f"  author = {{{author_str}}},\n"
        if cit.year:
            bibtex_str += f"  year = {{{cit.year}}},\n"
        if cit.doi:
            bibtex_str += f"  doi = {{{cit.doi}}},\n"
        if cit.url:
            bibtex_str += f"  url = {{{cit.url}}},\n"
        bibtex_str += f"  note = {{Retrieved from ARIA ({cit.source_tier} tier)}},\n"
        bibtex_str += "}\n\n"
    return bibtex_str

def generate_ris(citations: List[Citation]) -> str:
    ris_str = ""
    for cit in citations:
        ris_str += "TY  - GEN\n"
        ris_str += f"TI  - {cit.title}\n"
        if cit.authors:
            for au in cit.authors:
                ris_str += f"AU  - {au}\n"
        if cit.year:
            ris_str += f"PY  - {cit.year}\n"
        if cit.doi:
            ris_str += f"DO  - {cit.doi}\n"
        if cit.url:
            ris_str += f"UR  - {cit.url}\n"
        ris_str += f"N1  - Retrieved from ARIA ({cit.source_tier} tier)\n"
        ris_str += "ER  - \n\n"
    return ris_str
