import os
import time
import uuid
import datetime
from typing import Optional, Dict, List, Tuple, Any
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
_ip_general_history: Dict[str, List[float]] = {}

# Daily global query count: (date_str, count)
_daily_counter = {"date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"), "count": 0}

MAX_USER_QUERIES_PER_HOUR = 10
MAX_USER_FEEDBACK_PER_HOUR = 30
MAX_BODY_SIZE_BYTES = 8192  # 8 KB
MAX_QUERY_LENGTH = 500
MAX_STREAM_DURATION_SECONDS = 180.0


def get_client_ip(request: Request) -> str:
    """
    Extracts the client IP address securely behind trusted local proxy (Caddy/Nginx).
    Uses X-Forwarded-For ONLY when the direct peer is 127.0.0.1 / ::1 / localhost.
    """
    direct_peer = request.client.host if request.client else "127.0.0.1"
    if direct_peer in ("127.0.0.1", "::1", "localhost"):
        x_forwarded = request.headers.get("x-forwarded-for")
        if x_forwarded:
            forwarded_ip = x_forwarded.split(",")[0].strip()
            if forwarded_ip:
                return forwarded_ip
    return direct_peer


async def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """
    Strictly verifies Supabase JWT signature and expiry.
    1. If SUPABASE_JWT_SECRET is configured, verifies signature & expiry locally.
    2. Otherwise, verifies token via Supabase Auth API (/auth/v1/user).
    Raises HTTPException(401) whenever the token is missing, malformed, or expired.
    """
    if not token or token.lower() in ("null", "undefined", "guest", "anonymous"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )

    supabase_jwt_secret = getattr(settings, "supabase_jwt_secret", "") or os.environ.get("SUPABASE_JWT_SECRET", "")
    if supabase_jwt_secret and supabase_jwt_secret != "default":
        try:
            payload = jwt.decode(
                token,
                supabase_jwt_secret,
                algorithms=["HS256", "RS256"],
                options={"verify_signature": True, "verify_aud": False},
            )
            if payload and (payload.get("id") or payload.get("sub")):
                return payload
        except JWTError as e:
            logger.warning(f"JWT verification failed: {e}")
            if not (settings.supabase_url and settings.supabase_url != "default"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token.",
                )
        except Exception as e:
            logger.warning(f"JWT verification error: {e}")
            if not (settings.supabase_url and settings.supabase_url != "default"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token.",
                )

    if settings.supabase_url and settings.supabase_url != "default":
        try:
            verify_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
            headers = {
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_service_role_key,
            }
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(verify_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, dict) and "iat" not in data:
                        try:
                            claims = jwt.get_unverified_claims(token)
                            if "iat" in claims:
                                data["iat"] = claims["iat"]
                        except Exception:
                            pass
                    return data
                logger.warning(f"Supabase auth check returned {resp.status_code}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired authentication token.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Error checking token with Supabase auth: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication verification failed.",
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication service unavailable or token invalid.",
    )


def extract_bearer_token(request: Request) -> str:
    """Extracts Bearer JWT from Authorization header or raises HTTP 401."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )
    token = auth_header[7:].strip()
    if not token or token.lower() in ("null", "undefined", "guest", "anonymous"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
        )
    return token


async def require_authenticated_user(request: Request) -> Dict[str, Any]:
    """
    Validates the Bearer JWT on every protected route and guarantees a verified user_id.
    Always rejects unauthenticated requests cleanly with HTTP 401 Unauthorized.
    """
    token = extract_bearer_token(request)
    payload = await verify_supabase_jwt(token)
    user_id = payload.get("id") or payload.get("sub") if isinstance(payload, dict) else None
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user session.",
        )
    payload["verified_user_id"] = str(user_id)
    payload["raw_token"] = token
    return payload


async def verify_supabase_user_password(email: str, password: str) -> bool:
    """
    Re-verifies an email/password account credential directly against Supabase Auth
    before permitting destructive actions such as permanent account deletion.
    """
    if not email or not password or not settings.supabase_url or settings.supabase_url == "default":
        return False
    token_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/token?grant_type=password"
    api_key = settings.supabase_service_role_key
    headers = {
        "apikey": api_key,
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                token_url,
                headers=headers,
                json={"email": email, "password": password},
            )
            return resp.status_code == 200
    except Exception as e:
        logger.warning(f"Credential re-verification error: {type(e).__name__}")
        return False


from utils.token_tracker import token_rate_limiter


def check_user_rate_limit(user_id: str, is_feedback: bool = False) -> Tuple[bool, int, str]:
    """
    Checks per-user rate limit (10 queries/hr per user, 30 feedback/hr per user)
    plus the global daily token capacity cap.
    """
    if not user_id or not isinstance(user_id, str):
        return False, 3600, "Valid user authentication is required."

    now = time.time()
    one_hour_ago = now - 3600.0
    history_store = _user_feedback_history if is_feedback else _user_query_history
    max_allowed = MAX_USER_FEEDBACK_PER_HOUR if is_feedback else MAX_USER_QUERIES_PER_HOUR

    timestamps = [t for t in history_store.get(user_id, []) if t > one_hour_ago]
    history_store[user_id] = timestamps

    if len(timestamps) >= max_allowed:
        oldest_in_window = timestamps[0]
        retry_after = max(1, int(3600 - (now - oldest_in_window)))
        action = "feedback submissions" if is_feedback else "queries"
        msg = f"Rate limit exceeded: Limit is {max_allowed} {action} per hour per user. Try again in {retry_after}s."
        return False, retry_after, msg

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


def check_general_ip_rate_limit(client_ip: str, max_per_minute: int = 40) -> Tuple[bool, int, str]:
    """
    Sliding-window per-IP rate limiter for API endpoints (/api/export/pdf, /api/keys/test, etc.).
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
                detail=f"{field_name} must be a valid UUID.",
            )
