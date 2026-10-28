import asyncio
import time
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from utils.query_queue import QueryQueue

async def simulate_client(queue: QueryQueue, client_id: str, hold_duration: float, event_log: list):
    events = []
    
    async def on_queued(pos: int):
        evt = f"[{time.strftime('%H:%M:%S')}] {client_id}: {{\"event\":\"queued\",\"position\":{pos}}}"
        events.append(evt)
        event_log.append(evt)
        print(evt)

    events.append(f"[{time.strftime('%H:%M:%S')}] {client_id}: Request sent")
    event_log.append(events[-1])
    print(events[-1])

    acquired = await queue.acquire(client_id, on_queued=on_queued)
    if not acquired:
        evt = f"[{time.strftime('%H:%M:%S')}] {client_id}: {{\"event\":\"error\",\"message\":\"ARIA is busy right now, try again in a few minutes\"}}"
        events.append(evt)
        event_log.append(evt)
        print(evt)
        return

    evt = f"[{time.strftime('%H:%M:%S')}] {client_id}: Acquired slot, starting query execution..."
    events.append(evt)
    event_log.append(evt)
    print(evt)

    try:
        await asyncio.sleep(hold_duration)
    finally:
        evt = f"[{time.strftime('%H:%M:%S')}] {client_id}: Query finished, releasing slot."
        events.append(evt)
        event_log.append(evt)
        print(evt)
        await queue.release()

async def main():
    print("=" * 80)
    print("TESTING GLOBAL QUERY QUEUE WITH 3 SIMULTANEOUS REQUESTS")
    print("=" * 80)

    queue = QueryQueue(max_wait_seconds=60.0)
    event_log = []

    # Launch 3 simultaneous requests (Client 1 holds for 2s, Client 2 for 1.5s, Client 3 for 1s)
    tasks = [
        asyncio.create_task(simulate_client(queue, "Request-1", hold_duration=2.0, event_log=event_log)),
        asyncio.create_task(simulate_client(queue, "Request-2", hold_duration=1.5, event_log=event_log)),
        asyncio.create_task(simulate_client(queue, "Request-3", hold_duration=1.0, event_log=event_log)),
    ]

    await asyncio.gather(*tasks)

    print("\n" + "=" * 80)
    print("COMPLETE CHRONOLOGICAL EVENT ORDER:")
    print("=" * 80)
    for idx, e in enumerate(event_log, 1):
        print(f"{idx:2d}. {e}")

if __name__ == "__main__":
    asyncio.run(main())
