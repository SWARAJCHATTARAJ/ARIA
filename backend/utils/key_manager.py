import os
import time
import json
import logging
from typing import List, Optional, Dict, Any
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
from config import settings

logger = logging.getLogger(__name__)

class KeyRotationManager:
    """
    Manages a pool of Groq API keys with seamless failover on HTTP 429 (Rate Limits)
    and 402/403 (Quota Exceeded). Supports:
    1. Per-request key pool provided via X-API-Key-Pool header
    2. Comma-separated GROQ_API_KEYS from environment / .env
    3. Primary settings.groq_api_key fallback
    """
    _key_cooldowns: Dict[str, float] = {}

    def __init__(self, request_keys: Optional[List[str]] = None):
        self.keys: List[str] = []
        self._initialize_keys(request_keys)
        self.current_index = 0

    def _initialize_keys(self, request_keys: Optional[List[str]] = None):
        seen = set()

        # 1. Prioritize client-provided BYOK keys
        if request_keys:
            for k in request_keys:
                clean = k.strip()
                if clean and clean not in seen and len(clean) > 10:
                    seen.add(clean)
                    self.keys.append(clean)

        # 2. Add server environment pool from GROQ_API_KEYS
        env_keys_raw = os.getenv("GROQ_API_KEYS", "")
        if env_keys_raw:
            for k in env_keys_raw.split(","):
                clean = k.strip()
                if clean and clean not in seen and len(clean) > 10:
                    seen.add(clean)
                    self.keys.append(clean)

        # 3. Fallback to settings.groq_api_key
        primary = getattr(settings, "groq_api_key", "").strip()
        if primary and primary not in seen and primary != "default":
            seen.add(primary)
            self.keys.append(primary)

        if not self.keys:
            # Last-ditch placeholder to avoid empty index errors
            self.keys.append("default")

    def get_healthy_key(self) -> str:
        """Selects the next available key not currently in cooldown."""
        now = time.time()
        n = len(self.keys)
        for i in range(n):
            idx = (self.current_index + i) % n
            key = self.keys[idx]
            cooldown_until = self._key_cooldowns.get(key, 0)
            if now >= cooldown_until:
                self.current_index = idx
                return key

        # If all keys are in cooldown, pick the one expiring soonest
        earliest_key = min(self.keys, key=lambda k: self._key_cooldowns.get(k, 0))
        self.current_index = self.keys.index(earliest_key)
        return earliest_key

    def mark_key_rate_limited(self, key: str, cooldown_seconds: float = 60.0):
        """Puts a rate-limited or quota-exhausted key into cooldown."""
        masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "key"
        logger.warning(f"Groq API key {masked} marked rate-limited. Cooling down for {cooldown_seconds}s.")
        self._key_cooldowns[key] = time.time() + cooldown_seconds
        # Advance index
        if self.keys:
            self.current_index = (self.current_index + 1) % len(self.keys)

    def create_chat_groq(
        self,
        model_name: str,
        temperature: float = 0.0,
        max_tokens: Optional[int] = None,
        json_mode: bool = False,
        **extra_kwargs
    ) -> ChatGroq:
        """Instantiates ChatGroq using the active healthy key."""
        key = self.get_healthy_key()
        kwargs: Dict[str, Any] = {
            "api_key": key,
            "model_name": model_name,
            "temperature": temperature,
            "request_timeout": extra_kwargs.pop("request_timeout", 25.0),
            "max_retries": extra_kwargs.pop("max_retries", 0),
            **extra_kwargs
        }
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if json_mode:
            kwargs["model_kwargs"] = {"response_format": {"type": "json_object"}}
        if "gpt-oss" in model_name:
            kwargs["reasoning_effort"] = "low"
        return ChatGroq(**kwargs)

    async def execute_with_failover(
        self,
        invoke_fn,
        model_name: str,
        *args,
        **kwargs
    ) -> Any:
        """
        Executes an LLM function with automatic failover across key pool.
        Catches 429 RateLimitError, 402/403 Quota, 5xx server errors, and timeouts,
        switching keys seamlessly.
        """
        max_attempts = max(1, len(self.keys))
        last_error = None

        for attempt in range(max_attempts):
            key = self.get_healthy_key()
            masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "key"
            try:
                return await invoke_fn(key, *args, **kwargs)
            except Exception as exc:
                err_str = str(exc).lower()
                is_failover_trigger = (
                    "429" in err_str or
                    "rate limit" in err_str or
                    "tokens per minute" in err_str or
                    "tpm" in err_str or
                    "quota" in err_str or
                    "402" in err_str or
                    "403" in err_str or
                    "timeout" in err_str or
                    "timed out" in err_str or
                    "500" in err_str or
                    "502" in err_str or
                    "503" in err_str or
                    "504" in err_str or
                    isinstance(exc, (asyncio.TimeoutError, httpx.TimeoutException))
                )
                if is_failover_trigger and attempt < max_attempts - 1:
                    logger.warning(
                        f"Failover trigger on {masked}: {exc}. Rotating to next key in pool (attempt {attempt + 1}/{max_attempts})."
                    )
                    self.mark_key_rate_limited(key, cooldown_seconds=60.0)
                    last_error = exc
                    continue
                else:
                    raise exc

        if last_error:
            raise last_error

async def test_groq_api_key(api_key: str) -> Dict[str, Any]:
    """Lightweight test probe to verify Groq API key validity and measure round-trip latency."""
    t0 = time.time()
    clean_key = api_key.strip()
    if not clean_key or len(clean_key) < 10:
        return {"status": "invalid", "detail": "Key format is too short or invalid."}

    try:
        test_llm = ChatGroq(
            api_key=clean_key,
            model_name="llama-3.1-8b-instant",
            temperature=0.0,
            max_tokens=5,
        )
        resp = await test_llm.ainvoke([HumanMessage(content="ping")])
        latency = round((time.time() - t0) * 1000)
        return {
            "status": "valid",
            "model": "llama-3.1-8b-instant",
            "latency_ms": latency,
            "response": str(resp.content).strip(),
        }
    except Exception as exc:
        err_msg = str(exc)
        logger.warning(f"Key test probe failed: {err_msg}")
        return {
            "status": "invalid",
            "detail": err_msg[:180],
            "latency_ms": round((time.time() - t0) * 1000),
        }
