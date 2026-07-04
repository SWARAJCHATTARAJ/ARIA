from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from .core import Evidence

HEADERS = {"User-Agent": "ARIA-Research-Workspace/1.0"}


def run_async(coro):
    """Run an async coroutine, supporting nested loops (e.g. under uvicorn)."""
    try:
        return asyncio.run(coro)
    except RuntimeError:
        with ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(asyncio.run, coro).result()


def free_web_search(query: str, max_results: int = 5) -> list[Evidence]:
    """Runs a multi-provider web search asynchronously and returns the results."""
    return run_async(async_free_web_search(query, max_results=max_results))


async def async_free_web_search(query: str, max_results: int = 5) -> list[Evidence]:
    """Performs web search across Wikipedia, OpenAlex, arXiv, and DuckDuckGo concurrently."""
    try:
        import aiohttp
    except ImportError as exc:
        raise ImportError("aiohttp is required for live web search.") from exc

    timeout = aiohttp.ClientTimeout(total=5)
    async with aiohttp.ClientSession(headers=HEADERS, timeout=timeout) as session:
        results = await asyncio.gather(
            async_wikipedia_search(session, query, 2),
            async_openalex_search(session, query, 2),
            async_arxiv_search(session, query, 2),
            async_duckduckgo_instant_answer(session, query),
            return_exceptions=True,
        )

    evidence: list[Evidence] = []
    valid_results = []
    for r in results:
        if isinstance(r, Exception) or not r:
            continue
        valid_results.append(r)

    # Interleave results from different engines to guarantee source type diversity
    max_len = max(len(r) for r in valid_results) if valid_results else 0
    for i in range(max_len):
        for r in valid_results:
            if i < len(r):
                evidence.append(r[i])

    if not evidence:
        evidence.append(
            Evidence(
                title="Free web search returned no results",
                summary=(
                    "ARIA could not collect data from the free public search endpoints. "
                    "Check your internet connection, try a more specific query, or upload PDFs."
                ),
                source_type="system",
                score=0.0,
                retrieved_via="asyncio",
            )
        )
    return evidence[:max_results]


async def async_arxiv_search(session, query: str, max_results: int = 2) -> list[Evidence]:
    params = {
        "search_query": query,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    try:
        async with session.get("https://export.arxiv.org/api/query", params=params) as response:
            response.raise_for_status()
            content = await response.read()
        root = ET.fromstring(content)
    except Exception:
        return []

    evidence = []
    namespace = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall("atom:entry", namespace):
        title_el = entry.find("atom:title", namespace)
        summary_el = entry.find("atom:summary", namespace)
        id_el = entry.find("atom:id", namespace)
        title = title_el.text.replace("\n", " ").strip() if (title_el is not None and title_el.text) else "arXiv research source"
        summary = summary_el.text.replace("\n", " ").strip() if (summary_el is not None and summary_el.text) else ""
        url_link = id_el.text.strip() if (id_el is not None and id_el.text) else None
        evidence.append(
            Evidence(
                title=title,
                summary=summary[:1200],
                url=url_link,
                source_type="research",
                score=0.85,
                source_id=url_link,
                retrieved_via="arxiv_async",
            )
        )
    return evidence


async def async_wikipedia_search(session, query: str, max_results: int = 2) -> list[Evidence]:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": query,
        "gsrlimit": max_results,
        "prop": "extracts|info",
        "exintro": 1,
        "explaintext": 1,
        "inprop": "url",
    }
    try:
        async with session.get("https://en.wikipedia.org/w/api.php", params=params) as response:
            response.raise_for_status()
            pages = (await response.json()).get("query", {}).get("pages", {})
    except Exception:
        return []

    evidence = []
    for page in pages.values():
        extract = page.get("extract", "").strip()
        if extract:
            evidence.append(
                Evidence(
                    title=page.get("title", "Wikipedia source"),
                    summary=extract[:1200],
                    url=page.get("fullurl"),
                    source_type="wikipedia",
                    score=0.80,
                    source_id=str(page.get("pageid", "")) or None,
                    retrieved_via="wikipedia_async",
                )
            )
    return evidence


async def async_openalex_search(session, query: str, max_results: int = 2) -> list[Evidence]:
    try:
        async with session.get("https://api.openalex.org/works", params={"search": query, "per-page": max_results}) as response:
            response.raise_for_status()
            works = (await response.json()).get("results", [])
    except Exception:
        return []

    evidence = []
    for work in works:
        title = work.get("title") or "OpenAlex research source"
        abstract = inverted_abstract(work.get("abstract_inverted_index"))
        if not abstract:
            abstract = f"Cited by {work.get('cited_by_count', 0)} works."
        evidence.append(
            Evidence(
                title=title,
                summary=abstract[:1200],
                url=work.get("doi") or work.get("id"),
                source_type="research",
                score=0.70,
                source_id=work.get("id"),
                retrieved_via="openalex_async",
            )
        )
    return evidence


async def async_duckduckgo_instant_answer(session, query: str) -> list[Evidence]:
    try:
        async with session.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
        ) as response:
            response.raise_for_status()
            data = await response.json()
    except Exception:
        return []

    abstract = data.get("AbstractText")
    if not abstract:
        return []
    return [
        Evidence(
            title=data.get("Heading") or "DuckDuckGo instant answer",
            summary=abstract[:1200],
            url=data.get("AbstractURL"),
            source_type="web",
            score=0.75,
            source_id=data.get("AbstractURL") or data.get("Heading"),
            retrieved_via="duckduckgo_async",
        )
    ]


def get_market_snapshot(tickers: list[str]) -> list[Evidence]:
    """Retrieves basic stock market parameters for requested tickers."""
    try:
        import yfinance as yf
    except ImportError:
        return [
            Evidence(
                title="Market data unavailable",
                summary="Install yfinance only if you need market snapshots: pip install yfinance",
                source_type="system",
                score=0.0,
                retrieved_via="yfinance",
            )
        ]

    snapshots: list[Evidence] = []
    for ticker in tickers:
        try:
            data = yf.Ticker(ticker)
            history = data.history(period="1mo")
            if history.empty:
                continue
            latest = history.iloc[-1]
            first = history.iloc[0]
            close_latest = latest["Close"]
            close_first = first["Close"]
            change = ((close_latest - close_first) / close_first * 100) if close_first != 0 else 0.0
            snapshots.append(
                Evidence(
                    title=f"{ticker} market snapshot",
                    summary=f"Latest close: {close_latest:.2f}. One-month change: {change:.2f}%.",
                    source_type="finance",
                    score=0.85,
                    source_id=ticker,
                    retrieved_via="yfinance",
                )
            )
        except Exception:
            continue
    return snapshots


def inverted_abstract(index: dict[str, list[int]] | None) -> str:
    if not index:
        return ""
    words: list[tuple[int, str]] = []
    for word, positions in index.items():
        for position in positions:
            words.append((position, word))
    return " ".join(word for _, word in sorted(words))
