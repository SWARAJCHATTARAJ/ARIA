import asyncio
import httpx
import json
import time
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

URL = "http://127.0.0.1:8000/api/test-queue"

async def client_worker(client_id: str, results: list):
    t_send = time.time()
    t_send_str = time.strftime("%H:%M:%S", time.localtime(t_send)) + f".{int((t_send % 1) * 1000):03d}"
    print(f"[{t_send_str}] {client_id}: HTTP GET request sent to {URL}")
    results.append((t_send, client_id, "HTTP GET request sent"))

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("GET", URL) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    print(f"ERROR {client_id} status {response.status_code}: {err_body.decode('utf-8', errors='ignore')}")
                    return
                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n\n" in buffer:
                        raw_event, buffer = buffer.split("\n\n", 1)
                        raw_event = raw_event.strip()
                        if raw_event.startswith("data: "):
                            data_str = raw_event[6:].strip()
                            try:
                                evt = json.loads(data_str)
                                now = time.time()
                                now_str = time.strftime("%H:%M:%S", time.localtime(now)) + f".{int((now % 1) * 1000):03d}"
                                print(f"[{now_str}] {client_id}: received event -> {evt}")
                                results.append((now, client_id, evt))
                            except Exception as e:
                                print(f"JSON parse error: {e}")
    except Exception as e:
        print(f"EXCEPTION {client_id}: {e}")

async def main():
    print("=" * 80)
    print("SENDING 3 SIMULTANEOUS REAL HTTP REQUESTS TO /api/test-queue")
    print(f"Endpoint: {URL}")
    print("=" * 80)

    results = []
    t_start = time.time()

    # Launch 3 simultaneous HTTP requests
    tasks = [
        asyncio.create_task(client_worker("Request-1", results)),
        asyncio.create_task(client_worker("Request-2", results)),
        asyncio.create_task(client_worker("Request-3", results)),
    ]

    await asyncio.gather(*tasks)

    t_end = time.time()
    print("\n" + "=" * 80)
    print(f"CHRONOLOGICAL EVENT ORDER (Total duration: {t_end - t_start:.2f}s):")
    print("=" * 80)

    # Sort strictly by timestamp
    results.sort(key=lambda x: x[0])
    for idx, (ts, cid, item) in enumerate(results, 1):
        ts_str = time.strftime("%H:%M:%S", time.localtime(ts)) + f".{int((ts % 1) * 1000):03d}"
        if isinstance(item, dict):
            event_name = item.get("event")
            pos = item.get("position")
            pos_str = f" (position: {pos})" if pos is not None else ""
            print(f"{idx:2d}. [{ts_str}] [{cid}] event: '{event_name}'{pos_str} -> raw: {json.dumps(item)}")
        else:
            print(f"{idx:2d}. [{ts_str}] [{cid}] {item}")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(main())
