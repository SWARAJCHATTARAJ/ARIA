import asyncio
import datetime
import logging
import re
import time
from typing import Dict, List, Any, Optional, Tuple
from config import settings

logger = logging.getLogger(__name__)

class TokenRateLimiter:
    """
    Thread-safe in-memory rolling 60-second and daily token budget manager per model.
    Limits reset on application restart.
    """
    def __init__(self):
        # model_name -> list of (timestamp, token_count)
        self._rolling_usage: Dict[str, List[Tuple[float, int]]] = {}
        # model_name -> {"date": "YYYY-MM-DD", "tokens": int}
        self._daily_usage: Dict[str, Dict[str, Any]] = {}

    def get_model_limits(self, model: str) -> Tuple[int, int]:
        """Returns (tpm_limit, tpd_limit) for a given model."""
        if model == settings.groq_writer_model:
            return settings.groq_writer_tpm, settings.groq_writer_tpd
        elif model == settings.groq_judge_model:
            return settings.groq_judge_tpm, settings.groq_judge_tpd
        return 6400, settings.daily_token_cap

    def check_daily_cap(self, model: str, estimated_tokens: int = 0) -> Tuple[bool, int, str]:
        """
        Checks whether adding estimated_tokens exceeds the daily token cap.
        Returns: (is_allowed, retry_after_seconds, message)
        """
        today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        usage_record = self._daily_usage.setdefault(model, {"date": today_str, "tokens": 0})
        if usage_record["date"] != today_str:
            usage_record["date"] = today_str
            usage_record["tokens"] = 0

        _, tpd_limit = self.get_model_limits(model)
        cap = min(tpd_limit, settings.daily_token_cap)
        if (usage_record["tokens"] + estimated_tokens) >= cap:
            now_dt = datetime.datetime.now(datetime.timezone.utc)
            tomorrow = datetime.datetime(now_dt.year, now_dt.month, now_dt.day, tzinfo=datetime.timezone.utc) + datetime.timedelta(days=1)
            retry_after = max(1, int((tomorrow - now_dt).total_seconds()))
            msg = "Today's free capacity is used up. Try the recorded examples or come back tomorrow."
            return False, retry_after, msg

        return True, 0, ""

    async def check_and_pace(self, model: str, estimated_tokens: int = 500) -> Tuple[bool, str]:
        """
        Pacing check: rolling 60-second window.
        If next call would push usage above model's TPM, wait up to 20s.
        If still over, return friendly error.
        Returns: (is_allowed, error_message)
        """
        tpm_limit, _ = self.get_model_limits(model)
        now = time.time()
        window_start = now - 60.0

        # Clean old entries
        entries = [e for e in self._rolling_usage.get(model, []) if e[0] > window_start]
        self._rolling_usage[model] = entries

        current_window_tokens = sum(e[1] for e in entries)
        if current_window_tokens + estimated_tokens > tpm_limit:
            # Calculate wait time until enough tokens roll out
            tokens_needed = (current_window_tokens + estimated_tokens) - tpm_limit
            accumulated_rolloff = 0
            wait_time = 0.0
            for ts, count in sorted(entries, key=lambda x: x[0]):
                accumulated_rolloff += count
                wait_time = max(0.0, 60.0 - (now - ts) + 0.1)
                if accumulated_rolloff >= tokens_needed:
                    break

            if wait_time <= 65.0:
                logger.info(f"Pacing [{model}]: rolling usage ({current_window_tokens} + {estimated_tokens} > {tpm_limit}). Waiting {wait_time:.1f}s...")
                await asyncio.sleep(wait_time)
                # Re-verify window after sleep
                now = time.time()
                entries = [e for e in self._rolling_usage.get(model, []) if e[0] > (now - 60.0)]
                self._rolling_usage[model] = entries
                current_window_tokens = sum(e[1] for e in entries)
                if current_window_tokens + estimated_tokens > tpm_limit:
                    return False, "ARIA is busy right now, try again in a few minutes"
            else:
                logger.warning(f"Pacing [{model}]: wait time {wait_time:.1f}s exceeds threshold.")
                return False, "ARIA is busy right now, try again in a few minutes"

        return True, ""

    def check_and_pace_sync(self, model: str, estimated_tokens: int = 500) -> Tuple[bool, str]:
        """Synchronous version of check_and_pace for sync pipeline stages."""
        tpm_limit, _ = self.get_model_limits(model)
        now = time.time()
        window_start = now - 60.0

        entries = [e for e in self._rolling_usage.get(model, []) if e[0] > window_start]
        self._rolling_usage[model] = entries

        current_window_tokens = sum(e[1] for e in entries)
        if current_window_tokens + estimated_tokens > tpm_limit:
            tokens_needed = (current_window_tokens + estimated_tokens) - tpm_limit
            accumulated_rolloff = 0
            wait_time = 0.0
            for ts, count in sorted(entries, key=lambda x: x[0]):
                accumulated_rolloff += count
                wait_time = max(0.0, 60.0 - (now - ts) + 0.1)
                if accumulated_rolloff >= tokens_needed:
                    break

            if wait_time <= 65.0:
                logger.info(f"Pacing sync [{model}]: waiting {wait_time:.1f}s...")
                time.sleep(wait_time)
                now = time.time()
                entries = [e for e in self._rolling_usage.get(model, []) if e[0] > (now - 60.0)]
                self._rolling_usage[model] = entries
                if sum(e[1] for e in entries) + estimated_tokens > tpm_limit:
                    return False, "ARIA is busy right now, try again in a few minutes"
            else:
                return False, "ARIA is busy right now, try again in a few minutes"

        return True, ""

    def record_tokens(self, model: str, total_tokens: int) -> None:
        """Records real token usage in rolling 60s and daily counters."""
        now = time.time()
        today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")

        # Rolling 60s
        self._rolling_usage.setdefault(model, []).append((now, total_tokens))

        # Daily usage
        usage_record = self._daily_usage.setdefault(model, {"date": today_str, "tokens": 0})
        if usage_record["date"] != today_str:
            usage_record["date"] = today_str
            usage_record["tokens"] = 0
        usage_record["tokens"] += total_tokens
        logger.info(f"Token tracker recorded {total_tokens} tokens for [{model}]. Total today: {usage_record['tokens']}")

    def log_groq_429(self, model: str, headers: Dict[str, str], error_body: str = "") -> None:
        """Logs which limit was hit on Groq 429 using response headers and error text."""
        rem_tokens = headers.get("x-ratelimit-remaining-tokens")
        rem_reqs = headers.get("x-ratelimit-remaining-requests")
        reset_tokens = headers.get("x-ratelimit-reset-tokens")
        reset_reqs = headers.get("x-ratelimit-reset-requests")
        retry_after = headers.get("retry-after")

        limit_type = "unknown limit"
        err_lower = error_body.lower()
        if "tokens per minute" in err_lower or (rem_tokens == "0" and reset_tokens and "m" in reset_tokens):
            limit_type = "Tokens Per Minute (TPM)"
        elif "requests per minute" in err_lower or (rem_reqs == "0" and reset_reqs and "m" in reset_reqs):
            limit_type = "Requests Per Minute (RPM)"
        elif "tokens per day" in err_lower or "tpd" in err_lower:
            limit_type = "Tokens Per Day (TPD)"
        elif "requests per day" in err_lower or "rpd" in err_lower:
            limit_type = "Requests Per Day (RPD)"
        elif rem_tokens == "0":
            limit_type = f"Tokens limit (reset in {reset_tokens or retry_after or 'N/A'})"
        elif rem_reqs == "0":
            limit_type = f"Requests limit (reset in {reset_reqs or retry_after or 'N/A'})"

        logger.error(
            f"Groq 429 Rate Limit Hit for [{model}]: Hit {limit_type}. "
            f"Headers: remaining_tokens={rem_tokens}, remaining_requests={rem_reqs}, "
            f"reset_tokens={reset_tokens}, reset_requests={reset_reqs}, retry_after={retry_after}. "
            f"Error message: {error_body[:200]}"
        )

# Global singleton rate limiter
token_rate_limiter = TokenRateLimiter()

class TokenTracker:
    """
    Tracks LLM prompt, completion, and reasoning tokens per model call and per query.
    """
    def __init__(self, query_id: str = ""):
        self.query_id = query_id
        self.calls: List[Dict[str, Any]] = []

    def record_call(
        self,
        call_name: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        reasoning_tokens: int = 0,
        total_tokens: Optional[int] = None,
        model_name: str = "",
        finish_reason: str = "stop",
        raw_usage: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        if total_tokens is None:
            total_tokens = prompt_tokens + completion_tokens

        record = {
            "name": call_name,
            "model": model_name or settings.groq_writer_model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "reasoning_tokens": reasoning_tokens,
            "total_tokens": total_tokens,
            "finish_reason": finish_reason,
            "usage": raw_usage or {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "reasoning_tokens": reasoning_tokens
            }
        }
        self.calls.append(record)
        
        # Increment global budget manager
        token_rate_limiter.record_tokens(record["model"], total_tokens)

        logger.info(
            f"TokenTracker [{call_name}]: model='{record['model']}', finish_reason='{finish_reason}', "
            f"prompt_tokens={prompt_tokens}, completion_tokens={completion_tokens}, "
            f"reasoning_tokens={reasoning_tokens}, total_tokens={total_tokens}"
        )
        return record

    def record_from_response(self, call_name: str, response: Any, model_name: str = "", finish_reason: Optional[str] = None) -> Dict[str, Any]:
        prompt_tokens = 0
        completion_tokens = 0
        reasoning_tokens = 0
        total_tokens = 0
        resolved_model = model_name
        raw_usage: Dict[str, Any] = {}
        detected_finish_reason = finish_reason

        # 1. Try usage_metadata (LangChain standard)
        usage = getattr(response, "usage_metadata", None)
        if usage and isinstance(usage, dict):
            raw_usage = dict(usage)
            prompt_tokens = usage.get("input_tokens", 0)
            completion_tokens = usage.get("output_tokens", 0)
            total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)
            details = usage.get("output_token_details", {})
            if isinstance(details, dict):
                reasoning_tokens = details.get("reasoning", 0)
        else:
            # 2. Try response_metadata["token_usage"]
            resp_meta = getattr(response, "response_metadata", {})
            if isinstance(resp_meta, dict):
                if not resolved_model:
                    resolved_model = resp_meta.get("model_name", "") or resp_meta.get("model", "")
                t_usage = resp_meta.get("token_usage", {})
                if isinstance(t_usage, dict):
                    raw_usage = dict(t_usage)
                    prompt_tokens = t_usage.get("prompt_tokens", 0)
                    completion_tokens = t_usage.get("completion_tokens", 0)
                    total_tokens = t_usage.get("total_tokens", prompt_tokens + completion_tokens)
                    c_details = t_usage.get("completion_tokens_details", {})
                    if isinstance(c_details, dict):
                        reasoning_tokens = c_details.get("reasoning_tokens", 0)

        resp_meta = getattr(response, "response_metadata", {})
        if isinstance(resp_meta, dict):
            if not resolved_model:
                resolved_model = resp_meta.get("model_name", "") or resp_meta.get("model", "")
            if not detected_finish_reason:
                detected_finish_reason = resp_meta.get("finish_reason", "stop")

        final_finish_reason = detected_finish_reason or "stop"

        return self.record_call(
            call_name=call_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            reasoning_tokens=reasoning_tokens,
            total_tokens=total_tokens,
            model_name=resolved_model,
            finish_reason=final_finish_reason,
            raw_usage=raw_usage
        )

    def summary(self) -> Dict[str, Any]:
        total_prompt = sum(c["prompt_tokens"] for c in self.calls)
        total_completion = sum(c["completion_tokens"] for c in self.calls)
        total_reasoning = sum(c.get("reasoning_tokens", 0) for c in self.calls)
        total_tokens = sum(c["total_tokens"] for c in self.calls)
        return {
            "model_calls": len(self.calls),
            "prompt_tokens": total_prompt,
            "completion_tokens": total_completion,
            "reasoning_tokens": total_reasoning,
            "total_tokens": total_tokens,
            "calls": self.calls
        }
