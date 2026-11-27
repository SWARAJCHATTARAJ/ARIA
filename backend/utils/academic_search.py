import asyncio
import logging
import urllib.parse
import xml.etree.ElementTree as ET
import re
import math
from typing import List, Dict, Any, Optional, Tuple
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

# Strict network timeout limits: fail fast on connect/read rather than blocking pipeline
EXTERNAL_SEARCH_TIMEOUT = httpx.Timeout(connect=5.0, read=8.0, write=5.0, pool=5.0)

ARXIV_TOPIC_CATEGORIES = {
    "cs": "cat:cs.*",
    "physics": "(cat:physics.*+OR+cat:astro-ph.*)",
    "math": "cat:math.*",
    "bio": "cat:q-bio.*",
    "chem": "(cat:cond-mat.mtrl-sci+OR+cat:physics.chem-ph)",
    "eng": "cat:eess.*",
    "econ": "(cat:q-fin.*+OR+cat:econ.*)",
    "law": "(cat:econ.*+OR+cat:cs.CY)",
}

OPENALEX_TOPIC_CONCEPTS = {
    "cs": "computer science",
    "physics": "physics",
    "math": "mathematics",
    "bio": "biology",
    "chem": "chemistry",
    "eng": "engineering",
    "econ": "economics",
    "law": "law",
}

SCHOLARLY_SOURCE_TYPES = {"openalex", "crossref", "arxiv", "semantic_scholar", "pubmed"}

DISCIPLINE_EXPANSION_TERMS = {
    "arts_performance": "acoustics biomechanics pedagogy technique history",
    "zoology_botany_earth": "taxonomy morphology ecology physiology habitat classification",
    "medicine_clinical": "pathophysiology clinical trials epidemiology mechanism efficacy",
    "instruments_engineering": "optics resolution instrumentation architecture calibration",
    "cs_math": "algorithmic complexity formal analysis architecture benchmarks",
    "geography_history_social": "geography history governance economy demographics culture",
    "pure_science": "physical principles mechanism quantitative properties spectroscopy",
    "general": "comprehensive review mechanisms taxonomy properties",
}

NICHE_CASE_PENALTY_TERMS = (
    "unfpa", "futon", "memorandum", "letter to the editor", "erratum",
    "corrigendum", "book review", "obituary", "conference report",
    "case report:", "news in brief", "reply to:", "comment on:",
)


def _is_retracted_title(title: str) -> bool:
    tl = (title or "").lower()
    return (
        tl.startswith("retracted:")
        or tl.startswith("retraction:")
        or "[retracted]" in tl
        or "(retracted)" in tl
        or "retraction notice" in tl
    )


def normalize_source_metadata(chunk: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures every retrieved chunk carries clean authors, venue, title, and readable prose."""
    c = dict(chunk)
    title = (c.get("title") or "").strip()
    if not title or title.lower() == "unknown":
        title = c.get("source") or "Reference Source"
    c["title"] = title

    venue = (c.get("venue") or "").strip()
    if not venue or venue.lower() in ("unknown", "n/a"):
        stype = c.get("source_type", "")
        venue = {
            "openalex": "OpenAlex Indexed Journal",
            "crossref": "Crossref Scholarly Archive",
            "semantic_scholar": "Semantic Scholar",
            "arxiv": "arXiv Preprint",
            "pubmed": "PubMed / MEDLINE",
            "wikipedia": "Wikipedia",
        }.get(stype, _domain_from_url(c.get("url"), fallback="Web Reference"))
    c["venue"] = venue

    authors = c.get("authors")
    if isinstance(authors, list):
        clean_auth = [str(a).strip() for a in authors if a and str(a).strip().lower() != "unknown"]
        c["authors"] = clean_auth if clean_auth else None
    elif isinstance(authors, str) and authors.strip().lower() == "unknown":
        c["authors"] = None

    if not c.get("authors") and c.get("source_type") == "wikipedia":
        c["authors"] = ["Wikipedia Contributors"]

    snip = clean_scraped_reference_text(c.get("snippet") or c.get("content") or "")
    if snip:
        c["snippet"] = snip
        c["content"] = snip
    return c


def resolve_min_year(recency: Optional[str] = None) -> Optional[int]:
    """Resolves UI recency filter ('all' | '5y' | '2y') to an inclusive cutoff year."""
    if not recency or recency == "all":
        return None
    cur_year = datetime.datetime.now().year
    if recency == "2y":
        return cur_year - 2
    if recency == "5y":
        return cur_year - 5
    return None


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

def clean_scraped_reference_text(text: str) -> str:
    """
    Cleans raw scraped/Wikipedia text before chunking, synthesis, and evidence extraction:
    - Strips Wikipedia navigation menus, language switcher lists ('331 languages Аԥсшәа Acèh...'),
      citation brackets ([1], [citation needed], [edit]), and MediaWiki UI chrome.
    - Strips maintenance banners: (Learn how and when to remove this message), citation notices.
    - Strips image caption artifacts: Space-filling model of..., Ball-and-stick model of..., etc.
    - Normalizes excessive whitespace and unescapes HTML.
    """
    if not text:
        return ""
    t = text

    # 0. Strip Wikipedia / MediaWiki navigation & language-list boilerplate
    t = re.sub(
        r'\bJump to content\b.*?(?=\b(?:From Wikipedia|Main article|[A-Z][a-z]+\s+is\b))',
        ' ',
        t,
        flags=re.IGNORECASE | re.DOTALL,
    )
    # Strip "331 languages ..." language switcher blocks (mixed ASCII, hyphenated, and non-ASCII scripts)
    t = re.sub(
        r'\b\d{1,4}\s+languages\b(?:\s+[^\s]{1,35}){2,}(?=\s+(?:Article|Talk|Read|Edit|View history|Tools|From Wikipedia|Coordinates|[A-Z][a-z]+\s+(?:is|was|are)\b)|$)',
        ' ',
        t,
        flags=re.IGNORECASE,
    )
    t = re.sub(
        r'\b\d{1,4}\s+languages\b(?:\s+[^\x00-\x7F]+|\s+[A-Za-z][a-zA-Z\'-]{1,25}){1,}',
        ' ',
        t,
        flags=re.IGNORECASE,
    )
    for ui_phrase in (
        r'\bJump to content\b',
        r'\bMain menu\b',
        r'\bPersonal tools\b',
        r'\bToggle the table of contents\b',
        r'\bFrom Wikipedia, the free encyclopedia\b',
        r'\bMove to sidebar\b',
        r'\bHide\b\s+\bMove to sidebar\b',
        r'\bView history\b',
        r'\bRead\s+Edit\s+View history\b',
        r'\bv\s*·\s*t\s*·\s*e\b',
        r'\^\s*Jump up to:[^\n]*',
        r'\bCookie\s+(?:Policy|Preferences|Settings)\b',
        r'\bAccept all cookies\b',
    ):
        t = re.sub(ui_phrase, ' ', t, flags=re.IGNORECASE)

    # Strip trailing Wikipedia non-prose sections when explaintext=1 includes them
    t = re.sub(
        r'\n+(?:See also|References|Further reading|External links|Notes|Bibliography)\s*\n[\s\S]*$',
        '',
        t,
        flags=re.IGNORECASE,
    )

    # 1. Maintenance banners and cleanup notices
    t = re.sub(r'\(Learn how and when to remove this (?:template )?message\)', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'This article (?:needs additional citations|relies largely or entirely on a single source|contains weasel words|has multiple issues|is about).*?(?:\.\s*|\n|$)', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'Please help improve this article by.*?(?:\.\s*|\n|$)', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'For other uses, see.*?(?:\.\s*|\n|$)', ' ', t, flags=re.IGNORECASE)

    # 2. Image captions, 3D model annotations, and figure labels
    t = re.sub(r'(?:Space-filling|Ball-and-stick|Skeletal|Chemical structure|Crystal structure|3D|3-D)\s+(?:model|representation|formula|diagram|view)\s+of\b[^\.\n]*[\.\n]?', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'^(?:Figure|Fig\.|Image|Photo):\s*[^\.\n]*[\.\n]?', ' ', t, flags=re.IGNORECASE | re.MULTILINE)

    # 3. Navigation, citation brackets ([1], [a], [citation needed]), section links, and infobox noise
    t = re.sub(r'\[(?:edit|citation needed|clarification needed|better source needed|dead link|note \d+|\d{1,3}|[a-z])\]', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\b(?:Main article|See also|External links|Further reading):\s*[^\.\n]*[\.\n]?', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'Coordinates:\s*[\d°\s\.\'\"NSEW]+', ' ', t, flags=re.IGNORECASE)

    # 4. Collapse whitespace
    return " ".join(t.split()).strip()

def extract_core_subject_entities(query: str, canonical_topic: Optional[str] = None) -> Tuple[str, List[str]]:
    """
    Extracts the clean core subject and core entity tokens from a user query or canonical topic
    by stripping conversational boilerplate, question framing, and noise.
    """
    raw = canonical_topic if canonical_topic and len(canonical_topic.split()) >= 2 else query
    clean = (raw or "").strip()

    # Strip conversational and question prefixes
    prefixes = [
        r'^(?:can you\s+)?(?:please\s+)?(?:explain\s+the|explain|describe|tell me about|tell me everything about|overview of|give me an overview of|give me details on|what is the|what is a|what is an|what is|what are the|what are|how does|how do|how did|why does|why do|analyze the|analyze|research the|research on|discuss|summarize|what do we know about|details on|information on|information about)\s+',
        r'^(?:what can you tell me about)\s+',
    ]
    for pat in prefixes:
        clean = re.sub(pat, '', clean, flags=re.IGNORECASE).strip()

    clean = re.sub(r'[\?\.!/\\:;,]+$', '', clean).strip()
    clean = re.sub(r'\s+(?:please|thanks|thank you)\s*$', '', clean, flags=re.IGNORECASE).strip()
    # Strip secondary clauses like "and its structure", "and its properties"
    clean = re.sub(r'\s+(?:and\s+its|and\s+their|and\s+the|and\s+how|and\s+why)\b.*$', '', clean, flags=re.IGNORECASE).strip()

    # Extract significant tokens
    stops = STOP_WORDS | {
        "what", "when", "where", "which", "whose", "whom", "how", "does", "explain",
        "describe", "there", "about", "their", "would", "these", "those", "from", "with",
        "into", "over", "under", "between", "through", "using", "based", "overview", "the", "and",
        "its", "it", "our", "his", "her", "also", "well",
        "mechanism", "mechanisms", "property", "properties", "analysis", "analyses",
        "empirical", "architecture", "system", "systems", "study", "studies", "review"
    }
    tokens = [w.lower() for w in re.findall(r'\b[a-zA-Z0-9_-]{2,}\b', clean) if w.lower() not in stops]
    return clean, tokens

def evaluate_topical_relevance(
    title: str,
    text: str,
    core_subject: str,
    core_entities: List[str]
) -> Tuple[float, bool]:
    """
    Evaluates strict topical relevance of a candidate source against core subject and entities.
    Returns (score, is_relevant).
    Strictly drops off-topic or tangentially related sources (e.g. Dwarf Irregular Galaxies for Milky Way).
    """
    title_norm = (title or "").lower()
    text_norm = (text or "").lower()[:3000]
    subj_norm = (core_subject or "").lower().strip()

    if not subj_norm or not core_entities:
        return 1.0, True

    score = 0.0

    # 1. Exact phrase match in title / text
    core_phrase_in_title = subj_norm in title_norm
    core_phrase_in_text = subj_norm in text_norm

    if core_phrase_in_title:
        score += 18.0
    elif core_phrase_in_text:
        score += 8.0

    # 2. Check core entities match in title / text
    matched_title = sum(1 for e in core_entities if e in title_norm)
    matched_text = sum(1 for e in core_entities if e in text_norm)
    matched_total = sum(1 for e in core_entities if e in title_norm or e in text_norm)

    # Strict requirement:
    # If the core phrase is not in the title or text, require at least 75% entity overlap
    if not core_phrase_in_title and not core_phrase_in_text:
        min_required = max(1, int(len(core_entities) * 0.75))
        if matched_total < min_required:
            return 0.0, False

    score += (matched_title * 5.0) + (matched_text * 2.0)

    # 3. Frequency of core phrase in abstract text
    phrase_count = text_norm.count(subj_norm)
    score += min(5, phrase_count) * 3.0

    # 4. Check whether core subject is mentioned early in the abstract (first 250 chars)
    if subj_norm in text_norm[:250]:
        score += 4.0

    # 5. Competing / Off-topic primary subject penalty:
    # If the title does NOT contain the core subject, AND the title focuses on another object/topic,
    # AND the core subject is only mentioned once or twice in the abstract as an incidental comparison:
    if not core_phrase_in_title and matched_title < len(core_entities):
        if phrase_count <= 1:
            score -= 20.0

    # 6. Hyper-niche tangential artifact penalty for broad overview queries (1-2 entity tokens)
    if len(core_entities) <= 2:
        if any(np_term in title_norm for np_term in NICHE_CASE_PENALTY_TERMS):
            score -= 24.0
        # Penalize hyper-specific numeric memo/year micro-studies when user didn't ask for a specific year
        if re.search(r'\b19\d{2}\b', title_norm) and not re.search(r'\b19\d{2}\b', subj_norm):
            score -= 10.0

    # Negative domain check for ambiguous acronyms (e.g. PVC medical vs polymer)
    if "pvc" in subj_norm and any(neg in f"{title_norm} {text_norm}" for neg in ("ventricular", "arrhythmia", "cardiac", "myocardial", "ecg", "cardiomyopathy", "extrasystole", "systolic", "diastolic")):
        return -50.0, False

    is_relevant = score >= 8.0
    return score, is_relevant

async def search_arxiv(
    query: str,
    max_results: int = 3,
    canonical_topic: Optional[str] = None,
    topic: Optional[str] = None,
    min_year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Queries official arXiv API with targeted title/abstract matching,
    strict topical relevance scoring, and drops off-topic papers completely.
    """
    core_subject, core_entities = extract_core_subject_entities(query, canonical_topic)
    effective_query = core_subject or query

    # Check if recency / specific year is requested
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = year_match.group(1) if year_match else None

    # Add domain category scoping if specified
    cat_clause = ""
    if topic:
        t_key = topic.lower().strip()
        for k, v in ARXIV_TOPIC_CATEGORIES.items():
            if k in t_key or t_key in k:
                cat_clause = f"+AND+{v}"
                break

    # Build title/abstract match query for precision
    if core_entities:
        if len(core_entities) >= 2:
            ti_parts = "+AND+".join(f"ti:{urllib.parse.quote_plus(e)}" for e in core_entities[:3])
            abs_parts = "+AND+".join(f"abs:{urllib.parse.quote_plus(e)}" for e in core_entities[:3])
            search_clause = f"({ti_parts})+OR+({abs_parts})"
        else:
            term = urllib.parse.quote_plus(core_entities[0])
            search_clause = f"ti:{term}+OR+abs:{term}"
    else:
        clean_q = urllib.parse.quote_plus(re.sub(r"[?*#&%=+]", " ", effective_query).strip())
        search_clause = f"all:{clean_q}"

    fetch_limit = max_results * 3
    if target_year:
        url = (
            f"https://export.arxiv.org/api/query?search_query={search_clause}{cat_clause}"
            f"+AND+submittedDate:[{target_year}01010000+TO+{target_year}12312359]"
            f"&sortBy=relevance&sortOrder=descending&start=0&max_results={fetch_limit}"
        )
    elif min_year:
        cur_yr = datetime.datetime.now().year
        url = (
            f"https://export.arxiv.org/api/query?search_query={search_clause}{cat_clause}"
            f"+AND+submittedDate:[{min_year}01010000+TO+{cur_yr}12312359]"
            f"&sortBy=relevance&sortOrder=descending&start=0&max_results={fetch_limit}"
        )
    else:
        url = (
            f"https://export.arxiv.org/api/query?search_query={search_clause}{cat_clause}"
            f"&sortBy=relevance&sortOrder=descending&start=0&max_results={fetch_limit}"
        )

    candidates = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
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

                    # Require substantial abstract
                    if not summary or len(summary.strip()) < 100:
                        continue

                    # Strict topical relevance evaluation
                    score, is_relevant = evaluate_topical_relevance(title, summary, core_subject, core_entities)
                    if not is_relevant:
                        logger.info(f"Dropping off-topic arXiv paper for '{core_subject}': {title}")
                        continue

                    if target_year and year and year != int(target_year):
                        continue
                    if min_year and (year is None or year < min_year):
                        continue

                    raw_authors = []
                    for author_elem in entry.findall("atom:author", ns):
                        name = author_elem.find("atom:name", ns)
                        if name is not None and name.text:
                            raw_authors.append(name.text.strip())

                    authors = clean_authors_list(raw_authors)
                    author_str = f" ({', '.join(authors[:2])}{' et al.' if len(authors) > 2 else ''})" if authors else ""

                    candidates.append((score, {
                        "tier": "LIVE",
                        "source_type": "arxiv",
                        "review_status": "preprint",
                        "title": title,
                        "path": None,
                        "url": raw_id if raw_id else None,
                        "authors": authors,
                        "year": year,
                        "venue": "arXiv",
                        "snippet": clean_scraped_reference_text(summary),
                        "source": f"arXiv:{arxiv_id}{author_str}",
                        "arxiv_id": arxiv_id if arxiv_id else None,
                        "doi": doi,
                        "is_retracted": False,
                        "published": pub_str
                    }))
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.warning(f"arXiv search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_arxiv", t0, t1, start_iso, end_iso, status_str)

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [c[1] for c in candidates[:max_results]]


async def search_openalex(
    query: str,
    max_results: int = 3,
    topic: Optional[str] = None,
    canonical_topic: Optional[str] = None,
    min_year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Queries OpenAlex API for open scientific literature, sorted by strict topical relevance
    and citation weight, preferring high-citation authoritative papers and reviews.
    """
    core_subject, core_entities = extract_core_subject_entities(query, canonical_topic)
    search_term = core_subject or query

    # Strip punctuation/wildcards that trigger OpenAlex 400 errors
    clean_q = re.sub(r"[?*#&%=+]", " ", search_term).strip()
    clean_query = urllib.parse.quote_plus(" ".join(clean_q.split()))

    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = year_match.group(1) if year_match else None

    fetch_limit = max(10, max_results * 3)
    if target_year:
        url = f"https://api.openalex.org/works?search={clean_query}&filter=publication_year:{target_year},type:article&per-page={fetch_limit}"
    elif min_year:
        url = f"https://api.openalex.org/works?search={clean_query}&filter=publication_year:>{min_year - 1},type:article&per-page={fetch_limit}"
    else:
        url = f"https://api.openalex.org/works?search={clean_query}&per-page={fetch_limit}"

    headers = {"User-Agent": "ARIA-Research-Assistant/2.0 (mailto:swarajchattaraj@users.noreply.github.com)"}

    candidates = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
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
                    cited_by_count = work.get("cited_by_count", 0)
                    work_type = (work.get("type") or "").lower()

                    # Primary Location / Venue
                    primary_loc = work.get("primary_location") or {}
                    source_obj = primary_loc.get("source") or {}
                    venue = source_obj.get("display_name") or "OpenAlex Indexed Journal"

                    # Extract authors
                    raw_authors = []
                    for authorship in work.get("authorships", []):
                        author_obj = authorship.get("author") or {}
                        author_name = author_obj.get("display_name")
                        if author_name:
                            raw_authors.append(author_name)
                    authors = clean_authors_list(raw_authors)

                    # Extract arxiv_id
                    ids = work.get("ids", {})
                    arxiv_url = ids.get("arxiv") or ""
                    arxiv_id = arxiv_url.split("/")[-1] if arxiv_url else None

                    # Reconstruct abstract
                    abstract = ""
                    inv_index = work.get("abstract_inverted_index")
                    if inv_index and isinstance(inv_index, dict):
                        words = sorted([(pos, word) for word, positions in inv_index.items() for pos in positions])
                        abstract = " ".join([w[1] for w in words[:220]])

                    # Strict topical relevance evaluation
                    rel_score, is_relevant = evaluate_topical_relevance(title, abstract, core_subject, core_entities)
                    if not is_relevant:
                        logger.info(f"Dropping off-topic OpenAlex paper for '{core_subject}': {title}")
                        continue

                    # Guard against hyper-niche low-citation tangents hijacking broad 1-2 word topics
                    if len(core_entities) <= 2 and cited_by_count < 3 and work_type not in ("review", "book-chapter", "reference-entry"):
                        if not abstract or len(abstract) < 160:
                            continue

                    snippet = clean_scraped_reference_text(abstract) if abstract else f"Published in {year or 'peer-reviewed literature'} ({venue}, {cited_by_count} citations)."
                    source_str = raw_doi or f"{venue} ({year or 'n.d.'})"

                    raw_work_id = work.get("id") or ""
                    work_url = raw_work_id if raw_work_id.startswith("http") else (f"https://openalex.org/{raw_work_id}" if raw_work_id else None)
                    final_url = raw_doi or work_url

                    # Citation weighting and review preference:
                    citation_weight = math.log10(max(1, cited_by_count) + 1.0) * 3.0
                    is_review = work_type in ("review", "book-chapter", "reference-entry") or any(
                        kw in title.lower() for kw in ("review", "overview", "handbook", "survey", "principles of")
                    )
                    review_bonus = 7.0 if is_review else 0.0
                    retracted_flag = is_retracted or _is_retracted_title(title)
                    authoritative_score = rel_score + citation_weight + review_bonus

                    candidates.append((authoritative_score, normalize_source_metadata({
                        "tier": "LIVE",
                        "source_type": "openalex",
                        "review_status": "retracted" if retracted_flag else "scholarly",
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
                        "is_retracted": retracted_flag,
                        "published": pub_date,
                        "cited_by_count": cited_by_count
                    })))
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.warning(f"OpenAlex search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_openalex", t0, t1, start_iso, end_iso, status_str)

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [c[1] for c in candidates[:max_results]]


def _domain_from_url(url: Optional[str], fallback: str = "Web Source") -> str:
    if not url:
        return fallback
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
        host = re.sub(r'^www\.', '', host)
        return host or fallback
    except Exception:
        return fallback


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
            body = clean_scraped_reference_text(res.get("body", ""))
            if body:
                href = res.get("href")
                year_match = re.search(r"\b(20[12][0-9])\b", body + " " + (href or ""))
                year = int(year_match.group(1)) if year_match else None
                pub_date = str(year) if year else None
                domain_venue = _domain_from_url(href, fallback="Web Reference")
                
                results.append({
                    "tier": "LIVE",
                    "source_type": "duckduckgo",
                    "review_status": "unreviewed_web",
                    "title": res.get("title", "Web Source"),
                    "path": None,
                    "url": href if href else None,
                    "authors": None,
                    "year": year,
                    "venue": domain_venue,
                    "snippet": body,
                    "source": href if href else domain_venue,
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
            async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
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
                        body = clean_scraped_reference_text(html.unescape(' '.join(raw_body.split())))
                        
                        title = "Web Source"
                        if i < len(title_matches):
                            t_text = re.sub(r'<[^>]+>', ' ', title_matches[i].group(2)).strip()
                            if t_text:
                                title = t_text
                                
                        year_match = re.search(r"\b(20[12][0-9])\b", body + " " + href)
                        year = int(year_match.group(1)) if year_match else None
                        domain_venue = _domain_from_url(href, fallback="Web Reference")
                        results.append({
                            "tier": "LIVE",
                            "source_type": "duckduckgo",
                            "review_status": "unreviewed_web",
                            "title": title,
                            "path": None,
                            "url": href,
                            "authors": None,
                            "year": year,
                            "venue": domain_venue,
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

async def search_semantic_scholar(
    query: str,
    max_results: int = 3,
    min_year: Optional[int] = None,
    canonical_topic: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Queries the free Semantic Scholar Graph API for scholarly papers with abstracts & TL;DR.
    Applies strict topical relevance + citation authority ranking.
    """
    core_subject, core_entities = extract_core_subject_entities(query, canonical_topic)
    clean_q = re.sub(r"[?*#&%=+\[\]\"]", " ", core_subject or query).strip()
    clean_query = " ".join(clean_q.split())[:200]
    year_param = f"&year={min_year}-" if min_year else ""
    fetch_limit = max(6, max_results * 3)
    url = (
        "https://api.semanticscholar.org/graph/v1/paper/search"
        f"?query={urllib.parse.quote_plus(clean_query)}"
        f"{year_param}"
        "&fields=title,abstract,tldr,year,venue,externalIds,url,authors,citationCount,openAccessPdf"
        f"&limit={fetch_limit}"
    )
    headers = {"User-Agent": "ARIA-Research-Assistant/2.0 (mailto:swarajchattaraj@users.noreply.github.com)"}

    candidates: List[Tuple[float, Dict[str, Any]]] = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            status_str = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                data = resp.json()
                for paper in data.get("data", []):
                    title = (paper.get("title") or "").strip()
                    abstract = (paper.get("abstract") or "").strip().replace("\n", " ")
                    tldr_txt = ((paper.get("tldr") or {}).get("text") or "").strip() if isinstance(paper.get("tldr"), dict) else ""
                    combined_text = abstract if len(abstract) >= 120 else (f"{tldr_txt} {abstract}".strip() if len(tldr_txt) >= 80 else "")
                    if not title or len(combined_text) < 100:
                        continue

                    rel_score, is_rel = evaluate_topical_relevance(title, combined_text, core_subject, core_entities)
                    if not is_rel:
                        continue

                    ext = paper.get("externalIds") or {}
                    doi = ext.get("DOI")
                    arxiv_id = ext.get("ArXiv")
                    year = paper.get("year")
                    venue = paper.get("venue") or "Semantic Scholar"
                    cited_by_count = paper.get("citationCount") or 0
                    raw_authors = [
                        a.get("name") for a in (paper.get("authors") or [])
                        if isinstance(a, dict) and a.get("name")
                    ]
                    authors = clean_authors_list(raw_authors)
                    author_str = f" ({', '.join(authors[:2])}{' et al.' if len(authors) > 2 else ''})" if authors else ""
                    paper_url = paper.get("url") or (f"https://doi.org/{doi}" if doi else None)
                    retracted_flag = _is_retracted_title(title)
                    auth_score = rel_score + math.log10(max(1, cited_by_count) + 1.0) * 2.5

                    candidates.append((auth_score, normalize_source_metadata({
                        "tier": "LIVE",
                        "source_type": "semantic_scholar",
                        "review_status": "retracted" if retracted_flag else "scholarly",
                        "title": title,
                        "path": None,
                        "url": paper_url,
                        "authors": authors,
                        "year": int(year) if isinstance(year, int) or (isinstance(year, str) and year.isdigit()) else None,
                        "venue": venue,
                        "snippet": combined_text[:1800],
                        "source": f"Semantic Scholar:{arxiv_id or doi or title[:60]}{author_str}",
                        "arxiv_id": arxiv_id,
                        "doi": doi,
                        "is_retracted": retracted_flag,
                        "published": str(year) if year else None,
                        "cited_by_count": cited_by_count
                    })))
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.warning(f"Semantic Scholar search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_semantic_scholar", t0, t1, start_iso, end_iso, status_str)

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [c[1] for c in candidates[:max_results]]

async def _fetch_wikipedia_api_entry(
    client: httpx.AsyncClient,
    title_or_slug: str,
    headers: Dict[str, str],
    lang: str = "en",
) -> Optional[Dict[str, Any]]:
    """
    Fetches a clean encyclopedic article via official MediaWiki Action API
    (prop=extracts&explaintext=1&exsectionformat=plain) enriched with REST summary metadata.
    Never scrapes raw Wikipedia HTML.
    """
    clean_title = urllib.parse.unquote(title_or_slug).replace("_", " ").strip()
    if not clean_title:
        return None

    action_url = (
        f"https://{lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1"
        f"&exsectionformat=plain&redirects=1&format=json&titles={urllib.parse.quote(clean_title)}"
    )
    w_resp = await client.get(action_url, headers=headers)
    if w_resp.status_code != 200:
        return None

    pages = w_resp.json().get("query", {}).get("pages", {})
    raw_extract = ""
    resolved_title = clean_title
    for pid, p in pages.items():
        if pid == "-1":
            continue
        raw_extract = (p.get("extract") or "").strip()
        resolved_title = p.get("title") or clean_title
        break

    if not raw_extract:
        return None

    # If disambiguation page, resolve via opensearch
    lower_ext = raw_extract[:300].lower()
    if "may refer to:" in lower_ext or "most often refers to:" in lower_ext:
        op_url = (
            f"https://{lang}.wikipedia.org/w/api.php?action=opensearch"
            f"&search={urllib.parse.quote(clean_title)}&limit=5&namespace=0&format=json"
        )
        op_resp = await client.get(op_url, headers=headers)
        if op_resp.status_code == 200:
            op_hits = op_resp.json()[1]
            for hit in op_hits[1:]:
                hit_url = (
                    f"https://{lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1"
                    f"&exsectionformat=plain&redirects=1&format=json&titles={urllib.parse.quote(hit)}"
                )
                hit_resp = await client.get(hit_url, headers=headers)
                if hit_resp.status_code == 200:
                    hit_pages = hit_resp.json().get("query", {}).get("pages", {})
                    for h_pid, hp in hit_pages.items():
                        if h_pid != "-1":
                            h_ext = (hp.get("extract") or "").strip()
                            if h_ext and "may refer to:" not in h_ext[:200].lower() and "most often refers to:" not in h_ext[:200].lower():
                                raw_extract = h_ext
                                resolved_title = hp.get("title") or hit
                                break
                if raw_extract and "may refer to:" not in raw_extract[:200].lower() and "most often refers to:" not in raw_extract[:200].lower():
                    break

    if not raw_extract or len(raw_extract) < 100:
        return None
    if "may refer to:" in raw_extract[:200].lower() or "most often refers to:" in raw_extract[:200].lower():
        return None

    # Enrich with REST summary API (revision timestamp, canonical URL, short description)
    pub_year: Optional[int] = None
    pub_date: Optional[str] = None
    canonical_url = f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(resolved_title.replace(' ', '_'))}"
    try:
        rest_url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(resolved_title.replace(' ', '_'))}"
        r_resp = await client.get(rest_url, headers=headers)
        if r_resp.status_code == 200:
            r_data = r_resp.json()
            ts = r_data.get("timestamp") or ""
            if len(ts) >= 4 and ts[:4].isdigit():
                pub_year = int(ts[:4])
                pub_date = ts[:10]
            page_desktop = (r_data.get("content_urls") or {}).get("desktop", {}).get("page")
            if page_desktop:
                canonical_url = page_desktop
    except Exception:
        pass

    clean_snippet = clean_scraped_reference_text(raw_extract[:5000])
    if len(clean_snippet) < 100:
        return None

    return {
        "tier": "LIVE",
        "source_type": "wikipedia",
        "review_status": "unreviewed_web",
        "title": f"Wikipedia: {resolved_title}",
        "path": None,
        "url": canonical_url,
        "authors": ["Wikipedia Contributors"],
        "year": pub_year or datetime.datetime.now().year,
        "venue": "Wikipedia",
        "snippet": clean_snippet,
        "content": clean_snippet,
        "full_text": clean_snippet,
        "source": f"Wikipedia ({resolved_title})",
        "doi": None,
        "arxiv_id": None,
        "is_retracted": False,
        "published": pub_date or str(datetime.datetime.now().year),
    }


async def search_wikipedia(query: str, max_results: int = 1, exact_title: Optional[str] = None, canonical_topic: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Encyclopedic reference search using official MediaWiki Action API + REST summary API.
    Returns clean plaintext extracts (never raw HTML scraping) with compliant User-Agent
    and proper author/year metadata.
    """
    core_subject, _ = extract_core_subject_entities(query, canonical_topic)
    target_title = exact_title or canonical_topic or core_subject or query

    results: List[Dict[str, Any]] = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    headers = {"User-Agent": "ARIA-Scientific-Assistant/2.0 (https://aria.swarajchattaraj.tech; contact@swarajchattaraj.tech)"}

    if target_title and target_title.strip():
        candidates: List[str] = [target_title.strip()]
        if canonical_topic:
            clean_canon = urllib.parse.unquote(canonical_topic)
            no_paren = clean_canon.split("(")[0].strip()
            if no_paren and no_paren not in candidates:
                candidates.append(no_paren)
        if core_subject and core_subject not in candidates:
            candidates.append(core_subject)
        if query and query not in candidates:
            candidates.append(query)

        try:
            async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
                for cand in candidates:
                    entry = await _fetch_wikipedia_api_entry(client, cand, headers)
                    if entry:
                        results.append(entry)
                        status_str = f"Wikipedia Action hit: {entry['title']}"
                        break

                # If direct candidates didn't match, search using list=search
                if not results:
                    search_q = canonical_topic or query
                    s_url = (
                        "https://en.wikipedia.org/w/api.php?action=query&list=search"
                        f"&srsearch={urllib.parse.quote(search_q)}&utf8=1&format=json&srlimit=3"
                    )
                    s_resp = await client.get(s_url, headers=headers)
                    if s_resp.status_code == 200:
                        for hit in s_resp.json().get("query", {}).get("search", []):
                            hit_title = hit.get("title")
                            if not hit_title:
                                continue
                            entry = await _fetch_wikipedia_api_entry(client, hit_title, headers)
                            if entry:
                                results.append(entry)
                                status_str = f"Wikipedia search hit: {hit_title}"
                                break
        except Exception as e:
            status_str = f"failed: {type(e).__name__}"
            logger.debug(f"Wikipedia Action extracts lookup failed: {e}")

    t1 = time.time()
    end_iso = datetime.datetime.now().isoformat()
    retrieval_tracker.record("provider_wikipedia", t0, t1, start_iso, end_iso, status_str)
    return results[:max_results]


async def search_crossref(
    query: str,
    max_results: int = 2,
    canonical_topic: Optional[str] = None,
    min_year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Queries Crossref Works API for peer-reviewed journal and book-chapter literature
    with clean DOI, author, year, and publication venue metadata.
    """
    core_subject, core_entities = extract_core_subject_entities(query, canonical_topic)
    search_term = core_subject or query
    clean_q = re.sub(r"[?*#&%=+]", " ", search_term).strip()
    clean_query = urllib.parse.quote_plus(" ".join(clean_q.split())[:200])

    date_filter = f"&filter=from-pub-date:{min_year}-01-01" if min_year else ""
    url = (
        f"https://api.crossref.org/works?query={clean_query}"
        f"{date_filter}&rows={max(6, max_results * 3)}&select=DOI,title,author,published-print,published-online,issued,container-title,abstract,type,update-to,relation,is-referenced-by-count"
    )
    headers = {"User-Agent": "ARIA-Research-Assistant/2.0 (mailto:swarajchattaraj@users.noreply.github.com)"}

    candidates = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            status_str = f"HTTP {resp.status_code}"
            if resp.status_code == 200:
                items = (resp.json().get("message") or {}).get("items") or []
                for item in items:
                    titles = item.get("title") or []
                    title = (titles[0] if titles else "").strip()
                    if not title:
                        continue
                    raw_abs = (item.get("abstract") or "").strip()
                    clean_abs = clean_scraped_reference_text(html.unescape(re.sub(r"<[^>]+>", " ", raw_abs)))
                    if len(clean_abs) < 120:
                        continue

                    rel_score, is_rel = evaluate_topical_relevance(title, clean_abs, core_subject, core_entities)
                    if not is_rel:
                        continue

                    doi = item.get("DOI")
                    containers = item.get("container-title") or []
                    venue = (containers[0] if containers else "Crossref Scholarly Archive").strip()

                    # Detect Crossmark/Crossref retraction notices or retracted-work relations
                    item_type = str(item.get("type") or "").lower()
                    updates = item.get("update-to") or []
                    relations = item.get("relation") or {}
                    retracted_flag = (
                        item_type == "retraction"
                        or _is_retracted_title(title)
                        or any(str(u.get("type") or "").lower() == "retraction" for u in updates if isinstance(u, dict))
                        or bool(isinstance(relations, dict) and (relations.get("is-retracted-by") or relations.get("retraction-of")))
                    )

                    date_parts = (
                        (item.get("published-print") or {}).get("date-parts")
                        or (item.get("published-online") or {}).get("date-parts")
                        or (item.get("issued") or {}).get("date-parts")
                        or []
                    )
                    year = None
                    if date_parts and date_parts[0] and isinstance(date_parts[0][0], int):
                        year = date_parts[0][0]

                    raw_authors = []
                    for a in item.get("author") or []:
                        given = (a.get("given") or "").strip()
                        family = (a.get("family") or "").strip()
                        full_name = f"{given} {family}".strip()
                        if full_name:
                            raw_authors.append(full_name)
                    authors = clean_authors_list(raw_authors)

                    cited_by_count = int(item.get("is-referenced-by-count") or 0)
                    work_url = f"https://doi.org/{doi}" if doi else None
                    auth_score = rel_score + math.log10(max(1, cited_by_count) + 1.0) * 2.5
                    candidates.append((auth_score, normalize_source_metadata({
                        "tier": "LIVE",
                        "source_type": "crossref",
                        "review_status": "retracted" if retracted_flag else "scholarly",
                        "title": title,
                        "path": None,
                        "url": work_url,
                        "authors": authors,
                        "year": year,
                        "venue": venue,
                        "snippet": clean_abs[:1800],
                        "source": work_url or venue,
                        "doi": doi,
                        "arxiv_id": None,
                        "is_retracted": retracted_flag,
                        "published": str(year) if year else None,
                        "cited_by_count": cited_by_count,
                    })))
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.debug(f"Crossref search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_crossref", t0, t1, start_iso, end_iso, status_str)

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [c[1] for c in candidates[:max_results]]


async def search_pubmed(
    query: str,
    max_results: int = 2,
    canonical_topic: Optional[str] = None,
    min_year: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Queries NCBI PubMed E-utilities for peer-reviewed biomedical and life-science literature.
    """
    core_subject, core_entities = extract_core_subject_entities(query, canonical_topic)
    search_term = " ".join(re.sub(r"[?*#&%=+\[\]\"]", " ", core_subject or query).split())[:200]
    if not search_term:
        return []

    date_params = f"&datetype=pdat&mindate={min_year}&maxdate={datetime.datetime.now().year}" if min_year else ""
    esearch_url = (
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
        f"?db=pubmed&term={urllib.parse.quote_plus(search_term)}&retmode=json&sort=relevance&retmax={max(4, max_results * 2)}{date_params}"
    )
    headers = {"User-Agent": "ARIA-Research-Assistant/2.0 (mailto:swarajchattaraj@users.noreply.github.com)"}

    candidates: List[Tuple[float, Dict[str, Any]]] = []
    t0 = time.time()
    start_iso = datetime.datetime.now().isoformat()
    status_str = "error"
    try:
        async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
            es_resp = await client.get(esearch_url, headers=headers)
            status_str = f"HTTP {es_resp.status_code}"
            if es_resp.status_code != 200:
                return []
            id_list = (es_resp.json().get("esearchresult") or {}).get("idlist") or []
            if not id_list:
                return []

            efetch_url = (
                "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
                f"?db=pubmed&id={','.join(id_list[:6])}&retmode=xml"
            )
            ef_resp = await client.get(efetch_url, headers=headers)
            status_str = f"HTTP {ef_resp.status_code}"
            if ef_resp.status_code != 200 or not ef_resp.text:
                return []

            root = ET.fromstring(ef_resp.text)
            for art in root.findall(".//PubmedArticle"):
                title = "".join(art.findtext(".//ArticleTitle", "")).strip()
                abs_parts = ["".join(ab.itertext()).strip() for ab in art.findall(".//AbstractText")]
                abstract = clean_scraped_reference_text(" ".join(p for p in abs_parts if p))
                if not title or len(abstract) < 120:
                    continue

                rel_score, is_rel = evaluate_topical_relevance(title, abstract, core_subject, core_entities)
                if not is_rel:
                    continue

                pmid = (art.findtext(".//MedlineCitation/PMID") or "").strip()
                venue = (art.findtext(".//Journal/Title") or "PubMed").strip()
                yr_txt = (art.findtext(".//JournalIssue/PubDate/Year") or art.findtext(".//JournalIssue/PubDate/MedlineDate") or "")
                yr_match = re.search(r"\b(19|20)\d{2}\b", yr_txt)
                year = int(yr_match.group(0)) if yr_match else None
                if min_year and (year is None or year < min_year):
                    continue

                doi = None
                for aid in art.findall(".//ArticleIdList/ArticleId"):
                    if aid.attrib.get("IdType") == "doi" and aid.text:
                        doi = aid.text.strip()
                        break

                raw_authors = []
                for au in art.findall(".//AuthorList/Author"):
                    fore = (au.findtext("ForeName") or "").strip()
                    last = (au.findtext("LastName") or "").strip()
                    full = f"{fore} {last}".strip()
                    if full:
                        raw_authors.append(full)
                authors = clean_authors_list(raw_authors)

                pub_url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else (f"https://doi.org/{doi}" if doi else None)
                candidates.append((rel_score, {
                    "tier": "LIVE",
                    "source_type": "pubmed",
                    "review_status": "scholarly",
                    "title": title,
                    "path": None,
                    "url": pub_url,
                    "authors": authors,
                    "year": year,
                    "venue": venue,
                    "snippet": abstract[:1800],
                    "source": pub_url or venue,
                    "doi": doi,
                    "arxiv_id": None,
                    "is_retracted": False,
                    "published": str(year) if year else None,
                }))
    except Exception as e:
        status_str = f"failed: {type(e).__name__}"
        logger.debug(f"PubMed search error: {e}")
    finally:
        t1 = time.time()
        end_iso = datetime.datetime.now().isoformat()
        retrieval_tracker.record("provider_pubmed", t0, t1, start_iso, end_iso, status_str)

    candidates.sort(key=lambda x: x[0], reverse=True)
    return [c[1] for c in candidates[:max_results]]

def compute_source_score(
    chunk: Dict[str, Any],
    query: str,
    canonical_topic: Optional[str] = None,
    recency: Optional[str] = None,
) -> float:
    """
    Ranks sources with calibrated multi-factor scoring:
    1. Query term overlap / relevance (primary).
    2. Canonical topic semantic alignment (penalizes cross-domain noise).
    3. Academic credibility (arXiv / OpenAlex / Crossref / PubMed > Wikipedia > general web).
    4. Moderate recency bonus (scaled higher when recency filter active).
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

    # 2. Canonical Topic Alignment & Negative Domain Penalties
    if canonical_topic:
        canon_words = {w for w in set(re.findall(r"\b[a-zA-Z]{4,}\b", canonical_topic.lower())) - STOP_WORDS}
        if canon_words:
            canon_overlap = len(canon_words.intersection(chunk_tokens))
            relevance_score += canon_overlap * 4.0
            if len(q_tokens) <= 2 and canon_overlap == 0:
                relevance_score -= 25.0
        # Negative domain penalty for PVC
        if "pvc" in query_lower and any(neg in full_text for neg in ("ventricular", "arrhythmia", "cardiac", "myocardial", "ecg", "cardiomyopathy")):
            relevance_score -= 60.0

    # Penalize papers with low citations / anomalous claims if OpenAlex
    cited_by = chunk.get("cited_by_count", 0)
    if chunk.get("source_type") == "openalex" and cited_by == 0 and "anomalies" in title_text:
        relevance_score -= 10.0  # Penalize unverified fringe / predatory papers

    # 3. Source-type credibility base
    stype = chunk.get("source_type")
    if stype == "arxiv":
        credibility_score = 8.0
    elif stype in ("openalex", "crossref", "semantic_scholar", "pubmed"):
        credibility_score = 7.5
    elif stype == "wikipedia":
        credibility_score = 5.5
    else:  # duckduckgo
        credibility_score = 3.5

    # 4. Recency modifier
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = int(year_match.group(1)) if year_match else None
    min_year = resolve_min_year(recency)
    chunk_year = chunk.get("year")
    
    recency_score = 0.0
    if target_year and chunk_year:
        if chunk_year == target_year:
            recency_score = 4.0  # Moderate bonus for exact year
        elif chunk_year < target_year - 2:
            recency_score = -4.0  # Penalty for older work when explicit year is queried
    elif min_year and isinstance(chunk_year, int):
        if chunk_year >= min_year:
            recency_score = 3.5 + min(2.0, (chunk_year - min_year) * 0.5)
        else:
            recency_score = -12.0

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

    # Clean inside the chosen target: drop nav, sidebar, share buttons, footer, comments, Wikipedia chrome
    for elem in target.find_all(["nav", "footer", "aside", "header"]):
        elem.decompose()
    for elem in target.find_all(attrs={"class": re.compile(r"share|social|comment|footer-bar|post-footer|sidebar|widget-item-control|vector-menu|mw-jump-link|mw-editsection|navbox|reflist|noprint|interlanguage|uls-", re.I)}):
        elem.decompose()
    for elem in target.find_all(attrs={"id": re.compile(r"share|social|comment|footer|sidebar|p-lang|mw-navigation|siteSub|contentSub|catlinks", re.I)}):
        elem.decompose()
    for elem in target.find_all("sup", class_=re.compile(r"reference|noprint", re.I)):
        elem.decompose()

    text = target.get_text(separator=" ", strip=True)
    text = re.sub(r'\bFull article here\b', '', text, flags=re.I)
    text = html.unescape(" ".join(text.split()))
    return clean_scraped_reference_text(text)

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

    # Route Wikipedia article URLs through official MediaWiki API instead of scraping HTML
    wiki_match = re.match(r'^https?://([a-z-]+)\.wikipedia\.org/wiki/([^?#]+)', url, flags=re.IGNORECASE)
    if wiki_match:
        lang, slug = wiki_match.group(1).lower(), wiki_match.group(2)
        if not slug.lower().startswith(("file:", "special:", "category:", "portal:", "help:", "wikipedia:", "template:")):
            try:
                api_headers = {"User-Agent": "ARIA-Scientific-Assistant/2.0 (https://aria.swarajchattaraj.tech; contact@swarajchattaraj.tech)"}
                async with httpx.AsyncClient(timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=True) as client:
                    entry = await _fetch_wikipedia_api_entry(client, slug, api_headers, lang=lang)
                    if entry and entry.get("snippet"):
                        return entry["snippet"][:2000]
            except Exception as e:
                logger.debug(f"MediaWiki API fetch for {url} failed: {e}")
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
        async with httpx.AsyncClient(transport=transport, timeout=EXTERNAL_SEARCH_TIMEOUT, follow_redirects=False) as client:
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

async def search_all_free_sources(
    query: str,
    wikipedia_title: Optional[str] = None,
    canonical_topic: Optional[str] = None,
    topic: Optional[str] = None,
    source_tier: str = "all",
    recency: str = "all",
    sub_queries: Optional[List[str]] = None,
    domain_discipline: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Executes parallel multi-source search across scholarly and general providers.
    - When source_tier == 'peer_reviewed': strictly restricts to OpenAlex, arXiv,
      Crossref, Semantic Scholar, and PubMed (skipping Wikipedia & DuckDuckGo).
    - When recency is '5y' or '2y': pushes publication-year cutoff to providers,
      filters older works, and boosts recent papers in ranking.
    - Runs a targeted query expansion pass (Pass 2) when Pass 1 yields fewer than
      3 high-relevance scholarly sources.
    """
    t_retrieval_start = time.time()
    iso_start = datetime.datetime.now().isoformat()
    retrieval_tracker.record(
        "live_retrieval_start",
        t_retrieval_start,
        t_retrieval_start,
        iso_start,
        iso_start,
        f"cap=15s tier={source_tier} recency={recency}",
    )

    core_subject, core_entities = extract_core_subject_entities(query, canonical_topic)
    min_year = resolve_min_year(recency)
    peer_reviewed_only = (source_tier == "peer_reviewed")

    provider_tasks = [
        asyncio.create_task(search_openalex(query, max_results=4, topic=topic, canonical_topic=canonical_topic, min_year=min_year)),
        asyncio.create_task(search_crossref(query, max_results=3, canonical_topic=canonical_topic, min_year=min_year)),
        asyncio.create_task(search_arxiv(query, max_results=3, canonical_topic=canonical_topic, topic=topic, min_year=min_year)),
        asyncio.create_task(search_semantic_scholar(query, max_results=3, min_year=min_year, canonical_topic=canonical_topic)),
        asyncio.create_task(search_pubmed(query, max_results=2, canonical_topic=canonical_topic, min_year=min_year)),
    ]
    # Include a secondary sub-query facet on OpenAlex when planned sub_queries diversify coverage
    facet_queries = [sq for sq in (sub_queries or []) if sq and sq.strip().lower() != query.strip().lower()]
    if facet_queries:
        provider_tasks.append(
            asyncio.create_task(search_openalex(facet_queries[0], max_results=2, topic=topic, canonical_topic=canonical_topic, min_year=min_year))
        )
    if not peer_reviewed_only:
        provider_tasks.extend([
            asyncio.create_task(search_wikipedia(query, max_results=1, exact_title=wikipedia_title, canonical_topic=canonical_topic)),
            asyncio.create_task(search_duckduckgo(query, max_results=3)),
        ])

    # Cap Pass 1 providers at 8.5s so Pass 2 expansion (if needed) still fits inside 15s
    done, pending = await asyncio.wait(provider_tasks, timeout=8.5)
    if pending:
        logger.warning(f"[RETRIEVAL] {len(pending)} provider task(s) timed out at 8.5s cap and will be cancelled.")
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

    # Pass 2 targeted query expansion if fewer than 3 high-relevance scholarly sources returned
    high_rel_scholarly = [
        c for c in combined
        if c.get("source_type") in SCHOLARLY_SOURCE_TYPES
        and not c.get("is_retracted")
        and evaluate_topical_relevance(c.get("title", ""), c.get("snippet", "") or c.get("content", ""), core_subject, core_entities)[0] >= 10.0
    ]
    if len(high_rel_scholarly) < 3 and (time.time() - t_retrieval_start) < 9.5:
        disc_terms = DISCIPLINE_EXPANSION_TERMS.get(domain_discipline or "general", DISCIPLINE_EXPANSION_TERMS["general"])
        expanded_q = f"{core_subject or query} {disc_terms}".strip()
        if facet_queries and len(facet_queries) > 1:
            expanded_q = facet_queries[1]
        logger.info(f"[RETRIEVAL] Pass 1 yielded {len(high_rel_scholarly)} scholarly sources (<3); running Pass 2 expansion: '{expanded_q[:80]}'")
        pass2_tasks = [
            asyncio.create_task(search_openalex(expanded_q, max_results=3, topic=topic, canonical_topic=canonical_topic, min_year=min_year)),
            asyncio.create_task(search_semantic_scholar(expanded_q, max_results=3, min_year=min_year, canonical_topic=canonical_topic)),
            asyncio.create_task(search_crossref(expanded_q, max_results=2, canonical_topic=canonical_topic, min_year=min_year)),
        ]
        done_p2, pending_p2 = await asyncio.wait(pass2_tasks, timeout=4.0)
        for p in pending_p2:
            p.cancel()
        for t in done_p2:
            try:
                res = t.result()
                if isinstance(res, list):
                    combined.extend(res)
            except Exception:
                pass

    if peer_reviewed_only:
        combined = [c for c in combined if c.get("source_type") in SCHOLARLY_SOURCE_TYPES]
            
    # Strict Topical Relevance Filtering & Deduplication against Core Subject & Entities:
    valid_chunks = []
    seen_source_keys = set()
    for chunk in combined:
        chunk = normalize_source_metadata(chunk)
        title = chunk.get("title", "")
        text = chunk.get("snippet", "") or chunk.get("content", "")
        dedup_key = (
            (chunk.get("doi") or "").strip().lower()
            or (chunk.get("url") or "").strip().lower()
            or re.sub(r'\W+', '', title.lower())
        )
        if dedup_key and dedup_key in seen_source_keys:
            continue
        score, is_relevant = evaluate_topical_relevance(title, text, core_subject, core_entities)
        if not is_relevant:
            logger.info(f"Cross-provider filter: Dropped off-topic source for '{core_subject}': {title}")
            continue
        if dedup_key:
            seen_source_keys.add(dedup_key)
        chunk["_topical_score"] = score
        valid_chunks.append(chunk)

    # Fallback safety: if strict filtering dropped all web/scholar results, keep Wikipedia if allowed
    if not valid_chunks and combined and not peer_reviewed_only:
        wiki_candidates = [c for c in combined if c.get("source_type") == "wikipedia"]
        if wiki_candidates:
            valid_chunks = wiki_candidates

    # Filter 2: Explicit query year or recency window cutoff
    year_match = re.search(r"\b(20[12][0-9])\b", query)
    target_year = int(year_match.group(1)) if year_match else None
    if target_year:
        year_matching = [c for c in valid_chunks if c.get("year") == target_year]
        if year_matching:
            valid_chunks = [c for c in valid_chunks if c.get("year") == target_year or c.get("year") is None]
    elif min_year:
        valid_chunks = [
            c for c in valid_chunks
            if isinstance(c.get("year"), int) and c["year"] >= min_year
        ]

    # Rank filtered sources
    scored_chunks = sorted(
        valid_chunks,
        key=lambda c: compute_source_score(c, query, canonical_topic=canonical_topic, recency=recency),
        reverse=True,
    )
    
    # Assign 1-indexed ranks
    for rank_idx, chunk in enumerate(scored_chunks, start=1):
        chunk["rank"] = rank_idx
        chunk["tier"] = "LIVE"

    # Fetch readable text for top N general-web results only (duckduckgo and similar) in rank order
    # Scholarly providers already carry abstracts
    fetch_n = int(os.environ.get("FETCH_TOP_N", getattr(settings, "fetch_top_n", 2)))
    if fetch_n > 0 and scored_chunks and not peer_reviewed_only:
        fetch_targets = [
            c for c in scored_chunks
            if c.get("source_type") not in ("openalex", "arxiv", "crossref", "semantic_scholar", "pubmed", "okf_note", "okf_graph", "pgvector")
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
