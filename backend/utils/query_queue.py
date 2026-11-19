import asyncio
import time
import logging
from typing import Callable, Optional, Awaitable

logger = logging.getLogger(__name__)

class QueryQueue:
    def __init__(self, max_wait_seconds: float = 60.0, max_concurrent: int = 3):
        self._max_wait = max_wait_seconds
        self._max_concurrent = max_concurrent
        # request_id -> timestamp when slot was granted
        self._active_requests: dict[str, float] = {}
        self._waiters: list[tuple[str, asyncio.Future, Optional[Callable[[int], Awaitable[None]]]]] = []
        self._lock = asyncio.Lock()

    @property
    def queue_length(self) -> int:
        return len(self._waiters)

    @property
    def is_running(self) -> bool:
        return len(self._active_requests) > 0

    @property
    def active_count(self) -> int:
        return len(self._active_requests)

    def _clean_stale_active_locked(self) -> None:
        """Purges any active slots held longer than max_wait_seconds to prevent deadlocks."""
        now = time.time()
        stale = [req_id for req_id, start_t in self._active_requests.items() if (now - start_t) > self._max_wait]
        for req_id in stale:
            logger.warning(f"[{req_id}] Releasing stale live query slot after {self._max_wait}s hard safety timeout.")
            del self._active_requests[req_id]

    def _handoff_next_locked(self) -> None:
        """Hands off available slots to waiting queries. Must be called while holding self._lock."""
        self._clean_stale_active_locked()
        while len(self._active_requests) < self._max_concurrent and self._waiters:
            req_id, next_fut, _ = self._waiters.pop(0)
            if not next_fut.done():
                self._active_requests[req_id] = time.time()
                logger.info(f"[{req_id}] Handing off live query slot ({len(self._active_requests)}/{self._max_concurrent} active).")
                next_fut.set_result(True)
                for idx, (w_id, _, w_on_queued) in enumerate(self._waiters):
                    if w_on_queued:
                        try:
                            asyncio.create_task(w_on_queued(idx + 1))
                        except Exception:
                            pass

    async def acquire(
        self,
        request_id: str,
        on_queued: Optional[Callable[[int], Awaitable[None]]] = None
    ) -> bool:
        """
        Acquires execution slot for a live query (up to max_concurrent simultaneous queries).
        If busy, waits in queue and calls on_queued(position).
        Returns True if acquired, False if timed out after max_wait_seconds.
        """
        loop = asyncio.get_running_loop()

        async with self._lock:
            self._clean_stale_active_locked()

            if len(self._active_requests) < self._max_concurrent and not self._waiters:
                self._active_requests[request_id] = time.time()
                logger.info(f"[{request_id}] Acquired live query slot immediately ({len(self._active_requests)}/{self._max_concurrent} active).")
                return True

            fut = loop.create_future()
            self._waiters.append((request_id, fut, on_queued))
            pos = len(self._waiters)
            logger.info(f"[{request_id}] Queued for live slot at position {pos} ({len(self._active_requests)}/{self._max_concurrent} active).")

        if on_queued:
            await on_queued(pos)

        start_time = time.time()
        try:
            while not fut.done():
                elapsed = time.time() - start_time
                remaining = self._max_wait - elapsed
                if remaining <= 0:
                    async with self._lock:
                        self._remove_waiter(request_id)
                        self._handoff_next_locked()
                    logger.warning(f"[{request_id}] Timed out waiting in query queue after {self._max_wait}s.")
                    return False

                try:
                    await asyncio.wait_for(asyncio.shield(fut), timeout=min(remaining, 1.0))
                except asyncio.TimeoutError:
                    if fut.done():
                        break
                    # Recheck stale slots, advance queue, and notify if position shifted
                    async with self._lock:
                        self._clean_stale_active_locked()
                        self._handoff_next_locked()
                        current_pos = self._get_waiter_position(request_id)
                    if current_pos is not None and current_pos != pos:
                        pos = current_pos
                        if on_queued:
                            await on_queued(pos)
                    continue

            return True

        except asyncio.CancelledError:
            async with self._lock:
                self._remove_waiter(request_id)
                if request_id in self._active_requests:
                    del self._active_requests[request_id]
                self._handoff_next_locked()
            raise

    async def release(self, request_id: Optional[str] = None) -> None:
        """
        Releases the slot held by request_id (or oldest slot if omitted)
        and notifies the next waiting query. Idempotent.
        """
        async with self._lock:
            if request_id:
                if request_id in self._active_requests:
                    del self._active_requests[request_id]
                    logger.info(f"[{request_id}] Live query slot released ({len(self._active_requests)}/{self._max_concurrent} active).")
                else:
                    logger.debug(f"[{request_id}] Release called but request not in active slots (already released).")
                    return
            else:
                if self._active_requests:
                    popped_id, _ = self._active_requests.popitem()
                    logger.info(f"[{popped_id}] Live query slot released ({len(self._active_requests)}/{self._max_concurrent} active).")

            self._handoff_next_locked()

    def _remove_waiter(self, request_id: str):
        self._waiters = [w for w in self._waiters if w[0] != request_id]

    def _get_waiter_position(self, request_id: str) -> Optional[int]:
        for idx, (req_id, _, _) in enumerate(self._waiters):
            if req_id == request_id:
                return idx + 1
        return None

global_query_queue = QueryQueue(max_wait_seconds=60.0, max_concurrent=3)
