from __future__ import annotations

import asyncio
import xml.etree.ElementTree as ET
import re
import html
import urllib.parse
import json
import logging
import os
from concurrent.futures import ThreadPoolExecutor

from .core import Evidence

HEADERS = {"User-Agent": "ARIA-Research-Workspace/1.0"}
logger = logging.getLogger("aria.tools")


def _truncate_body(text: str | bytes | None, limit: int = 800) -> str:
    if text is None:
        return ""
    if isinstance(text, bytes):
        text = text.decode("utf-8", errors="replace")
    return " ".join(str(text).split())[:limit]


def _log_zero_results(provider: str, query: str, status: int | None, body: str | bytes | None) -> None:
    logger.warning(
        "%s returned 0 parsed results for query=%r status=%s body_preview=%r",
        provider,
        query,
        status,
        _truncate_body(body),
    )


def _clean_public_search_query(query: str) -> str:
    """Remove Lucene/wildcard punctuation that public search APIs reject."""
    cleaned = re.sub(r"[\?\*\~\^\[\]\{\}\\]", " ", query or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or (query or "").strip()


def _public_source_timeout(default: float = 6.0) -> float:
    try:
        return float(os.getenv("ARIA_PUBLIC_SOURCE_TIMEOUT", str(default)))
    except ValueError:
        return default


async def _read_response_json_and_body(response) -> tuple[dict, str]:
    """Read JSON while retaining a raw body preview; supports lightweight test mocks."""
    if hasattr(response, "text"):
        body = await response.text()
        return json.loads(body), body
    data = await response.json()
    return data, json.dumps(data)


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
            async_duckduckgo_search(session, query, 2),
            async_doaj_search(session, query, 2),
            async_pubmed_search(session, query, 2),
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
    clean_query = _clean_public_search_query(query)
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": clean_query,
        "gsrlimit": max_results,
        "prop": "extracts|info",
        "exintro": 1,
        "explaintext": 1,
        "inprop": "url",
    }
    raw_body = ""
    status = None
    pages = {}
    try:
        async with session.get("https://en.wikipedia.org/w/api.php", params=params) as response:
            status = response.status
            data, raw_body = await _read_response_json_and_body(response)
            response.raise_for_status()
            pages = data.get("query", {}).get("pages", {})
    except Exception as exc:
        logger.warning(
            "wikipedia generator search failed for query=%r status=%s error=%s body_preview=%r",
            query,
            status,
            exc,
            _truncate_body(raw_body),
        )

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

    # Fallback to action=query&list=search if generator search yielded 0 results
    if not evidence:
        try:
            fallback_params = {
                "action": "query",
                "format": "json",
                "list": "search",
                "srsearch": clean_query,
                "srlimit": max_results,
            }
            async with session.get("https://en.wikipedia.org/w/api.php", params=fallback_params) as response:
                status = response.status
                data, raw_body = await _read_response_json_and_body(response)
                response.raise_for_status()
                search_results = data.get("query", {}).get("search", [])
                for item in search_results:
                    title = item.get("title", "")
                    snippet = re.sub(r'<[^>]+>', '', item.get("snippet", "")).strip()
                    pageid = item.get("pageid")
                    url = f"https://en.wikipedia.org/?curid={pageid}" if pageid else None
                    if title and snippet:
                        evidence.append(
                            Evidence(
                                title=title,
                                summary=html.unescape(snippet)[:1200],
                                url=url,
                                source_type="wikipedia",
                                score=0.75,
                                source_id=str(pageid) if pageid else title,
                                retrieved_via="wikipedia_list_fallback",
                            )
                        )
        except Exception as exc:
            logger.warning(
                "wikipedia list search fallback failed for query=%r status=%s error=%s",
                query,
                status,
                exc,
            )

    if not evidence:
        _log_zero_results("wikipedia", query, status, raw_body)
    return evidence


async def async_openalex_search(session, query: str, max_results: int = 2) -> list[Evidence]:
    clean_query = _clean_public_search_query(query)
    raw_body = ""
    status = None
    try:
        async with session.get("https://api.openalex.org/works", params={"search": clean_query, "per_page": max_results}) as response:
            status = response.status
            data, raw_body = await _read_response_json_and_body(response)
            response.raise_for_status()
            works = data.get("results", [])
    except Exception as exc:
        logger.warning(
            "openalex search failed for query=%r sanitized_query=%r status=%s error=%s body_preview=%r",
            query,
            clean_query,
            status,
            exc,
            _truncate_body(raw_body),
        )
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
    if not evidence:
        _log_zero_results("openalex", clean_query, status, raw_body)
    return evidence


async def async_duckduckgo_instant_answer(session, query: str) -> list[Evidence]:
    raw_body = ""
    status = None
    try:
        async with session.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
        ) as response:
            status = response.status
            data, raw_body = await _read_response_json_and_body(response)
            response.raise_for_status()
    except Exception as exc:
        logger.warning(
            "duckduckgo instant answer failed for query=%r status=%s error=%s body_preview=%r",
            query,
            status,
            exc,
            _truncate_body(raw_body),
        )
        return []

    abstract = data.get("AbstractText")
    if not abstract:
        _log_zero_results("duckduckgo_instant", query, status, raw_body)
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


async def async_duckduckgo_search(session, query: str, max_results: int = 3) -> list[Evidence]:
    """Queries DuckDuckGo HTML Search to retrieve general web snippets and links."""
    import aiohttp
    url = "https://html.duckduckgo.com/html/"
    status = None
    html_content = ""
    try:
        # Construct header to look like a realistic web browser request
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://html.duckduckgo.com/",
        }
        data = {"q": query}
        async with session.post(url, data=data, headers=headers, timeout=aiohttp.ClientTimeout(total=_public_source_timeout())) as response:
            status = response.status
            if response.status != 200:
                # Try GET fallback
                async with session.get(url, params=data, headers=headers, timeout=aiohttp.ClientTimeout(total=_public_source_timeout())) as response2:
                    status = response2.status
                    if response2.status != 200:
                        logger.warning(
                            "duckduckgo html search failed for query=%r status=%s",
                            query,
                            response2.status,
                        )
                        return []
                    html_content = await response2.text()
            else:
                html_content = await response.text()
    except Exception as exc:
        logger.warning(
            "duckduckgo html search primary request failed for query=%r status=%s error=%s body_preview=%r",
            query,
            status,
            exc,
            _truncate_body(html_content),
        )
        try:
            # Simple GET fallback using session defaults
            async with session.get(url, params={"q": query}, timeout=aiohttp.ClientTimeout(total=_public_source_timeout())) as response:
                status = response.status
                if response.status != 200:
                    logger.warning(
                        "duckduckgo html fallback failed for query=%r status=%s",
                        query,
                        response.status,
                    )
                    return []
                html_content = await response.text()
        except Exception as fallback_exc:
            logger.warning(
                "duckduckgo html fallback exception for query=%r status=%s error=%s",
                query,
                status,
                fallback_exc,
            )
            return []

    parts = re.split(r'<div class="[^"]*result(?:__body)?[^"]*"[^>]*>', html_content)
    bodies = parts[1:]
    evidence: list[Evidence] = []
    
    for body in bodies:
        url_found = None
        url_match = re.search(r'href="([^"]+)"', body)
        if url_match:
            url_found = url_match.group(1)
            
        if not url_found:
            continue
            
        # Try extracting title from result__a or fallback to title link inside result__title
        title_match = re.search(r'<a[^>]+class="[^"]*result__a[^"]*"[^>]*>(.*?)</a>', body, re.DOTALL)
        if title_match:
            title_text = title_match.group(1)
        else:
            title_match_alt = re.search(r'<h2 class="result__title">.*?<a[^>]*>(.*?)</a>', body, re.DOTALL)
            title_text = title_match_alt.group(1) if title_match_alt else ""
            
        title_text = re.sub(r'<[^>]+>', '', title_text).strip()
        title_text = html.unescape(title_text)
        
        # Try extracting snippet from result__snippet
        snippet_match = re.search(r'<[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</[^>]+>', body, re.DOTALL)
        if not snippet_match:
            snippet_match = re.search(r'class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</', body, re.DOTALL)
            
        snippet_text = snippet_match.group(1) if snippet_match else ""
        snippet_text = re.sub(r'<[^>]+>', '', snippet_text).strip()
        snippet_text = html.unescape(snippet_text)
        
        if not snippet_text:
            snippet_text = "No preview available for this search result."
            
        if "/l/?kh=" in url_found or "uddg=" in url_found:
            url_match_param = re.search(r'uddg=([^&]+)', url_found)
            if url_match_param:
                url_found = urllib.parse.unquote(url_match_param.group(1))
        
        evidence.append(
            Evidence(
                title=title_text or "DuckDuckGo web source",
                summary=snippet_text[:1200],
                url=url_found,
                source_type="web",
                score=0.75,
                source_id=url_found,
                retrieved_via="duckduckgo_html_async",
            )
        )
        if len(evidence) >= max_results:
            break
            
    if not evidence:
        _log_zero_results("duckduckgo_html", query, status, html_content)
    return evidence


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


async def async_doaj_search(session, query: str, max_results: int = 2) -> list[Evidence]:
    """Queries Directory of Open Access Journals (DOAJ) to retrieve open-access academic articles."""
    raw_body = ""
    status = None
    try:
        import aiohttp
        clean_query = _clean_public_search_query(query)
        url = f"https://doaj.org/api/v4/search/articles/{urllib.parse.quote(clean_query)}"
        async with session.get(url, params={"pageSize": max_results}, timeout=aiohttp.ClientTimeout(total=_public_source_timeout())) as response:
            status = response.status
            data, raw_body = await _read_response_json_and_body(response)
            if response.status != 200:
                logger.warning(
                    "doaj search failed for query=%r status=%s body_preview=%r",
                    query,
                    response.status,
                    _truncate_body(raw_body),
                )
                return []
    except Exception as exc:
        logger.warning(
            "doaj search exception for query=%r status=%s error=%s body_preview=%r",
            query,
            status,
            exc,
            _truncate_body(raw_body),
        )
        return []

    evidence = []
    for result in data.get("results", []):
        bibjson = result.get("bibjson", {})
        title = bibjson.get("title") or "DOAJ academic paper"
        abstract = bibjson.get("abstract") or ""
        
        url_link = None
        links = bibjson.get("link", [])
        if links:
            url_link = links[0].get("url")

        evidence.append(
            Evidence(
                title=title,
                summary=abstract[:1200] if abstract else "Abstract not available.",
                url=url_link,
                source_type="research",
                score=0.80,
                source_id=url_link or title,
                retrieved_via="doaj_async",
            )
        )
    if not evidence:
        _log_zero_results("doaj", query, status, raw_body)
    return evidence


async def async_pubmed_search(session, query: str, max_results: int = 2) -> list[Evidence]:
    """Queries NCBI PubMed to retrieve biomedical and life sciences literature."""
    try:
        import aiohttp
        search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": max_results
        }
        async with session.get(search_url, params=params, timeout=aiohttp.ClientTimeout(total=_public_source_timeout())) as response:
            if response.status != 200:
                return []
            search_data = await response.json()
            id_list = search_data.get("esearchresult", {}).get("idlist", [])
            
        if not id_list:
            return []
            
        ids_str = ",".join(id_list)
        summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
        params_sum = {
            "db": "pubmed",
            "id": ids_str,
            "retmode": "json"
        }
        async with session.get(summary_url, params=params_sum, timeout=aiohttp.ClientTimeout(total=_public_source_timeout())) as sum_response:
            if sum_response.status != 200:
                return []
            summary_data = await sum_response.json()
            results = summary_data.get("result", {})
            
        evidence = []
        for uid in id_list:
            paper_info = results.get(uid, {})
            title = paper_info.get("title") or "PubMed article"
            source = paper_info.get("source") or "NCBI PubMed"
            pubdate = paper_info.get("pubdate") or ""
            
            summary_text = f"Journal: {source}. Publication Date: {pubdate}."
            authors = [a.get("name") for a in paper_info.get("authors", []) if a.get("name")]
            if authors:
                summary_text += f" Authors: {', '.join(authors)}."
                
            evidence.append(
                Evidence(
                    title=title,
                    summary=summary_text[:1200],
                    url=f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
                    source_type="research",
                    score=0.85,
                    source_id=f"PMID:{uid}",
                    retrieved_via="pubmed_async",
                )
            )
        return evidence
    except Exception:
        return []
