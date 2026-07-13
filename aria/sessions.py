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
    # If the session has no owner, make it accessible to everyone who has a valid profile
    if not session_user:
        return True
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
        "cached": getattr(result, "cached", False),
        "history": getattr(result, "history", []),
        "validation_warning": getattr(result, "validation_warning", False),
        "recurring_interval": getattr(result, "recurring_interval", None),
        "last_run_at": getattr(result, "last_run_at", None),
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
        cached=data.get("cached", False),
        history=list(data.get("history", [])),
        validation_warning=data.get("validation_warning", False),
        recurring_interval=data.get("recurring_interval", None),
        last_run_at=data.get("last_run_at", None),
    )


def is_db_mode() -> bool:
    db_url = os.getenv("DATABASE_URL")
    return bool(db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")))


class DatabaseSessionPath:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.stem = session_id
        self.name = session_id

    def read_text(self, encoding="utf-8") -> str:
        import json
        from .auth import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, user_id, created_at, title, result FROM sessions WHERE id = %s", (self.session_id,))
                row = cur.fetchone()
                if not row:
                    raise FileNotFoundError(f"Session {self.session_id} not found in database.")
                created_at_val = row[2]
                if hasattr(created_at_val, "isoformat"):
                    created_at_str = created_at_val.isoformat()
                else:
                    created_at_str = str(created_at_val)
                res_data = row[4]
                if isinstance(res_data, str):
                    res_data = json.loads(res_data)
                payload = {
                    "id": row[0],
                    "user_id": row[1],
                    "created_at": created_at_str,
                    "title": row[3],
                    "result": res_data,
                }
                return json.dumps(payload, indent=2)
        finally:
            conn.close()

    def __str__(self) -> str:
        return f"db_session_{self.session_id}"
        
    def __fspath__(self) -> str:
        return f"db_session_{self.session_id}"


def save_session(result: ResearchResult, session_dir: Path = SESSION_DIR, user_id: str | None = None) -> dict:
    if is_db_mode() and session_dir == SESSION_DIR:
        from .auth import get_db_connection
        
        created_at = utc_now_iso()
        session_id = uuid4().hex
        payload = {
            "id": session_id,
            "user_id": user_id,
            "created_at": created_at,
            "title": result.question[:90],
            "result": result_to_dict(result),
        }
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO sessions (id, user_id, title, created_at, result)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (session_id, user_id, payload["title"], created_at, json.dumps(payload["result"]))
                )
                conn.commit()
        finally:
            conn.close()
        return payload
    else:
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
    if is_db_mode() and session_dir == SESSION_DIR:
        from .auth import get_db_connection
        
        limit = max(1, min(int(limit), 200))
        requester_user_id = normalize_user_id(user_id)
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                if is_admin_user(requester_user_id):
                    cursor.execute(
                        """
                        SELECT id, created_at, title, user_id FROM sessions
                        ORDER BY created_at DESC LIMIT %s
                        """,
                        (limit,)
                    )
                else:
                    cursor.execute(
                        """
                        SELECT id, created_at, title, user_id FROM sessions
                        WHERE user_id = %s OR user_id IS NULL OR user_id = ''
                        ORDER BY created_at DESC LIMIT %s
                        """,
                        (requester_user_id, limit)
                    )
                rows = cursor.fetchall()
                sessions = []
                for row in rows:
                    created_at_val = row[1]
                    if hasattr(created_at_val, "isoformat"):
                        created_at_str = created_at_val.isoformat()
                    else:
                        created_at_str = str(created_at_val)
                        
                    sessions.append({
                        "id": row[0],
                        "created_at": created_at_str,
                        "title": row[2] or "Untitled session",
                        "path": f"db_session_{row[0]}",
                        "user_id": row[3]
                    })
                return sessions
        finally:
            conn.close()
    else:
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
    if is_db_mode() and session_dir == SESSION_DIR:
        from .auth import get_db_connection
        requester_user_id = normalize_user_id(user_id)
        
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                if is_admin_user(requester_user_id):
                    cursor.execute("DELETE FROM sessions")
                else:
                    if requester_user_id:
                        cursor.execute("DELETE FROM sessions WHERE user_id = %s", (requester_user_id,))
                conn.commit()
        finally:
            conn.close()
    else:
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
                    if session_user and session_user == requester_user_id:
                        path.unlink()
            except OSError:
                pass


def find_session_path(
    session_id: str,
    session_dir: Path = SESSION_DIR,
    user_id: str | None = None,
) -> Path | DatabaseSessionPath | None:
    if is_db_mode() and session_dir == SESSION_DIR:
        if not is_valid_session_id(session_id):
            return None
            
        from .auth import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as cursor:
                cursor.execute("SELECT user_id FROM sessions WHERE id = %s", (session_id,))
                row = cursor.fetchone()
                if not row:
                    return None
                session_user = row[0]
                if not can_access_session(session_user, user_id):
                    return None
                return DatabaseSessionPath(session_id)
        finally:
            conn.close()
    else:
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


def load_session(path: str | Path | DatabaseSessionPath) -> ResearchResult:
    if isinstance(path, DatabaseSessionPath):
        from .auth import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT result FROM sessions WHERE id = %s", (path.session_id,))
                row = cur.fetchone()
                if not row:
                    raise FileNotFoundError(f"Session {path.session_id} not found in database.")
                res_data = row[0]
                if isinstance(res_data, str):
                    res_data = json.loads(res_data)
                return result_from_dict(res_data)
        finally:
            conn.close()
    elif str(path).startswith("db_session_"):
        session_id = str(path).split("_", 2)[2]
        from .auth import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT result FROM sessions WHERE id = %s", (session_id,))
                row = cur.fetchone()
                if not row:
                    raise FileNotFoundError(f"Session {session_id} not found in database.")
                res_data = row[0]
                if isinstance(res_data, str):
                    res_data = json.loads(res_data)
                return result_from_dict(res_data)
        finally:
            conn.close()
    else:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return result_from_dict(data.get("result", {}))
