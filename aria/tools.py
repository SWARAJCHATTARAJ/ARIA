from __future__ import annotations

import requests
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from .core import Evidence


HEADERS = {"User-Agent": "ARIA-Free-Research-Demo/1.0"}


def free_web_search(query: str, max_results: int = 5) -> list[Evidence]:
    evidence: list[Evidence] = []
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        f_wiki = executor.submit(wikipedia_search, query, 2)
        f_openalex = executor.submit(openalex_search, query, 2)
        f_arxiv = executor.submit(arxiv_search, query, 2)
        f_ddg = executor.submit(duckduckgo_instant_answer, query)
        
        evidence.extend(f_wiki.result())
        evidence.extend(f_openalex.result())
        evidence.extend(f_arxiv.result())
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
                score=0.0,
            )
        )
    return evidence[:max_results]


def arxiv_search(query: str, max_results: int = 2) -> list[Evidence]:
    url = "https://export.arxiv.org/api/query"
    params = {
        "search_query": query,
        "max_results": max_results,
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=10)
        response.raise_for_status()
        root = ET.fromstring(response.content)
    except Exception as exc:
        return [
            Evidence(
                title="arXiv search unavailable",
                summary=f"arXiv API request failed: {type(exc).__name__}.",
                source_type="system",
                score=0.0,
            )
        ]

    evidence = []
    # The entries are under the namespace http://www.w3.org/2005/Atom
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
            )
        )
    return evidence


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
                score=0.0,
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
                    score=0.80,
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
                score=0.0,
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
                score=0.70,
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
                score=0.0,
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
            score=0.75,
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
                score=0.0,
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
                score=0.85,
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
