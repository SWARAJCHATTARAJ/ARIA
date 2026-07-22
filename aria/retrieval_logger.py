"""
aria/retrieval_logger.py
Lightweight async retrieval logger and quality observability for ARIA.
"""

from __future__ import annotations

import json
import logging
import os
import re

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .core import Evidence

logger = logging.getLogger("aria.retrieval_logger")

LOG_FILE_PATH = Path(".aria_sessions/retrieval_logs.jsonl")
DEFAULT_THRESHOLD = 0.35
_LOG_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="aria_retrieval_logger")

# =====================================================================
# TODO: ALERTING THRESHOLD (Future-Proofing Config Stub)
# =====================================================================
# Config stub for future automated alert when retrieval rejection rate
# exceeds threshold (e.g. > 30% in a rolling window of 50 queries).
#
# ALERT_CONFIG = {
#     "enabled": False,
#     "rejection_rate_threshold": 0.30,  # Alert if rejection rate > 30%
#     "rolling_window_size": 50,
#     "alert_channel": "logger_warning", # or "webhook", "email"
# }
#
# def check_retrieval_alerts(stats: dict[str, Any]) -> None:
#     if ALERT_CONFIG["enabled"] and stats.get("rejection_rate", 0.0) > ALERT_CONFIG["rejection_rate_threshold"]:
#         logger.warning(
#             f"[RETRIEVAL ALERT] High rejection rate detected: {stats['rejection_summary']} "
#             f"({stats['rejection_rate']*100:.1f}% > {ALERT_CONFIG['rejection_rate_threshold']*100:.1f}%)"
#         )
# =====================================================================


def extract_query_entity(query: str) -> str | None:
    """Extracts primary named entity or key subject phrase from a query."""
    if not query:
        return None
    # 1. Quoted entity e.g. "Secret Project X"
    quotes = re.findall(r'["\']([^"\']+)["\']', query)
    if quotes:
        return quotes[0].strip()

    # 2. Capitalized entity phrase (e.g. Swaraj Chattaraj, ARIA, iPhone 15)
    words = query.strip().split()
    caps = []
    stop_starts = {
        "what", "how", "why", "who", "where", "when", "is", "are", "the",
        "a", "an", "in", "on", "can", "tell", "summarize", "find", "show", "get", "explain"
    }
    for w in words:
        clean_w = re.sub(r"[^\w\-]", "", w)
        if clean_w and clean_w[0].isupper() and clean_w.lower() not in stop_starts:
            caps.append(clean_w)
        elif caps:
            break
    if caps:
        return " ".join(caps)

    # 3. Fallback: key non-stopword topic term
    stop_words = {
        "what", "is", "are", "the", "a", "an", "and", "or", "in", "on",
        "at", "for", "to", "with", "of", "about", "how", "why", "who", "which"
    }
    terms = [
        re.sub(r"[^\w\-]", "", w)
        for w in words
        if re.sub(r"[^\w\-]", "", w).lower() not in stop_words and len(w) > 2
    ]
    if terms:
        return terms[0]
    return None


def is_entity_in_evidence(entity: str, evidence: list[Evidence]) -> bool:
    """Checks if the extracted entity is present in any evidence title or summary."""
    if not entity or not evidence:
        return False
    entity_lower = entity.lower()
    for item in evidence:
        title = (item.title or "").lower()
        summary = (item.summary or "").lower()
        if entity_lower in title or entity_lower in summary:
            return True
    return False


def _write_log_entry_sync(entry: dict[str, Any], log_path: Path = LOG_FILE_PATH) -> None:
    """Synchronous file & DB write target executed inside a background thread worker."""
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(entry) + "\n"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as exc:
        logger.warning(f"Failed to write retrieval log entry to file: {exc}")

    # If DB mode (Postgres), attempt writing to DB table retrieval_logs
    db_url = os.getenv("DATABASE_URL")
    if db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
        try:
            from .auth import get_db_connection
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS retrieval_logs (
                            id SERIAL PRIMARY KEY,
                            timestamp TIMESTAMPTZ NOT NULL,
                            query TEXT NOT NULL,
                            top_k_scores JSONB,
                            top_chunk_source TEXT,
                            top_chunk_similarity FLOAT,
                            threshold_used FLOAT,
                            decision TEXT NOT NULL,
                            entity_extracted TEXT,
                            fallback_triggered BOOLEAN NOT NULL
                        )
                        """
                    )
                    cur.execute(
                        """
                        INSERT INTO retrieval_logs
                        (timestamp, query, top_k_scores, top_chunk_source, top_chunk_similarity, threshold_used, decision, entity_extracted, fallback_triggered)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            entry["timestamp"],
                            entry["query"],
                            json.dumps(entry["top_k_scores"]),
                            entry["top_chunk_source"],
                            entry["top_chunk_similarity"],
                            entry["threshold_used"],
                            entry["decision"],
                            entry["entity_extracted"],
                            entry["fallback_triggered"],
                        ),
                    )
                    conn.commit()
            finally:
                conn.close()
        except Exception as db_exc:
            logger.warning(f"Failed to write retrieval log entry to Postgres DB: {db_exc}")


def log_retrieval_call(
    query: str,
    evidence: list[Evidence],
    threshold: float | None = None,
    log_path: Path = LOG_FILE_PATH,
) -> dict[str, Any]:
    """
    Logs a structured JSON entry for a retrieval call.
    Executes disk/DB logging asynchronously in a background thread to prevent performance bottlenecks.
    """
    if threshold is None:
        try:
            threshold = float(os.getenv("ARIA_RETRIEVAL_THRESHOLD", str(DEFAULT_THRESHOLD)))
        except ValueError:
            threshold = DEFAULT_THRESHOLD

    top_k_scores = [round(float(item.score), 3) for item in evidence[:5]] if evidence else []
    top_chunk_source = evidence[0].title if evidence else None
    top_chunk_similarity = round(float(evidence[0].score), 3) if evidence else 0.0
    entity = extract_query_entity(query)

    if not evidence or top_chunk_similarity < threshold:
        decision = "rejected_low_similarity"
    elif entity and not is_entity_in_evidence(entity, evidence):
        decision = "rejected_entity_mismatch"
    else:
        decision = "accepted"

    fallback_triggered = (decision != "accepted")

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "query": query,
        "top_k_scores": top_k_scores,
        "top_chunk_source": top_chunk_source,
        "top_chunk_similarity": top_chunk_similarity,
        "threshold_used": threshold,
        "decision": decision,
        "entity_extracted": entity,
        "fallback_triggered": fallback_triggered,
    }

    # Asynchronous non-blocking file write
    _LOG_EXECUTOR.submit(_write_log_entry_sync, entry, log_path)
    return entry


def get_retrieval_logs(limit: int = 50, log_path: Path = LOG_FILE_PATH) -> list[dict[str, Any]]:
    """Retrieves last N retrieval log entries from Postgres or local jsonl file, newest first."""
    db_url = os.getenv("DATABASE_URL")
    if db_url and (db_url.startswith("postgres://") or db_url.startswith("postgresql://")):
        try:
            from .auth import get_db_connection
            conn = get_db_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT timestamp, query, top_k_scores, top_chunk_source, top_chunk_similarity, threshold_used, decision, entity_extracted, fallback_triggered
                        FROM retrieval_logs
                        ORDER BY id DESC
                        LIMIT %s
                        """,
                        (limit,),
                    )
                    rows = cur.fetchall()
                    logs = []
                    for row in rows:
                        scores = row[2]
                        if isinstance(scores, str):
                            scores = json.loads(scores)
                        ts = row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
                        logs.append(
                            {
                                "timestamp": ts,
                                "query": row[1],
                                "top_k_scores": scores or [],
                                "top_chunk_source": row[3],
                                "top_chunk_similarity": row[4],
                                "threshold_used": row[5],
                                "decision": row[6],
                                "entity_extracted": row[7],
                                "fallback_triggered": row[8],
                            }
                        )
                    return logs
            finally:
                conn.close()
        except Exception as exc:
            logger.warning(f"Could not read retrieval logs from DB: {exc}")

    if not log_path.exists():
        return []

    logs = []
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        logs.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except Exception as exc:
        logger.warning(f"Error reading retrieval log file: {exc}")

    return list(reversed(logs[-limit:]))


def get_retrieval_stats(window_size: int = 50, log_path: Path = LOG_FILE_PATH) -> dict[str, Any]:
    """Calculates summary statistics over the last N queries."""
    logs = get_retrieval_logs(limit=window_size, log_path=log_path)
    total = len(logs)
    if total == 0:
        return {
            "total_queries": 0,
            "rejections": 0,
            "rejection_rate": 0.0,
            "rejection_summary": "0/0 queries fell back due to low relevance",
            "accepted_count": 0,
            "rejected_low_sim_count": 0,
            "rejected_entity_mismatch_count": 0,
        }

    rejected = [l for l in logs if l.get("fallback_triggered") or l.get("decision") != "accepted"]
    rejections = len(rejected)
    rate = round(rejections / total, 3)

    accepted_count = sum(1 for l in logs if l.get("decision") == "accepted")
    rejected_low_sim = sum(1 for l in logs if l.get("decision") == "rejected_low_similarity")
    rejected_entity = sum(1 for l in logs if l.get("decision") == "rejected_entity_mismatch")

    summary = f"{rejections}/{total} queries fell back due to low relevance"

    return {
        "total_queries": total,
        "rejections": rejections,
        "rejection_rate": rate,
        "rejection_summary": summary,
        "accepted_count": accepted_count,
        "rejected_low_sim_count": rejected_low_sim,
        "rejected_entity_mismatch_count": rejected_entity,
    }
