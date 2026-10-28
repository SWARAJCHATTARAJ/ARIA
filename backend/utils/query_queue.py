import asyncio
import time
import logging
from typing import Callable, Optional, Awaitable

logger = logging.getLogger(__name__)

class QueryQueue:
    def __init__(self, max_wait_seconds: float = 60.0):
        self._max_wait = max_wait_seconds
        self._is_running = False
        self._waiters: list[tuple[str, asyncio.Future, Optional[Callable[[int], Awaitable[None]]]]] = []
        self._lock = asyncio.Lock()

    @property
    def queue_length(self) -> int:
        return len(self._waiters)

    @property
    def is_running(self) -> bool:
        return self._is_running

    async def acquire(
        self,
        request_id: str,
        on_queued: Optional[Callable[[int], Awaitable[None]]] = None
    ) -> bool:
        """
        Acquires execution slot for one live query globally.
        If busy, waits in queue and calls on_queued(position).
        Returns True if acquired, False if timed out after max_wait_seconds.
        """
        loop = asyncio.get_running_loop()

        async with self._lock:
            if not self._is_running and not self._waiters:
                self._is_running = True
                logger.info(f"[{request_id}] Acquired live query slot immediately.")
                return True

            fut = loop.create_future()
            self._waiters.append((request_id, fut, on_queued))
            pos = len(self._waiters)
            logger.info(f"[{request_id}] Queued for live slot at position {pos}.")

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
                    logger.warning(f"[{request_id}] Timed out waiting in query queue after {self._max_wait}s.")
                    return False

                try:
                    await asyncio.wait_for(asyncio.shield(fut), timeout=min(remaining, 1.0))
                except asyncio.TimeoutError:
                    if fut.done():
                        break
                    # Recheck and notify if position shifted
                    async with self._lock:
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
            raise

    async def release(self):
        """Releases the slot and notifies the next waiting query."""
        async with self._lock:
            while self._waiters:
                req_id, next_fut, _ = self._waiters.pop(0)
                if not next_fut.done():
                    logger.info(f"[{req_id}] Handing off live query slot.")
                    next_fut.set_result(True)
                    # Notify remaining waiters of their updated positions
                    for idx, (w_id, _, w_on_queued) in enumerate(self._waiters):
                        if w_on_queued:
                            try:
                                asyncio.create_task(w_on_queued(idx + 1))
                            except Exception:
                                pass
                    return

            self._is_running = False
            logger.info("Live query slot released (queue is now empty).")

    def _remove_waiter(self, request_id: str):
        self._waiters = [w for w in self._waiters if w[0] != request_id]

    def _get_waiter_position(self, request_id: str) -> Optional[int]:
        for idx, (req_id, _, _) in enumerate(self._waiters):
            if req_id == request_id:
                return idx + 1
        return None

global_query_queue = QueryQueue(max_wait_seconds=60.0)
