import asyncio
import io
import logging
import re
import urllib.parse
from typing import List, Dict, Any, Optional, Tuple

import httpx
from PIL import Image

logger = logging.getLogger(__name__)

USER_AGENT = "ARIA-Scientific-Assistant/2.0 (https://aria.swarajchattaraj.tech; contact@swarajchattaraj.tech)"
EXTERNAL_MEDIA_TIMEOUT = httpx.Timeout(connect=5.0, read=8.0, write=5.0, pool=5.0)

# UI, navigation, and non-subject terms to discard from media searches
MEDIA_REJECT_TERMS = {
    "icon", "logo", "flag", "symbol", "stub", "button", "portal", "edit",
    "crystal_clear", "ambox", "folder", "gnome", "disambig", "wikidata",
    "sound-icon", "p_vip", "padlock", "question_mark", "scale_icon", "locator",
    "map_of", "blank", "default", "navbar", "signature", "coat_of_arms",
    "audio", "speaker", "placeholder", "wikipedia_logo", "wikimedia_logo", "wiki_icon",
    "advertisement", "banner", "film_poster", "album_cover", "book_cover",
    "user_interface", "status", "arrow", "checkbox",
    "portrait", "headshot", "selfie", "mugshot"
}

DESC_REJECT_TERMS = {
    "portrait of", "headshot of", "official portrait", "selfie", "mugshot",
    "coat of arms", "flag of", "logo of", "official seal", "state emblem"
}

ALLOWED_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp")

def _clean_topic_for_media(query: str, canonical_topic: Optional[str] = None) -> str:
    """Extracts a concise, clean academic subject for media retrieval."""
    if canonical_topic and len(canonical_topic.strip()) >= 2:
        topic = canonical_topic.strip()
    else:
        try:
            from utils.academic_search import extract_core_subject_entities
            res = extract_core_subject_entities(query or "")
            topic = res[0] if isinstance(res, (tuple, list)) else (res or "")
        except Exception:
            topic = (query or "").strip()
        for prefix in (
            "what is the", "what are the", "what is a", "what is an", "what is", "what are",
            "how does", "how do", "how did", "explain the", "explain", "describe",
            "tell me about", "overview of", "analyze the", "analyze", "discuss", "details on"
        ):
            if topic.lower().startswith(prefix):
                topic = topic[len(prefix):].strip(" ?.:,")
                break
    topic = re.sub(r'[\?\.!/\\:;]', ' ', topic)
    return " ".join(topic.split()).strip()

def _extract_media_keywords(topic: str) -> List[str]:
    stops = {
        "what", "when", "where", "which", "whose", "whom", "how", "does", "explain",
        "describe", "there", "about", "their", "would", "these", "those", "from", "with",
        "into", "over", "under", "between", "through", "using", "based", "overview", "the", "and"
    }
    tokens = [w.lower() for w in re.findall(r'\b[a-zA-Z0-9_-]{2,}\b', topic) if w.lower() not in stops]
    return tokens

def _is_image_valid(url: str, width: int, height: int, filename: str, desc: str) -> bool:
    """Strictly validates format, resolution, aspect ratio, and reject terms."""
    fn_clean = filename.split("?")[0].lower()
    desc_lower = (desc or "").lower()
    url_clean = url.split("?")[0].lower()

    # Reject .svg, .ico, .gif, or unapproved extensions
    if any(url_clean.endswith(ext) or fn_clean.endswith(ext) for ext in (".svg", ".ico", ".gif")):
        return False
    if not any(url_clean.endswith(ext) or fn_clean.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        return False

    # Reject icons, logos, flags, portraits, headshots in filename
    for term in MEDIA_REJECT_TERMS:
        if term in fn_clean:
            return False

    # Reject portrait/logo phrases in description
    for term in DESC_REJECT_TERMS:
        if term in desc_lower:
            return False

    # Resolution constraints: minimum 400px wide, 200px high
    if width < 400 or height < 200:
        return False

    # Extreme aspect ratios (> 3:1 or < 1:3) rejected
    aspect = width / max(1, height)
    if aspect > 3.0 or aspect < (1.0 / 3.0):
        return False

    return True

def _score_image_candidate(filename: str, desc: str, keywords: List[str]) -> float:
    """Scores topical overlap between image metadata and the query keywords."""
    fn_clean = filename.split("?")[0].lower()
    desc_lower = (desc or "").lower()

    # Instant rejection of UI / non-subject graphics
    for term in MEDIA_REJECT_TERMS:
        if term in fn_clean:
            return -1.0
    for term in DESC_REJECT_TERMS:
        if term in desc_lower:
            return -1.0

    score = 0.0
    matched_kws = 0
    for kw in keywords:
        if kw in fn_clean:
            score += 4.0
            matched_kws += 1
        elif kw in desc_lower:
            score += 2.0
            matched_kws += 1

    # Bonus for scientific / technical diagrams, structures, and schematics
    if any(tech in fn_clean or tech in desc_lower for tech in (
        "structure", "diagram", "schematic", "mechanism", "formula", "synthesis",
        "pathway", "architecture", "curve", "spectrum", "crystal", "reaction",
        "model", "molecule", "chemical", "system", "overview"
    )):
        score += 2.5

    return score

async def fetch_verified_figures(
    query: str,
    canonical_topic: Optional[str] = None,
    max_figures: int = 2
) -> List[Dict[str, Any]]:
    """
    Queries Wikipedia and Wikimedia APIs for verified, topic-relevant scientific diagrams,
    structural formulas, schematics, or domain photographs.
    Applies strict topical relevance, resolution (>=400px), aspect ratio, and format filtering.
    Fails fast (<4.0s timeout) and returns empty list if no high-confidence image matches.
    """
    clean_topic = _clean_topic_for_media(query, canonical_topic)
    if not clean_topic or len(clean_topic) < 2:
        return []

    keywords = _extract_media_keywords(clean_topic)
    if not keywords:
        return []

    headers = {"User-Agent": USER_AGENT}
    figures: List[Dict[str, Any]] = []
    seen_urls = set()

    async with httpx.AsyncClient(timeout=EXTERNAL_MEDIA_TIMEOUT) as client:
        resolved_title = clean_topic

        # 1. Canonical Wikipedia Summary / PageImage (Highest precision)
        try:
            wiki_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(clean_topic.replace(' ', '_'))}"
            w_resp = await client.get(wiki_url, headers=headers)
            if w_resp.status_code == 200:
                data = w_resp.json()
                # Reject disambiguation pages
                if data.get("type") != "disambiguation":
                    resolved_title = data.get("title", clean_topic)
                    img = data.get("originalimage") or data.get("thumbnail")
                    if img:
                        src = img.get("source")
                        w = img.get("width", 0)
                        h = img.get("height", 0)
                        if src and src not in seen_urls:
                            fn = src.split("/")[-1].split("?")[0]
                            desc = data.get("description", "")
                            if _is_image_valid(src, w, h, fn, desc):
                                score = _score_image_candidate(fn, desc, keywords)
                                if score >= 0.0:
                                    raw_fn_clean = urllib.parse.unquote(fn)
                                    fn_title = re.sub(r'[\._-]', ' ', raw_fn_clean.rsplit('.', 1)[0]).strip()
                                    fn_title = re.sub(r'\s+(?:svg|png|jpg|jpeg)\b', '', fn_title, flags=re.I).strip()
                                    is_descriptive = len(fn_title.split()) >= 2 and any(k in fn_title.lower() for k in ("diagram", "structure", "cell", "model", "schematic", "overview", "anatomy", "cycle", "pathway", "curve", "spectrum", "formula"))
                                    if is_descriptive:
                                        fig_display_title = fn_title.title()
                                        raw_desc = (data.get("description") or "").strip()
                                        cap = f"{fig_display_title}. {raw_desc}".strip(". ") if raw_desc else fig_display_title
                                    else:
                                        fig_display_title = resolved_title
                                        cap = data.get("description") or f"Scientific overview of {resolved_title}."

                                    figures.append({
                                        "title": fig_display_title,
                                        "caption": cap,
                                        "url": src,
                                        "source_url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
                                        "attribution": "Wikipedia / Wikimedia Commons"
                                    })
                                    seen_urls.add(src)
        except Exception as e:
            logger.debug(f"Wikipedia summary image lookup failed: {e}")

        # 2. Wikipedia Article Images Query (prop=images for the resolved canonical topic)
        if len(figures) < max_figures and resolved_title:
            try:
                images_url = (
                    "https://en.wikipedia.org/w/api.php?action=query&format=json"
                    f"&titles={urllib.parse.quote(resolved_title)}&prop=images&imlimit=20"
                )
                i_resp = await client.get(images_url, headers=headers)
                if i_resp.status_code == 200:
                    pages = (i_resp.json().get("query") or {}).get("pages") or {}
                    page_images = []
                    for _, p in pages.items():
                        for im in p.get("images") or []:
                            im_title = im.get("title", "")
                            if any(im_title.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
                                page_images.append(im_title)

                    # Score image titles against topic keywords
                    scored_images = []
                    for im_t in page_images:
                        clean_fn = im_t.replace("File:", "")
                        sc = _score_image_candidate(clean_fn, "", keywords)
                        if sc >= 4.0:
                            scored_images.append((sc, im_t))

                    scored_images.sort(key=lambda x: x[0], reverse=True)
                    if scored_images:
                        top_titles = [x[1] for x in scored_images[:4]]
                        info_url = (
                            "https://en.wikipedia.org/w/api.php?action=query&format=json"
                            f"&titles={'|'.join(urllib.parse.quote(t) for t in top_titles)}"
                            "&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200"
                        )
                        info_resp = await client.get(info_url, headers=headers)
                        if info_resp.status_code == 200:
                            info_pages = (info_resp.json().get("query") or {}).get("pages") or {}
                            for _, ip in info_pages.items():
                                info_list = ip.get("imageinfo") or []
                                if not info_list:
                                    continue
                                info = info_list[0]
                                u = info.get("thumburl") or info.get("url")
                                w = info.get("thumbwidth") or info.get("width") or 0
                                h = info.get("thumbheight") or info.get("height") or 0
                                if u and u not in seen_urls:
                                    raw_title = ip.get("title", "").replace("File:", "").split("?")[0]
                                    desc_val = info.get("extmetadata", {}).get("ImageDescription", {}).get("value", "")
                                    clean_desc = re.sub(r'<[^>]+>', '', desc_val).strip()
                                    if _is_image_valid(u, w, h, raw_title, clean_desc):
                                        clean_fig_title = re.sub(r'[\._-]', ' ', raw_title.rsplit('.', 1)[0]).strip().title()
                                        cap = clean_desc[:200] if clean_desc else f"Structural diagram for {resolved_title}."
                                        figures.append({
                                            "title": clean_fig_title,
                                            "caption": cap,
                                            "url": u,
                                            "source_url": info.get("descriptionurl", ""),
                                            "attribution": "Wikimedia Commons / Scientific Reference"
                                        })
                                        seen_urls.add(u)
                                        if len(figures) >= max_figures:
                                            break
            except Exception as e:
                logger.debug(f"Wikipedia page images lookup failed: {e}")

        # 3. Wikimedia Commons Search (ONLY as fallback if Wikipedia had no suitable image)
        if not figures:
            try:
                search_query = f'"{resolved_title}" (diagram OR structure OR schematic OR architecture)'
                commons_url = (
                    "https://commons.wikimedia.org/w/api.php?action=query&format=json"
                    f"&generator=search&gsrnamespace=6&gsrsearch={urllib.parse.quote(search_query)}"
                    "&gsrlimit=8&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1200"
                )
                c_resp = await client.get(commons_url, headers=headers)
                if c_resp.status_code == 200:
                    pages = (c_resp.json().get("query") or {}).get("pages") or {}
                    scored_candidates = []
                    for _, p in pages.items():
                        title = p.get("title", "")
                        info_list = p.get("imageinfo") or []
                        if not info_list:
                            continue
                        info = info_list[0]
                        url = info.get("thumburl") or info.get("url")
                        w = info.get("thumbwidth") or info.get("width") or 0
                        h = info.get("thumbheight") or info.get("height") or 0
                        desc_meta = info.get("extmetadata", {}).get("ImageDescription", {}).get("value", "")

                        if not url or url in seen_urls:
                            continue

                        fn = title.replace("File:", "").split("?")[0]
                        clean_desc = re.sub(r'<[^>]+>', '', desc_meta).strip()
                        if _is_image_valid(url, w, h, fn, clean_desc):
                            score = _score_image_candidate(fn, clean_desc, keywords)
                            # Require strong topic keyword overlap for Commons fallback
                            if score >= 4.0:
                                scored_candidates.append((score, fn, clean_desc, url, info.get("descriptionurl", "")))

                    scored_candidates.sort(key=lambda x: x[0], reverse=True)
                    for _, fn, clean_desc, url, page_url in scored_candidates:
                        if len(figures) >= max_figures:
                            break
                        clean_title = re.sub(r'[\._-]', ' ', fn.rsplit('.', 1)[0]).strip().title()
                        cap = clean_desc[:200] if clean_desc else f"Structural diagram for {resolved_title}."
                        figures.append({
                            "title": clean_title,
                            "caption": cap,
                            "url": url,
                            "source_url": page_url,
                            "attribution": "Wikimedia Commons / Open Educational Media"
                        })
                        seen_urls.add(url)
            except Exception as e:
                logger.debug(f"Wikimedia commons search failed: {e}")

    return figures[:max_figures]


# ---------------------------------------------------------------------------
# Strict Grounded Quantitative Chart Extraction (No Mock Fallbacks)
# ---------------------------------------------------------------------------

KNOWN_UNITS = [
    "km/s", "m/s", "mph", "ly", "kpc", "mpc", "pc", "au", "km", "nm", "um", "mm", "cm", "m",
    "m_sun", "msun", "kg", "g", "gev", "mev", "kev", "ev", "tev",
    "ms", "sec", "min", "hr", "gyr", "myr", "yr", "s",
    "%", "db", "hz", "khz", "mhz", "ghz", "thz",
    "k", "°c", "c", "j", "kj", "w", "kw", "mw", "gw",
    "flops", "tflops", "gflops", "pflops", "params", "tokens/s", "tok/s",
    "score", "index", "points"
]

def _extract_unit_from_string(s: str) -> Optional[str]:
    """Finds known scientific or benchmark unit from a header or string."""
    s_clean = s.strip().lower()
    m_paren = re.search(r'[\(\[]([^\)\]]+)[\)\]]', s_clean)
    if m_paren:
        inside = m_paren.group(1).strip()
        for u in KNOWN_UNITS:
            if inside == u or inside.endswith(f" {u}") or inside.startswith(f"{u} "):
                return u
        if len(inside) <= 8 and not inside.isdigit():
            return inside

    for u in KNOWN_UNITS:
        if s_clean.endswith(f" {u}") or s_clean.endswith(f"{u}"):
            return u
    return None

def _extract_number(s: str) -> Optional[Tuple[float, str]]:
    """Extracts first valid number and its raw string representation."""
    m = re.search(r'[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:[eE][-+]?\d+)?', s)
    if not m:
        return None
    raw_str = m.group(0)
    cleaned = raw_str.replace(',', '')
    try:
        val = float(cleaned)
        return val, raw_str
    except ValueError:
        return None

def _is_number_in_sources(num_str: str, source_corpus: str) -> bool:
    """Verifies that the numeric string appears verbatim in source corpus."""
    if not source_corpus or not num_str:
        return False
    clean_num = num_str.replace(',', '')
    pattern = r'(?<![\w.])' + re.escape(clean_num) + r'(?![\w.])'
    if re.search(pattern, source_corpus):
        return True
    if clean_num != num_str and re.search(r'(?<![\w.])' + re.escape(num_str) + r'(?![\w.])', source_corpus):
        return True
    return False

def extract_or_generate_topic_chart(
    query: str,
    text: str,
    chunks: Optional[List[Dict[str, Any]]] = None,
    canonical_topic: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Extracts structured, verified numeric benchmarks from Markdown tables.
    Returns a chart dictionary ONLY if ALL conditions are met:
      1. Every single numeric value is verified verbatim inside the retrieved source text.
      2. Every bar/point uses the exact same unit and metric (never mixes unrelated numbers).
      3. At least 3 distinct comparable items exist, with real axis labels and source citations.
    Otherwise returns None (never forces a chart or generates synthetic mock data).
    """
    if not text or not chunks:
        return None

    # Build lower-cased source corpus for verbatim number verification
    source_corpus_parts = []
    for c in chunks:
        t = c.get("text") or c.get("content") or c.get("snippet") or ""
        tit = c.get("title") or ""
        source_corpus_parts.append(f"{tit} {t}")
    source_corpus = " ".join(source_corpus_parts).lower()
    if not source_corpus.strip():
        return None

    # 1. Parse all Markdown tables from text
    lines = text.split("\n")
    tables = []
    current_table = []
    for line in lines:
        s = line.strip()
        if s.startswith("|") and s.endswith("|"):
            current_table.append(s)
        else:
            if len(current_table) >= 3:
                tables.append(list(current_table))
            current_table.clear()
    if len(current_table) >= 3:
        tables.append(list(current_table))

    if not tables:
        return None

    for tbl in tables:
        # Parse table cells
        header_cells = [c.strip() for c in tbl[0].split("|")[1:-1]]
        if not header_cells or len(header_cells) < 2:
            continue

        # Skip separator row (tbl[1])
        data_rows = []
        for r_str in tbl[2:]:
            cells = [c.strip() for c in r_str.split("|")[1:-1]]
            if len(cells) == len(header_cells):
                data_rows.append(cells)

        if not data_rows:
            continue

        # Strategy A: Rows are comparable entities, columns are metrics (requires >= 3 data rows)
        if len(data_rows) >= 3:
            col0_name = header_cells[0]
            for col_idx in range(1, len(header_cells)):
                metric_header = header_cells[col_idx]
                if any(term in metric_header.lower() for term in ("citation", "source", "ref", "url", "notes")):
                    continue

                header_unit = _extract_unit_from_string(metric_header)

                candidate_categories = []
                candidate_values = []
                candidate_units = []
                all_verified = True

                for r in data_rows:
                    item_name = r[0]
                    cell_val_str = r[col_idx]
                    parsed_num = _extract_number(cell_val_str)
                    if parsed_num is None:
                        all_verified = False
                        break
                    val_float, raw_num_str = parsed_num

                    # Check verbatim presence in source text
                    if not _is_number_in_sources(raw_num_str, source_corpus):
                        all_verified = False
                        break

                    # Extract unit for this cell
                    cell_unit = _extract_unit_from_string(cell_val_str) or header_unit
                    if not cell_unit:
                        if any(term in metric_header.lower() for term in ("score", "f1", "bleu", "accuracy", "rate", "ratio", "index")):
                            cell_unit = "index"
                        else:
                            all_verified = False
                            break

                    candidate_categories.append(item_name)
                    candidate_values.append(val_float)
                    candidate_units.append(cell_unit)

                if not all_verified:
                    continue

                # Check at least 3 distinct comparable items
                if len(candidate_categories) < 3 or len(set(candidate_categories)) < 3:
                    continue

                # Check uniform unit: every single item must have the EXACT SAME unit
                unique_units = set(candidate_units)
                if len(unique_units) != 1:
                    continue

                common_unit = candidate_units[0]
                display_unit = f" ({common_unit})" if common_unit != "index" else ""

                # Check if there is a citation column in this table
                citations_found = []
                for c_idx in range(len(header_cells)):
                    if any(term in header_cells[c_idx].lower() for term in ("citation", "source", "ref")):
                        for r in data_rows:
                            citations_found.append(r[c_idx])
                        break

                cite_label = "Source-verified comparative benchmarks"
                if citations_found:
                    cite_label = f"Primary source citations: {', '.join(sorted(set(citations_found))[:4])}"

                metric_title = re.sub(r'[\(\[].*?[\)\]]', '', metric_header).strip() or "Comparative Metric"

                return {
                    "title": f"Quantitative Benchmark: {metric_title}",
                    "caption": f"Empirical {metric_title.lower()} across {len(candidate_categories)} verified items with uniform unit [{common_unit}].",
                    "chart_type": "bar",
                    "x_label": col0_name or "Category",
                    "y_label": f"{metric_title}{display_unit}",
                    "categories": candidate_categories[:8],
                    "series": [
                        {
                            "name": metric_title,
                            "data": candidate_values[:8]
                        }
                    ],
                    "source_citation": cite_label
                }

        # Strategy B: Columns are comparable entities, rows are metrics (requires >= 4 header cells)
        if len(header_cells) >= 4:
            entity_columns = header_cells[1:]
            for r in data_rows:
                metric_row_name = r[0]
                row_unit = _extract_unit_from_string(metric_row_name)

                candidate_categories = []
                candidate_values = []
                candidate_units = []
                all_verified = True

                for col_idx, entity_name in enumerate(entity_columns, start=1):
                    if any(term in entity_name.lower() for term in ("citation", "source", "ref", "notes")):
                        continue

                    cell_val_str = r[col_idx]
                    parsed_num = _extract_number(cell_val_str)
                    if parsed_num is None:
                        all_verified = False
                        break
                    val_float, raw_num_str = parsed_num

                    if not _is_number_in_sources(raw_num_str, source_corpus):
                        all_verified = False
                        break

                    cell_unit = _extract_unit_from_string(cell_val_str) or row_unit
                    if not cell_unit:
                        if any(term in metric_row_name.lower() for term in ("score", "f1", "bleu", "accuracy", "rate", "ratio", "index")):
                            cell_unit = "index"
                        else:
                            all_verified = False
                            break

                    candidate_categories.append(entity_name)
                    candidate_values.append(val_float)
                    candidate_units.append(cell_unit)

                if all_verified and len(candidate_categories) >= 3 and len(set(candidate_categories)) >= 3:
                    if len(set(candidate_units)) == 1:
                        common_unit = candidate_units[0]
                        display_unit = f" ({common_unit})" if common_unit != "index" else ""
                        metric_title = re.sub(r'[\(\[].*?[\)\]]', '', metric_row_name).strip() or "Comparative Metric"
                        return {
                            "title": f"Quantitative Benchmark: {metric_title}",
                            "caption": f"Empirical {metric_title.lower()} across {len(candidate_categories)} verified items with uniform unit [{common_unit}].",
                            "chart_type": "bar",
                            "x_label": "System / Entity",
                            "y_label": f"{metric_title}{display_unit}",
                            "categories": candidate_categories[:8],
                            "series": [
                                {
                                    "name": metric_title,
                                    "data": candidate_values[:8]
                                }
                            ],
                            "source_citation": "Verified from primary retrieval sources"
                        }

    return None


# ---------------------------------------------------------------------------
# Matplotlib 300-DPI Publication-Grade Renderer for PDF
# ---------------------------------------------------------------------------

def render_chart_matplotlib(chart_data: Optional[Dict[str, Any]]) -> Optional[bytes]:
    """
    Renders publication-style chart bytes using Matplotlib (Agg backend).
    White background, clean academic typography, sharp 300 DPI, fits standard page widths.
    Strictly closes every figure inside a try ... finally: plt.close(fig); plt.close('all') block
    to eliminate memory leaks on the server.
    """
    if not chart_data:
        return None

    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np

    fig = None
    try:
        categories = chart_data.get("categories") or []
        series = chart_data.get("series") or []
        if not categories or not series:
            return None

        plt.style.use('seaborn-v0_8-whitegrid' if 'seaborn-v0_8-whitegrid' in plt.style.available else 'default')
        fig, ax = plt.subplots(figsize=(6.5, 3.2), dpi=300)
        fig.patch.set_facecolor('white')
        ax.set_facecolor('white')

        colors = ['#1E3A8A', '#0D9488', '#D97706', '#4B5563', '#7C3AED']

        x = np.arange(len(categories))
        n_series = len(series)
        width = 0.65 / max(1, n_series)

        for i, s in enumerate(series):
            vals = s.get("data") or [0.0] * len(categories)
            vals = (vals + [0.0] * len(categories))[:len(categories)]
            offset = (i - (n_series - 1) / 2.0) * width
            bars = ax.bar(
                x + offset, vals, width,
                label=s.get("name", f"Series {i + 1}"),
                color=colors[i % len(colors)],
                edgecolor='#1E293B',
                linewidth=0.6,
                alpha=0.9
            )
            for bar in bars:
                h = bar.get_height()
                if h > 0:
                    ax.annotate(
                        f'{h:g}',
                        xy=(bar.get_x() + bar.get_width() / 2, h),
                        xytext=(0, 2),
                        textcoords="offset points",
                        ha='center', va='bottom',
                        fontsize=7,
                        color='#1E293B',
                        fontweight='bold'
                    )

        ax.set_title(chart_data.get("title", ""), fontsize=9.5, fontweight='bold', pad=10, color='#0F172A')
        ax.set_xlabel(chart_data.get("x_label", ""), fontsize=8, color='#334155', labelpad=6)
        ax.set_ylabel(chart_data.get("y_label", ""), fontsize=8, color='#334155', labelpad=6)
        ax.set_xticks(x)
        wrapped_categories = [
            "\n".join([c[j:j+16] for j in range(0, len(c), 16)])
            for c in categories
        ]
        ax.set_xticklabels(wrapped_categories, fontsize=7.5, color='#1E293B')
        ax.tick_params(axis='y', labelsize=7.5, colors='#334155')

        ax.grid(axis='y', linestyle='--', alpha=0.4, color='#94A3B8')
        ax.grid(axis='x', visible=False)
        for spine in ('top', 'right', 'left', 'bottom'):
            ax.spines[spine].set_color('#CBD5E1')
            ax.spines[spine].set_linewidth(0.6)

        if n_series > 1:
            ax.legend(frameon=True, facecolor='#F8FAFC', edgecolor='#E2E8F0', fontsize=7.5, loc='upper right')

        plt.tight_layout()
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=300, facecolor=fig.get_facecolor(), edgecolor='none', bbox_inches='tight')
        buf.seek(0)
        return buf.getvalue()
    except Exception as e:
        logger.error(f"Matplotlib chart rendering failed: {e}")
        return None
    finally:
        if fig is not None:
            try:
                plt.close(fig)
            except Exception:
                pass
        try:
            plt.close('all')
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Safe Image Downloader with Pillow Verification for PDF
# ---------------------------------------------------------------------------

async def download_image_safe(url: str, timeout: Optional[float] = None) -> Optional[bytes]:
    """
    Downloads image with strict timeout and proper User-Agent header.
    Validates and converts image via Pillow to a standard RGB JPEG/PNG byte stream.
    Skips cleanly on network or decoding error without crashing.
    """
    if not url or not url.startswith("http"):
        return None

    try:
        headers = {"User-Agent": USER_AGENT}
        async with httpx.AsyncClient(timeout=EXTERNAL_MEDIA_TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return None
            data = resp.content
            if not data or len(data) < 100:
                return None

            img = Image.open(io.BytesIO(data))
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            max_dim = 1200
            if img.width > max_dim or img.height > max_dim:
                img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)

            out_buf = io.BytesIO()
            img.save(out_buf, format="JPEG", quality=90)
            return out_buf.getvalue()
    except Exception as e:
        logger.debug(f"Image download/processing failed for {url}: {e}")
        return None
