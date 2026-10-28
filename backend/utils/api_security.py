import time
import uuid
import datetime
from typing import Optional, Dict, List, Tuple
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
import httpx
from jose import jwt, JWTError

from config import settings
import logging

logger = logging.getLogger(__name__)

# Allowed feedback verdict values
ALLOWED_VERDICTS = {"positive", "negative", "flagged", "accurate", "inaccurate", "conflict"}

# Rate limiting storage (in-memory sliding window)
# IP -> List[float] timestamps
_ip_query_history: Dict[str, List[float]] = {}
# IP -> List[float] timestamps for feedback
_ip_feedback_history: Dict[str, List[float]] = {}

# Daily global query count: (date_str, count)
_daily_counter = {"date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"), "count": 0}

MAX_QUERIES_PER_HOUR = 5
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
        return None
        
    # Check locally if JWT secret is available
    if settings.supabase_jwt_secret and settings.supabase_jwt_secret != "default":
        try:
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_signature": True, "verify_exp": True}
            )
            return payload
        except JWTError as e:
            logger.warning(f"JWT verification failed: {e}")
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

    # 2. Daily token capacity check (only for queries, not feedback)
    if not is_feedback:
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
