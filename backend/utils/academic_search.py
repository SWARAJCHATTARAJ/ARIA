import asyncio
import logging
import urllib.parse
import xml.etree.ElementTree as ET
import re
from typing import List, Dict, Any, Optional
import httpx
import os
import html
import time
import datetime
from config import settings
from utils.ssrf_guard import is_safe_url, SSRFSafeTransport
from utils.retrieval_timings import retrieval_tracker

logger = logging.getLogger(__name__)

STOP_WORDS = {
    "what", "when", "where", "which", "while", "who", "whom", "whose", "why", "how",
    "that", "this", "these", "those", "with", "from", "about", "into", "through",
    "during", "before", "after", "above", "below", "have", "has", "had", "been",
    "were", "their", "there", "they", "them", "some", "such", "than", "then",
    "more", "most", "other", "the", "and", "for", "are", "can", "all", "any",
    "was", "will"
}

AFFILIATION_KEYWORDS = {
    "university", "department", "history of", "institute", "hospital",
    "center", "centre", "laboratory", "school", "division", "united states",
    "ministry", "association", "technology and medicine"
}

def clean_authors_list(authors: List[str]) -> Optional[List[str]]:
    """Filters out institutional affiliations from authors list."""
    cleaned = []
    for a in authors:
        a_clean = a.strip()
        a_lower = a_clean.lower()
        if any(kw in a_lower for kw in AFFILIATION_KEYWORDS):
            continue
        if len(a_clean) > 40 and "," not in a_clean:
            continue
        cleaned.append(a_clean)
    return cleaned if cleaned else None

async def search_arxiv(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """
    Queries official arXiv API with relevance sort and optional submittedDate range from query year.
    Drops results with no topic overlap.
    """
    # Check if recency / specific year is requested
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = year_match.group(1) if year_match else None
    
    # Strip explicit year and wildcard characters from query keywords for cleaner arXiv term matching
    search_q = re.sub(r"\b20[12][0-9]\b", "", query)
    search_q = re.sub(r"[?*#&%=+]", " ", search_q).strip()
    search_q = " ".join(search_q.split())
    fallback_q = re.sub(r"[?*#&%=+]", " ", query).strip()
    clean_query = urllib.parse.quote_plus(search_q if search_q else fallback_q)
    
    if target_year:
        url = (
            f"https://export.arxiv.org/api/query?search_query=all:{clean_query}"
            f"+AND+submittedDate:[{target_year}01010000+TO+{target_year}12312359]"
            f"&sortBy=relevance&sortOrder=descending&start=0&max_results={max_results}"
        )
    else:
        url = (
            f"https://export.arxiv.org/api/query?search_query=all:{clean_query}"
            f"&sortBy=relevance&sortOrder=descending&start=0&max_results={max_results}"
        )
    
    q_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", query.lower())) - STOP_WORDS
    results = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url)
            status_str = f"HTTP {resp.status_code}"
            if resp.status_code == 200 and resp.text:
                root = ET.fromstring(resp.text)
                ns = {
                    "atom": "http://www.w3.org/2005/Atom",
                    "arxiv": "http://arxiv.org/schemas/atom"
                }
                for entry in root.findall("atom:entry", ns):
                    title_elem = entry.find("atom:title", ns)
                    summary_elem = entry.find("atom:summary", ns)
                    id_elem = entry.find("atom:id", ns)
                    doi_elem = entry.find("arxiv:doi", ns)
                    published_elem = entry.find("atom:published", ns)
                    
                    title = title_elem.text.strip().replace("\n", " ") if title_elem is not None and title_elem.text else "Untitled Paper"
                    summary = summary_elem.text.strip().replace("\n", " ") if summary_elem is not None and summary_elem.text else ""
                    raw_id = id_elem.text.strip() if id_elem is not None and id_elem.text else ""
                    arxiv_id = raw_id.split("/abs/")[-1] if "/abs/" in raw_id else raw_id
                    doi = doi_elem.text.strip() if doi_elem is not None and doi_elem.text else None
                    pub_str = published_elem.text.strip()[:10] if published_elem is not None and published_elem.text else None
                    
                    year = None
                    if pub_str and len(pub_str) >= 4 and pub_str[:4].isdigit():
                        year = int(pub_str[:4])
                    
                    # Drop results without at least 2 distinct content words overlap
                    paper_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", (title + " " + summary).lower()))
                    overlap_tokens = q_tokens.intersection(paper_tokens)
                    if q_tokens and len(overlap_tokens) < 2:
                        logger.info(f"Dropping arXiv paper with <2 content words overlap ({len(overlap_tokens)} matched): {title}")
                        continue
                        
                    # Require substantial abstracts (minimum 120 characters)
                    if not summary or len(summary.strip()) < 120:
                        logger.info(f"Dropping arXiv paper with empty or short (<120 chars) abstract: {title}")
                        continue

                    # Drop other years if target_year specified
                    if target_year and year and year != int(target_year):
                        logger.info(f"Dropping arXiv paper outside target year {target_year}: [{year}] {title}")
                        continue
                    
                    raw_authors = []
                    for author_elem in entry.findall("atom:author", ns):
                        name = author_elem.find("atom:name", ns)
                        if name is not None and name.text:
                            raw_authors.append(name.text.strip())
                            
                    authors = clean_authors_list(raw_authors)
                    author_str = f" ({', '.join(authors[:2])}{' et al.' if len(authors) > 2 else ''})" if authors else ""

                    results.append({
                        "tier": "LIVE",
                        "source_type": "arxiv",
                        "review_status": "preprint",
                        "title": title,
                        "path": None,
                        "url": raw_id if raw_id else None,
                        "authors": authors,
                        "year": year,
                        "venue": "arXiv",
                        "snippet": summary,
                        "source": f"arXiv:{arxiv_id}{author_str}",
                        "arxiv_id": arxiv_id if arxiv_id else None,
                        "doi": doi,
                        "is_retracted": False,
                        "published": pub_str
                    })
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.warning(f"arXiv search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_arxiv", t0, t1, start_iso, end_iso, status_str)
        
    return results

async def search_openalex(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """
    Queries OpenAlex API for open scientific literature.
    Applies publication_year filter when a year is present in the query.
    """
    # Strip punctuation/wildcards that trigger OpenAlex 400 errors
    clean_q = re.sub(r"[?*#&%=+]", " ", query).strip()
    clean_query = urllib.parse.quote_plus(" ".join(clean_q.split()))
    
    # Check for target year filter
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = year_match.group(1) if year_match else None
    
    if target_year:
        url = f"https://api.openalex.org/works?search={clean_query}&filter=publication_year:{target_year},type:article&per-page={max_results}"
    else:
        url = f"https://api.openalex.org/works?search={clean_query}&per-page={max_results}"

    headers = {"User-Agent": "ARIA-Research-Assistant/2.0 (mailto:swarajchattaraj@users.noreply.github.com)"}
    
    results = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            status_str = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                data = resp.json()
                for work in data.get("results", []):
                    title = work.get("title") or "Scientific Publication"
                    raw_doi = work.get("doi") or None
                    doi = raw_doi.replace("https://doi.org/", "") if raw_doi else None
                    year = work.get("publication_year") or None
                    pub_date = work.get("publication_date") or (str(year) if year else None)
                    is_retracted = bool(work.get("is_retracted", False))
                    
                    # Venue / Journal Name
                    primary_loc = work.get("primary_location") or {}
                    source_obj = primary_loc.get("source") or {}
                    venue = source_obj.get("display_name") or "OpenAlex"
                    
                    # Extract authors (with affiliation filtering)
                    raw_authors = []
                    for authorship in work.get("authorships", []):
                        author_obj = authorship.get("author") or {}
                        author_name = author_obj.get("display_name")
                        if author_name:
                            raw_authors.append(author_name)
                    authors = clean_authors_list(raw_authors)
                    
                    # Extract arxiv_id from ids dictionary if present
                    ids = work.get("ids", {})
                    arxiv_url = ids.get("arxiv") or ""
                    arxiv_id = arxiv_url.split("/")[-1] if arxiv_url else None
                    
                    # OpenAlex abstract inverted index reconstruction
                    abstract = ""
                    inv_index = work.get("abstract_inverted_index")
                    if inv_index and isinstance(inv_index, dict):
                        words = sorted([(pos, word) for word, positions in inv_index.items() for pos in positions])
                        abstract = " ".join([w[1] for w in words[:150]])
                        
                    snippet = abstract if abstract else f"Published in {year}. Scientific paper indexed by OpenAlex."
                    source_str = f"OpenAlex [{year}]: {title}"
                    if raw_doi:
                        source_str = raw_doi

                    # Fix doubled OpenAlex URL
                    raw_work_id = work.get("id") or ""
                    if raw_work_id.startswith("http"):
                        work_url = raw_work_id
                    elif raw_work_id:
                        work_url = f"https://openalex.org/{raw_work_id}"
                    else:
                        work_url = None
                    final_url = raw_doi or work_url

                    results.append({
                        "tier": "LIVE",
                        "source_type": "openalex",
                        "review_status": "scholarly",
                        "title": title,
                        "path": None,
                        "url": final_url,
                        "authors": authors,
                        "year": int(year) if year else None,
                        "venue": venue,
                        "snippet": snippet,
                        "source": source_str,
                        "doi": doi,
                        "arxiv_id": arxiv_id,
                        "is_retracted": is_retracted,
                        "published": pub_date,
                        "cited_by_count": work.get("cited_by_count", 0)
                    })
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.warning(f"OpenAlex search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_openalex", t0, t1, start_iso, end_iso, status_str)
        
    return results

async def search_duckduckgo(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """
    Live web search using DDGS. Returns chunks under tier='LIVE' with source_type='duckduckgo'.
    """
    results = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS
        ddgs = DDGS()
        def _call_ddgs():
            return list(ddgs.text(query, max_results=max_results))
        ddg_hits = await asyncio.wait_for(asyncio.to_thread(_call_ddgs), timeout=5.0)
        status_str = f"DDGS {len(ddg_hits)} hits"
        for res in ddg_hits:
            body = res.get("body", "")
            if body:
                href = res.get("href")
                year_match = re.search(r"\b(20[12][0-9])\b", body + " " + (href or ""))
                year = int(year_match.group(1)) if year_match else None
                pub_date = str(year) if year else None
                
                results.append({
                    "tier": "LIVE",
                    "source_type": "duckduckgo",
                    "review_status": "unreviewed_web",
                    "title": res.get("title", "Web Source"),
                    "path": None,
                    "url": href if href else None,
                    "authors": None,
                    "year": year,
                    "venue": "DuckDuckGo",
                    "snippet": body,
                    "source": href if href else "DuckDuckGo",
                    "doi": None,
                    "arxiv_id": None,
                    "is_retracted": False,
                    "published": pub_date
                })
    except Exception as e:
        status_str = f"DDGS failed: {type(e).__name__}"
        logger.warning(f"DuckDuckGo search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_ddgs", t0, t1, start_iso, end_iso, status_str)

    # Fallback to direct html.duckduckgo.com if ddgs returned no results
    if not results:
        t0_fb = time.time()
        start_iso_fb = datetime.datetime.now().isoformat()
        status_fb = "error"
        try:
            async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                resp = await client.post("https://html.duckduckgo.com/html/", data={"q": query}, headers=headers)
                status_fb = f"HTTP {resp.status_code}"
                if resp.status_code == 200:
                    resp_lower = resp.text.lower()
                    if "anomaly" in resp_lower or "bots" in resp_lower or "captcha" in resp_lower or "challenge" in resp_lower or "blocked" in resp_lower:
                        logger.warning("DuckDuckGo returned challenge/block page, skipping DDG.")
                        status_fb = "challenge/blocked"
                        return results
                    matches = list(re.finditer(r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', resp.text, re.DOTALL))
                    title_matches = list(re.finditer(r'<a[^>]+class="[^"]*result__url[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', resp.text, re.DOTALL))
                    for i, m in enumerate(matches):
                        href = m.group(1)
                        if "uddg=" in href:
                            parsed = urllib.parse.urlparse(href)
                            qs = urllib.parse.parse_qs(parsed.query)
                            href = qs.get("uddg", [href])[0]
                        raw_body = re.sub(r'<[^>]+>', ' ', m.group(2))
                        body = html.unescape(' '.join(raw_body.split()))
                        
                        title = "Web Source"
                        if i < len(title_matches):
                            t_text = re.sub(r'<[^>]+>', ' ', title_matches[i].group(2)).strip()
                            if t_text:
                                title = t_text
                                
                        year_match = re.search(r"\b(20[12][0-9])\b", body + " " + href)
                        year = int(year_match.group(1)) if year_match else None
                        results.append({
                            "tier": "LIVE",
                            "source_type": "duckduckgo",
                            "review_status": "unreviewed_web",
                            "title": title,
                            "path": None,
                            "url": href,
                            "authors": None,
                            "year": year,
                            "venue": "DuckDuckGo",
                            "snippet": body,
                            "source": href,
                            "doi": None,
                            "arxiv_id": None,
                            "is_retracted": False,
                            "published": str(year) if year else None
                        })
                        if len(results) >= max_results:
                            break
        except Exception as e:
            status_fb = f"fallback failed: {type(e).__name__}"
            logger.warning(f"DuckDuckGo html fallback search error: {e}")
        finally:
            t1_fb = time.time()
            end_iso_fb = datetime.datetime.now().isoformat()
            retrieval_tracker.record("provider_ddg_html_fallback", t0_fb, t1_fb, start_iso_fb, end_iso_fb, status_fb)
        
    return results

async def search_semantic_scholar(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """
    Queries the free Semantic Scholar Graph API for scholarly papers with abstracts.
    Applies the same evidence-density discipline as arXiv/OpenAlex (>=120 char abstracts
    and >=2 content-word overlap) so Semantic Scholar citations stay substantive.
    """
    clean_q = re.sub(r"[?*#&%=+\[\]\"]", " ", query).strip()
    clean_query = " ".join(clean_q.split())[:200]
    url = (
        "https://api.semanticscholar.org/graph/v1/paper/search"
        f"?query={urllib.parse.quote_plus(clean_query)}"
        "&fields=title,abstract,year,venue,externalIds,url,authors,citationCount,openAccessPdf"
        f"&limit={max_results}"
    )
    headers = {"User-Agent": "ARIA-Research-Assistant/2.0 (mailto:swarajchattaraj@users.noreply.github.com)"}

    results = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            status_str = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                data = resp.json()
                q_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", query.lower())) - STOP_WORDS
                for paper in data.get("data", []):
                    title = (paper.get("title") or "").strip()
                    abstract = (paper.get("abstract") or "").strip().replace("\n", " ")
                    if not title or len(abstract) < 120:
                        continue
                    paper_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", (title + " " + abstract).lower()))
                    if q_tokens and len(q_tokens.intersection(paper_tokens)) < 2:
                        continue

                    ext = paper.get("externalIds") or {}
                    doi = ext.get("DOI")
                    arxiv_id = ext.get("ArXiv")
                    year = paper.get("year")
                    venue = paper.get("venue") or "Semantic Scholar"
                    raw_authors = [
                        a.get("name") for a in (paper.get("authors") or [])
                        if isinstance(a, dict) and a.get("name")
                    ]
                    authors = clean_authors_list(raw_authors)
                    author_str = f" ({', '.join(authors[:2])}{' et al.' if len(authors) > 2 else ''})" if authors else ""
                    paper_url = paper.get("url") or (f"https://doi.org/{doi}" if doi else None)

                    results.append({
                        "tier": "LIVE",
                        "source_type": "semantic_scholar",
                        "review_status": "scholarly",
                        "title": title,
                        "path": None,
                        "url": paper_url,
                        "authors": authors,
                        "year": int(year) if isinstance(year, int) or (isinstance(year, str) and year.isdigit()) else None,
                        "venue": venue,
                        "snippet": abstract,
                        "source": f"Semantic Scholar:{arxiv_id or doi or title[:60]}{author_str}",
                        "arxiv_id": arxiv_id,
                        "doi": doi,
                        "is_retracted": False,
                        "published": str(year) if year else None,
                        "cited_by_count": paper.get("citationCount", 0)
                    })
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.warning(f"Semantic Scholar search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_semantic_scholar", t0, t1, start_iso, end_iso, status_str)

    return results

async def search_wikipedia(query: str, max_results: int = 1, exact_title: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Encyclopedic reference search using Wikipedia. Returns chunks under tier='LIVE' with source_type='wikipedia'.
    When a disambiguated canonical article title is available (Part 1.1 reformulator), that exact title is
    tried first before generic search.
    """
    results = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        def _run_wiki():
            import wikipedia
            wikipedia.set_user_agent("ARIA-Scientific-Assistant/2.0 (https://aria.swarajchattaraj.tech; contact@swarajchattaraj.tech)")
            ranked: List[tuple] = []
            if exact_title and exact_title.strip():
                try:
                    summ = wikipedia.summary(exact_title.strip(), sentences=3, auto_suggest=False)
                    ranked.append((exact_title.strip(), summ))
                except Exception:
                    pass
            if len(ranked) < max(1, max_results):
                hits = wikipedia.search(query, results=max_results)
                for hit in hits:
                    if any(h.lower() == hit.lower() for h, _ in ranked):
                        continue
                    try:
                        summ = wikipedia.summary(hit, sentences=3, auto_suggest=False)
                        ranked.append((hit, summ))
                    except Exception:
                        continue
            return ranked
        wiki_data = await asyncio.wait_for(asyncio.to_thread(_run_wiki), timeout=6.0)
        status_str = f"Wikipedia {len(wiki_data)} hits"
        for hit, summary in wiki_data:
            results.append({
                "tier": "LIVE",
                "source_type": "wikipedia",
                "review_status": "unreviewed_web",
                "title": f"Wikipedia: {hit}",
                "path": None,
                "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(hit)}",
                "authors": None,
                "year": None,
                "venue": "Wikipedia",
                "snippet": summary,
                "source": f"Wikipedia ({hit})",
                "doi": None,
                "arxiv_id": None,
                "is_retracted": False,
                "published": None
            })
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.warning(f"Wikipedia search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_wikipedia", t0, t1, start_iso, end_iso, status_str)
        
    return results

def compute_source_score(chunk: Dict[str, Any], query: str) -> float:
    """
    Ranks sources with calibrated multi-factor scoring:
    1. Query term overlap / relevance (primary).
    2. Academic credibility (arXiv / OpenAlex > Wikipedia > general web).
    3. Moderate recency bonus (cannot override low relevance).
    """
    query_lower = query.lower()
    q_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", query_lower)) - STOP_WORDS
    
    title_text = chunk.get("title", "").lower()
    snippet_text = chunk.get("snippet", "").lower()
    full_text = title_text + " " + snippet_text
    chunk_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", full_text))
    
    # 1. Term Overlap Relevance
    overlap_count = len(q_tokens.intersection(chunk_tokens))
    title_overlap = len(q_tokens.intersection(set(re.findall(r"\b[a-zA-Z]{3,}\b", title_text))))
    relevance_score = (title_overlap * 8.0) + (overlap_count * 2.5)

    # Penalize papers with low citations / anomalous claims if OpenAlex
    cited_by = chunk.get("cited_by_count", 0)
    if chunk.get("source_type") == "openalex" and cited_by == 0 and "anomalies" in title_text:
        relevance_score -= 10.0  # Penalize unverified fringe / predatory papers

    # 2. Source-type credibility base
    stype = chunk.get("source_type")
    if stype == "arxiv":
        credibility_score = 8.0
    elif stype == "openalex":
        credibility_score = 7.5
    elif stype == "semantic_scholar":
        credibility_score = 7.5
    elif stype == "wikipedia":
        credibility_score = 5.0
    else:  # duckduckgo
        credibility_score = 3.5

    # 3. Recency modifier
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = int(year_match.group(1)) if year_match else None
    chunk_year = chunk.get("year")
    
    recency_score = 0.0
    if target_year and chunk_year:
        if chunk_year == target_year:
            recency_score = 4.0  # Moderate bonus for exact year
        elif chunk_year < target_year - 2:
            recency_score = -4.0  # Penalty for older work when explicit year is queried

    return relevance_score + credibility_score + recency_score

def extract_main_article_content(raw_html: str) -> str:
    """
    Extracts the main article region from HTML:
    - Drops nav, sidebar, share-button, footer, script, and style text.
    - Prefers dedicated content classes (post-body, entry-content, article-body, main-content).
    - Prefers <article> and <main> elements with substantial text.
    - Falls back to the largest container block.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(raw_html, "html.parser")
    
    # Drop scripts, styles, forms, svgs, iframes
    for tag in soup(["script", "style", "svg", "noscript", "form", "iframe"]):
        tag.decompose()

    chosen_elem = None
    # 1. Dedicated content containers
    content_classes = [
        re.compile(r"post-body", re.I),
        re.compile(r"entry-content", re.I),
        re.compile(r"article-body", re.I),
        re.compile(r"main-content", re.I),
    ]
    for c_pattern in content_classes:
        found = soup.find(class_=c_pattern)
        if found and len(found.get_text(strip=True)) >= 250:
            chosen_elem = found
            break

    # 2. <article> tag
    if not chosen_elem:
        art = soup.find("article")
        if art and len(art.get_text(strip=True)) >= 250:
            chosen_elem = art

    # 3. <main> tag
    if not chosen_elem:
        m = soup.find("main")
        if m and len(m.get_text(strip=True)) >= 250:
            chosen_elem = m

    # 4. Largest text container among <div> and <section>
    if not chosen_elem:
        candidates = []
        for block in soup.find_all(["div", "section"]):
            if block.parent and block.parent.name in ("body", "html"):
                continue
            t = block.get_text(strip=True)
            if len(t) >= 250:
                candidates.append((len(t), block))
        if candidates:
            candidates.sort(key=lambda x: x[0], reverse=True)
            chosen_elem = candidates[0][1]

    target = chosen_elem if chosen_elem else soup

    # Clean inside the chosen target: drop nav, sidebar, share buttons, footer, comments
    for elem in target.find_all(["nav", "footer", "aside"]):
        elem.decompose()
    for elem in target.find_all(attrs={"class": re.compile(r"share|social|comment|footer-bar|post-footer|sidebar|widget-item-control", re.I)}):
        elem.decompose()
    for elem in target.find_all(attrs={"id": re.compile(r"share|social|comment|footer|sidebar", re.I)}):
        elem.decompose()

    text = target.get_text(separator=" ", strip=True)
    text = re.sub(r'\bFull article here\b', '', text, flags=re.I)
    text = html.unescape(" ".join(text.split()))
    return text

def extract_scored_sentence_snippet(text: str, query: str, max_chars: int = 1500) -> str:
    """
    Selects a snippet window starting strictly at a sentence boundary,
    scored by overlap with the question's content words and target year.
    """
    if not text or len(text) < 100:
        return text

    q_words = [w.lower() for w in re.findall(r"\b[a-zA-Z]{3,}\b", query) if w.lower() not in STOP_WORDS]
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = year_match.group(1) if year_match else None

    # Sentence boundary matches: starts at offset 0 or after [.!?] followed by space and [A-Z0-9]
    boundary_matches = [0] + [m.start(1) for m in re.finditer(r'(?<=[.!?])\s+([A-Z0-9])', text)]
    boundary_matches = sorted(list(set(boundary_matches)))

    best_score = -1.0
    best_snippet = text[:max_chars].strip()

    for start_idx in boundary_matches:
        if start_idx >= len(text) - 60:
            break
            
        target_end = min(len(text), start_idx + max_chars)
        window_text = text[start_idx:target_end]
        
        # Snap end to sentence boundary if possible
        if len(window_text) >= 400:
            last_punct = max(window_text.rfind('. '), window_text.rfind('? '), window_text.rfind('! '))
            if last_punct > 300:
                window_text = window_text[:last_punct + 1]

        window_lower = window_text.lower()
        distinct_overlap = sum(1 for w in q_words if w in window_lower)
        total_occurrences = sum(window_lower.count(w) for w in q_words)
        year_bonus = 20.0 if (target_year and target_year in window_lower) else 0.0
        # Position bias: earlier sections represent main topic / newest items
        pos_bias = max(0.0, 15.0 * (1.0 - start_idx / 3000.0))
        heading_bonus = 8.0 if start_idx == 0 else 0.0
        
        score = (distinct_overlap * 5.0) + (total_occurrences * 1.5) + year_bonus + pos_bias + heading_bonus
        if score > best_score:
            best_score = score
            best_snippet = window_text.strip()

    return best_snippet

async def fetch_readable_text(url: Optional[str], query: str, fallback_snippet: str = "") -> str:
    """
    Fetches readable text for a source:
    - Scheme: http/https only, ports 80/443 only.
    - SSRF guard validates DNS and blocks loopback, private, link-local, unique-local,
      IPv4-mapped, and cloud metadata (169.254.169.254).
    - Re-validates peer IP after socket connection via SSRFSafeTransport (DNS rebinding defense).
    - Re-checks every redirect hop (max 3 hops) against SSRF guard.
    - HTTP GET with 5.0s timeout and strict 60 KB size cap. Skips PDFs.
    - Extracts main article region (<article>, <main>, or largest text block).
    - Drops nav, sidebar, share-button, and footer text.
    - Starts snippets at a sentence boundary scored by content words and target year.
    - Logs 'fetched N chars from <url>' on success.
    """
    if not url or not url.startswith("http"):
        return fallback_snippet
        
    url_lower = url.lower()
    if url_lower.endswith(".pdf") or "/pdf/" in url_lower:
        return fallback_snippet
        
    is_safe, reason = is_safe_url(url)
    if not is_safe:
        logger.warning(f"SSRF guard blocked initial fetch for {url}: {reason}")
        return fallback_snippet

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ARIA-Research/2.0"
    }

    current_url = url
    max_redirects = 3
    redirect_count = 0

    t0_fetch = time.time()
    start_iso_fetch = datetime.datetime.now().isoformat()
    status_fetch = "error"
    try:
        transport = SSRFSafeTransport()
        # Use httpx with follow_redirects=False to manually inspect every redirect hop
        async with httpx.AsyncClient(transport=transport, timeout=5.0, follow_redirects=False) as client:
            while redirect_count <= max_redirects:
                resp = await client.get(current_url, headers=headers)
                status_fetch = f"HTTP {resp.status_code}"
                
                # Check for redirects (301, 302, 303, 307, 308)
                if resp.status_code in (301, 302, 303, 307, 308):
                    redirect_count += 1
                    if redirect_count > max_redirects:
                        logger.warning(f"Exceeded max redirects ({max_redirects}) for {url}")
                        return fallback_snippet
                        
                    location = resp.headers.get("location")
                    if not location:
                        logger.warning(f"Redirect without Location header from {current_url}")
                        return fallback_snippet
                        
                    next_url = urllib.parse.urljoin(current_url, location)
                    is_next_safe, next_reason = is_safe_url(next_url)
                    if not is_next_safe:
                        logger.warning(f"SSRF guard blocked redirect from {current_url} to {next_url}: {next_reason}")
                        return fallback_snippet
                        
                    current_url = next_url
                    continue

                if resp.status_code != 200:
                    return fallback_snippet

                content_type = resp.headers.get("content-type", "").lower()
                if "application/pdf" in content_type:
                    return fallback_snippet

                # Robust HTML cleaning with size cap
                raw_bytes = resp.content[:262144]
                raw_text = raw_bytes.decode(resp.encoding or "utf-8", errors="replace")
                
                # Extract main article region and drop nav, sidebar, share buttons, footer
                article_text = extract_main_article_content(raw_text)
                if len(article_text) < 80:
                    return fallback_snippet

                # Start snippet at sentence boundary scored by content words and target year
                final_res = extract_scored_sentence_snippet(article_text, query, max_chars=1500)
                if not final_res or len(final_res) < 80:
                    final_res = fallback_snippet

                if final_res != fallback_snippet:
                    logger.info(f"fetched {len(final_res)} chars from {url}")
                return final_res

    except Exception as e:
        status_fetch = f"failed: {type(e).__name__}"
        logger.debug(f"Failed to fetch readable text from {url}: {e}")
        return fallback_snippet
    finally:
        t1_fetch = time.time()
        end_iso_fetch = datetime.datetime.now().isoformat()
        retrieval_tracker.record(f"page_fetch: {url[:50]}", t0_fetch, t1_fetch, start_iso_fetch, end_iso_fetch, status_fetch)

async def search_all_free_sources(query: str, wikipedia_title: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Executes parallel multi-source search across:
    1. arXiv
    2. OpenAlex
    3. Semantic Scholar
    4. DuckDuckGo
    5. Wikipedia (prioritizes disambiguated exact article title from the reformulator)
    Capped at 15s total: providers capped at 10.0s, page fetches capped at 5.0s max.
    Filters out results with 0 query overlap and ranks candidates fairly.
    """
    t_retrieval_start = time.time()
    iso_start = datetime.datetime.now().isoformat()
    retrieval_tracker.record("live_retrieval_start", t_retrieval_start, t_retrieval_start, iso_start, iso_start, "cap=15s")

    provider_tasks = [
        asyncio.create_task(search_arxiv(query, max_results=3)),
        asyncio.create_task(search_openalex(query, max_results=3)),
        asyncio.create_task(search_semantic_scholar(query, max_results=2)),
        asyncio.create_task(search_duckduckgo(query, max_results=3)),
        asyncio.create_task(search_wikipedia(query, max_results=1, exact_title=wikipedia_title))
    ]
    
    # Cap providers at 10.0s so total retrieval stays well within 15.0s
    done, pending = await asyncio.wait(provider_tasks, timeout=10.0)
    if pending:
        logger.warning(f"[RETRIEVAL] {len(pending)} provider task(s) timed out at 10.0s cap and will be cancelled.")
        for p in pending:
            p.cancel()

    combined = []
    for t in done:
        try:
            res = t.result()
            if isinstance(res, list):
                combined.extend(res)
        except Exception as e:
            logger.warning(f"Provider task failed: {e}")
            
    # Filter 1: Drop results with zero query term overlap
    q_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", query.lower())) - STOP_WORDS
    valid_chunks = []
    for chunk in combined:
        title_snippet = (chunk.get("title", "") + " " + chunk.get("snippet", "")).lower()
        chunk_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", title_snippet))
        if q_tokens and len(q_tokens.intersection(chunk_tokens)) == 0:
            logger.info(f"Dropped result with 0 query overlap: '{chunk.get('title')}'")
            continue
        valid_chunks.append(chunk)

    # Filter 2: When the query has a year, drop results from other years unless nothing else remains
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = int(year_match.group(1)) if year_match else None
    if target_year:
        year_matching = [c for c in valid_chunks if c.get("year") == target_year]
        if year_matching:
            valid_chunks = [c for c in valid_chunks if c.get("year") == target_year or c.get("year") is None]

    # Rank filtered sources
    scored_chunks = sorted(valid_chunks, key=lambda c: compute_source_score(c, query), reverse=True)
    
    # Assign 1-indexed ranks
    for rank_idx, chunk in enumerate(scored_chunks, start=1):
        chunk["rank"] = rank_idx
        chunk["tier"] = "LIVE"

    # Fetch readable text for top N general-web results only (duckduckgo and similar) in rank order
    # OpenAlex and arXiv already carry abstracts
    fetch_n = int(os.environ.get("FETCH_TOP_N", getattr(settings, "fetch_top_n", 2)))
    if fetch_n > 0 and scored_chunks:
        fetch_targets = [
            c for c in scored_chunks
            if c.get("source_type") not in ("openalex", "arxiv", "okf_note", "okf_graph", "pgvector")
        ][:fetch_n]
        if fetch_targets:
            elapsed = time.time() - t_retrieval_start
            time_remaining = max(1.0, min(5.0, 15.0 - elapsed))
            fetch_tasks = [
                asyncio.create_task(fetch_readable_text(c.get("url"), query, fallback_snippet=c.get("snippet", "")))
                for c in fetch_targets
            ]
            done_f, pending_f = await asyncio.wait(fetch_tasks, timeout=time_remaining)
            if pending_f:
                logger.warning(f"[RETRIEVAL] {len(pending_f)} page fetch task(s) exceeded {time_remaining:.1f}s cap and will be cancelled.")
                for pf in pending_f:
                    pf.cancel()

            for idx, task in enumerate(fetch_tasks):
                if task in done_f:
                    try:
                        res = task.result()
                        if isinstance(res, str) and res.strip() and res.strip() != fetch_targets[idx].get("snippet", ""):
                            old_snip = fetch_targets[idx].get("snippet", "")
                            fetch_targets[idx]["snippet"] = res
                            fetch_targets[idx]["content"] = res
                            logger.info(f"Page fetch replaced snippet for {fetch_targets[idx].get('url')} ({len(old_snip)} -> {len(res)} chars)")
                    except Exception as e:
                        logger.warning(f"Fetch task error: {e}")

    t_retrieval_end = time.time()
    iso_end = datetime.datetime.now().isoformat()
    retrieval_tracker.record("live_retrieval_end", t_retrieval_end, t_retrieval_end, iso_end, iso_end, f"total={t_retrieval_end - t_retrieval_start:.2f}s")
        
    return scored_chunks
