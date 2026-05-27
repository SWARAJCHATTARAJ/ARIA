from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .core import Evidence, ResearchResult


SESSION_DIR = Path(".aria_sessions")


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


def save_session(result: ResearchResult, session_dir: Path = SESSION_DIR) -> dict:
    session_dir.mkdir(parents=True, exist_ok=True)
    created_at = utc_now_iso()
    session_id = uuid4().hex
    payload = {
        "id": session_id,
        "created_at": created_at,
        "title": result.question[:90],
        "result": result_to_dict(result),
    }
    (session_dir / f"{created_at.replace(':', '-')}_{session_id}.json").write_text(
        json.dumps(payload, indent=2),
        encoding="utf-8",
    )
    return payload


def list_sessions(session_dir: Path = SESSION_DIR, limit: int = 25) -> list[dict]:
    if not session_dir.exists():
        return []

    sessions: list[dict] = []
    for path in sorted(session_dir.glob("*.json"), reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        sessions.append(
            {
                "id": data.get("id", path.stem),
                "created_at": data.get("created_at", ""),
                "title": data.get("title") or data.get("result", {}).get("question", "Untitled session"),
                "path": str(path),
            }
        )
        if len(sessions) >= limit:
            break
    return sessions


def load_session(path: str | Path) -> ResearchResult:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return result_from_dict(data.get("result", {}))
