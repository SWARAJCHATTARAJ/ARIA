from __future__ import annotations

import requests

from .models import Evidence


HEADERS = {"User-Agent": "ARIA-Free-Research-Demo/1.0"}


from concurrent.futures import ThreadPoolExecutor

def free_web_search(query: str, max_results: int = 5) -> list[Evidence]:
    evidence: list[Evidence] = []
    
    with ThreadPoolExecutor(max_workers=3) as executor:
        f_wiki = executor.submit(wikipedia_search, query, 2)
        f_openalex = executor.submit(openalex_search, query, 2)
        f_ddg = executor.submit(duckduckgo_instant_answer, query)
        
        evidence.extend(f_wiki.result())
        evidence.extend(f_openalex.result())
        evidence.extend(f_ddg.result())
        
    if not evidence:
        evidence.append(
            Evidence(
                title="Free web search returned no results",
                summary=(
                    "ARIA could not collect data from the free public search endpoints. "
                    "Check your internet connection, try a more specific query, or upload PDFs."
                ),
                source_type="system",
            )
        )
    return evidence[:max_results]


def wikipedia_search(query: str, max_results: int = 2) -> list[Evidence]:
    url = "https://en.wikipedia.org/w/api.php"
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
        response = requests.get(url, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        pages = response.json().get("query", {}).get("pages", {})
    except requests.RequestException as exc:
        return [
            Evidence(
                title="Wikipedia search unavailable",
                summary=f"Wikipedia API request failed: {type(exc).__name__}.",
                source_type="system",
            )
        ]

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
                )
            )
    return evidence


def openalex_search(query: str, max_results: int = 2) -> list[Evidence]:
    url = "https://api.openalex.org/works"
    params = {"search": query, "per-page": max_results}
    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        works = response.json().get("results", [])
    except requests.RequestException as exc:
        return [
            Evidence(
                title="OpenAlex search unavailable",
                summary=f"OpenAlex API request failed: {type(exc).__name__}.",
                source_type="system",
            )
        ]

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
            )
        )
    return evidence


def duckduckgo_instant_answer(query: str) -> list[Evidence]:
    params = {"q": query, "format": "json", "no_html": 1, "skip_disambig": 1}
    try:
        response = requests.get(
            "https://api.duckduckgo.com/",
            params=params,
            headers=HEADERS,
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        return [
            Evidence(
                title="DuckDuckGo search unavailable",
                summary=f"DuckDuckGo API request failed: {type(exc).__name__}.",
                source_type="system",
            )
        ]

    abstract = data.get("AbstractText")
    if not abstract:
        return []
    return [
        Evidence(
            title=data.get("Heading") or "DuckDuckGo instant answer",
            summary=abstract[:1200],
            url=data.get("AbstractURL"),
            source_type="web",
        )
    ]


def get_market_snapshot(tickers: list[str]) -> list[Evidence]:
    try:
        import yfinance as yf
    except ImportError:
        return [
            Evidence(
                title="Market data unavailable",
                summary="Install yfinance only if you need market snapshots: pip install yfinance",
                source_type="system",
            )
        ]

    snapshots: list[Evidence] = []
    for ticker in tickers:
        data = yf.Ticker(ticker)
        history = data.history(period="1mo")
        if history.empty:
            continue
        latest = history.iloc[-1]
        first = history.iloc[0]
        change = ((latest["Close"] - first["Close"]) / first["Close"]) * 100
        snapshots.append(
            Evidence(
                title=f"{ticker} market snapshot",
                summary=(
                    f"Latest close: {latest['Close']:.2f}. "
                    f"One-month change: {change:.2f}%."
                ),
                source_type="finance",
            )
        )
    return snapshots


def inverted_abstract(index: dict[str, list[int]] | None) -> str:
    if not index:
        return ""
    words: list[tuple[int, str]] = []
    for word, positions in index.items():
        for position in positions:
            words.append((position, word))
    return " ".join(word for _, word in sorted(words))
