from __future__ import annotations

from pathlib import Path


MAX_UPLOAD_MB = 15
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_PDF_PAGES = 80


def validate_pdf_upload(name: str, size: int) -> None:
    if not name or Path(name).name != name:
        raise ValueError("PDF filename is invalid.")
    if not name.lower().endswith(".pdf"):
        raise ValueError("Only PDF files are accepted.")
    if size <= 0:
        raise ValueError("PDF file is empty.")
    if size > MAX_UPLOAD_BYTES:
        raise ValueError(f"PDF is too large. Limit is {MAX_UPLOAD_MB} MB per file.")


def safe_temp_pdf_path(path: Path) -> Path:
    resolved = path.resolve()
    if resolved.suffix.lower() != ".pdf":
        raise ValueError("Temporary upload path must be a PDF.")
    return resolved
