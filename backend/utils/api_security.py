import os
import time
import uuid
import datetime
from typing import Optional, Dict, List, Tuple
from fastapi import Request, HTTPException, status
import httpx
from jose import jwt, JWTError

from config import settings
import logging

logger = logging.getLogger(__name__)

# Allowed feedback verdict values
ALLOWED_VERDICTS = {"positive", "negative", "flagged", "accurate", "inaccurate", "conflict"}

# Per-user rate limiting storage (in-memory sliding window keyed by Supabase user UUID)
_user_query_history: Dict[str, List[float]] = {}
_user_feedback_history: Dict[str, List[float]] = {}

# Backward-compatibility storage for IP rate limits
_ip_query_history: Dict[str, List[float]] = {}
_ip_feedback_history: Dict[str, List[float]] = {}
_ip_general_history: Dict[str, List[float]] = {}

# Daily global query count: (date_str, count)
_daily_counter = {"date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"), "count": 0}

MAX_USER_QUERIES_PER_HOUR = 10
MAX_USER_FEEDBACK_PER_HOUR = 30
MAX_QUERIES_PER_HOUR = 5  # For anonymous IP rate limiting
MAX_BODY_SIZE_BYTES = 8192  # 8 KB
MAX_QUERY_LENGTH = 500
MAX_STREAM_DURATION_SECONDS = 180.0

def get_client_ip(request: Request) -> str:
    """
    Extracts the client IP address securely.
    Behind Caddy, the direct peer is 127.0.0.1 or ::1.
    Use X-Forwarded-For ONLY when the direct peer is 127.0.0.1 or ::1.
    If the direct peer is any other address, ignore X-Forwarded-For and use direct peer.
    """
    direct_peer = request.client.host if request.client else "127.0.0.1"
    if direct_peer in ("127.0.0.1", "::1", "localhost"):
        x_forwarded = request.headers.get("x-forwarded-for")
        if x_forwarded:
            forwarded_ip = x_forwarded.split(",")[0].strip()
            if forwarded_ip:
                return forwarded_ip
    return direct_peer

async def verify_supabase_jwt(token: str) -> Optional[Dict]:
    """
    Verifies Supabase JWT signature and expiry.
    1. If SUPABASE_JWT_SECRET is configured, verifies signature & expiry locally.
    2. Otherwise, verifies token by calling Supabase Auth API (/auth/v1/user).
    Returns user payload dictionary if valid, raises HTTPException(401) if invalid or expired.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please sign in."
        )
        
    # Check locally if JWT secret is available
    SUPABASE_JWT_SECRET = getattr(settings, "supabase_jwt_secret", "") or os.environ.get("SUPABASE_JWT_SECRET", "")
    if SUPABASE_JWT_SECRET and SUPABASE_JWT_SECRET != "default":
        try:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256", "RS256"],
                options={"verify_signature": True}
            )
            return payload
        except JWTError as e:
            logger.warning(f"JWT verification failed: {e}")
            if not (settings.supabase_url and settings.supabase_url != "default"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token."
                )
        except Exception as e:
            logger.warning(f"JWT verification error: {e}")
            if not (settings.supabase_url and settings.supabase_url != "default"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token."
                )

    # Supabase Auth endpoint verification
    if settings.supabase_url and settings.supabase_url != "default":
        try:
            verify_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
            headers = {
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_service_role_key
            }
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(verify_url, headers=headers)
                if resp.status_code == 200:
                    return resp.json()
                else:
                    logger.warning(f"Supabase auth check returned {resp.status_code}")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid or expired authentication token."
                    )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Error checking token with Supabase auth: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication verification failed."
            )

    return None

from utils.token_tracker import token_rate_limiter

def check_user_rate_limit(user_id: str, is_feedback: bool = False) -> Tuple[bool, int, str]:
    """
    Checks per-user rate limit (10 queries/hr per user, 30 feedback/hr per user)
    plus the global daily token capacity cap.
    Returns: (is_allowed, retry_after_seconds, error_message)
    """
    if not user_id or not isinstance(user_id, str):
        return False, 3600, "Valid user authentication is required."

    now = time.time()
    one_hour_ago = now - 3600.0
    history_store = _user_feedback_history if is_feedback else _user_query_history
    max_allowed = MAX_USER_FEEDBACK_PER_HOUR if is_feedback else MAX_USER_QUERIES_PER_HOUR

    # Clean up timestamps older than 1 hour for this user
    timestamps = [t for t in history_store.get(user_id, []) if t > one_hour_ago]
    history_store[user_id] = timestamps

    # 1. Per-user limit check (10 queries per hour)
    if len(timestamps) >= max_allowed:
        oldest_in_window = timestamps[0]
        retry_after = max(1, int(3600 - (now - oldest_in_window)))
        action = "feedback submissions" if is_feedback else "queries"
        msg = f"Rate limit exceeded: Limit is {max_allowed} {action} per hour per user. Try again in {retry_after}s."
        return False, retry_after, msg

    # 2. Daily global token capacity check (only for queries, not feedback)
    if not is_feedback:
        allowed, retry_after, daily_msg = token_rate_limiter.check_daily_cap(settings.groq_writer_model)
        if not allowed:
            return False, retry_after, daily_msg

    return True, 0, ""

def record_user_request(user_id: str, is_feedback: bool = False) -> None:
    """Records an authenticated user's request timestamp and increments daily counter."""
    if not user_id:
        return
    now = time.time()
    history_store = _user_feedback_history if is_feedback else _user_query_history
    history_store.setdefault(user_id, []).append(now)
    if not is_feedback:
        _daily_counter["count"] += 1

def check_anonymous_rate_limit(client_ip: str, is_feedback: bool = False) -> Tuple[bool, int, str]:
    """
    Checks per-IP limit of 5 queries per hour plus global DAILY_TOKEN_CAP.
    Returns: (is_allowed, retry_after_seconds, error_message)
    """
    if client_ip in ("127.0.0.1", "::1", "localhost"):
        return True, 0, ""

    now = time.time()
    one_hour_ago = now - 3600.0
    history_store = _ip_feedback_history if is_feedback else _ip_query_history

    # Clean up entries older than 1 hour for this IP
    timestamps = [t for t in history_store.get(client_ip, []) if t > one_hour_ago]
    history_store[client_ip] = timestamps

    # 1. Per-IP limit check (5 queries per hour)
    if len(timestamps) >= MAX_QUERIES_PER_HOUR:
        oldest_in_window = timestamps[0]
        retry_after = max(1, int(3600 - (now - oldest_in_window)))
        msg = f"Rate limit exceeded: Limit is {MAX_QUERIES_PER_HOUR} requests per hour. Try again in {retry_after}s."
        return False, retry_after, msg

    # 2. Daily query cap & token capacity check (only for queries, not feedback)
    if not is_feedback:
        DAILY_QUERY_CAP = 100
        if _daily_counter.get("count", 0) >= DAILY_QUERY_CAP:
            now_dt = datetime.datetime.now(datetime.timezone.utc)
            tomorrow = datetime.datetime(now_dt.year, now_dt.month, now_dt.day, tzinfo=datetime.timezone.utc) + datetime.timedelta(days=1)
            retry_after = max(1, int((tomorrow - now_dt).total_seconds()))
            msg = f"Rate limit exceeded: Daily query cap of {DAILY_QUERY_CAP} reached. Try again tomorrow in {retry_after}s."
            return False, retry_after, msg

        allowed, retry_after, daily_msg = token_rate_limiter.check_daily_cap(settings.groq_writer_model)
        if not allowed:
            return False, retry_after, daily_msg

    return True, 0, ""

def record_anonymous_request(client_ip: str, is_feedback: bool = False) -> None:
    """Records an anonymous request timestamp and increments daily counter."""
    now = time.time()
    history_store = _ip_feedback_history if is_feedback else _ip_query_history
    history_store.setdefault(client_ip, []).append(now)
    if not is_feedback:
        _daily_counter["count"] += 1


def check_general_ip_rate_limit(client_ip: str, max_per_minute: int = 40) -> Tuple[bool, int, str]:
    """
    Sliding-window per-IP rate limiter for API endpoints (/api/export/pdf, /api/keys/test, etc.).
    Returns (is_allowed, retry_after_seconds, error_message).
    """
    now = time.time()
    window_start = now - 60.0
    timestamps = [t for t in _ip_general_history.get(client_ip, []) if t > window_start]
    if len(timestamps) >= max_per_minute:
        retry_after = max(1, int(60 - (now - timestamps[0])))
        _ip_general_history[client_ip] = timestamps
        return False, retry_after, f"Rate limit exceeded: Limit is {max_per_minute} requests per minute. Try again in {retry_after}s."
    timestamps.append(now)
    _ip_general_history[client_ip] = timestamps
    return True, 0, ""

def validate_uuid(val: Optional[str], field_name: str = "thread_id") -> None:
    """Validates that a string is a valid UUID."""
    if val:
        try:
            uuid.UUID(str(val))
        except (ValueError, AttributeError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{field_name} must be a valid UUID."
            )
