import time
import datetime
import logging
from typing import List, Dict, Any

logger = logging.getLogger("retrieval_timings")

class RetrievalTimingTracker:
    def __init__(self):
        self.logs: List[Dict[str, Any]] = []

    def reset(self):
        self.logs.clear()

    def record(self, call_name: str, start_time: float, end_time: float, start_iso: str, end_iso: str, status: str = "ok"):
        duration = round(end_time - start_time, 3)
        entry = {
            "call": call_name,
            "start_iso": start_iso,
            "end_iso": end_iso,
            "start_time": start_time,
            "end_time": end_time,
            "duration_s": duration,
            "status": status
        }
        self.logs.append(entry)
        logger.info(f"[RETRIEVAL TIMING] {call_name:<30} | {duration:6.3f}s | {start_iso} -> {end_iso} | status={status}")

    def get_logs(self) -> List[Dict[str, Any]]:
        return list(self.logs)

retrieval_tracker = RetrievalTimingTracker()
