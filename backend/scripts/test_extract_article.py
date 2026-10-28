import asyncio
import httpx
import re
import html
from bs4 import BeautifulSoup

STOP_WORDS = {
    "what", "were", "latest", "discoveries", "the", "and", "for", "with",
    "from", "that", "this", "are", "was", "has", "have", "been", "had"
}

def extract_main_article_text(raw_html: str) -> str:
    soup = BeautifulSoup(raw_html, "html.parser")
    
    # Drop standard script, style, head, svg, noscript, etc.
    for tag in soup(["script", "style", "svg", "noscript", "form", "iframe"]):
        tag.decompose()

    # 1. Prefer dedicated article body containers: post-body, entry-content, article-body
    # 2. Prefer <article> or <main> if they have substantial content
    chosen_elem = None
    
    # Priority A: Dedicated content containers
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

    # Priority B: <article> tag
    if not chosen_elem:
        art = soup.find("article")
        if art and len(art.get_text(strip=True)) >= 250:
            chosen_elem = art

    # Priority C: <main> tag
    if not chosen_elem:
        m = soup.find("main")
        if m and len(m.get_text(strip=True)) >= 250:
            chosen_elem = m

    # Priority D: Largest text container among <div> and <section>
    if not chosen_elem:
        candidates = []
        for block in soup.find_all(["div", "section"]):
            # ignore body/html containers
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
    text = html.unescape(" ".join(text.split()))
    return text

def extract_scored_sentence_snippet(text: str, query: str, max_chars: int = 1500) -> str:
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
        if start_idx >= len(text) - 80:
            break
            
        target_end = min(len(text), start_idx + max_chars)
        window_text = text[start_idx:target_end]
        
        # Snap end to sentence boundary if possible
        if len(window_text) >= 600:
            last_punct = max(window_text.rfind('. '), window_text.rfind('? '), window_text.rfind('! '))
            if last_punct > 400:
                window_text = window_text[:last_punct + 1]

        window_lower = window_text.lower()
        distinct_overlap = sum(1 for w in q_words if w in window_lower)
        total_occurrences = sum(window_lower.count(w) for w in q_words)
        year_bonus = 20.0 if (target_year and target_year in window_lower) else 0.0
        
        score = (distinct_overlap * 5.0) + (total_occurrences * 1.5) + year_bonus
        if score > best_score:
            best_score = score
            best_snippet = window_text.strip()

    return best_snippet

async def main():
    url = "https://blog.jameswebbdiscovery.com/2024/03/james-webb-space-telescope-discoveries.html"
    query = "What were the latest discoveries of the James Webb Space Telescope in 2024?"
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        r = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ARIA-Research/2.0"})
        article_text = extract_main_article_text(r.text)
        print("Total extracted article text length:", len(article_text))
        snippet = extract_scored_sentence_snippet(article_text, query)
        print("\n--- NEW EXTRACTED SNIPPET FOR JAMESWEBBDISCOVERY.COM (MARCH 2024) ---")
        print(snippet)
        print("\nSnippet length:", len(snippet))
        print("Starts with capital:", snippet[0].isupper())
        print("Contains 2024:", "2024" in snippet)

if __name__ == "__main__":
    asyncio.run(main())
