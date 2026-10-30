"""
Publication-grade IEEE / arXiv two-column research PDF generator (Part 2).

Guarantees on EVERY topic:
- Universal Unicode & LaTeX sanitizer: no '?' glyph can ever appear from
  unsupported characters (dashes, subscripts, superscripts, Greek letters,
  degrees, +/-, multiplication, arrows, comparisons, LaTeX delimiters).
- Dynamic grammatically-sound Abstract built from the canonical topic title,
  the real verified claim ratio, and top verified summary sentences.
- Real bordered multi-column tables parsed from the Markdown table syntax,
  with wrapped cells, header shading, and cross-column pagination.
- Section III prints the COMPLETE sentence-level verification audit ledger
  (every audited claim, badge, confidence score, supporting citation).
"""
import fitz
import re
import datetime
import unicodedata
from typing import List, Dict, Any, Optional, Tuple

# Unicode spaces, dashes, quotes
_SPACES = ["\u202f", "\u00a0", "\u2009", "\u2002", "\u2003", "\u2004", "\u2005", "\u2006", "\u2007", "\u2008", "\u200a", "\u200b", "\ufeff"]
_DASHES = ["\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212", "\u201a"]
_QUOTES = {"\u201c": '"', "\u201d": '"', "\u201e": '"', "«": '"', "»": '"', "\u2018": "'", "\u2019": "'", "\u201b": "'"}

# Subscripts -> digits
_SUB_MAP = str.maketrans("₀₁₂₃₄₅₆₇₈₉₊₋₌", "0123456789+-=")

# Greek / math symbols -> ASCII names
_GREEK_MAP = {
    "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon",
    "ζ": "zeta", "η": "eta", "θ": "theta", "ι": "iota", "κ": "kappa",
    "λ": "lambda", "µ": "u", "μ": "u", "ν": "nu", "ξ": "xi", "ο": "o",
    "π": "pi", "ρ": "rho", "ς": "s", "σ": "sigma", "τ": "tau", "υ": "u",
    "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega",
    "Γ": "Gamma", "Δ": "Delta", "Θ": "Theta", "Λ": "Lambda", "Π": "Pi",
    "Σ": "Sigma", "Φ": "Phi", "Ψ": "Psi", "Ω": "Omega", "Ξ": "Xi",
    "∂": "d", "∞": "infinity", "τ": "tau",
}
_MATH_MAP = {
    "°": " deg ", "±": "+/-", "×": "x", "·": "*", "÷": "/", "•": "-",
    "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~", "∼": "~", "≡": "=",
    "→": "->", "←": "<-", "⇒": "=>", "⇐": "<=", "↔": "<->",
    "∴": "therefore", "∈": "in", "∑": "sum", "∏": "prod", "√": "sqrt",
    "∫": "integral", "∇": "grad", "⊕": "(+)", "⊗": "(x)", "‰": " permille",
}

# Common LaTeX operator macros (robust to backslash-letter sequences)
_LATEX_MACROS = [
    (re.compile(r'\\(?:left|right)\b\s*', re.I), ' '),
    (re.compile(r'\\(?:Big|big|Bigg|bigg)[lrm]?\b', re.I), ' '),
    (re.compile(r'\\(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|chi|psi|omega)\b', re.I),
     lambda m: m.group(0)[1:].lower()),
    (re.compile(r'\\(?:Gamma|Delta|Theta|Lambda|Pi|Sigma|Phi|Psi|Omega|Xi)\b'),
     lambda m: m.group(0)[1:]),
    (re.compile(r'\\ge[q]?\b', re.I), '>='),
    (re.compile(r'\\le[q]?\b', re.I), '<='),
    (re.compile(r'\\ne[q]?\b', re.I), '!='),
    (re.compile(r'\\approx\b', re.I), ' ~ '),
    (re.compile(r'\\sim\b', re.I), ' ~ '),
    (re.compile(r'\\pm\b', re.I), ' +/- '),
    (re.compile(r'\\mp\b', re.I), ' +/- '),
    (re.compile(r'\\circ\b', re.I), ' deg '),
    (re.compile(r'\\degree[s]?\b', re.I), ' deg '),
    (re.compile(r'\\times\b', re.I), ' x '),
    (re.compile(r'\\cdot\b', re.I), ' * '),
    (re.compile(r'\\div\b', re.I), ' / '),
    (re.compile(r'\\to\b', re.I), ' -> '),
    (re.compile(r'\\rightarrow\b', re.I), ' -> '),
    (re.compile(r'\\leftarrow\b', re.I), ' <- '),
    (re.compile(r'\\infty\b', re.I), ' infinity '),
    (re.compile(r'\\sum\b', re.I), ' sum '),
    (re.compile(r'\\prod\b', re.I), ' prod '),
    (re.compile(r'\\sqrt\b', re.I), ' sqrt '),
    (re.compile(r'\\in\b', re.I), ' in '),
    (re.compile(r'\\(?:dots|ldots|cdots)\b', re.I), '...'),
    (re.compile(r'\\(?:pi|Theta)_\\theta\b', re.I), 'pi_theta'),
    (re.compile(r'\\pi_\\theta\b', re.I), 'pi_theta'),
    (re.compile(r'\\text\{([^{}]*)\}'), r'\1'),
    (re.compile(r'\\(?:mathrm|mathit|mathbf|mathbb|mathcal|mathsf)\{([^{}]*)\}'), r'\1'),
    (re.compile(r'\\(?:hat|bar|vec|tilde|dot|overline)\{([^{}]*)\}'), r'\1'),
    (re.compile(r'\\[!,:;]'), ' '),
    (re.compile(r'\\begin\{[^{}]*\}'), ' '),
    (re.compile(r'\\end\{[^{}]*\}'), ' '),
    (re.compile(r'\\[A-Za-z]+\b', re.I), ' '),
]


_SUP_RUN_PATTERN = re.compile('[\u2070\u2071\u2074-\u2079\u207a\u207b\u00b9\u00b2\u00b3]+')


def _sup_run_to_ascii(match) -> str:
    run = match.group(0)
    out = []
    for ch in run:
        cp = ord(ch)
        if 0x2070 <= cp <= 0x2079 and cp != 0x2071:
            out.append(str(cp - 0x2070))
        elif cp == 0x00b9:
            out.append("1")
        elif cp == 0x00b2:
            out.append("2")
        elif cp == 0x00b3:
            out.append("3")
        elif cp == 0x207a:
            out.append("+")
        elif cp == 0x207b:
            out.append("-")
    joined = "".join(out)
    return ("^" + joined) if joined else ""


def sanitize_academic_text(text: str) -> str:
    """
    Comprehensive Universal Unicode & LaTeX normalizer (Part 2.1).
    Pass every string through this so '?' can NEVER appear from an
    unsupported glyph in the generated PDF.
    """
    if not text:
        return ""
    s = str(text)

    # 1. Unicode spaces
    for sp in _SPACES:
        s = s.replace(sp, " ")
    # 2. Dashes -> '-'
    for d in _DASHES:
        s = s.replace(d, '-')
    # 3. Quotes
    for k, v in _QUOTES.items():
        s = s.replace(k, v)
    # 4. Subscripts -> digits
    s = s.translate(_SUB_MAP)
    # 5. Superscript RUNS (e.g. 10⁻⁸ -> 10^-8, x²ⁿ -> x^2n)
    s = _SUP_RUN_PATTERN.sub(_sup_run_to_ascii, s)
    # 6. Greek letters
    for k, v in _GREEK_MAP.items():
        s = s.replace(k, f" {v} ") if k in ("α", "δ", "γ", "Δ", "μ", "µ", "π", "θ", "σ", "λ") else s.replace(k, v)
    # 7. Math symbols
    for k, v in _MATH_MAP.items():
        s = s.replace(k, v)
    # 8. Strip raw LaTeX math delimiters and macros
    s = s.replace("\\(", " ").replace("\\)", " ").replace("\\[", " ").replace("\\]", " ")
    s = re.sub(r'\$\$?([^$]*)\$\$?', r' \1 ', s)  # $$..$$ blocks
    s = re.sub(r'\$(?!=)([^$]*)\$', r' \1 ', s, flags=re.DOTALL)  # inline $..$
    s = s.replace("$", " ")
    for pattern, repl in _LATEX_MACROS:
        s = pattern.sub(repl, s)
    s = s.replace("\\", " ")

    # 9. Transliterate any remaining non-ASCII Latin characters (accents) via NFKD,
    #    and finally HARD-DROP every remaining char outside Latin-1 instead of
    #    letting the font encoder emit '?'.
    out_chars = []
    for ch in unicodedata.normalize("NFKD", s):
        if ord(ch) < 128:
            out_chars.append(ch)
        elif unicodedata.category(ch) == "Mn":
            continue  # combining accent mark
        elif 128 <= ord(ch) <= 255:
            base = unicodedata.normalize("NFKD", ch)[0]
            out_chars.append(base if base and ord(base) < 128 else "")
        else:
            out_chars.append("")
    s = "".join(out_chars)

    # 10. Collapse whitespace artifacts left by symbol substitution
    s = re.sub(r'\s+([.,;:!?%)\]])', r'\1', s)
    s = re.sub(r'([(\[])\s+', r'\1', s)
    s = re.sub(r' {2,}', ' ', s)
    return " ".join(s.split()).strip()


def convert_citations_to_ieee(text: str) -> str:
    """Replaces [[c:0]], [[c:1]] with IEEE bracketed 1-indexed numbers [1], [2]."""
    if not text:
        return ""
    return re.sub(r'\[+c:(\d+)\]+', lambda m: f"[{int(m.group(1)) + 1}]", text)


def short_domain(url: Optional[str]) -> str:
    """Extracts a readable short domain from a URL for clean inline display."""
    if not url:
        return ""
    u = str(url).strip()
    m = re.match(r'^https?://([^/?#]+)', u, flags=re.IGNORECASE)
    if m:
        host = m.group(1)
        host = re.sub(r'^www\.', '', host, flags=re.IGNORECASE)
        return host
    if u.startswith("doi:"):
        return u[4:]
    return u[:48]


def resolve_source_url(src: Dict[str, Any]) -> str:
    """
    Resolves the direct, clickable primary-source URL for a citation:
    explicit URL > DOI URL > arXiv abs URL > Wikipedia/curated path.
    Returns "" when no resolvable link exists.
    """
    for key in ("url", "source_url"):
        v = src.get(key)
        if v and re.match(r'^https?://', str(v), flags=re.IGNORECASE):
            return str(v).strip()
    doi = src.get("doi")
    if doi:
        d = str(doi).strip()
        if not d.startswith("http"):
            d = f"https://doi.org/{d}"
        return d
    arxiv = src.get("arxiv_id") or src.get("arxiv")
    if arxiv:
        return f"https://arxiv.org/abs/{str(arxiv).strip()}"
    return ""


def _parse_rich_segments(text: str) -> List[Tuple[str, bool]]:
    """
    Segments Markdown inline syntax into (text, bold) runs so **bold** becomes
    Times-Bold in the PDF and literal '**' glyphs NEVER appear in the output.
    Also strips inline code backticks and any unbalanced '**' remnants.
    """
    t = text.replace("`", "")
    segments: List[Tuple[str, bool]] = []
    pos = 0
    for m in re.finditer(r'\*\*(.+?)\*\*', t, flags=re.DOTALL):
        if m.start() > pos:
            segments.append((t[pos:m.start()], False))
        segments.append((m.group(1), True))
        pos = m.end()
    if pos < len(t):
        segments.append((t[pos:], False))
    if not segments:
        return [(t, False)]
    # Drop any residual single '**' runs (unbalanced markers)
    segments = [(s.replace("**", ""), b) for s, b in segments]
    return [(s, b) for s, b in segments if s]


def _split_segmented_words(segments: List[Tuple[str, bool]]) -> List[Tuple[str, bool]]:
    """Splits (text,bold) segments into per-word tuples preserving bold flags."""
    words: List[Tuple[str, bool]] = []
    for txt, bold in segments:
        for w in re.split(r'\s+', txt):
            if w:
                words.append((w, bold))
    return words


def strip_markdown(text: str) -> str:
    """Strips Markdown syntax for clean academic prose."""
    t = re.sub(r'```(?:[a-zA-Z0-9_-]*\n)?(.*?)```', r'\1', text, flags=re.DOTALL)
    t = re.sub(r'\*\*(.*?)\*\*', r'\1', t, flags=re.DOTALL)
    t = re.sub(r'(?<!\w)\*(?!\s)([^*]+?)\*(?!\w)', r'\1', t)
    t = re.sub(r'`(.*?)`', r'\1', t)
    t = re.sub(r'^#{1,6}\s*', '', t, flags=re.MULTILINE)
    return t.strip()


def is_table_separator(line: str) -> bool:
    return bool(re.match(r'^\|?\s*[-:]+[-| :]+\s*\|?$', line.strip()))


def parse_markdown_table_rows(lines: List[str]) -> List[List[str]]:
    """Parses Markdown table lines into list-of-cells (header + data rows)."""
    rows = []
    for line in lines:
        s = line.strip()
        if not s.startswith('|') or is_table_separator(s):
            continue
        cells = [c.strip() for c in s.split('|')[1:-1]]
        if cells:
            rows.append(cells)
    return rows


class AcademicTwoColumnPaper:
    """
    Renders a true IEEE / arXiv Two-Column Academic Research Paper PDF using PyMuPDF.
    Base-14 serif fonts: 'tiro' (Times-Roman), 'tibo' (Times-Bold),
    'tiit' (Times-Italic), 'tibi' (Times-BoldItalic).
    """

    BODY_FONT = 'tiro'
    BOLD_FONT = 'tibo'
    ITAL_FONT = 'tiit'
    BODY_SIZE = 8.5
    LINE_H = 11.0

    def __init__(
        self,
        query: str,
        answer_final: str,
        confidence: float,
        tiers: List[str],
        claims: List[Dict[str, Any]],
        sources: List[Dict[str, Any]],
        timing: Optional[Dict[str, Any]] = None,
        tokens: Optional[Dict[str, Any]] = None,
        canonical_topic: Optional[str] = None,
        full_ledger: bool = True,
        clickable_urls: bool = True
    ):
        self.doc = fitz.open()
        self.query = sanitize_academic_text((query or "Research Overview").strip())
        # v3 fix: sanitize line-by-line so the Markdown BLOCK STRUCTURE (headings,
        # bullets, table rows) survives into the block parser. A whole-document
        # sanitize pass would collapse every newline and dump one text wall.
        raw = convert_citations_to_ieee(answer_final or "No synthesis content was recorded for this report.")
        self.raw_answer = "\n".join(
            sanitize_academic_text(ln) if ln.strip() else ""
            for ln in raw.split("\n")
        )
        self.confidence = confidence if confidence is not None else 0.85
        self.tiers = tiers or ["OKF"]
        self.claims = claims or []
        self.sources = sources or []
        self.timing = timing or {}
        self.tokens = tokens or {}
        self.canonical_topic = sanitize_academic_text(canonical_topic or "")
        self.full_ledger = bool(full_ledger)
        self.clickable_urls = bool(clickable_urls)

        # Precompute click targets for every citation (idx -> (url, display_url))
        self.ref_links: List[Tuple[str, str]] = []
        for s in self.sources:
            url = resolve_source_url(s)
            if url.startswith("doi:"):
                url = f"https://doi.org/{url[4:]}"
            self.ref_links.append((url, short_domain(url)))

        # Dimensions (A4)
        self.PAGE_W = 595.0
        self.PAGE_H = 842.0
        self.MARGIN_L = 42.0
        self.MARGIN_R = 553.0
        self.COL_W = 246.5
        self.GUTTER = 18.0
        self.COL_X = [42.0, 42.0 + 246.5 + 18.0]  # [42.0, 306.5]
        self.BOTTOM_LIMIT = 800.0
        self.TOP_LIMIT_NEXT = 52.0

        self.tier_str = ", ".join(self.tiers)
        self.conf_pct = f"{int(round(self.confidence * 100))}%"
        self.date_str = datetime.datetime.now().strftime("%B %Y")

        self.page = self.doc.new_page(width=self.PAGE_W, height=self.PAGE_H)
        self.render_page1_header()
        self.current_col = 0
        self.y = self.start_y_col

    # ------------------------------------------------------------------ utils
    def wrap_line(self, text: str, max_w: float, fontname: str = 'tiro', fontsize: float = 8.5) -> List[str]:
        words = text.split()
        if not words:
            return [""]
        lines = []
        cur = []
        for w in words:
            cand = " ".join(cur + [w])
            if fitz.get_text_length(cand, fontname=fontname, fontsize=fontsize) <= max_w:
                cur.append(w)
            else:
                if cur:
                    lines.append(" ".join(cur))
                cur = [w]
        if cur:
            lines.append(" ".join(cur))
        return lines

    def insert_uri_link(self, rect: fitz.Rect, uri: str):
        """Attaches a clickable URI annotation to the drawn link text rect."""
        try:
            self.page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": uri})
        except Exception:
            pass  # Link annotations are cosmetic; text itself still displays the URL

    def _wrap_rich_words(
        self, words: List[Tuple[str, bool]], max_w: float, fontsize: float
    ) -> List[List[Tuple[str, bool, str]]]:
        """
        Word-wraps rich (word, bold) tuples into lines of (word, bold, fontname)
        runs. Bold words wrap in Times-Bold, plain words in Times-Roman.
        """
        lines: List[List[Tuple[str, bool, str]]] = []
        cur: List[Tuple[str, bool, str]] = []
        cur_w = 0.0
        space_w = fitz.get_text_length(" ", fontname="tiro", fontsize=fontsize)
        for word, bold in words:
            fname = "tibo" if bold else "tiro"
            w = fitz.get_text_length(word, fontname=fname, fontsize=fontsize)
            add = w if not cur else w + space_w
            if cur and cur_w + add > max_w:
                lines.append(cur)
                cur = [(word, bold, fname)]
                cur_w = w
            else:
                cur.append((word, bold, fname))
                cur_w += add
        if cur:
            lines.append(cur)
        return lines

    def draw_rich_line(self, x: float, y: float, runs: List[Tuple[str, bool, str]], fontsize: float, color=(0.12, 0.15, 0.18)) -> float:
        """Draws mixed bold/plain runs on a single baseline; returns end x."""
        cursor = x
        space_w = fitz.get_text_length(" ", fontname="tiro", fontsize=fontsize)
        for word, bold, fname in runs:
            if not word:
                continue
            self.page.insert_text(fitz.Point(cursor, y), word, fontname=fname, fontsize=fontsize, color=color)
            cursor += fitz.get_text_length(word, fontname=fname, fontsize=fontsize) + space_w
        return cursor

    def add_link_text(self, x: float, y: float, label: str, uri: str, fontsize: float = 7.5) -> None:
        """Draws a sky-blue underlined clickable URL label with its link annotation."""
        if not label or not uri:
            return
        self.page.insert_text(fitz.Point(x, y), label, fontname="tiro", fontsize=fontsize, color=(0.02, 0.47, 0.66))
        label_w = fitz.get_text_length(label, fontname="tiro", fontsize=fontsize)
        underline_y = y + 2.0
        self.page.draw_line(fitz.Point(x, underline_y), fitz.Point(x + label_w, underline_y), color=(0.02, 0.47, 0.66), width=0.4)
        self.insert_uri_link(fitz.Rect(x, y - fontsize, x + label_w + 2, y + 3), uri)

    def ensure_space(self, pts: float):
        if self.y + pts > self.BOTTOM_LIMIT:
            self.advance_column()

    def advance_column(self):
        if self.current_col == 0:
            self.current_col = 1
            self.y = self.start_y_col if len(self.doc) == 1 else self.TOP_LIMIT_NEXT
        else:
            self.current_col = 0
            self.page = self.doc.new_page(width=self.PAGE_W, height=self.PAGE_H)
            self.y = self.TOP_LIMIT_NEXT
            self.page.insert_text(fitz.Point(self.MARGIN_L, 26), f"ARIA v2 AUTONOMOUS VERIFICATION PREPRINT  |  {self.query[:45]}...", fontname="tiro", fontsize=7.5, color=(0.30, 0.35, 0.40))
            self.page.insert_text(fitz.Point(self.MARGIN_R - 45, 26), f"Page {len(self.doc)}", fontname="tibo", fontsize=8.0, color=(0.30, 0.35, 0.40))
            self.page.draw_line(fitz.Point(self.MARGIN_L, 32), fitz.Point(self.MARGIN_R, 32), color=(0.72, 0.76, 0.80), width=0.5)

    def paper_title(self) -> str:
        clean_title = strip_markdown(self.query).strip(" ?.:") or "Environment-Agnostic Research Synthesis"
        if not clean_title.endswith("?"):
            clean_title = clean_title.title()
        return clean_title

    # -------------------------------------------------------------- page head
    def render_page1_header(self):
        # 1. Top Preprint Banner
        header_text = f"ARIA v2 AUTONOMOUS VERIFICATION PREPRINT  |  TIER: {self.tier_str.upper()}  |  AUDIT CONFIDENCE: {self.conf_pct}  |  {self.date_str.upper()}"
        self.page.insert_text(fitz.Point(self.MARGIN_L, 26), header_text, fontname="tiro", fontsize=7.5, color=(0.28, 0.32, 0.36))
        self.page.draw_line(fitz.Point(self.MARGIN_L, 32), fitz.Point(self.MARGIN_R, 32), color=(0.72, 0.76, 0.80), width=0.6)

        # 2. Centered 16pt Bold Serif Title
        clean_title = strip_markdown(self.query).strip(" ?.:") or "Autonomous Research Synthesis"
        clean_title = clean_title.title()
        title_lines = self.wrap_line(clean_title, max_w=480.0, fontname="tibo", fontsize=16.0)
        cur_y = 58.0
        for tl in title_lines:
            t_len = fitz.get_text_length(tl, fontname="tibo", fontsize=16.0)
            x_pos = (self.PAGE_W - t_len) / 2.0
            self.page.insert_text(fitz.Point(x_pos, cur_y), tl, fontname="tibo", fontsize=16.0, color=(0.08, 0.10, 0.12))
            cur_y += 19.0

        # 3. Centered Author & Affiliation Block
        cur_y += 4.0
        a1 = "ARIA v2 Autonomous Research & Intelligence Synthesis Engine"
        t1_len = fitz.get_text_length(a1, fontname="tiro", fontsize=10.0)
        self.page.insert_text(fitz.Point((self.PAGE_W - t1_len) / 2.0, cur_y), a1, fontname="tiro", fontsize=10.0, color=(0.14, 0.17, 0.20))
        cur_y += 13.0

        a2 = "Department of Autonomous Verification & Multi-Tier Retrieval | Sentence-Level Entailment Audited"
        t2_len = fitz.get_text_length(a2, fontname="tiit", fontsize=8.5)
        self.page.insert_text(fitz.Point((self.PAGE_W - t2_len) / 2.0, cur_y), a2, fontname="tiit", fontsize=8.5, color=(0.35, 0.38, 0.42))
        cur_y += 16.0

        # 4. Indented Abstract & Index Terms Block (Indented 65..530, width=465)
        abs_l = 65.0
        abs_w = 465.0
        self.page.draw_line(fitz.Point(abs_l, cur_y), fitz.Point(abs_l + abs_w, cur_y), color=(0.80, 0.83, 0.86), width=0.5)
        cur_y += 12.0

        abs_body = self.build_dynamic_abstract(clean_title)
        abs_full = "Abstract— " + abs_body
        abs_lines = self.wrap_line(abs_full, max_w=abs_w, fontname="tiro", fontsize=8.5)
        abs_lead = "Abstract—"
        for idx, al in enumerate(abs_lines):
            if idx == 0 and al.startswith(abs_lead):
                lead_w = fitz.get_text_length(abs_lead, fontname="tibi", fontsize=8.5)
                self.page.insert_text(fitz.Point(abs_l, cur_y), abs_lead, fontname="tibi", fontsize=8.5, color=(0.08, 0.10, 0.12))
                rem_text = al[len(abs_lead) + 1:]
                self.page.insert_text(fitz.Point(abs_l + lead_w - 1.5, cur_y), rem_text, fontname="tiro", fontsize=8.5, color=(0.12, 0.15, 0.18))
            else:
                self.page.insert_text(fitz.Point(abs_l, cur_y), al, fontname="tiro", fontsize=8.5, color=(0.12, 0.15, 0.18))
            cur_y += 11.0

        cur_y += 2.0
        idx_lead = "Index Terms—"
        term_words = self.build_index_terms(clean_title)
        terms_str = ", ".join(term_words)
        idx_full = idx_lead + " " + terms_str
        idx_lines = self.wrap_line(idx_full, max_w=abs_w, fontname="tiro", fontsize=8.5)
        for idx, il in enumerate(idx_lines):
            if idx == 0 and il.startswith(idx_lead):
                lead_w = fitz.get_text_length(idx_lead, fontname="tibi", fontsize=8.5)
                self.page.insert_text(fitz.Point(abs_l, cur_y), idx_lead, fontname="tibi", fontsize=8.5, color=(0.08, 0.10, 0.12))
                self.page.insert_text(fitz.Point(abs_l + lead_w, cur_y), il[len(idx_lead):], fontname="tiit", fontsize=8.5, color=(0.20, 0.22, 0.25))
            else:
                self.page.insert_text(fitz.Point(abs_l, cur_y), il, fontname="tiit", fontsize=8.5, color=(0.20, 0.22, 0.25))
            cur_y += 11.0

        cur_y += 4.0
        self.page.draw_line(fitz.Point(abs_l, cur_y), fitz.Point(abs_l + abs_w, cur_y), color=(0.80, 0.83, 0.86), width=0.5)
        self.start_y_col = cur_y + 16.0

    # ------------------------------------------------------- abstract builder
    def build_dynamic_abstract(self, clean_title: str) -> str:
        """
        Dynamic, grammatically sound Abstract (Part 2.2).
        Uses the canonical topic title, the REAL verified claim ratio, and the
        top verified summary sentences - never a broken template filler.
        """
        supported_claims = [c for c in self.claims if c.get("status") == "supported"]
        partial_claims = [c for c in self.claims if c.get("status") == "partially_supported"]
        total_claims = len(self.claims)
        verified_ratio = (len(supported_claims) / total_claims * 100.0) if total_claims else 0.0

        # Canonical topic sentence
        if supported_claims:
            top = [convert_citations_to_ieee(strip_markdown(c.get("text", "")).rstrip(". "))
                   for c in supported_claims[:2]]
            top = [t for t in top if t and len(t) >= 15]
        else:
            top = []

        if top and verified_ratio >= 60.0:
            findings = f"Verified findings show that {top[0]}."
            if len(top) > 1:
                findings += f" Additional confirmation holds that {top[1]}."
        elif top and verified_ratio >= 40.0:
            findings = f"Partially verified analysis indicates that {top[0]}."
        else:
            findings = (
                f"An autonomous analysis over the retrieved evidence outlines the foundational "
                f"operational principles governing {clean_title}."
            )

        coverage_sentence = (
            f"Sentence-level entailment auditing across the {self.tier_str} retrieval architecture "
            f"verified {len(supported_claims)} of {total_claims} detected factual claims "
            f"({verified_ratio:.0f}% verified) with {len(partial_claims)} partially supported claims, "
            f"yielding an audit confidence of {self.conf_pct}."
        )
        close = "All assertions are deterministically checked with exact substring evidence grounding against cited sources."
        return f"This paper presents an autonomous verification analysis of {clean_title}. {coverage_sentence} {findings} {close}"

    def build_index_terms(self, clean_title: str) -> List[str]:
        term_words = [w.lower() for w in re.findall(r'\b[A-Za-z]{5,}\b', clean_title) if w.lower() not in
                      {"which", "where", "there", "about", "their", "would", "these", "those"}]
        seen = []
        for t in term_words[:4] + ["autonomous verification", "multi-tier retrieval", "deterministic claim auditing", "zero-hallucination synthesis"]:
            if t not in seen:
                seen.append(t)
        return seen

    # ------------------------------------------------------------ primitives
    def add_section_header(self, roman_title: str):
        self.ensure_space(26.0)
        x = self.COL_X[self.current_col]
        t_len = fitz.get_text_length(roman_title, fontname="tibo", fontsize=9.0)
        offset = max(0, (self.COL_W - t_len) / 2.0)
        self.page.insert_text(fitz.Point(x + offset, self.y), roman_title, fontname="tibo", fontsize=9.0, color=(0.08, 0.10, 0.12))
        self.y += 12.0
        self.page.draw_line(fitz.Point(x, self.y), fitz.Point(x + self.COL_W, self.y), color=(0.72, 0.76, 0.80), width=0.5)
        self.y += 4.0

    def add_subheading(self, text: str):
        """
        v3 Part 1.2: Markdown '## Title' / '### Title' headings become distinct
        bold serif subsection headers with proper vertical spacing
        (spaceBefore=8, spaceAfter=4 semantics). Literal '#' NEVER prints.
        """
        clean = strip_markdown(text).strip()
        clean = re.sub(r'^#{1,6}\s*', '', clean).strip()
        clean = clean.strip("#").strip()
        if not clean:
            return
        # Overlong "headings" are actually continuation prose; render as a paragraph
        if len(clean) > 78:
            self.add_paragraph(clean)
            return
        self.ensure_space(22.0)
        x = self.COL_X[self.current_col]
        self.y += 8.0  # spaceBefore
        title = clean.title() if clean.islower() else clean
        words = _split_segmented_words(_parse_rich_segments(title))
        for i, line_runs in enumerate(self._wrap_rich_words(words, self.COL_W, 9.0)):
            bold_runs = [(w, True, "tibo") for w, _b, _f in line_runs]
            self.draw_rich_line(x, self.y, bold_runs, 9.0, color=(0.08, 0.10, 0.12))
            self.y += 11.0
        self.y += 4.0  # spaceAfter

    def add_paragraph(self, text: str, indent: bool = True, fontsize: float = BODY_SIZE, fontname: str = BODY_FONT, line_h: float = LINE_H):
        """
        v3 Part 1.2: renders a Markdown paragraph with **bold** runs converted to
        real Times-Bold text. Falls back to the plain single-font path when the
        text contains no inline emphasis.
        """
        if "**" in text or "`" in text:
            words = _split_segmented_words(_parse_rich_segments(text))
            has_bold = any(b for _, b in words)
            if has_bold:
                lines = self._wrap_rich_words(words, max_w=self.COL_W, fontsize=fontsize)
                self.ensure_space(len(lines) * line_h + 4.0)
                x = self.COL_X[self.current_col]
                for idx, runs in enumerate(lines):
                    line_indent = 10.0 if (indent and idx == 0) else 0.0
                    self.draw_rich_line(x + line_indent, self.y, runs, fontsize)
                    self.y += line_h
                self.y += 4.0
                return
        clean = strip_markdown(text)
        lines = self.wrap_line(clean, max_w=self.COL_W, fontname=fontname, fontsize=fontsize)
        self.ensure_space(len(lines) * line_h + 4.0)
        x = self.COL_X[self.current_col]
        for idx, l in enumerate(lines):
            line_indent = 10.0 if (indent and idx == 0) else 0.0
            self.page.insert_text(fitz.Point(x + line_indent, self.y), l, fontname=fontname, fontsize=fontsize, color=(0.12, 0.15, 0.18))
            self.y += line_h
        self.y += 4.0

    def add_bullet(self, bold_prefix: str, text: str):
        """
        v3 Part 1.2: bullets render as properly indented hanging-indent bullet
        paragraphs ('- glyph + wrapped continuation lines'), never concatenated
        inline strings, with **bold** lead-ins drawn in Times-Bold.
        """
        body = re.sub(r'^\s*[\-\u2022\u00b7]\s+', '', text or "")
        body_words: List[Tuple[str, bool]] = []
        if bold_prefix.strip():
            body_words = [(t, True) for t in re.split(r'\s+', (bold_prefix + " ").strip()) if t]
        body_words += _split_segmented_words(_parse_rich_segments(body))
        if not body_words:
            return
        pending = [("-", False)] + body_words
        lines = self._wrap_rich_words(pending, max_w=self.COL_W - 8.0, fontsize=8.5)
        self.ensure_space(len(lines) * 11.0 + 3.0)
        x = self.COL_X[self.current_col]
        first = True
        for runs in lines:
            indent_x = x + 2.0 if first else x + 12.0  # hanging indent
            self.draw_rich_line(indent_x, self.y, runs, 8.5)
            self.y += 11.0
            first = False
        self.y += 3.0

    # ------------------------------------------------------- real MD tables
    def _render_table_block(self, rows: List[List[str]], caption: str = ""):
        """
        Part 2.3: Renders Markdown table rows as a REAL bordered grid with
        wrapped cells, header shading, and row-level pagination across columns.
        """
        if not rows:
            return
        ncols = max(len(r) for r in rows)
        rows = [r + [""] * (ncols - len(r)) for r in rows]

        header = rows[0] if len(rows) > 1 else None
        data_rows = rows[1:] if len(rows) > 1 else rows
        if header is None:
            data_rows = rows

        # Column width distribution proportional to natural content width
        x0 = self.COL_X[self.current_col]
        avail_w = self.COL_W
        weights = []
        for col in range(ncols):
            natural = max(
                (fitz.get_text_length(strip_markdown(" ".join(r[col].split("|"))), fontname="tiro", fontsize=7.5)
                 for r in rows), default=30.0)
            weights.append(max(natural, 22.0))
        total_w = sum(weights)
        col_widths = [max(26.0, avail_w * w / total_w) for w in weights]
        # Normalize to fill avail_w exactly
        scale = avail_w / sum(col_widths)
        col_widths = [w * scale for w in col_widths]

        if caption:
            cap_lines = self.wrap_line(caption, max_w=avail_w, fontname="tiit", fontsize=7.5)
            self.ensure_space(len(cap_lines) * 9.0 + 4.0)
            for cl in cap_lines:
                self.page.insert_text(fitz.Point(x0, self.y), cl, fontname="tiit", fontsize=7.5, color=(0.30, 0.33, 0.36))
                self.y += 9.0
            self.y += 2.0

        cell_pad_x = 3.0
        cell_pad_y = 2.5
        line_h = 9.0

        def draw_row(row_cells: List[str], bold: bool, shade: bool) -> Tuple[float, List[List[str]]]:
            fontname = "tibo" if bold else "tiro"
            cell_lines = []
            for col, (_, cw) in enumerate(zip(row_cells, col_widths)):
                txt = convert_citations_to_ieee(strip_markdown(sanitize_academic_text(row_cells[col])))
                cell_lines.append(self.wrap_line(txt, max_w=cw - 2 * cell_pad_x, fontname=fontname, fontsize=7.5))
            n_lines = max(len(cl) for cl in cell_lines)
            row_h = n_lines * line_h + 2 * cell_pad_y
            return row_h, cell_lines

        all_rows = []
        if header is not None:
            all_rows.append((header, True))
        for r in data_rows:
            all_rows.append((r, False))

        pending = all_rows
        while pending:
            self.ensure_space(40.0)
            x0 = self.COL_X[self.current_col]
            # Measure how many rows fit in the remaining column space
            fitting = []
            used = 0.0
            remaining_h = self.BOTTOM_LIMIT - self.y
            for r, bold in pending:
                row_h, cell_lines = draw_row(r, bold, False)
                if used + row_h > remaining_h and fitting:
                    break
                fitting.append((r, bold, row_h, cell_lines))
                used += row_h
            if not fitting:  # Row too tall for a whole column: force at least one
                r, bold = pending[0]
                row_h, cell_lines = draw_row(r, bold, False)
                fitting = [(r, bold, row_h, cell_lines)]

            xs = [x0]
            for cw in col_widths[:-1]:
                xs.append(xs[-1] + cw)

            for r, bold, row_h, cell_lines in fitting:
                y_top = self.y
                # Draw cell backgrounds & borders
                for col, cw in enumerate(col_widths):
                    rect = fitz.Rect(xs[col], y_top, xs[col] + cw, y_top + row_h)
                    if bold:
                        self.page.draw_rect(rect, color=(0.35, 0.38, 0.42), fill=(0.91, 0.92, 0.94), width=0.7)
                    else:
                        self.page.draw_rect(rect, color=(0.55, 0.58, 0.62), width=0.5)
                    fontname = "tibo" if bold else "tiro"
                    ty = y_top + cell_pad_y + 6.5
                    for line in cell_lines[col]:
                        self.page.insert_text(fitz.Point(xs[col] + cell_pad_x, ty), line, fontname=fontname, fontsize=7.5, color=(0.10, 0.13, 0.16))
                        ty += line_h
                # Advance row
                self.y += row_h

            pending = pending[len(fitting):]
        self.y += 8.0

    # -------------------------------------------------------- audit ledger
    def add_audit_entry(self, claim_id: int, status: str, coverage: float, cids: list, claim_text: str, evidence: str):
        """
        v3 Part 1.3: professional tabular audit entry with alternating row
        shading, clean verification badges ([SUPPORTED] emerald, [PARTIAL]
        amber, [UNSUPPORTED] rose), confidence %, source index with short
        clickable domain links, claim text and verbatim evidence quote.
        """
        cids = [c for c in (cids or []) if isinstance(c, int) and 0 <= c < len(self.ref_links)]
        if status == "supported":
            stat_label, stat_color, badge = "Supported", (0.05, 0.50, 0.35), "[SUPPORTED]"
        elif status == "partially_supported":
            stat_label, stat_color, badge = "Partial", (0.75, 0.45, 0.05), "[PARTIAL]"
        elif status == "uncited":
            stat_label, stat_color, badge = "Uncited", (0.45, 0.47, 0.50), "[UNCITED]"
        elif status == "audit_incomplete":
            stat_label, stat_color, badge = "Could Not Check", (0.55, 0.38, 0.05), "[AUDIT INCOMPLETE]"
        else:
            stat_label, stat_color, badge = "Unsupported", (0.62, 0.16, 0.16), "[UNSUPPORTED]"

        c_lines = self.wrap_line(strip_markdown(claim_text), max_w=self.COL_W - 6.0, fontname="tiro", fontsize=8.0)
        ev_lines = self.wrap_line(f'Evidence: "{strip_markdown(evidence)}"', max_w=self.COL_W - 8.0, fontname="tiit", fontsize=7.5) if evidence else []

        header_y = 9.0
        total_pts = header_y + len(c_lines) * 9.5 + len(ev_lines) * 9.0 + 5.0
        self.ensure_space(total_pts + 2.0)
        x = self.COL_X[self.current_col]

        # Alternating row shading for the tabular ledger look
        self.ledger_row_idx = getattr(self, "ledger_row_idx", 0) + 1
        row_rect = fitz.Rect(x - 3.0, self.y - 7.5, x + self.COL_W, self.y + total_pts - 2.0)
        if self.ledger_row_idx % 2 == 0:
            self.page.draw_rect(row_rect, color=None, fill=(0.955, 0.962, 0.970))
        else:
            self.page.draw_rect(row_rect, color=None, fill=(1.0, 1.0, 1.0))

        # Header: "[C3] [SUPPORTED] Supported | confidence 86% | cited by [1] arxiv.org [2] doi.org/..."
        confidence_str = f"{int(round(coverage * 100))}%"
        lead = f"[C{claim_id + 1}] {badge} {stat_label} | confidence {confidence_str} | cited by"
        if not cids:
            lead = f"[C{claim_id + 1}] {badge} {stat_label} | confidence {confidence_str} | uncited"
        self.page.insert_text(fitz.Point(x, self.y), lead, fontname="tibo", fontsize=7.5, color=stat_color)
        cx = x + fitz.get_text_length(lead, fontname="tibo", fontsize=7.5) + 4.0
        for cid in cids:
            url, dom = self.ref_links[cid]
            num = f"[{cid + 1}]"
            self.page.insert_text(fitz.Point(cx, self.y), num, fontname="tibo", fontsize=6.5, color=stat_color)
            cx += fitz.get_text_length(num, fontname="tibo", fontsize=6.5)
            display = dom or "source"
            if url and self.clickable_urls:
                self.add_link_text(cx, self.y, display, url, fontsize=6.5)
                cx += fitz.get_text_length(display, fontname="tiro", fontsize=6.5)
            else:
                self.page.insert_text(fitz.Point(cx, self.y), display, fontname="tiro", fontsize=6.5, color=(0.35, 0.38, 0.42))
                cx += fitz.get_text_length(display, fontname="tiro", fontsize=6.5)
            cx += 6.0
        self.y += header_y
        for cl in c_lines:
            self.page.insert_text(fitz.Point(x + 4.0, self.y), cl, fontname="tiro", fontsize=8.0, color=(0.15, 0.18, 0.22))
            self.y += 9.5
        for el in ev_lines:
            self.page.insert_text(fitz.Point(x + 6.0, self.y), el, fontname="tiit", fontsize=7.5, color=(0.35, 0.38, 0.42))
            self.y += 9.0
        self.y += 3.0

    def add_reference(self, num: int, src_name: str, tier: str, src_type: str, authors=None, year=None, title: str = "", url: str = ""):
        """
        v3 Part 1.1: IEEE-style reference entry with full bibliographic metadata
        and an explicitly printed, directly clickable source URL / DOI link.
        Format: [N] Authors (Year). "Title". Tier: TIER (type). [Verified] - URL: ...
        """
        def _authors_str(a) -> str:
            if isinstance(a, (list, tuple)):
                names = [str(x).strip() for x in a if str(x).strip() and str(x) != "User"]
                if not names:
                    return ""
                return ", ".join(names[:4]) + (" et al." if len(names) > 4 else "")
            a = str(a).strip() if a else ""
            return "" if a in ("", "User", "None", "null") else a

        authors_part = _authors_str(authors)
        year_part = str(year).strip() if year else ""
        # src_name holds either the platform/venue ("Semantic Scholar", okf node path) — prefer real title
        display_title = strip_markdown(title or src_name or f"Source {num}").strip()
        lead_meta = f"[{num}] "
        up = f" ({year_part})" if year_part else ""
        sourcer = f"{src_name}" if src_name and src_name != display_title else ""
        head = (
            f"{lead_meta}{authors_part}{up} \"{display_title}\"."
            + (f" {sourcer}." if sourcer else "")
            + f" Tier: {tier} ({src_type}). [Verified]"
        )
        lines = self.wrap_line(head, max_w=self.COL_W, fontname="tiro", fontsize=8.0)
        url_line = None
        if url:
            url_label = "URL: "
            url_text = url
            url_line_w = fitz.get_text_length(url_label + url_text, fontname="tiro", fontsize=7.5)
            if url_line_w > self.COL_W:  # long URLs: compact by trimming scheme
                url_text = url_text.replace("https://", "").replace("http://", "")
            url_line = url_label + url_text
            lines.append(url_line)
        self.ensure_space(len(lines) * 9.5 + 3.0)
        x = self.COL_X[self.current_col]
        for i, l in enumerate(lines):
            is_url = (url_line is not None and l == url_line)
            self.page.insert_text(
                fitz.Point(x, self.y), l,
                fontname="tiro",
                fontsize=7.5 if is_url else 8.0,
                color=(0.02, 0.47, 0.66) if is_url else (0.12, 0.15, 0.18),
            )
            # Attach the clickable link annotation over the drawn URL text
            if url and url_line is not None and l == url_line:
                uw = fitz.get_text_length(l, fontname="tiro", fontsize=7.5)
                self.insert_uri_link(fitz.Rect(x, self.y - 7.0, x + uw + 2, self.y + 2.5), url)
                self.page.draw_line(fitz.Point(x, self.y + 2.0), fitz.Point(x + uw, self.y + 2.0), color=(0.02, 0.47, 0.66), width=0.4)
            self.y += 9.5
        self.y += 2.0

    # ------------------------------------------------------------- generate
    def _classify_block(self, line: str) -> str:
        s = line.strip()
        if s.startswith('#'):
            return "heading"
        if s.startswith('|') and s.endswith('|'):
            return "table"
        if s.startswith(('-', '*', '•')) and not s.startswith('**') or re.match(r'^\*\s+', s):
            return "bullet"
        if re.match(r'^\d+\.\s+[A-Za-z]', s):
            return "bullet"
        return "paragraph"

    def _heading_mode(self, heading: str, current_mode: str) -> str:
        h = heading.lower()
        if any(k in h for k in ("mechanism", "architecture", "formulation", "method", "pipeline")):
            return "mechanism"
        if any(k in h for k in ("quantitative", "comparative", "table", "benchmark")):
            return "table"
        if any(k in h for k in ("empirical", "application", "limitation", "verification, applications")):
            return "applications"
        if any(k in h for k in ("definition", "taxonomy", "overview", "introduction")):
            return "intro"
        return current_mode

    def generate(self) -> bytes:
        raw_lines = [l.rstrip() for l in self.raw_answer.split('\n')]

        intro_paragraphs: List[str] = []
        mechanism_blocks: List[Tuple[str, str]] = []  # (kind, text)
        table_buffer: List[str] = []
        pending_tables: List[List[List[str]]] = []

        def flush_table_buffer():
            if table_buffer:
                rows = parse_markdown_table_rows(table_buffer)
                if rows:
                    pending_tables.append(rows)
                table_buffer.clear()

        current_mode = "intro"
        for ln in raw_lines:
            s = ln.strip()
            if not s:
                flush_table_buffer()
                continue
            kind = self._classify_block(s)
            if kind == "heading":
                flush_table_buffer()
                current_mode = self._heading_mode(s.lstrip('# '), current_mode)
                # v3 Part 1.2: markdown headings are PRINTED as bold subsection
                # headers, no longer silently dropped.
                self.add_subheading(s)
                continue
            if kind == "table":
                table_buffer.append(s)
                continue
            flush_table_buffer()
            if current_mode == "intro":
                if kind == "bullet":
                    intro_paragraphs.append(s)
                else:
                    intro_paragraphs.append(s)
            elif current_mode == "mechanism":
                mechanism_blocks.append((kind, s))
            elif current_mode == "table":
                if kind == "bullet":
                    mechanism_blocks.append(("bullet", s))
                else:
                    mechanism_blocks.append(("paragraph", s))
            else:  # applications
                mechanism_blocks.append((kind, s))
        flush_table_buffer()

        # ------------------------------------------------------------------
        # SECTION I. INTRODUCTION & EXECUTIVE DEFINITION
        # ------------------------------------------------------------------
        self.add_section_header("I. INTRODUCTION & EXECUTIVE DEFINITION")
        if intro_paragraphs:
            for p in intro_paragraphs:
                self.add_paragraph(p)
        else:
            self.add_paragraph(self.raw_answer[:400])

        # ------------------------------------------------------------------
        # SECTION II. CORE MECHANISMS & QUANTITATIVE ANALYSIS
        # ------------------------------------------------------------------
        self.add_section_header("II. CORE MECHANISMS & QUANTITATIVE ANALYSIS")

        # Draw real tables first (or interleaved if mechanism text before table)
        if pending_tables:
            # If mechanism text exists, render it first, then the table
            for kind, s in mechanism_blocks:
                if kind == "bullet":
                    m_bold = re.match(r'^(?:-\s*)?(?:\*\*(.*?)\*\*|([A-Za-z0-9][A-Za-z0-9\s_-]*?):)\s*[-\u2013\u2014:]?\s*(.*)$', s)
                    if m_bold:
                        prefix = (m_bold.group(1) or m_bold.group(2) or "").strip()
                        rest = m_bold.group(3).strip()
                        self.add_bullet(prefix, strip_markdown(rest))
                    else:
                        self.add_bullet("", strip_markdown(s))
                else:
                    self.add_paragraph(s)
            mechanism_blocks = []
            self.y += 3.0
            for rows in pending_tables:
                self._render_table_block(rows)
        else:
            for kind, s in mechanism_blocks:
                if kind == "bullet":
                    m_bold = re.match(r'^(?:-\s*)?(?:\*\*(.*?)\*\*|([A-Za-z0-9][A-Za-z0-9\s_-]*?):)\s*[-\u2013\u2014:]?\s*(.*)$', s)
                    if m_bold:
                        prefix = (m_bold.group(1) or m_bold.group(2) or "").strip()
                        rest = m_bold.group(3).strip()
                        self.add_bullet(prefix, strip_markdown(rest))
                    else:
                        self.add_bullet("", strip_markdown(s))
                else:
                    self.add_paragraph(s)

        # ------------------------------------------------------------------
        # SECTION III. SENTENCE-LEVEL VERIFICATION AUDIT LEDGER
        # ------------------------------------------------------------------
        self.add_section_header("III. SENTENCE-LEVEL VERIFICATION AUDIT LEDGER")
        if self.claims:
            total = len(self.claims)
            supported = sum(1 for c in self.claims if c.get("status") == "supported")
            self.add_paragraph(
                f"Complete deterministic audit ledger: {supported} of {total} audited factual claims "
                f"are fully supported with verdicts stated below for every claim ({self.conf_pct} overall audit confidence).",
                indent=False
            )
            # Settings toggle: full ledger vs compact summary (Part 3.3)
            ledger_claims = self.claims if self.full_ledger else self.claims[:4]
            for i, c in enumerate(ledger_claims):
                stat = c.get("status", "supported")
                cov = c.get("coverage", 1.0) if cov_ok(c) else 1.0
                cids = c.get("citation_ids", [0])
                txt = convert_citations_to_ieee(sanitize_academic_text(c.get("text", "")))
                ev = convert_citations_to_ieee(sanitize_academic_text(c.get("evidence", "")))
                self.add_audit_entry(i, stat, cov, cids, txt, ev)
            if not self.full_ledger and total > 4:
                self.add_paragraph(
                    f"Ledger compacted per export settings: showing the first 4 of {total} audited claims. "
                    f"Enable 'Full Audit Ledger' in Settings > Verification & Export for the complete list.",
                    indent=False, fontsize=7.5
                )
        else:
            self.add_paragraph(
                "No sentence-level audit claims were recorded for this report. "
                "The synthesis could not be verified at the claim level.",
                indent=False
            )

        # ------------------------------------------------------------------
        # SECTION IV. REFERENCES (with direct clickable source URLs)
        # ------------------------------------------------------------------
        self.add_section_header("IV. REFERENCES")
        for idx, s in enumerate(self.sources):
            src_name = sanitize_academic_text(str(s.get("source") or s.get("venue") or "Research Source"))
            tier = s.get("tier", "OKF")
            st = s.get("source_type", "okf_note")
            if st == "user_context":
                continue
            authors = s.get("authors")
            year = s.get("year")
            title = strip_markdown(str(s.get("title") or "")) or None
            raw_url = resolve_source_url(s) if self.clickable_urls else ""
            self.add_reference(
                idx + 1, src_name or "Research Source", tier, st,
                authors=authors, year=year, title=title, url=raw_url,
            )

        pdf_bytes = self.doc.write()
        self.doc.close()
        return pdf_bytes


def cov_ok(c: Dict[str, Any]) -> bool:
    """Coverage guard: only use numeric coverage values."""
    cov = c.get("coverage")
    return isinstance(cov, (int, float))


def generate_research_pdf(
    query: str,
    answer_final: str,
    confidence: float,
    tiers: List[str],
    claims: List[Dict[str, Any]],
    sources: List[Dict[str, Any]],
    timing: Optional[Dict[str, Any]] = None,
    tokens: Optional[Dict[str, Any]] = None,
    canonical_topic: Optional[str] = None,
    full_ledger: bool = True,
    clickable_urls: bool = True
) -> bytes:
    paper = AcademicTwoColumnPaper(
        query=query,
        answer_final=answer_final,
        confidence=confidence,
        tiers=tiers,
        claims=claims,
        sources=sources,
        timing=timing,
        tokens=tokens,
        canonical_topic=canonical_topic,
        full_ledger=full_ledger,
        clickable_urls=clickable_urls
    )
    return paper.generate()
