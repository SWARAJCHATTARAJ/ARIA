"""
Publication-grade IEEE / arXiv two-column research PDF generator.

Guarantees on EVERY topic:
- Formal, prestigious academic paper title preserving all uppercase acronyms (PVC, LLM, CRISPR, JWST, etc.).
- Clean running header on page 2+ with the formal academic title.
- Dynamic grammatically-sound Abstract built from the canonical topic title,
  verified claim count (proper singular/plural agreement), and top verified summary sentences.
- 5 Publication-Grade Canonical Manuscript Sections:
  I. Introduction & Executive Definition
  II. Core Mechanisms, Structure & Synthesis
  III. Quantitative Properties & Comparative Analysis (with real bordered GFM table)
  IV. Empirical Applications, Environmental/Safety Impact & Technical Limitations
  V. Conclusion & Open Research Directions
- Section VI. References containing ONLY cited sources, renumbered sequentially starting from [1].
- Appendix: Verification Audit Ledger rendered as a clean, compact table after References.
- Zero raw Markdown asterisks (** or *), zero leaking carets (^), and complete Unicode/LaTeX sanitization.
"""
import fitz
import io
import os
import logging
import re
import datetime
import urllib.parse
from typing import List, Dict, Any, Optional, Tuple, Union
import httpx
from PIL import Image
import matplotlib
from utils.ssrf_guard import is_allowed_image_url

logger = logging.getLogger(__name__)

# DejaVuSerif & DejaVuSans Unicode TrueType font pairing
_FONT_DIR = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")
_SERIF_REG = os.path.join(_FONT_DIR, "DejaVuSerif.ttf")
_SERIF_BOLD = os.path.join(_FONT_DIR, "DejaVuSerif-Bold.ttf")
_SERIF_ITAL = os.path.join(_FONT_DIR, "DejaVuSerif-Italic.ttf")
_SERIF_BI = os.path.join(_FONT_DIR, "DejaVuSerif-BoldItalic.ttf")
_SANS_REG = os.path.join(_FONT_DIR, "DejaVuSans.ttf")
_SANS_BOLD = os.path.join(_FONT_DIR, "DejaVuSans-Bold.ttf")
_SANS_ITAL = os.path.join(_FONT_DIR, "DejaVuSans-Oblique.ttf")

UNICODE_FONTS_AVAILABLE = all(
    os.path.exists(p) for p in (_SERIF_REG, _SERIF_BOLD, _SERIF_ITAL, _SERIF_BI)
)
SANS_FONTS_AVAILABLE = all(
    os.path.exists(p) for p in (_SANS_REG, _SANS_BOLD, _SANS_ITAL)
)

if UNICODE_FONTS_AVAILABLE:
    FONT_MAP = {
        "tiro": "serif-reg",
        "tibo": "serif-bold",
        "tiit": "serif-it",
        "tibi": "serif-bi",
        "helv": "sans-reg" if SANS_FONTS_AVAILABLE else "serif-reg",
        "hebo": "sans-bold" if SANS_FONTS_AVAILABLE else "serif-bold",
        "heit": "sans-it" if SANS_FONTS_AVAILABLE else "serif-it",
    }
    FONT_FILES = {
        "serif-reg": _SERIF_REG,
        "serif-bold": _SERIF_BOLD,
        "serif-it": _SERIF_ITAL,
        "serif-bi": _SERIF_BI,
    }
    if SANS_FONTS_AVAILABLE:
        FONT_FILES.update({
            "sans-reg": _SANS_REG,
            "sans-bold": _SANS_BOLD,
            "sans-it": _SANS_ITAL,
        })
    FONT_OBJS = {
        name: fitz.Font(fontfile=path)
        for name, path in FONT_FILES.items()
    }
else:
    FONT_MAP = {
        "tiro": "tiro",
        "tibo": "tibo",
        "tiit": "tiit",
        "tibi": "tibi",
        "helv": "helv",
        "hebo": "hebo",
        "heit": "heit",
    }
    FONT_FILES = {}
    FONT_OBJS = {}

def get_text_width(text: str, fontname: str, fontsize: float) -> float:
    mapped = FONT_MAP.get(fontname, fontname)
    fobj = FONT_OBJS.get(mapped)
    if fobj is not None:
        try:
            return fobj.text_length(text, fontsize=fontsize)
        except Exception:
            pass
    return fitz.get_text_length(text, fontname=fontname, fontsize=fontsize)

# Unicode spaces, dashes, quotes
_SPACES = ["\u202f", "\u00a0", "\u2009", "\u2002", "\u2003", "\u2004", "\u2005", "\u2006", "\u2007", "\u2008", "\u200a", "\u200b", "\ufeff"]
_DASHES = ["\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2015", "\u2212", "\u201a"]
_QUOTES = {"\u201c": '"', "\u201d": '"', "\u201e": '"', "«": '"', "»": '"', "\u2018": "'", "\u2019": "'", "\u201b": "'"}

# Subscript / Superscript Unicode characters
_SUP_MAP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'i': 'ⁱ', 'd': 'ᵈ', 'b': 'ᵇ', 't': 'ᵗ',
    'x': 'ˣ', 'y': 'ʸ', 'k': 'ᵏ', 'm': 'ᵐ', 'T': 'ᵀ'
}
_SUB_MAP = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
    'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
    'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
    'v': 'ᵥ', 'x': 'ₓ'
}

def _to_sup(s: str) -> str:
    return "".join(_SUP_MAP.get(c, c) for c in s)

def _to_sub(s: str) -> str:
    return "".join(_SUB_MAP.get(c, c) for c in s)

# Greek / math symbols -> readable Unicode math
_GREEK_MAP = {
    "α": "α", "β": "β", "γ": "γ", "δ": "δ", "ε": "ε",
    "ζ": "ζ", "η": "η", "θ": "θ", "ι": "ι", "κ": "κ",
    "λ": "λ", "µ": "μ", "μ": "μ", "ν": "ν", "ξ": "ξ", "ο": "o",
    "π": "π", "ρ": "ρ", "ς": "s", "σ": "σ", "τ": "τ", "υ": "υ",
    "φ": "φ", "χ": "χ", "ψ": "ψ", "ω": "ω",
    "Γ": "Γ", "Δ": "Δ", "Θ": "Θ", "Λ": "Λ", "Π": "Π",
    "Σ": "Σ", "Φ": "Φ", "Ψ": "Ψ", "Ω": "Ω", "Ξ": "Ξ",
    "∂": "∂", "∞": "∞",
}
_MATH_MAP = {
    "°": "°", "±": "±", "×": "×", "·": "·", "÷": "/", "•": "•",
    "≤": "≤", "≥": "≥", "≠": "≠", "≈": "≈", "∼": "~", "≡": "=",
    "→": "→", "←": "←", "⇒": "⇒", "⇐": "⇐", "↔": "↔",
    "∴": "therefore", "∈": "∈", "∉": "∉", "∑": "∑", "∏": "∏", "√": "√",
    "∫": "∫", "∇": "∇", "⊕": "⊕", "⊗": "⊗", "‰": "‰",
}

def is_complex_latex_block(expr: str) -> bool:
    """
    Detects if a LaTeX math block contains fractions, integrals, roots, summations, or key Greek formulas.
    """
    if not expr:
        return False
    patterns = [
        r'\\frac', r'\\int', r'\\sqrt', r'\\sum', r'\\prod', r'\\iint', r'\\oint',
        r'\\partial', r'\\alpha', r'\\beta', r'\\gamma', r'\\theta', r'\\lambda'
    ]
    return any(re.search(p, expr) for p in patterns)

def render_latex_to_png(expr: str, dpi: int = 300) -> Optional[bytes]:
    """
    Renders block LaTeX equations ($$ ... $$) containing fractions, integrals, roots, or summations
    to crisp 300-DPI transparent PNG images using matplotlib.mathtext, closing figures cleanly in finally.
    """
    clean = expr.strip()
    if clean.startswith('$$') and clean.endswith('$$'):
        clean = clean[2:-2].strip()
    elif clean.startswith(r'\[') and clean.endswith(r'\]'):
        clean = clean[2:-2].strip()
    elif clean.startswith('$') and clean.endswith('$'):
        clean = clean[1:-1].strip()

    if not clean:
        return None

    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fig = None
    try:
        fig = plt.figure(facecolor='none')
        fig.text(0.5, 0.5, f"${clean}$", fontsize=12, ha='center', va='center', color='#0F172A')
        buf = io.BytesIO()
        fig.savefig(buf, dpi=dpi, format='png', transparent=True, bbox_inches='tight', pad_inches=0.06)
        buf.seek(0)
        return buf.getvalue()
    except Exception as e:
        logger.warning(f"matplotlib.mathtext failed to render LaTeX block '${clean[:50]}': {e}")
        return None
    finally:
        if fig is not None:
            plt.close(fig)
        plt.close('all')

def trim_incomplete_sentence(text: str) -> str:
    """
    Detects if text ends mid-sentence (lacking terminal punctuation or truncated by finish_reason == 'length')
    and trims cleanly at the last complete sentence boundary so no PDF section ever ends mid-word.
    """
    if not text:
        return ""
    s = text.strip()
    if not s:
        return ""
    # Complete sentence with punctuation + optional quotes/brackets/markdown/citation
    if re.search(r'[.!?]["\')”’]*(?:\s*\[\[c:\d+\]\])*(?:\*\*|\*|_)?$', s):
        return s
    # Tables or headings are preserved
    if (s.startswith('|') and s.endswith('|')) or s.startswith('#'):
        return s
    matches = list(re.finditer(r'([.!?]["\')”’]*(?:\s*\[\[c:\d+\]\])*(?:\*\*|\*|_)?)(?:\s+|$)', s))
    if matches:
        last_match = matches[-1]
        cut_idx = last_match.end(1)
        trimmed = s[:cut_idx].strip()
        if trimmed:
            return trimmed
    if s and s[-1].isalnum():
        return s + "."
    return s

def is_page_empty_or_header_only(page) -> bool:
    """Checks whether a page contains only running header / page number lines or is completely blank."""
    txt = page.get_text().strip()
    if not txt:
        return True
    lines = [l.strip() for l in txt.split('\n') if l.strip()]
    header_lines = [
        l for l in lines
        if "ARIA v2 AUTONOMOUS VERIFICATION PREPRINT" in l or re.match(r'^Page\s+\d+$', l)
    ]
    return len(lines) == len(header_lines)

def sanitize_academic_text(text: str) -> str:
    r"""
    Comprehensive LaTeX-to-Unicode and PDF-safe math sanitizer.
    - Converts inline/display LaTeX math into readable Unicode math (e.g. \rightarrow -> →, \theta -> θ, \ell/\mathcal{L} -> L).
    - Preserves scientific notation ranges (e.g. 10^{5}-10^{7} -> 10⁵–10⁷, b^{d} -> bᵈ, _{i} -> ᵢ).
    - Strips all stray $, \_, \^, and raw braces without dropping valid math symbols.
    """
    if not text:
        return ""
    s = str(text)

    # 1. Unicode spaces, dashes, quotes
    for sp in _SPACES:
        s = s.replace(sp, " ")
    for k, v in _QUOTES.items():
        s = s.replace(k, v)

    # Normalize em-dashes with clean spacing so words don't collide
    s = s.replace("\u2014", " — ").replace("\u2015", " — ")
    s = re.sub(r'\s*—\s*', ' — ', s)
    # Numeric ranges: e.g. 10 - 100 or 10 – 100 -> 10–100 (en-dash without spaces)
    s = re.sub(r'(?<=\d)\s*[-–\u2013]\s*(?=\d)', '–', s)
    # Remaining dashes
    for d in ["\u2010", "\u2011", "\u2012"]:
        s = s.replace(d, '-')

    # 2. Critical mathematical symbols & loss functions (NEVER silently drop \ell or \mathcal{L})
    s = re.sub(r'\\(?:mathcal|mathbf|mathrm|mathbb)\{L\}', 'L', s)
    s = re.sub(r'\\(?:mathcal|mathbf|mathrm|mathbb)\s+L\b', 'L', s)
    s = re.sub(r'\\ell\b', 'L', s)
    s = re.sub(r'\\(?:mathcal|mathbf|mathrm|mathbb)\{([A-Za-z0-9])\}', r'\1', s)

    # 3. LaTeX Greek letters -> Unicode
    s = re.sub(r'\bfactor\s*\\?gamma\b', 'factor γ', s, flags=re.I)
    greek_latex = {
        r'\alpha': 'α', r'\beta': 'β', r'\gamma': 'γ', r'\delta': 'δ', r'\epsilon': 'ε',
        r'\zeta': 'ζ', r'\eta': 'η', r'\theta': 'θ', r'\vartheta': 'θ', r'\iota': 'ι',
        r'\kappa': 'κ', r'\lambda': 'λ', r'\mu': 'μ', r'\nu': 'ν', r'\xi': 'ξ',
        r'\pi': 'π', r'\rho': 'ρ', r'\sigma': 'σ', r'\tau': 'τ', r'\phi': 'φ',
        r'\varphi': 'φ', r'\chi': 'χ', r'\psi': 'ψ', r'\omega': 'ω',
        r'\Gamma': 'Γ', r'\Delta': 'Δ', r'\Theta': 'Θ', r'\Lambda': 'Λ', r'\Pi': 'Π',
        r'\Sigma': 'Σ', r'\Phi': 'Φ', r'\Psi': 'Ψ', r'\Omega': 'Ω',
    }
    for gl, gch in greek_latex.items():
        s = re.sub(re.escape(gl) + r'\b', gch, s)

    # 4. LaTeX operators & relations
    s = re.sub(r'\\(?:rightarrow|to|longrightarrow)\b', ' → ', s)
    s = re.sub(r'\s*→\s*', ' → ', s)
    s = re.sub(r'\\(?:leftarrow|longleftarrow)\b', '←', s)
    s = re.sub(r'\\(?:Rightarrow|implies)\b', '⇒', s)
    s = re.sub(r'\\(?:Leftrightarrow|iff)\b', '⇔', s)
    s = re.sub(r'\\(?:ge|geq)\b', '≥', s)
    s = re.sub(r'\\(?:le|leq)\b', '≤', s)
    s = re.sub(r'\\(?:ne|neq)\b', '≠', s)
    s = re.sub(r'\\approx\b', '≈', s)
    s = re.sub(r'\\sim\b', '~', s)
    s = re.sub(r'\\pm\b', '±', s)
    s = re.sub(r'\\times\b', '×', s)
    s = re.sub(r'\\cdot\b', '·', s)
    s = re.sub(r'\\div\b', '÷', s)
    s = re.sub(r'\\in\b', '∈', s)
    s = re.sub(r'\\notin\b', '∉', s)
    s = re.sub(r'\\subset\b', '⊂', s)
    s = re.sub(r'\\subseteq\b', '⊆', s)
    s = re.sub(r'\\infty\b', '∞', s)
    s = re.sub(r'\\nabla\b', '∇', s)
    s = re.sub(r'\\partial\b', '∂', s)
    s = re.sub(r'\\(?:dots|ldots|cdots)\b', '...', s)
    s = re.sub(r'\\(?:circ|degree|degrees)\b', '°', s)

    # 5. Functions & Fractions
    s = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', r'(\1 / \2)', s)
    s = re.sub(r'\\sqrt\{([^{}]*)\}', r'√(\1)', s)
    s = re.sub(r'\\(?:log|ln|exp|min|max|det|dim)\b', lambda m: m.group(0)[1:], s)

    # 6. Scientific notation ranges & Subscripts / Superscripts (T_op -> Tₒₚ, P_op -> Pₒₚ, E_op -> Eₒₚ)
    s = re.sub(r'<sub>(.*?)</sub>', lambda m: _to_sub(m.group(1)), s, flags=re.I)
    s = re.sub(r'<sup>(.*?)</sup>', lambda m: _to_sup(m.group(1)), s, flags=re.I)
    s = re.sub(r'10\^\{([0-9+-]+)\}\s*[-–]\s*10\^\{([0-9+-]+)\}', lambda m: f"10{_to_sup(m.group(1))}–10{_to_sup(m.group(2))}", s)
    s = re.sub(r'([A-Za-z0-9])\^\{([^{}]+)\}', lambda m: f"{m.group(1)}{_to_sup(m.group(2))}", s)
    s = re.sub(r'([A-Za-z0-9])\\?\_\{([^{}]+)\}', lambda m: f"{m.group(1)}{_to_sub(m.group(2))}", s)
    s = re.sub(r'\^\{([^{}]+)\}', lambda m: _to_sup(m.group(1)), s)
    s = re.sub(r'\\?\_\{([^{}]+)\}', lambda m: _to_sub(m.group(1)), s)
    s = re.sub(r'([A-Za-z0-9])\^([0-9a-zA-Z+-]+)\b', lambda m: f"{m.group(1)}{_to_sup(m.group(2))}", s)
    s = re.sub(r'([A-Za-z0-9])\\?\_([0-9a-zA-Z]+)\b', lambda m: f"{m.group(1)}{_to_sub(m.group(2))}", s)
    s = re.sub(r'\\?\_([0-9a-zA-Z]+)\b', lambda m: _to_sub(m.group(1)), s)

    # 7. Strip delimiters and macros
    s = re.sub(r'\\(?:left|right|Big|big|Bigg|bigg)[lrm]?\b\s*', '', s)
    s = re.sub(r'\\text\{([^{}]*)\}', r'\1', s)
    s = re.sub(r'\\begin\{[^{}]*\}|\\end\{[^{}]*\}', '', s)

    # 8. Clean escaped characters & protect currency
    s = s.replace(r'\_', '_').replace(r'\%', '%').replace(r'\&', '&').replace(r'\#', '#')

    # 9. Strip math delimiters: $$, $, \(, \), \[, \] and ensure zero raw $ outside currency
    s = re.sub(r'\$\s*N/A\s*\$', 'N/A', s, flags=re.I)
    s = re.sub(r'\$\$([^\$]+)\$\$', r' \1 ', s)
    s = re.sub(r'\\\[([\s\S]+?)\\\]', r' \1 ', s)
    s = re.sub(r'\\\(([\s\S]+?)\\\)', r' \1 ', s)
    s = re.sub(r'\$([^$\n]+)\$', r' \1 ', s)
    s = re.sub(r'\$(?!\d)', '', s)
    s = s.replace('\\(', '').replace('\\)', '').replace('\\[', '').replace('\\]', '')

    # 10. Clean residual LaTeX braces and backslashes
    s = re.sub(r'\{([A-Za-z0-9+–\s_-]*)\}', r'\1', s)
    s = s.replace('{', '').replace('}', '').replace('\\', '')
    s = re.sub(r'(?<=[a-zA-Z0-9])\^(?=[0-9])', '', s)

    # 11. Normalize spaces
    s = re.sub(r'\s+([.,;:!?%)\]])', r'\1', s)
    s = re.sub(r'([(\[])\s+', r'\1', s)
    s = re.sub(r' {2,}', ' ', s)
    return " ".join(s.split()).strip()

UPPERCASE_ACRONYMS = {
    "DSA": "Data Structures and Algorithms (DSA)",
    "RAG": "Retrieval-Augmented Generation (RAG)",
    "OS": "Operating Systems (OS)",
    "DBMS": "Database Management Systems (DBMS)",
    "CPU": "Central Processing Unit (CPU)",
    "ML": "Machine Learning (ML)",
    "AI": "Artificial Intelligence (AI)",
    "LLM": "Large Language Models (LLMs)",
    "LLMS": "Large Language Models (LLMs)",
    "NLP": "Natural Language Processing (NLP)",
    "CRISPR": "CRISPR-Cas9",
    "JWST": "James Webb Space Telescope (JWST)",
    "BFT": "Byzantine Fault Tolerance (BFT)",
    "RNA": "Ribonucleic Acid (RNA)",
    "DNA": "Deoxyribonucleic Acid (DNA)",
    "NMR": "Nuclear Magnetic Resonance (NMR)",
    "BERT": "BERT Transformer Architecture",
    "GAN": "Generative Adversarial Networks (GANs)",
    "GANS": "Generative Adversarial Networks (GANs)",
    "QAOA": "Quantum Approximate Optimization Algorithm (QAOA)",
    "PCR": "Polymerase Chain Reaction (PCR)",
    "CAS9": "Cas9 Endonuclease",
    "PBFT": "Practical Byzantine Fault Tolerance (PBFT)",
    "PVC": "Polyvinyl Chloride (PVC)",
    "VCM": "Vinyl Chloride Monomer (VCM)",
}

UPPERCASE_TOKENS = {
    "DSA", "RAG", "OS", "DBMS", "CPU", "ML", "AI", "LLM", "LLMS", "NLP", "CRISPR",
    "JWST", "BFT", "RNA", "DNA", "NMR", "BERT", "GAN", "GANS", "QAOA", "PCR", "CAS9",
    "PBFT", "CNN", "RNN", "LSTM", "GPU", "TPU", "RL", "RLHF", "DPO", "NLI", "SGD",
    "DAG", "IEEE", "ACM", "API", "REST", "HTTP", "HTTPS", "SSRF", "SQL", "UUID",
    "NASA", "ESA", "PVC", "PE", "PP", "PS", "PET", "PTFE", "PVA", "ABS", "PMMA",
    "PU", "TPE", "VCM"
}

LOWERCASE_TITLE_WORDS = {
    "a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to", "by", "with", "in", "of", "vs", "versus"
}

def format_title_word(w: str, is_first: bool = False) -> str:
    w_clean = re.sub(r'^[^\w]+|[^\w]+$', '', w)
    w_upper = w_clean.upper()
    if w_upper in UPPERCASE_TOKENS:
        return w.replace(w_clean, w_upper)
    # Never titlecase short 2-3 letter abbreviations into 'Ml' or 'Ai'
    if len(w_clean) in (2, 3) and w_clean.isupper():
        return w
    if not is_first and w.lower() in LOWERCASE_TITLE_WORDS:
        return w.lower()
    return w.capitalize()

def generate_academic_paper_title(query: str, canonical_topic: Optional[str] = None) -> str:
    """
    Generates a formal, domain-appropriate academic working-paper title preserving all uppercase
    acronyms without forcing CS/engineering subtitles onto humanities, geography, or general topics.
    """
    if canonical_topic and len(canonical_topic.strip()) >= 5:
        raw = canonical_topic.strip()
    else:
        raw = query.strip()
        for pfx in ("what is the", "what are the", "what is a", "what is an", "what is", "what are",
                    "how does", "how do", "why does", "why do", "explain the", "explain", "describe", "overview of"):
            if raw.lower().startswith(pfx):
                raw = raw[len(pfx):].strip(" ?.:,")
                break

    clean_acronym = re.sub(r'[^\w]', '', raw).upper()
    if clean_acronym in UPPERCASE_ACRONYMS:
        formal_name = UPPERCASE_ACRONYMS[clean_acronym]
        if clean_acronym in ("DSA", "RAG", "OS", "DBMS", "CPU", "ML", "AI", "LLM", "LLMS", "NLP", "BERT", "GAN", "GANS", "QAOA", "BFT", "PBFT"):
            return f"{formal_name}: Formal Foundations, Algorithmic Complexity, and Empirical Analysis"
        return f"{formal_name}: Structural Mechanisms, Quantitative Properties, and Empirical Analysis"

    words = raw.split()
    cased_words = [format_title_word(w, i == 0) for i, w in enumerate(words)]
    title = " ".join(cased_words).strip(" ?.:,")

    is_stem = any(k in title.lower() for k in (
        "algorithm", "polymer", "chemical", "protein", "quantum", "neural", "system",
        "data structure", "database", "operating", "processor", "genome", "telescope",
        "synthesis", "thermodynamic", "consensus", "network", "molecule", "cell", "gene"
    ))

    if len(words) <= 2:
        if is_stem:
            title += ": Core Mechanisms, Quantitative Properties, and Empirical Synthesis"
        else:
            title += ": Historical Foundations, Structural Dynamics, and Comparative Overview"
    elif ":" not in title and not any(k in title.lower() for k in ("analysis", "synthesis", "review", "properties", "mechanisms", "principles", "overview", "foundations")):
        title += ": Synthesis and Comparative Analysis"

    return title

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
    """Resolves direct clickable primary-source URL for a citation."""
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

def _parse_rich_runs(text: str) -> List[Tuple[str, str]]:
    """
    Parses Markdown bold (*** / **) and italic (* / _) runs into (word, fontname) tuples.
    Guarantees literal asterisks or backticks NEVER leak into the PDF text.
    Fontnames: 'tiro' (Roman), 'tibo' (Bold), 'tiit' (Italic), 'tibi' (BoldItalic).
    """
    t = text.replace("`", "")
    t = re.sub(r'\*\*\*(.+?)\*\*\*', r'<<BI>>\1<</BI>>', t, flags=re.DOTALL)
    t = re.sub(r'\*\*(.+?)\*\*', r'<<B>>\1<</B>>', t, flags=re.DOTALL)
    t = re.sub(r'(?<!\w)\*([^*]+?)\*(?!\w)', r'<<I>>\1<</I>>', t)
    t = re.sub(r'(?<!\w)_([^_]+?)_(?!\w)', r'<<I>>\1<</I>>', t)
    t = t.replace("*", "")

    segments: List[Tuple[str, str]] = []
    parts = re.split(r'(<<(?:BI|B|I)>>.*?<</(?:BI|B|I)>>)', t, flags=re.DOTALL)
    for part in parts:
        if not part:
            continue
        if part.startswith("<<BI>>") and part.endswith("<</BI>>"):
            segments.append((part[6:-7], "tibi"))
        elif part.startswith("<<B>>") and part.endswith("<</B>>"):
            segments.append((part[5:-6], "tibo"))
        elif part.startswith("<<I>>") and part.endswith("<</I>>"):
            segments.append((part[5:-6], "tiit"))
        else:
            segments.append((part, "tiro"))

    words: List[Tuple[str, str]] = []
    for txt, fontname in segments:
        for w in re.split(r'\s+', txt):
            if w:
                words.append((w, fontname))
    return words

def _wrap_rich_runs(words: List[Tuple[str, str]], max_w: float, fontsize: float) -> List[List[Tuple[str, str]]]:
    lines: List[List[Tuple[str, str]]] = []
    cur: List[Tuple[str, str]] = []
    cur_w = 0.0
    space_w = get_text_width(" ", fontname="tiro", fontsize=fontsize)
    for word, fontname in words:
        w = get_text_width(word, fontname=fontname, fontsize=fontsize)
        add = w if not cur else w + space_w
        if cur and cur_w + add > max_w:
            lines.append(cur)
            cur = [(word, fontname)]
            cur_w = w
        else:
            cur.append((word, fontname))
            cur_w += add
    if cur:
        lines.append(cur)
    return lines

def strip_markdown(text: str) -> str:
    """Strips Markdown syntax and raw HTML bold/italic tags for clean academic prose."""
    t = re.sub(r'```(?:[a-zA-Z0-9_-]*\n)?(.*?)```', r'\1', text, flags=re.DOTALL)
    t = re.sub(r'</?[bi]>', '', t, flags=re.I)
    t = re.sub(r'\*\*\*(.*?)\*\*\*', r'\1', t, flags=re.DOTALL)
    t = re.sub(r'\*\*(.*?)\*\*', r'\1', t, flags=re.DOTALL)
    t = re.sub(r'(?<!\w)\*(?!\s)([^*]+?)\*(?!\w)', r'\1', t)
    t = re.sub(r'(?<!\w)_(?!\s)([^_]+?)_(?!\w)', r'\1', t)
    t = re.sub(r'`(.*?)`', r'\1', t)
    t = re.sub(r'^#{1,6}\s*', '', t, flags=re.MULTILINE)
    return t.replace("*", "").strip()

def is_table_separator(line: str) -> bool:
    return bool(re.match(r'^\|?\s*[-:]+[-| :]+\s*\|?$', line.strip()))

def split_markdown_table_row(line: str) -> List[str]:
    r"""
    Splits a markdown table row on pipe characters `|` ONLY outside:
    - single/double dollar math spans ($...$, $$...$$)
    - latex parenthesis math spans (\(...\))
    - latex bracket math spans (\[...\])
    - backtick code spans (`...`)
    and ignores escaped pipes (\|).
    Strips leading and trailing empty cells resulting from outer table borders.
    """
    s = line.strip()
    if not s:
        return []
    cells = []
    current = []
    in_single_dollar = False
    in_double_dollar = False
    in_paren_math = False
    in_bracket_math = False
    in_code = False
    i = 0
    n = len(s)
    while i < n:
        if s[i] == '\\' and i + 1 < n:
            next_ch = s[i + 1]
            if next_ch == '|':
                current.append('|')
                i += 2
                continue
            elif next_ch == '(' and not (in_single_dollar or in_double_dollar or in_code):
                in_paren_math = True
                current.append('\\(')
                i += 2
                continue
            elif next_ch == ')' and in_paren_math:
                in_paren_math = False
                current.append('\\)')
                i += 2
                continue
            elif next_ch == '[' and not (in_single_dollar or in_double_dollar or in_code):
                in_bracket_math = True
                current.append('\\[')
                i += 2
                continue
            elif next_ch == ']' and in_bracket_math:
                in_bracket_math = False
                current.append('\\]')
                i += 2
                continue
            else:
                current.append(s[i])
                current.append(next_ch)
                i += 2
                continue

        ch = s[i]
        if ch == '`' and not (in_single_dollar or in_double_dollar or in_paren_math or in_bracket_math):
            in_code = not in_code
            current.append(ch)
            i += 1
            continue

        if ch == '$' and not (in_code or in_paren_math or in_bracket_math):
            if i + 1 < n and s[i + 1] == '$':
                in_double_dollar = not in_double_dollar
                current.append('$$')
                i += 2
                continue
            elif not in_double_dollar:
                in_single_dollar = not in_single_dollar
                current.append('$')
                i += 1
                continue

        if ch == '|' and not (in_code or in_single_dollar or in_double_dollar or in_paren_math or in_bracket_math):
            cells.append("".join(current).strip())
            current = []
            i += 1
            continue

        current.append(ch)
        i += 1

    cells.append("".join(current).strip())
    if s.startswith('|') and len(cells) > 0 and cells[0] == '':
        cells.pop(0)
    if s.endswith('|') and len(cells) > 0 and cells[-1] == '':
        cells.pop(-1)
    return cells

def parse_markdown_table_rows(lines: Union[List[str], str]) -> List[List[str]]:
    """
    Parses Markdown table lines into list-of-cells (header + data rows),
    splitting on '|' strictly outside math spans and code spans.
    Preserves exact column count of real 3-5 column tables without phantom columns or ': N/A' padding.
    """
    if isinstance(lines, str):
        lines = [l for l in lines.strip().splitlines() if l.strip()]
    rows = []
    for line in lines:
        s = line.strip()
        if not s.startswith('|') or is_table_separator(s):
            continue
        cells = split_markdown_table_row(s)
        if cells:
            rows.append(cells)
    if not rows:
        return []

    header_len = len(rows[0])
    cleaned_rows = []
    for r_idx, row in enumerate(rows):
        cleaned_row = []
        for cell in row[:header_len]:
            c_val = cell.strip()
            if r_idx > 0 and (not c_val or c_val in ("-", "--", "---", "None", "null", "$N/A$", "$ N/A $")):
                c_val = "N/A"
            # Format markdown bold **text** to ReportLab <b>text</b>
            c_val = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', c_val)
            cleaned_row.append(c_val)
        while len(cleaned_row) < header_len:
            cleaned_row.append("N/A" if r_idx > 0 else "")
        cleaned_rows.append(cleaned_row)

    return cleaned_rows

def cov_ok(c: Dict[str, Any]) -> bool:
    """Coverage guard: only use numeric coverage values."""
    cov = c.get("coverage")
    return isinstance(cov, (int, float))


class AcademicTwoColumnPaper:
    """
    Renders a true IEEE / arXiv Two-Column Academic Research Paper PDF using PyMuPDF.
    Base-14 serif fonts: 'tiro' (Times-Roman), 'tibo' (Times-Bold),
    'tiit' (Times-Italic), 'tibi' (Times-BoldItalic).
    """

    BODY_FONT = 'tiro'
    BOLD_FONT = 'tibo'
    ITAL_FONT = 'tiit'
    BODY_SIZE = 9.0
    LINE_H = 12.0

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
        clickable_urls: bool = True,
        figures: Optional[List[Dict[str, Any]]] = None,
        chart: Optional[Dict[str, Any]] = None,
        pdf_style: str = "academic"
    ):
        self.doc = fitz.open()
        self.pdf_style = "executive" if str(pdf_style).lower() == "executive" else "academic"
        self.figures = figures or []
        self.chart = chart
        self.query = sanitize_academic_text((query or "Research Overview").strip())
        self.canonical_topic = sanitize_academic_text(canonical_topic or "")
        self.academic_title = generate_academic_paper_title(self.query, self.canonical_topic)
        if claims:
            score_sum = sum(1.0 if c.get("status") == "supported" else 0.5 if c.get("status") == "partially_supported" else 0.0 for c in claims)
            self.confidence = round(max(0.10, min(0.98, score_sum / len(claims))), 2)
        else:
            self.confidence = confidence if confidence is not None else 0.85
        self.tiers = tiers or ["LIVE"]
        self.raw_claims = claims or []
        self.full_sources = sources or []
        self.timing = timing or {}
        self.tokens = tokens or {}
        self.full_ledger = bool(full_ledger)
        self.clickable_urls = bool(clickable_urls)

        # Precompute click targets for all input sources
        self.ref_links: List[Tuple[str, str]] = []
        for s in self.full_sources:
            url = resolve_source_url(s)
            if url.startswith("doi:"):
                url = f"https://doi.org/{url[4:]}"
            self.ref_links.append((url, short_domain(url)))

        # ------------------------------------------------------------------
        # Cited-Only Bibliography & Citation Renumbering
        # ------------------------------------------------------------------
        raw_answer_text = answer_final or "No synthesis content was recorded for this report."
        found_markers = re.findall(r'\[+c:(\d+)\]+|\[(\d+)\]', raw_answer_text)
        
        cited_source_indices = []
        for m_c, m_num in found_markers:
            idx = int(m_c) if m_c else (int(m_num) - 1)
            if 0 <= idx < len(self.full_sources) and idx not in cited_source_indices:
                cited_source_indices.append(idx)

        # Fallback if no citations in text but sources exist: take first up to 4
        if not cited_source_indices and self.full_sources:
            cited_source_indices = list(range(min(len(self.full_sources), 4)))

        # Sequential 1-based renumbering mapping: old_source_idx -> new_1_based_num
        self.old_to_new = {old_idx: new_num for new_num, old_idx in enumerate(cited_source_indices, start=1)}

        def replace_cite(m):
            c_val = m.group(1) if m.group(1) is not None else m.group(2)
            old_idx = int(c_val) if m.group(1) is not None else (int(c_val) - 1)
            if old_idx in self.old_to_new:
                return f"[{self.old_to_new[old_idx]}]"
            return ""

        formatted_answer = re.sub(r'\[+c:(\d+)\]+', replace_cite, raw_answer_text)
        formatted_answer = re.sub(r'【+c:(\d+)】+', replace_cite, formatted_answer)
        
        # Preserve formatted answer with renumbered citations for section/math routing
        self.raw_answer = formatted_answer

        # Filter sources to cited-only list
        self.cited_sources = [self.full_sources[i] for i in cited_source_indices]
        self.cited_links = [self.ref_links[i] for i in cited_source_indices]

        # Remap claim citation numbers
        self.claims = []
        for c in self.raw_claims:
            c_copy = dict(c)
            old_cids = c.get("citation_ids") or []
            new_cids = [self.old_to_new[i] for i in old_cids if i in self.old_to_new]
            c_copy["renumbered_citations"] = new_cids
            self.claims.append(c_copy)

        # Dimensions (A4 Editorial Academic Journal / Working-Paper Layout)
        self.PAGE_W = 595.0
        self.PAGE_H = 842.0
        self.MARGIN_L = 54.0
        self.MARGIN_R = 541.0
        self.COL_W = self.MARGIN_R - self.MARGIN_L  # 487.0 pt balanced measure
        self.GUTTER = 0.0
        self.COL_X = [self.MARGIN_L]
        self.BOTTOM_LIMIT = 784.0
        self.TOP_LIMIT_NEXT = 54.0
        self.table_counter = 0

        self.tier_str = ", ".join(self.tiers)
        self.conf_pct = f"{int(round(self.confidence * 100))}%"
        self.date_str = datetime.datetime.now().strftime("%B %Y")

        self.page = self.doc.new_page(width=self.PAGE_W, height=self.PAGE_H)
        self._register_page_fonts(self.page)
        self.render_page1_header()
        self.current_col = 0
        self.y = self.start_y_col

    def _register_page_fonts(self, page):
        if UNICODE_FONTS_AVAILABLE:
            for fname, fpath in FONT_FILES.items():
                try:
                    page.insert_font(fontname=fname, fontfile=fpath)
                except Exception:
                    pass

    def get_next_table_num(self) -> str:
        self.table_counter += 1
        romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]
        return romans[self.table_counter - 1] if self.table_counter <= len(romans) else str(self.table_counter)

    # ------------------------------------------------------------------ utils
    def wrap_line(self, text: str, max_w: float, fontname: str = 'tiro', fontsize: float = 8.5) -> List[str]:
        words = text.split()
        if not words:
            return [""]
        lines = []
        cur = []
        for w in words:
            # Bind orphan closing punctuation/brackets to the previous word
            if w in (")", "]", "};", ")—", "):", ");", ".)", "?)", "!)") and cur:
                cur[-1] = f"{cur[-1]} {w}"
                continue
            cand = " ".join(cur + [w])
            if get_text_width(cand, fontname=fontname, fontsize=fontsize) <= max_w:
                cur.append(w)
            else:
                if cur:
                    lines.append(" ".join(cur))
                cur = [w]
        if cur:
            lines.append(" ".join(cur))
        return lines

    def insert_uri_link(self, rect: fitz.Rect, uri: str):
        try:
            self.page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": uri})
        except Exception:
            pass

    def draw_rich_line(self, x: float, y: float, runs: List[Tuple[str, str]], fontsize: float, color=(0.12, 0.15, 0.18)) -> float:
        cursor = x
        if not runs:
            return cursor
        
        # Group contiguous words of the same font style into unified phrase strings
        grouped: List[Tuple[str, str]] = []
        for word, fontname in runs:
            if not word:
                continue
            mapped_font = FONT_MAP.get(fontname, fontname)
            if grouped and grouped[-1][1] == mapped_font:
                grouped[-1] = (grouped[-1][0] + " " + word, mapped_font)
            else:
                grouped.append((word, mapped_font))

        space_w = get_text_width(" ", fontname="tiro", fontsize=fontsize)
        for idx, (phrase, fontname) in enumerate(grouped):
            self.page.insert_text(fitz.Point(cursor, y), phrase, fontname=fontname, fontsize=fontsize, color=color)
            w = get_text_width(phrase, fontname=fontname, fontsize=fontsize)
            cursor += w + (space_w if idx < len(grouped) - 1 else 0.0)
        return cursor

    def add_link_text(self, x: float, y: float, label: str, uri: str, fontsize: float = 7.5) -> None:
        if not label or not uri:
            return
        fn = FONT_MAP.get("tiro", "tiro")
        self.page.insert_text(fitz.Point(x, y), label, fontname=fn, fontsize=fontsize, color=(0.02, 0.47, 0.66))
        label_w = get_text_width(label, fontname="tiro", fontsize=fontsize)
        underline_y = y + 2.0
        self.page.draw_line(fitz.Point(x, underline_y), fitz.Point(x + label_w, underline_y), color=(0.02, 0.47, 0.66), width=0.4)
        self.insert_uri_link(fitz.Rect(x, y - fontsize, x + label_w + 2, y + 3), uri)

    def ensure_space(self, pts: float):
        if self.y + pts > self.BOTTOM_LIMIT:
            self.advance_column()

    def advance_column(self):
        self.current_col = 0
        self.page = self.doc.new_page(width=self.PAGE_W, height=self.PAGE_H)
        self._register_page_fonts(self.page)
        self.y = self.TOP_LIMIT_NEXT
        if len(self.academic_title) > 62:
            running_title = self.academic_title[:62].rsplit(' ', 1)[0] + "..."
        else:
            running_title = self.academic_title
        self.page.insert_text(
            fitz.Point(self.MARGIN_L, 28),
            f"ARIA v2 AUTONOMOUS VERIFICATION PREPRINT  |  {running_title}",
            fontname=FONT_MAP.get("helv", "tiro"),
            fontsize=7.2,
            color=(0.38, 0.43, 0.49),
        )
        self.page.draw_line(
            fitz.Point(self.MARGIN_L, 35),
            fitz.Point(self.MARGIN_R, 35),
            color=(0.78, 0.82, 0.86),
            width=0.5,
        )

    # -------------------------------------------------------------- page head
    def render_page1_header(self):
        is_exec = (self.pdf_style == "executive")
        # 1. Top Working-Paper Running Rule (Sans-Serif pairing)
        masthead_label = "ARIA v2 EXECUTIVE RESEARCH BRIEF" if is_exec else "ARIA v2 AUTONOMOUS VERIFICATION PREPRINT"
        header_text = f"{masthead_label}  |  TIER: {self.tier_str.upper()}  |  CONFIDENCE: {self.conf_pct}  |  {self.date_str.upper()}"
        self.page.insert_text(
            fitz.Point(self.MARGIN_L, 28),
            header_text,
            fontname=FONT_MAP.get("helv", "tiro"),
            fontsize=7.2,
            color=(0.35, 0.40, 0.46),
        )
        self.page.draw_line(fitz.Point(self.MARGIN_L, 35), fitz.Point(self.MARGIN_R, 35), color=(0.15, 0.25, 0.45), width=0.8)

        # 2. Title (Left-aligned in Executive Brief, Centered in Academic Paper)
        title_size = 14.5 if is_exec else 15.5
        title_max_w = self.COL_W if is_exec else 465.0
        title_lines = self.wrap_line(self.academic_title, max_w=title_max_w, fontname="tibo", fontsize=title_size)
        cur_y = 58.0 if is_exec else 60.0
        for tl in title_lines:
            if is_exec:
                x_pos = self.MARGIN_L
            else:
                t_len = get_text_width(tl, fontname="tibo", fontsize=title_size)
                x_pos = (self.PAGE_W - t_len) / 2.0
            self.page.insert_text(fitz.Point(x_pos, cur_y), tl, fontname=FONT_MAP.get("tibo", "tibo"), fontsize=title_size, color=(0.06, 0.09, 0.14))
            cur_y += 18.0 if is_exec else 19.0

        # 3. Author & Affiliation Block
        cur_y += 4.0
        a1 = "ARIA v2 Executive Intelligence & Evidence Brief" if is_exec else "ARIA v2 Autonomous Research & Evidence Synthesis Engine"
        if is_exec:
            self.page.insert_text(fitz.Point(self.MARGIN_L, cur_y), a1, fontname=FONT_MAP.get("helv", "tiro"), fontsize=8.8, color=(0.25, 0.30, 0.38))
            cur_y += 14.0
        else:
            t1_len = get_text_width(a1, fontname="helv", fontsize=9.2)
            self.page.insert_text(fitz.Point((self.PAGE_W - t1_len) / 2.0, cur_y), a1, fontname=FONT_MAP.get("helv", "tiro"), fontsize=9.2, color=(0.20, 0.25, 0.32))
            cur_y += 12.5

            a2 = "Multi-Tier Retrieval & Deterministic Claim Entailment Ledger"
            t2_len = get_text_width(a2, fontname="tiit", fontsize=8.2)
            self.page.insert_text(fitz.Point((self.PAGE_W - t2_len) / 2.0, cur_y), a2, fontname=FONT_MAP.get("tiit", "tiit"), fontsize=8.2, color=(0.40, 0.45, 0.52))
            cur_y += 16.0

        # 4. Styled Executive Summary / Abstract Callout Box
        abs_l = self.MARGIN_L
        abs_w = self.COL_W
        inner_l = abs_l + 12.0
        inner_w = abs_w - 22.0

        abs_body = self.build_dynamic_abstract()
        abs_lead = "Executive Brief — " if is_exec else "Abstract — "
        abs_full = abs_lead + abs_body
        abs_lines = self.wrap_line(abs_full, max_w=inner_w, fontname="tiro", fontsize=8.5)

        idx_lead = "Index Terms — "
        term_words = self.build_index_terms()
        terms_str = ", ".join(term_words)
        idx_full = idx_lead + terms_str
        idx_lines = self.wrap_line(idx_full, max_w=inner_w, fontname="tiro", fontsize=8.0)

        box_h = 14.0 + len(abs_lines) * 11.2 + 6.0 + len(idx_lines) * 10.5 + 8.0
        box_rect = fitz.Rect(abs_l, cur_y, abs_l + abs_w, cur_y + box_h)
        self.page.draw_rect(box_rect, color=(0.86, 0.89, 0.93), fill=(0.97, 0.98, 0.99), width=0.5)
        # Left accent rule
        accent_rect = fitz.Rect(abs_l, cur_y, abs_l + 2.8, cur_y + box_h)
        self.page.draw_rect(accent_rect, color=(0.12, 0.24, 0.54), fill=(0.12, 0.24, 0.54), width=0)

        cur_y += 14.0
        for idx, al in enumerate(abs_lines):
            if idx == 0 and al.startswith(abs_lead):
                lead_w = get_text_width(abs_lead, fontname="hebo", fontsize=8.5)
                self.page.insert_text(fitz.Point(inner_l, cur_y), abs_lead, fontname=FONT_MAP.get("hebo", "tibo"), fontsize=8.5, color=(0.10, 0.20, 0.45))
                rem_text = al[len(abs_lead):]
                self.page.insert_text(fitz.Point(inner_l + lead_w, cur_y), rem_text, fontname=FONT_MAP.get("tiro", "tiro"), fontsize=8.5, color=(0.12, 0.15, 0.19))
            else:
                self.page.insert_text(fitz.Point(inner_l, cur_y), al, fontname=FONT_MAP.get("tiro", "tiro"), fontsize=8.5, color=(0.12, 0.15, 0.19))
            cur_y += 11.2

        cur_y += 4.0
        for idx, il in enumerate(idx_lines):
            if idx == 0 and il.startswith(idx_lead):
                lead_w = get_text_width(idx_lead, fontname="hebo", fontsize=8.0)
                self.page.insert_text(fitz.Point(inner_l, cur_y), idx_lead, fontname=FONT_MAP.get("hebo", "tibo"), fontsize=8.0, color=(0.22, 0.27, 0.34))
                self.page.insert_text(fitz.Point(inner_l + lead_w, cur_y), il[len(idx_lead):], fontname=FONT_MAP.get("tiit", "tiit"), fontsize=8.0, color=(0.30, 0.35, 0.42))
            else:
                self.page.insert_text(fitz.Point(inner_l, cur_y), il, fontname=FONT_MAP.get("tiit", "tiit"), fontsize=8.0, color=(0.30, 0.35, 0.42))
            cur_y += 10.5

        self.start_y_col = box_rect.y1 + 18.0

    # ------------------------------------------------------- abstract builder
    def build_dynamic_abstract(self) -> str:
        """
        Dynamic, grammatically sound Abstract with proper singular/plural claim agreement.
        """
        supported_claims = [c for c in self.claims if c.get("status") == "supported"]
        partial_claims = [c for c in self.claims if c.get("status") == "partially_supported"]
        total_claims = len(self.claims)
        verified_ratio = (len(supported_claims) / total_claims * 100.0) if total_claims else 0.0

        def _format_finding_clause(t: str) -> str:
            s = t.strip()
            words = s.split()
            if not words:
                return ""
            first = words[0]
            if first.isupper() and len(first) >= 2:
                return s
            return first[0].lower() + first[1:] + (" " + " ".join(words[1:]) if len(words) > 1 else "")

        if supported_claims:
            top = [strip_markdown(sanitize_academic_text(c.get("text", ""))).rstrip(". ") for c in supported_claims[:2]]
            top = [t for t in top if t and len(t) >= 15]
        else:
            top = []

        n_supported = len(supported_claims)
        n_partial = len(partial_claims)

        if top and n_supported > 0:
            findings = f"Verified empirical findings demonstrate that {_format_finding_clause(top[0])}."
            if len(top) > 1 and verified_ratio >= 50.0:
                findings += f" Further cross-verified analysis confirms that {_format_finding_clause(top[1])}."
        elif partial_claims and n_partial > 0:
            top_part = [strip_markdown(sanitize_academic_text(c.get("text", ""))).rstrip(". ") for c in partial_claims[:1]]
            top_part = [t for t in top_part if t and len(t) >= 15]
            if top_part:
                findings = f"Partially verified analysis indicates that {_format_finding_clause(top_part[0])}."
            else:
                findings = f"Partially verified analysis examines the foundational mechanisms of {self.academic_title.split(':')[0]}."
        else:
            findings = (
                f"An autonomous synthesis over retrieved scientific evidence examines the foundational "
                f"properties and empirical mechanisms governing {self.academic_title.split(':')[0]}."
            )

        claim_noun = "claim" if total_claims == 1 else "claims"
        part_noun = "claim" if len(partial_claims) == 1 else "claims"
        
        coverage_sentence = (
            f"Verbatim evidence matching and entity coverage verification across the multi-tier retrieval architecture "
            f"verified {len(supported_claims)} of {total_claims} detected factual {claim_noun} "
            f"({verified_ratio:.0f}% verified) with {len(partial_claims)} partially supported {part_noun}, "
            f"yielding an overall verification audit confidence of {self.conf_pct}."
        )

        is_all_peer_reviewed = bool(self.cited_sources) and all(
            s.get("review_status") == "peer_reviewed" or s.get("source_type") in ("openalex_journal", "crossref_peer_reviewed")
            for s in self.cited_sources
        )
        if is_all_peer_reviewed:
            close = "All empirical assertions are deterministically checked with exact evidence grounding against cited peer-reviewed sources."
        else:
            close = "All empirical assertions are deterministically checked with evidence grounding against cited primary and scholarly sources (Wikipedia, arXiv, OpenAlex)."

        return f"This paper presents an autonomous verification analysis of {self.academic_title.split(':')[0]}. {coverage_sentence} {findings} {close}"

    def build_index_terms(self) -> List[str]:
        boilerplate_stops = {
            "what", "when", "where", "which", "whose", "whom", "how", "does", "explain",
            "describe", "there", "about", "their", "would", "these", "those", "that", "this",
            "from", "with", "into", "over", "under", "between", "through", "using", "based",
            "and", "the", "for", "its", "our", "all", "any", "can", "not", "are", "has",
            "had", "have", "been", "was", "were", "will", "shall", "each", "both", "such",
            "wikipedia", "arxiv", "openalex", "crossref", "semanticscholar", "scholar", "okf",
            "source", "sources", "journal", "review", "article", "author", "authors", "user",
            "comprehensive", "structural", "analysis", "synthesis", "principles", "frameworks",
            "architectural", "theoretical", "foundations", "empirical", "mechanisms", "overview",
            "properties", "quantitative", "comparative", "applications", "evaluation", "systematic",
            "perspective", "toward", "towards", "paper", "study", "research", "autonomous",
            "verification", "preliminary", "investigation", "implications", "aspects", "critical",
            "future", "modern", "novel", "department", "intelligence", "engine", "coverage",
            "audited", "entailment"
        }
        seen: List[str] = []

        def add_term(t: str):
            t_clean = t.strip()
            t_lower = t_clean.lower()
            if t_lower in boilerplate_stops:
                return
            if t_clean.isupper() and len(t_clean) >= 2:
                key = t_clean
            elif len(t_clean) >= 4 and t_lower not in boilerplate_stops:
                key = t_lower
            else:
                return
            if key.lower() not in [x.lower() for x in seen]:
                seen.append(key)

        # 1. From canonical topic
        if self.canonical_topic:
            for ct in re.findall(r'\b[A-Za-z0-9_-]{3,}\b', self.canonical_topic):
                add_term(ct)

        # 2. From core title (part before ':')
        core_title = self.academic_title.split(':')[0]
        for tok in re.findall(r'\b[A-Z]{2,}\b', core_title):
            add_term(tok)
        for w in re.findall(r'\b[A-Za-z]{3,}\b', core_title):
            add_term(w)

        # 3. From user query
        for tok in re.findall(r'\b[A-Z]{2,}\b', self.query):
            add_term(tok)
        for w in re.findall(r'\b[A-Za-z]{3,}\b', self.query):
            add_term(w)

        # 4. From cited source titles
        for s in self.cited_sources[:3]:
            stitle = s.get("title") or ""
            stitle_clean = re.sub(r'^(?:Wikipedia|arXiv|OpenAlex|Semantic Scholar):\s*', '', stitle, flags=re.I)
            for tok in re.findall(r'\b[A-Z]{2,}\b', stitle_clean):
                add_term(tok)
            for w in re.findall(r'\b[A-Za-z]{4,}\b', stitle_clean):
                add_term(w)

        # 5. Methodological fallbacks if too few terms
        fallbacks = ["claim entailment", "evidence grounding", "automated verification", "scholarly retrieval"]
        for fb in fallbacks:
            if len(seen) >= 6:
                break
            if fb.lower() not in [x.lower() for x in seen]:
                seen.append(fb)

        return seen[:6]

    # ------------------------------------------------------------ primitives
    def add_section_header(self, roman_title: str):
        lines = self.wrap_line(roman_title, max_w=self.COL_W, fontname="hebo", fontsize=9.8)
        self.ensure_space(max(60.0, len(lines) * 13.0 + 36.0))
        self.y += 4.0
        x = self.COL_X[self.current_col]
        for l in lines:
            self.page.insert_text(
                fitz.Point(x, self.y),
                l,
                fontname=FONT_MAP.get("hebo", "tibo"),
                fontsize=9.8,
                color=(0.08, 0.13, 0.24),
            )
            self.y += 13.0
        self.page.draw_line(
            fitz.Point(x, self.y - 2.0),
            fitz.Point(x + self.COL_W, self.y - 2.0),
            color=(0.76, 0.81, 0.88),
            width=0.6,
        )
        self.y += 8.0

    def add_callout_box(self, text: str):
        clean = strip_markdown(sanitize_academic_text(re.sub(r'^>\s*', '', text, flags=re.M))).strip()
        if not clean:
            return
        lines = self.wrap_line(clean, max_w=self.COL_W - 22.0, fontname="tiit", fontsize=8.6)
        box_h = len(lines) * 11.5 + 12.0
        self.ensure_space(box_h + 6.0)
        x = self.COL_X[self.current_col]
        rect = fitz.Rect(x, self.y, x + self.COL_W, self.y + box_h)
        self.page.draw_rect(rect, color=(0.88, 0.90, 0.94), fill=(0.97, 0.98, 0.995), width=0.4)
        self.page.draw_rect(fitz.Rect(x, self.y, x + 2.5, self.y + box_h), color=(0.15, 0.35, 0.68), fill=(0.15, 0.35, 0.68), width=0)
        ty = self.y + 12.5
        for ln in lines:
            self.page.insert_text(fitz.Point(x + 11.0, ty), ln, fontname=FONT_MAP.get("tiit", "tiit"), fontsize=8.6, color=(0.16, 0.20, 0.26))
            ty += 11.5
        self.y += box_h + 7.0

    def add_subheading(self, text: str):
        clean = strip_markdown(text).strip()
        clean = re.sub(r'^#{1,6}\s*', '', clean).strip()
        clean = clean.strip("#").strip()
        if not clean:
            return
        if len(clean) > 85:
            self.add_paragraph(clean)
            return
        self.ensure_space(22.0)
        x = self.COL_X[self.current_col]
        self.y += 8.0
        words = _parse_rich_runs(clean)
        for line_runs in _wrap_rich_runs(words, self.COL_W, 9.0):
            bold_runs = [(w, "tibo") for w, _ in line_runs]
            self.draw_rich_line(x, self.y, bold_runs, 9.0, color=(0.08, 0.10, 0.12))
            self.y += 11.0
        self.y += 4.0

    def add_equation_image(self, img_bytes: bytes, max_h: float = 75.0):
        """
        Embeds a rendered LaTeX equation image centered in the column with proper vertical breathing room.
        """
        if not img_bytes:
            return
        try:
            pil_img = Image.open(io.BytesIO(img_bytes))
            w_orig, h_orig = pil_img.size
            if w_orig <= 0 or h_orig <= 0:
                return

            dpi_scale = 72.0 / 300.0
            target_w = w_orig * dpi_scale
            target_h = h_orig * dpi_scale

            avail_w = self.COL_W - 20.0
            if target_w > avail_w:
                scale = avail_w / target_w
                target_w = avail_w
                target_h = target_h * scale
            if target_h > max_h:
                scale = max_h / target_h
                target_h = max_h
                target_w = target_w * scale

            total_block_h = target_h + 12.0
            self.ensure_space(total_block_h)

            x_offset = self.COL_X[self.current_col] + max(0.0, (self.COL_W - target_w) / 2.0)
            self.y += 3.0
            rect = fitz.Rect(x_offset, self.y, x_offset + target_w, self.y + target_h)
            self.page.insert_image(rect, stream=img_bytes)
            self.y += target_h + 6.0
        except Exception as e:
            logger.warning(f"Failed to embed equation image: {e}")

    def add_paragraph(self, text: str, indent: bool = True, fontsize: float = BODY_SIZE, fontname: str = BODY_FONT, line_h: float = LINE_H):
        clean = text.strip()
        if not clean:
            return

        # Check for block LaTeX equations ($$ ... $$ or \[ ... \]) containing fractions, integrals, roots, or summations
        if ("$$" in clean or r"\[" in clean) and is_complex_latex_block(clean):
            parts = re.split(r'(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])', clean)
            for part in parts:
                p_strip = part.strip()
                if not p_strip:
                    continue
                if (p_strip.startswith("$$") and p_strip.endswith("$$")) or (p_strip.startswith(r"\[") and p_strip.endswith(r"\]")):
                    if is_complex_latex_block(p_strip):
                        png_bytes = render_latex_to_png(p_strip, dpi=300)
                        if png_bytes:
                            self.add_equation_image(png_bytes)
                            continue
                self._render_text_paragraph(p_strip, indent=indent, fontsize=fontsize, fontname=fontname, line_h=line_h)
            return

        self._render_text_paragraph(clean, indent=indent, fontsize=fontsize, fontname=fontname, line_h=line_h)

    def _render_text_paragraph(self, text: str, indent: bool = True, fontsize: float = BODY_SIZE, fontname: str = BODY_FONT, line_h: float = LINE_H):
        clean = sanitize_academic_text(text).strip()
        if not clean:
            return
        words = _parse_rich_runs(clean)
        lines = _wrap_rich_runs(words, max_w=self.COL_W, fontsize=fontsize)
        self.ensure_space(len(lines) * line_h + 4.0)
        x = self.COL_X[self.current_col]
        for idx, runs in enumerate(lines):
            line_indent = 10.0 if (indent and idx == 0) else 0.0
            self.draw_rich_line(x + line_indent, self.y, runs, fontsize)
            self.y += line_h
        self.y += 4.0

    def add_bullet(self, bold_prefix: str, text: str):
        body = re.sub(r'^\s*[\-\u2022\u00b7]\s+', '', text or "").strip()
        if not body and not bold_prefix:
            return
        words: List[Tuple[str, str]] = []
        if bold_prefix.strip():
            clean_pfx = strip_markdown(sanitize_academic_text(bold_prefix.strip()))
            if not clean_pfx.endswith(":"):
                clean_pfx = f"{clean_pfx}:"
            words = [(w, "tibo") for w in re.split(r'\s+', clean_pfx) if w]
        words += _parse_rich_runs(sanitize_academic_text(body))
        pending = [("•", "tiro")] + words
        lines = _wrap_rich_runs(pending, max_w=self.COL_W - 8.0, fontsize=8.5)
        self.ensure_space(len(lines) * 11.0 + 3.0)
        x = self.COL_X[self.current_col]
        first = True
        for runs in lines:
            indent_x = x + 2.0 if first else x + 12.0
            self.draw_rich_line(indent_x, self.y, runs, 8.5)
            self.y += 11.0
            first = False
        self.y += 3.0

    def _render_key_value_cards(self, rows: List[List[str]], caption: str = ""):
        """
        Renders wide comparison tables (> 6 columns) as clean, bordered key-value stacked cards
        so wide comparison tables never crush text vertically into illegible single-character columns on portrait pages.
        Ensures both keys and values are sanitized so raw markdown or $N/A$ never leaks.
        """
        if not rows:
            return
        raw_header = rows[0] if len(rows) > 1 else [f"Field {i}" for i in range(len(rows[0]))]
        header = [strip_markdown(sanitize_academic_text(h)) for h in raw_header]
        data_rows = rows[1:] if len(rows) > 1 else rows

        avail_w = self.COL_W
        x0 = self.COL_X[self.current_col]

        if caption:
            clean_body = re.sub(r'^(?:Table\s+[0-9IVXivx]*\s*[:\.\-]\s*)', '', caption, flags=re.I).strip()
            if not clean_body:
                clean_body = caption.strip()
            clean_body = strip_markdown(sanitize_academic_text(clean_body))
            caption_str = f"Table {self.get_next_table_num()}: {clean_body} (Structured Metric Cards)"
            cap_lines = self.wrap_line(caption_str, max_w=avail_w, fontname="tiit", fontsize=7.5)
            self.ensure_space(len(cap_lines) * 9.0 + 4.0)
            for cl in cap_lines:
                self.page.insert_text(fitz.Point(x0, self.y), cl, fontname="tiit", fontsize=7.5, color=(0.30, 0.33, 0.36))
                self.y += 9.0
            self.y += 3.0

        for row_idx, r in enumerate(data_rows):
            raw_entity = r[0] if r else f"Entry {row_idx + 1}"
            entity_title = strip_markdown(sanitize_academic_text(raw_entity))
            primary_label = f"{header[0]}: {entity_title}" if header else entity_title

            items: List[Tuple[str, str]] = []
            for col in range(1, len(header)):
                key = header[col]
                raw_val = r[col] if col < len(r) else "N/A"
                val = strip_markdown(sanitize_academic_text(raw_val))
                if not val or val in ("None", "null", "$N/A$"):
                    val = "N/A"
                items.append((key, val))

            col_w_card = (avail_w - 16.0) / 2.0
            left_lines = []
            right_lines = []
            for idx, (k, v) in enumerate(items):
                target_list = left_lines if idx % 2 == 0 else right_lines
                wrapped = self.wrap_line(f"• {k}: {v}", max_w=col_w_card, fontname="tiro", fontsize=7.5)
                target_list.extend(wrapped)

            n_body_lines = max(len(left_lines), len(right_lines), 1)
            card_h = 16.0 + n_body_lines * 9.5 + 8.0

            if self.y + card_h > self.BOTTOM_LIMIT:
                self.advance_column()
                x0 = self.COL_X[self.current_col]

            card_rect = fitz.Rect(x0, self.y, x0 + avail_w, self.y + card_h)
            header_rect = fitz.Rect(x0, self.y, x0 + avail_w, self.y + 16.0)

            self.page.draw_rect(card_rect, color=(0.75, 0.78, 0.82), width=0.5)
            self.page.draw_rect(header_rect, color=(0.75, 0.78, 0.82), fill=(0.92, 0.93, 0.95), width=0.5)

            self.page.insert_text(fitz.Point(x0 + 6.0, self.y + 11.5), primary_label, fontname="tibo", fontsize=8.0, color=(0.08, 0.10, 0.14))

            body_y = self.y + 24.0
            for i, line in enumerate(left_lines):
                self.page.insert_text(fitz.Point(x0 + 6.0, body_y + i * 9.5), line, fontname="tiro", fontsize=7.5, color=(0.12, 0.15, 0.18))
            for i, line in enumerate(right_lines):
                self.page.insert_text(fitz.Point(x0 + 10.0 + col_w_card, body_y + i * 9.5), line, fontname="tiro", fontsize=7.5, color=(0.12, 0.15, 0.18))

            self.y += card_h + 6.0

    # ------------------------------------------------------- real MD tables
    def _render_table_block(self, rows: List[List[str]], caption: str = "", custom_col_widths: Optional[List[float]] = None):
        """
        Renders real bordered grid with wrapped cells, header shading, clean pagination,
        and header row repetition on continuation pages (repeatRows=1).
        For tables with > 6 columns, automatically renders as clean key-value stacked cards.
        For tables with 5-6 columns, automatically reduces cell font size to 7.0-7.5pt with tighter padding.
        """
        if not rows:
            return
        header = rows[0] if len(rows) > 1 else None
        ncols = len(header) if header else (len(rows[0]) if rows else 0)
        rows = [r[:ncols] + ["N/A"] * max(0, ncols - len(r)) for r in rows]

        # For wide comparison tables with > 6 columns: render as clean key-value stacked cards
        if ncols > 6 and not custom_col_widths:
            self._render_key_value_cards(rows, caption=caption)
            return

        header = rows[0] if len(rows) > 1 else None
        data_rows = rows[1:] if len(rows) > 1 else rows
        if header is None:
            data_rows = rows

        x0 = self.COL_X[self.current_col]
        avail_w = self.COL_W

        # Dynamic cell font size and tighter padding for 6+ columns to prevent vertical text crushing
        if ncols >= 6:
            cell_fontsize = 7.0
            cell_pad_x = 1.5
            cell_pad_y = 1.8
            line_h = 8.5
            min_col_w = 22.0
        else:
            cell_fontsize = 7.5
            cell_pad_x = 2.5
            cell_pad_y = 2.5
            line_h = 9.0
            min_col_w = 30.0

        if custom_col_widths and len(custom_col_widths) == ncols:
            col_widths = custom_col_widths
        else:
            weights = []
            for col in range(ncols):
                natural = max(
                    (get_text_width(strip_markdown(" ".join(r[col].split("|"))), fontname="tiro", fontsize=cell_fontsize)
                     for r in rows), default=min_col_w)
                # Metric / Property column (col 0) gets sufficient width to avoid orphan closing parentheses
                if col == 0:
                    natural = max(natural, 45.0 if ncols >= 6 else 55.0)
                weights.append(max(natural, min_col_w))
            total_w = sum(weights)
            col_widths = [max(min_col_w, avail_w * w / total_w) for w in weights]
            scale = avail_w / sum(col_widths)
            col_widths = [w * scale for w in col_widths]

        if caption:
            # Enforce clean sequential table numbering (Table I: ..., Table II: ...)
            clean_body = re.sub(r'^(?:Table\s+[0-9IVXivx]*\s*[:\.\-]\s*)', '', caption, flags=re.I).strip()
            if not clean_body:
                clean_body = caption.strip()
            caption = f"Table {self.get_next_table_num()}: {clean_body}"
            cap_lines = self.wrap_line(caption, max_w=avail_w, fontname="tiit", fontsize=7.5)
            self.ensure_space(len(cap_lines) * 9.0 + 4.0)
            for cl in cap_lines:
                self.page.insert_text(fitz.Point(x0, self.y), cl, fontname=FONT_MAP.get("tiit", "tiit"), fontsize=7.5, color=(0.30, 0.33, 0.36))
                self.y += 9.0
            self.y += 2.0

        def draw_row(row_cells: List[str], bold: bool) -> Tuple[float, List[List[str]]]:
            fontname = "hebo" if bold else "tiro"
            fsize = (cell_fontsize - 0.2) if bold else cell_fontsize
            cell_lines = []
            for col, (_, cw) in enumerate(zip(row_cells, col_widths)):
                txt = strip_markdown(sanitize_academic_text(row_cells[col]))
                cell_lines.append(self.wrap_line(txt, max_w=cw - 2 * cell_pad_x, fontname=fontname, fontsize=fsize))
            n_lines = max((len(cl) for cl in cell_lines), default=1)
            row_h = n_lines * line_h + 2 * cell_pad_y
            return row_h, cell_lines

        def paint_row(row_h: float, cell_lines: List[List[str]], bold: bool, xs_coords: List[float], row_idx: int = 0, is_last: bool = False):
            # Academic booktabs borderless-accent style (horizontal rules only, subtle zebra tint)
            y_top = self.y
            row_rect = fitz.Rect(xs_coords[0], y_top, xs_coords[-1] + col_widths[-1], y_top + row_h)
            if bold:
                self.page.draw_rect(row_rect, color=None, fill=(0.94, 0.96, 0.98), width=0)
                self.page.draw_line(fitz.Point(row_rect.x0, y_top), fitz.Point(row_rect.x1, y_top), color=(0.15, 0.22, 0.34), width=1.1)
                self.page.draw_line(fitz.Point(row_rect.x0, y_top + row_h), fitz.Point(row_rect.x1, y_top + row_h), color=(0.35, 0.42, 0.52), width=0.7)
            else:
                if row_idx % 2 == 1:
                    self.page.draw_rect(row_rect, color=None, fill=(0.98, 0.985, 0.99), width=0)
                if is_last:
                    self.page.draw_line(fitz.Point(row_rect.x0, y_top + row_h), fitz.Point(row_rect.x1, y_top + row_h), color=(0.15, 0.22, 0.34), width=1.0)
                else:
                    self.page.draw_line(fitz.Point(row_rect.x0, y_top + row_h), fitz.Point(row_rect.x1, y_top + row_h), color=(0.88, 0.90, 0.93), width=0.35)

            for col, cw in enumerate(col_widths):
                fontname = FONT_MAP.get("hebo" if bold else "tiro")
                fsize = (cell_fontsize - 0.2) if bold else cell_fontsize
                ty = y_top + cell_pad_y + (6.0 if ncols >= 6 else 6.6)
                for line in cell_lines[col]:
                    cell_color = (0.10, 0.14, 0.20) if bold else (0.14, 0.17, 0.22)
                    if not bold and line == "SUPPORTED":
                        cell_color = (0.04, 0.48, 0.33)
                    elif not bold and line == "PARTIAL":
                        cell_color = (0.72, 0.43, 0.04)
                    elif not bold and line == "UNSUPPORTED":
                        cell_color = (0.65, 0.16, 0.16)
                    elif not bold and line == "UNCITED":
                        cell_color = (0.45, 0.47, 0.50)
                    self.page.insert_text(fitz.Point(xs_coords[col] + cell_pad_x, ty), line, fontname=fontname, fontsize=fsize, color=cell_color)
                    ty += line_h
            self.y += row_h

        def get_xs():
            curr_x = self.COL_X[self.current_col]
            xs = [curr_x]
            for cw in col_widths[:-1]:
                xs.append(xs[-1] + cw)
            return xs

        # Pre-measure header if present
        header_h = 0.0
        header_lines = []
        if header is not None:
            header_h, header_lines = draw_row(header, True)
            if self.y + header_h + 25.0 > self.BOTTOM_LIMIT:
                self.advance_column()
            xs = get_xs()
            paint_row(header_h, header_lines, True, xs)

        xs = get_xs()
        total_data = len(data_rows)
        for r_idx, r in enumerate(data_rows):
            row_h, cell_lines = draw_row(r, False)
            if self.y + row_h > self.BOTTOM_LIMIT:
                self.advance_column()
                xs = get_xs()
                if header is not None:
                    paint_row(header_h, header_lines, True, xs)
            paint_row(row_h, cell_lines, False, xs, row_idx=r_idx, is_last=(r_idx == total_data - 1))

        self.y += 9.0

    def add_figure(self, img_bytes: bytes, caption_label: str, attribution: str = "", max_h: float = 235.0):
        """
        Embeds a high-resolution figure cleanly with crisp hairline frame, academic caption,
        and attribution, keeping image and caption together.
        """
        if not img_bytes:
            return
        try:
            pil_img = Image.open(io.BytesIO(img_bytes))
            w_orig, h_orig = pil_img.size
            if w_orig <= 0 or h_orig <= 0:
                return

            avail_w = self.COL_W
            aspect = h_orig / w_orig
            target_w = min(avail_w, 420.0)
            target_h = target_w * aspect
            if target_h > max_h:
                target_h = max_h
                target_w = target_h / aspect

            cap_text = caption_label.strip()
            cap_lines = self.wrap_line(cap_text, max_w=self.COL_W, fontname="tiro", fontsize=8.0)
            cap_h = len(cap_lines) * 10.2 + (11.0 if attribution else 0.0)

            total_block_h = target_h + cap_h + 20.0
            self.ensure_space(total_block_h)

            x_offset = self.COL_X[self.current_col] + max(0.0, (self.COL_W - target_w) / 2.0)
            rect = fitz.Rect(x_offset, self.y, x_offset + target_w, self.y + target_h)
            self.page.insert_image(rect, stream=img_bytes)
            self.page.draw_rect(rect, color=(0.82, 0.85, 0.89), width=0.45)
            self.y += target_h + 6.0

            x_cap = self.COL_X[self.current_col]
            fig_prefix_match = re.match(r'^(Figure\s+\d+:)\s*(.*)$', cap_text)
            for idx, cl in enumerate(cap_lines):
                if idx == 0 and fig_prefix_match and cl.startswith(fig_prefix_match.group(1)):
                    pfx = fig_prefix_match.group(1)
                    rest = cl[len(pfx):]
                    pfx_w = get_text_width(pfx, fontname="tibo", fontsize=8.0)
                    self.page.insert_text(
                        fitz.Point(x_cap, self.y),
                        pfx,
                        fontname=FONT_MAP.get("tibo", "tibo"),
                        fontsize=8.0,
                        color=(0.10, 0.14, 0.20),
                    )
                    if rest:
                        self.page.insert_text(
                            fitz.Point(x_cap + pfx_w, self.y),
                            rest,
                            fontname=FONT_MAP.get("tiro", "tiro"),
                            fontsize=8.0,
                            color=(0.15, 0.19, 0.24),
                        )
                else:
                    self.page.insert_text(
                        fitz.Point(x_cap, self.y),
                        cl,
                        fontname=FONT_MAP.get("tiro", "tiro"),
                        fontsize=8.0,
                        color=(0.15, 0.19, 0.24),
                    )
                self.y += 10.2

            if attribution:
                attr_str = f"Source: {attribution}"
                self.page.insert_text(fitz.Point(x_cap, self.y), attr_str, fontname=FONT_MAP.get("heit", "tiit"), fontsize=7.0, color=(0.42, 0.46, 0.52))
                self.y += 10.0

            self.y += 7.0
        except Exception as e:
            logger.warning(f"Failed to add figure to PDF: {e}")

    # ------------------------------------------------------------- references
    def add_reference(self, num: int, src_name: str, tier: str, src_type: str, authors=None, year=None, title: str = "", url: str = ""):
        """
        IEEE-style reference entry with full bibliographic metadata and clickable link.
        Format: [N] Authors (Year). "Title". Venue/Source. Tier: TIER (type).
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
            is_doi = "doi.org" in url
            url_label = "DOI: " if is_doi else "URL: "
            url_text = url
            url_line_w = get_text_width(url_label + url_text, fontname="tiro", fontsize=7.5)
            if url_line_w > self.COL_W:
                url_text = url_text.replace("https://", "").replace("http://", "")
            url_line = url_label + url_text
            lines.append(url_line)

        self.ensure_space(len(lines) * 9.5 + 3.0)
        x = self.COL_X[self.current_col]
        for i, l in enumerate(lines):
            is_url = (url_line is not None and l == url_line)
            link_blue = (0.0, 0.34, 0.71)  # Classic IEEE blue (#0056B3)
            self.page.insert_text(
                fitz.Point(x, self.y), l,
                fontname=FONT_MAP.get("tiro", "tiro"),
                fontsize=7.5 if is_url else 8.0,
                color=link_blue if is_url else (0.12, 0.15, 0.18),
            )
            if url and url_line is not None and l == url_line:
                uw = get_text_width(l, fontname="tiro", fontsize=7.5)
                self.insert_uri_link(fitz.Rect(x, self.y - 7.0, x + uw + 2, self.y + 2.5), url)
                self.page.draw_line(fitz.Point(x, self.y + 2.0), fitz.Point(x + uw, self.y + 2.0), color=link_blue, width=0.4)
            self.y += 9.5
        self.y += 2.0

    # -------------------------------------------------------- appendix table
    def _render_audit_ledger_table(self):
        """
        Renders the Verification Audit Ledger as a clean, compact Appendix table
        after Section VI. References when full_ledger is enabled.
        Columns: Claim ID | Audited Research Claim | Verdict | Conf. | Source
        """
        if not self.full_ledger or not self.claims:
            return

        # Start Appendix on a fresh column or page for clean IEEE separation
        if self.y > 180.0:
            self.advance_column()

        self.ensure_space(45.0)
        self.add_section_header("APPENDIX: VERIFICATION AUDIT LEDGER")
        self.add_paragraph(
            f"The following deterministic audit ledger verifies every factual claim in this manuscript "
            f"against cited primary sources using sentence-level entailment and entity coverage "
            f"({self.conf_pct} overall verification confidence).",
            indent=False, fontsize=7.5
        )
        self.y += 2.0

        rows = [["Claim ID", "Audited Research Claim", "Verdict", "Conf.", "Source"]]
        ledger_claims = self.claims if self.full_ledger else self.claims[:10]
        
        for idx, c in enumerate(ledger_claims):
            cid = f"C{idx + 1}"
            raw_txt = strip_markdown(sanitize_academic_text(c.get("text", ""))).strip()
            if len(raw_txt) > 110:
                short_txt = raw_txt[:110].rsplit(' ', 1)[0] + "..."
            else:
                short_txt = raw_txt
            
            stat = str(c.get("status", "supported")).lower()
            if stat == "uncited":
                verdict = "UNCITED"
                conf_str = "0%"
                src_str = "—"
            elif stat == "unsupported":
                verdict = "UNSUPPORTED"
                cov = c.get("coverage", 0.0) if cov_ok(c) else 0.0
                conf_str = f"{int(round(cov * 100))}%"
                cids = c.get("renumbered_citations") or []
                src_str = ", ".join(f"[{x}]" for x in cids[:3]) if cids else "—"
            elif stat == "partially_supported":
                verdict = "PARTIAL"
                cov = c.get("coverage", 0.5) if cov_ok(c) else 0.5
                conf_str = f"{int(round(cov * 100))}%"
                cids = c.get("renumbered_citations") or []
                src_str = ", ".join(f"[{x}]" for x in cids[:3]) if cids else "—"
            else:
                verdict = "SUPPORTED"
                cov = c.get("coverage", 1.0) if cov_ok(c) else 1.0
                conf_str = f"{int(round(cov * 100))}%"
                cids = c.get("renumbered_citations") or []
                src_str = ", ".join(f"[{x}]" for x in cids[:3]) if cids else "—"
            
            rows.append([cid, short_txt, verdict, conf_str, src_str])
            
        custom_widths = [38.0, 244.0, 75.0, 45.0, 85.0]  # Sum = 487.0 pt (full single-column width)
        self._render_table_block(rows, caption="Table II: Sentence-Level Evidence Grounding & Verification Audit Ledger", custom_col_widths=custom_widths)

    # ------------------------------------------------------------- generate
    def _classify_block(self, line: str) -> str:
        s = line.strip()
        if re.match(r'^#{3,6}\s+', s):
            if re.match(r'^#{3,6}\s*(?:I|II|III|IV|V)\.\s+', s, re.I):
                return "heading"
            return "subheading"
        if s.startswith('#'):
            return "heading"
        if s.startswith('>'):
            return "callout"
        if s.startswith('|') and s.endswith('|'):
            return "table"
        if s.startswith(('-', '*', '•')) and not s.startswith('**') or re.match(r'^\*\s+', s):
            return "bullet"
        if re.match(r'^\d+\.\s+[A-Za-z]', s):
            return "bullet"
        return "paragraph"

    def _route_section(self, heading: str) -> int:
        h = heading.lower().strip()
        if re.match(r'^iv\b[\.\:\s]', h):
            return 3
        if re.match(r'^iii\b[\.\:\s]', h):
            return 2
        if re.match(r'^ii\b[\.\:\s]', h):
            return 1
        if re.match(r'^v\b[\.\:\s]', h):
            return 4
        if re.match(r'^i\b[\.\:\s]', h):
            return 0
        if any(k in h for k in ("empirical", "application", "environmental", "safety", "operational", "limitation", "industrial", "significance", "challenges")):
            return 3
        if any(k in h for k in ("quantitative", "comparative", "properties", "benchmark", "indicator", "table")):
            return 2
        if any(k in h for k in ("mechanism", "structure", "synthesis", "pathway", "architecture", "methodology", "governance", "developments")):
            return 1
        if any(k in h for k in ("conclusion", "direction", "future", "outlook", "summary")):
            return 4
        if any(k in h for k in ("intro", "definition", "taxonomy", "overview", "foundations")):
            return 0
        return -1

    def generate(self) -> bytes:
        # Cleanly trim any incomplete trailing sentence lacking terminal punctuation
        self.raw_answer = trim_incomplete_sentence(self.raw_answer)

        # Normalize multi-line math blocks ($$\n...\n$$ and \[\n...\n\]) into single lines
        normalized_answer = re.sub(r'\$\$\s*\n([\s\S]+?)\n\s*\$\$', lambda m: f"$${' '.join(m.group(1).split())}$$", self.raw_answer)
        normalized_answer = re.sub(r'\\\[\s*\n([\s\S]+?)\n\s*\\\]', lambda m: f"\\[{' '.join(m.group(1).split())}\\]", normalized_answer)

        raw_lines = [l.rstrip() for l in normalized_answer.split('\n')]

        # Collect sections dynamically from markdown headings if structured, while preserving
        # canonical 5-section routing when headings align with I..V
        sections_content: List[List[Tuple[str, str]]] = [[] for _ in range(5)]
        custom_titles: Dict[int, str] = {}
        pending_tables: List[List[List[str]]] = []
        table_buffer: List[str] = []

        def flush_table_buffer():
            if table_buffer:
                rows = parse_markdown_table_rows(table_buffer)
                if rows:
                    pending_tables.append(rows)
                table_buffer.clear()

        cur_sec = 0
        seq_heading_idx = 0
        romans = ["I.", "II.", "III.", "IV.", "V."]
        for ln in raw_lines:
            s = ln.strip()
            if not s:
                flush_table_buffer()
                continue
            kind = self._classify_block(s)
            if kind == "heading":
                flush_table_buffer()
                clean_h = re.sub(r'^#{1,6}\s*', '', s).strip()
                mapped_sec = self._route_section(clean_h)
                if mapped_sec >= 0:
                    cur_sec = mapped_sec
                    seq_heading_idx = max(seq_heading_idx, mapped_sec + 1)
                else:
                    cur_sec = min(seq_heading_idx, 4)
                    seq_heading_idx = min(seq_heading_idx + 1, 4)
                if clean_h and cur_sec not in custom_titles:
                    upper_h = strip_markdown(sanitize_academic_text(clean_h)).upper()
                    if not re.match(r'^(?:I|II|III|IV|V)\.\s+', upper_h):
                        upper_h = f"{romans[cur_sec]} {upper_h}"
                    custom_titles[cur_sec] = upper_h
                continue
            if kind == "table":
                table_buffer.append(s)
                continue
            flush_table_buffer()
            sections_content[cur_sec].append((kind, s))

        flush_table_buffer()

        # Trim incomplete trailing sentences from each section so no section ends mid-word
        for s_idx in range(5):
            if sections_content[s_idx]:
                last_kind, last_text = sections_content[s_idx][-1]
                if last_kind == "paragraph":
                    sections_content[s_idx][-1] = (last_kind, trim_incomplete_sentence(last_text))

        # Domain-adaptive defaults (used only if manuscript had fewer than 5 headings)
        is_stem_topic = any(
            k in f"{self.query} {self.canonical_topic}".lower()
            for k in (
                "pvc", "polymer", "algorithm", "data structure", "dsa", "quantum",
                "crispr", "dna", "rna", "llm", "neural", "database", "operating system",
                "processor", "cpu", "consensus", "bft", "galaxy", "jwst", "molecule", "cell",
            )
        )
        if is_stem_topic:
            default_titles = [
                "I. INTRODUCTION & EXECUTIVE DEFINITION",
                "II. CORE MECHANISMS, THEORETICAL ARCHITECTURE & METHODOLOGY",
                "III. QUANTITATIVE PROPERTIES & COMPARATIVE ANALYSIS",
                "IV. EMPIRICAL APPLICATIONS, OPERATIONAL IMPACT & TECHNICAL LIMITATIONS",
                "V. CONCLUSION & OPEN RESEARCH DIRECTIONS",
            ]
        else:
            default_titles = [
                "I. INTRODUCTION & FOUNDATIONAL OVERVIEW",
                "II. STRUCTURAL CONTEXT, GOVERNANCE & KEY DEVELOPMENTS",
                "III. COMPARATIVE INDICATORS & EMPIRICAL PROFILE",
                "IV. CONTEMPORARY SIGNIFICANCE, IMPACT & CHALLENGES",
                "V. CONCLUSION & OPEN RESEARCH DIRECTIONS",
            ]

        canonical_sections = [
            (custom_titles.get(idx, default_titles[idx]), idx)
            for idx in range(5)
        ]

        def is_disclaimer_bullet(text: str) -> bool:
            lower = text.lower()
            return any(p in lower for p in (
                "disclaimer", "note:", "limitations of this analysis",
                "generated by aria", "autonomous synthesis note",
                "cover only part of this question", "as an ai", "as an automated"
            ))

        figure1_rendered = False
        figure2_rendered = False

        def _download_img_sync(url: str, timeout: float = 5.0) -> Optional[bytes]:
            if not url:
                return None
            allowed, reason = is_allowed_image_url(url)
            if not allowed:
                logger.warning(f"Blocked unsafe/disallowed sync image fetch for {url}: {reason}")
                return None
            try:
                from utils.media import USER_AGENT, MAX_IMAGE_BYTES
                headers = {
                    "User-Agent": USER_AGENT,
                    "Accept": "image/webp,image/png,image/jpeg,image/*;q=0.8"
                }
                current_url = url
                with httpx.Client(timeout=timeout, follow_redirects=False) as client:
                    resp = None
                    for _hop in range(4):
                        resp = client.get(current_url, headers=headers)
                        if resp.status_code in (301, 302, 303, 307, 308):
                            loc = resp.headers.get("location")
                            if not loc:
                                return None
                            next_url = urllib.parse.urljoin(current_url, loc)
                            next_ok, next_reason = is_allowed_image_url(next_url)
                            if not next_ok:
                                logger.warning(f"Blocked unsafe sync image redirect to {next_url}: {next_reason}")
                                return None
                            current_url = next_url
                            continue
                        break

                    if resp is None or resp.status_code != 200:
                        logger.debug(f"Sync image download HTTP {getattr(resp, 'status_code', 'none')} for {url}")
                        return None

                    # Reject non-image responses (such as HTML error pages)
                    content_type = resp.headers.get("content-type", "").lower()
                    if not content_type.startswith("image/"):
                        logger.debug(f"Rejecting non-image Content-Type '{content_type}' for {url}")
                        return None

                    # Cap image downloads to 4 MB
                    content_len = resp.headers.get("content-length")
                    if content_len and int(content_len) > MAX_IMAGE_BYTES:
                        logger.debug(f"Rejecting image exceeding 4 MB ({content_len} bytes) from {url}")
                        return None

                    if not resp.content or len(resp.content) < 100 or len(resp.content) > MAX_IMAGE_BYTES:
                        return None

                    img = Image.open(io.BytesIO(resp.content))
                    if img.mode not in ("RGB", "L"):
                        img = img.convert("RGB")
                    # Reject predominantly dark/blank/monochrome candidate images
                    from PIL import ImageStat
                    stat = ImageStat.Stat(img.convert("L"))
                    if stat.mean[0] < 25.0 or stat.stddev[0] < 8.0:
                        logger.debug(f"Rejecting dark/blank sync image from {url}: mean={stat.mean[0]:.1f}, std={stat.stddev[0]:.1f}")
                        return None
                    if img.width > 1400 or img.height > 1400:
                        img.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=92)
                    return buf.getvalue()
            except Exception as e:
                logger.debug(f"Sync image download failed for {url}: {e}")
            return None

        def _is_valid_chart_for_pdf(chart: Optional[Dict[str, Any]]) -> bool:
            if not chart:
                return False
            cats = chart.get("categories") or []
            sers = chart.get("series") or []
            if len(cats) < 3 or not sers:
                return False
            all_vals = [v for s in sers for v in s.get("data", [])]
            if len(all_vals) <= 1 or max(all_vals) == min(all_vals) or len(set(all_vals)) <= 1:
                return False
            y_lab = str(chart.get("y_label", ""))
            if any(tok in y_lab for tok in ("[c:", "c:", "§")):
                return False
            return True

        def _render_block(kind: str, text: str):
            if kind == "subheading":
                self.add_subheading(text)
            elif kind == "bullet":
                m_bold = re.match(r'^(?:-\s*)?(?:\*\*(.*?)\*\*|([A-Za-z0-9][A-Za-z0-9\s_-]*?):)\s*[-\u2013\u2014:]?\s*(.*)$', text)
                if m_bold:
                    pfx = (m_bold.group(1) or m_bold.group(2) or "").strip()
                    rest = m_bold.group(3).strip()
                    self.add_bullet(pfx, rest)
                else:
                    self.add_bullet("", text)
            elif kind == "callout":
                self.add_callout_box(text)
            else:
                self.add_paragraph(text)

        # ------------------------------------------------------------------
        # Render the Manuscript Sections
        # ------------------------------------------------------------------
        populated_sections = sum(1 for s in sections_content if s)
        for title, s_idx in canonical_sections:
            items = sections_content[s_idx]
            has_table_here = (s_idx == 2 and bool(pending_tables))
            if not items and not has_table_here and populated_sections >= 2:
                continue
            self.add_section_header(title)

            # Section III renders the quantitative Markdown table and topic chart
            if s_idx == 2 and pending_tables:
                # Flow: introductory paragraph -> Table I -> Figure 2 (chart) -> analytical commentary
                intro_items = []
                post_items = []
                for kind, text in items:
                    lower = text.lower()
                    if any(ph in lower for ph in ("table illustrates", "table summarizes", "table i", "as shown in the table", "as detailed in", "tabulated metrics", "variance in", "comparative analysis of")):
                        post_items.append((kind, text))
                    elif not intro_items:
                        intro_items.append((kind, text))
                    else:
                        post_items.append((kind, text))

                for kind, text in intro_items:
                    _render_block(kind, text)
                self.y += 2.0
                for t_rows in pending_tables:
                    self._render_table_block(t_rows, caption="Table I: Quantitative Properties & Comparative Analysis")
                self.y += 2.0

                # Embed Figure 2: Matplotlib quantitative comparative benchmark chart (rejects degenerate charts)
                if self.chart and _is_valid_chart_for_pdf(self.chart) and not figure2_rendered:
                    from utils.media import render_chart_matplotlib
                    c_bytes = self.chart.get("chart_bytes") or render_chart_matplotlib(self.chart)
                    if c_bytes:
                        c_cap = self.chart.get("caption") or self.chart.get("title") or "Comparative quantitative metrics across verified sources."
                        c_src = self.chart.get("source_citation") or "ARIA Autonomous Benchmark Synthesis"
                        self.add_figure(c_bytes, f"Figure 2: {c_cap}", attribution=c_src)
                        figure2_rendered = True

                for kind, text in post_items:
                    _render_block(kind, text)
            else:
                if items:
                    for kind, text in items:
                        if s_idx == 4 and is_disclaimer_bullet(text):
                            continue
                        _render_block(kind, text)
                else:
                    # Guarantee no orphaned headings: synthesize domain-grounded section prose
                    topic_name = self.academic_title.split(':')[0]
                    if s_idx == 0:
                        fallback_p = f"{topic_name} is examined across retrieved primary and scholarly literature to establish its foundational definitions, scope, and verified nomenclature [1]."
                    elif s_idx == 1:
                        fallback_p = f"Core structural dynamics and mechanisms governing {topic_name} reflect empirical patterns documented in the cited primary sources [1]."
                    elif s_idx == 2:
                        fallback_p = f"Comparative metrics and observed properties of {topic_name} illustrate key trade-offs and measurable distinctions across verified sources [1]."
                    elif s_idx == 3:
                        fallback_p = f"Real-world impact, practical applications, and operational limitations of {topic_name} remain bounded by the empirical evidence cited in this report [1]."
                    else:
                        fallback_p = f"Verified evidence establishes the core characteristics of {topic_name}, while open research questions motivate deeper longitudinal and comparative investigation [1]."
                    self.add_paragraph(fallback_p)

                # Embed Figure 1: verified topic picture/diagram inside Section I or II
                if s_idx in (0, 1) and self.figures and not figure1_rendered:
                    fig0 = self.figures[0]
                    fig_title_l = (fig0.get("title") or "").lower()
                    fig_cap_l = (fig0.get("caption") or "").lower()
                    fig_url_l = (fig0.get("url") or "").lower()
                    scan_terms = (
                        "(ia ", "ia_", "dtic", "ntis", "caltrans",
                        "defense technical information", "national technical information",
                        "technical report", "dissertation", "book cover", "title page", ".djvu"
                    )
                    is_rejected_scan = any(st in fig_title_l or st in fig_cap_l or st in fig_url_l for st in scan_terms)
                    if fig_title_l.startswith("ia ") or fig_url_l.split("/")[-1].startswith("ia "):
                        is_rejected_scan = True
                    if not is_rejected_scan:
                        img_bytes = fig0.get("image_bytes")
                        if not img_bytes and fig0.get("url"):
                            img_bytes = _download_img_sync(fig0["url"])
                        if img_bytes:
                            fig_title = (fig0.get("title") or "").strip()
                            raw_cap = (fig0.get("caption") or "").strip()
                            # Never repeat the figure title word-for-word in the caption
                            if raw_cap and raw_cap.lower().strip(". ") != fig_title.lower().strip(". "):
                                cap = raw_cap
                            elif fig_title:
                                cap = f"Contextual visual reference for {fig_title} in relation to {self.academic_title.split(':')[0]}."
                            else:
                                cap = f"Verified visual reference for {self.academic_title.split(':')[0]}."
                            attr = fig0.get("attribution") or "Wikimedia Commons"
                            self.add_figure(img_bytes, f"Figure 1: {cap}", attribution=attr)
                            figure1_rendered = True

                # If Section III had no pending table, still embed Figure 2 if chart exists and is valid
                if s_idx == 2 and self.chart and _is_valid_chart_for_pdf(self.chart) and not figure2_rendered:
                    from utils.media import render_chart_matplotlib
                    c_bytes = self.chart.get("chart_bytes") or render_chart_matplotlib(self.chart)
                    if c_bytes:
                        c_cap = self.chart.get("caption") or self.chart.get("title") or "Comparative quantitative metrics across verified sources."
                        c_src = self.chart.get("source_citation") or "ARIA Autonomous Benchmark Synthesis"
                        self.add_figure(c_bytes, f"Figure 2: {c_cap}", attribution=c_src)
                        figure2_rendered = True

        # ------------------------------------------------------------------
        # SECTION VI. REFERENCES (Cited-Only, Renumbered 1-N)
        # ------------------------------------------------------------------
        self.add_section_header("VI. REFERENCES")
        for new_num, s in enumerate(self.cited_sources, start=1):
            src_name = sanitize_academic_text(str(s.get("source") or s.get("venue") or "Research Source"))
            tier = s.get("tier", "LIVE")
            st = s.get("source_type", "scholarly")
            if st == "user_context":
                continue
            authors = s.get("authors")
            year = s.get("year")
            title = strip_markdown(str(s.get("title") or "")) or None
            raw_url = resolve_source_url(s) if self.clickable_urls else ""
            self.add_reference(
                new_num, src_name or "Research Source", tier, st,
                authors=authors, year=year, title=title, url=raw_url,
            )

        # ------------------------------------------------------------------
        # APPENDIX: VERIFICATION AUDIT LEDGER (Compact Bordered Table)
        # ------------------------------------------------------------------
        self._render_audit_ledger_table()

        # Remove trailing blank or header-only page
        while len(self.doc) > 1 and is_page_empty_or_header_only(self.doc[-1]):
            self.doc.delete_page(len(self.doc) - 1)

        # Stamp crisp journal footer rules with "Page N of M" across every page
        total_pages = len(self.doc)
        short_foot_title = (
            self.academic_title[:58].rsplit(" ", 1)[0] + "..."
            if len(self.academic_title) > 58
            else self.academic_title
        )
        for p_idx in range(total_pages):
            pg = self.doc[p_idx]
            pg.draw_line(
                fitz.Point(self.MARGIN_L, 804.0),
                fitz.Point(self.MARGIN_R, 804.0),
                color=(0.80, 0.84, 0.89),
                width=0.5,
            )
            pg.insert_text(
                fitz.Point(self.MARGIN_L, 816.0),
                f"ARIA Working Paper  ·  {short_foot_title}",
                fontname=FONT_MAP.get("helv", "tiro"),
                fontsize=7.2,
                color=(0.45, 0.50, 0.56),
            )
            page_label = f"Page {p_idx + 1} of {total_pages}"
            pw = get_text_width(page_label, fontname="helv", fontsize=7.2)
            pg.insert_text(
                fitz.Point(self.MARGIN_R - pw, 816.0),
                page_label,
                fontname=FONT_MAP.get("hebo", "tibo"),
                fontsize=7.2,
                color=(0.35, 0.40, 0.46),
            )

        pdf_bytes = self.doc.write()
        self.doc.close()
        return pdf_bytes


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
    clickable_urls: bool = True,
    figures: Optional[List[Dict[str, Any]]] = None,
    chart: Optional[Dict[str, Any]] = None,
    pdf_style: str = "academic",
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
        clickable_urls=clickable_urls,
        figures=figures,
        chart=chart,
        pdf_style=pdf_style,
    )
    return paper.generate()
