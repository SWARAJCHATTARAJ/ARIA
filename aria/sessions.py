from __future__ import annotations

import json
import os
import re
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .core import Evidence, ResearchResult


SESSION_DIR = Path(".aria_sessions")


def admin_user_id() -> str:
    return os.getenv("ARIA_ADMIN_USER_ID", "swaraj_admin").strip() or "swaraj_admin"


def normalize_user_id(user_id: str | None) -> str | None:
    user_id = (user_id or "").strip()
    return user_id or None


def is_admin_user(user_id: str | None) -> bool:
    normalized = normalize_user_id(user_id)
    return normalized in {admin_user_id(), "admin", "owner"}


def can_access_session(session_user: str | None, requester_user_id: str | None) -> bool:
    requester_user_id = normalize_user_id(requester_user_id)
    if is_admin_user(requester_user_id):
        return True
    if not requester_user_id:
        return False
    return session_user == requester_user_id


def is_valid_session_id(session_id: str) -> bool:
    return bool(re.fullmatch(r"[a-f0-9]{32}", session_id or ""))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def result_to_dict(result: ResearchResult) -> dict:
    return {
        "question": result.question,
        "plan": result.plan,
        "answer": result.answer,
        "verification": result.verification,
        "evidence": [asdict(item) for item in result.evidence],
        "events": result.events,
        "metrics": result.metrics,
    }


def result_from_dict(data: dict) -> ResearchResult:
    evidence = [Evidence(**item) for item in data.get("evidence", [])]
    return ResearchResult(
        question=data.get("question", ""),
        plan=list(data.get("plan", [])),
        answer=data.get("answer", ""),
        verification=data.get("verification", ""),
        evidence=evidence,
        events=list(data.get("events", [])),
        metrics=dict(data.get("metrics", {})),
    )


def save_session(result: ResearchResult, session_dir: Path = SESSION_DIR, user_id: str | None = None) -> dict:
    session_dir.mkdir(parents=True, exist_ok=True)
    created_at = utc_now_iso()
    session_id = uuid4().hex
    payload = {
        "id": session_id,
        "user_id": user_id,
        "created_at": created_at,
        "title": result.question[:90],
        "result": result_to_dict(result),
    }
    (session_dir / f"{created_at.replace(':', '-')}_{session_id}.json").write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8",
    )
    return payload


def list_sessions(session_dir: Path = SESSION_DIR, limit: int = 25, user_id: str | None = None) -> list[dict]:
    if not session_dir.exists():
        return []

    limit = max(1, min(int(limit), 200))
    requester_user_id = normalize_user_id(user_id)
    sessions: list[dict] = []
    for path in sorted(session_dir.glob("*.json"), reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
            
        session_user = data.get("user_id")
        if not can_access_session(session_user, requester_user_id):
            continue

        sessions.append(
            {
                "id": data.get("id", path.stem),
                "created_at": data.get("created_at", ""),
                "title": data.get("title") or data.get("result", {}).get("question", "Untitled session"),
                "path": str(path),
                "user_id": session_user,
            }
        )
        if len(sessions) >= limit:
            break
    return sessions


def clear_sessions(session_dir: Path = SESSION_DIR, user_id: str | None = None) -> None:
    if not session_dir.exists():
        return

    requester_user_id = normalize_user_id(user_id)
    for path in session_dir.glob("*.json"):
        try:
            if is_admin_user(requester_user_id):
                path.unlink()
            else:
                data = json.loads(path.read_text(encoding="utf-8"))
                session_user = data.get("user_id")
                if can_access_session(session_user, requester_user_id):
                    path.unlink()
        except OSError:
            pass


def find_session_path(
    session_id: str,
    session_dir: Path = SESSION_DIR,
    user_id: str | None = None,
) -> Path | None:
    if not is_valid_session_id(session_id):
        return None

    matching_files = list(session_dir.glob(f"*_{session_id}.json"))
    if not matching_files:
        return None

    path = matching_files[0]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    if not can_access_session(data.get("user_id"), user_id):
        return None
    return path


def load_session(path: str | Path) -> ResearchResult:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return result_from_dict(data.get("result", {}))
