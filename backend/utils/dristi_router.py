import logging
import httpx
import time
from typing import Dict, Any, Optional
from config import settings

logger = logging.getLogger("dristi.router")

async def route_query_dristi(query: str) -> Dict[str, Any]:
    """
    Dristi Query Routing Client (Patch 3 Section A).
    Calls external Dristi FastAPI server on port 8001 via POST /predict.
    
    Timeouts: connect 0.2 s, read 1.0 s.
    
    If Dristi is unreachable, route returns:
      engine: "none"
      dristi_available: False
      confidences: null
      
    Never labels anything V1 or V2 unless the Dristi server produced it.
    Zero heuristics, zero hardcoded words, zero default literals (0.78, 0.95),
    zero lexical-density formulas.
    """
    start_time = time.perf_counter()
    url = f"{settings.dristi_url.rstrip('/')}/predict"
    timeout = httpx.Timeout(1.0, connect=0.2)
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                url,
                json={
                    "question": query,
                    "options": ["OKF", "RAG", "LIVE"]
                }
            )
            latency = round((time.perf_counter() - start_time) * 1000, 2)
            
            if resp.status_code == 200:
                data = resp.json()
                raw_engine = data.get("engine_used") or ""
                
                # Never label V1 or V2 unless the Dristi server produced it
                if "V1" in raw_engine:
                    engine = "V1"
                elif "V2" in raw_engine:
                    engine = "V2"
                else:
                    engine = raw_engine or "none"
                    
                conf = data.get("confidence")
                escalated = (engine == "V2")
                v1_conf = conf if engine == "V1" else None
                v2_conf = conf if engine == "V2" else None
                
                logger.info(f"[Dristi Router] Server responded: engine={engine} ({raw_engine}), conf={conf}, latency={latency}ms")
                return {
                    "dristi_available": True,
                    "engine_used": engine,
                    "raw_engine": raw_engine,
                    "decision": data.get("decision"),
                    "selected_option": data.get("selected_option"),
                    "escalated": escalated,
                    "v1_confidence": v1_conf,
                    "v2_confidence": v2_conf,
                    "confidence": conf,
                    "latency_ms": latency,
                    "is_ood": data.get("ood_detected", False)
                }
            else:
                logger.warning(f"[Dristi Router] Server at {url} returned status code {resp.status_code}")
    except (httpx.ConnectError, httpx.ConnectTimeout) as e:
        logger.info(f"[Dristi Router] Server unreachable at {url}: {e}")
    except Exception as e:
        logger.warning(f"[Dristi Router] Error calling {url}: {e}")

    latency = round((time.perf_counter() - start_time) * 1000, 2)
    # If Dristi is unreachable: engine 'none', dristi_available False, confidences null
    return {
        "dristi_available": False,
        "engine_used": "none",
        "raw_engine": None,
        "decision": None,
        "selected_option": None,
        "escalated": False,
        "v1_confidence": None,
        "v2_confidence": None,
        "confidence": None,
        "latency_ms": latency,
        "is_ood": False
    }
