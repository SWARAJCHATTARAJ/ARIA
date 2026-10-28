import yaml
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
import os

class OKFFrontmatter(BaseModel):
    id: str
    type: str # definition, finding, note, source-summary, method
    topic: List[str]
    title: str
    created: datetime
    updated: datetime
    source: Optional[str] = None
    related: List[str] = Field(default_factory=list) # Relative paths
    owner: str # shared, personal
    confidence: str # verified, draft

    @validator("type")
    def validate_type(cls, v):
        allowed = ["definition", "finding", "note", "source-summary", "method"]
        if v not in allowed:
            raise ValueError(f"type must be one of {allowed}")
        return v

    @validator("owner")
    def validate_owner(cls, v):
        allowed = ["shared", "personal"]
        if v not in allowed:
            raise ValueError(f"owner must be one of {allowed}")
        return v
        
    @validator("confidence")
    def validate_confidence(cls, v):
        allowed = ["verified", "draft"]
        if v not in allowed:
            raise ValueError(f"confidence must be one of {allowed}")
        return v

def parse_okf_file(file_path: str) -> dict:
    """
    Parses an OKF Markdown file, extracting the YAML frontmatter and the content.
    """
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if not content.startswith("---"):
        raise ValueError(f"File {file_path} does not contain YAML frontmatter.")
        
    parts = content.split("---", 2)
    if len(parts) < 3:
        raise ValueError(f"File {file_path} has malformed frontmatter.")
        
    frontmatter_yaml = parts[1].strip()
    markdown_content = parts[2].strip()
    
    parsed_yaml = yaml.safe_load(frontmatter_yaml)
    
    # Validate with Pydantic
    frontmatter = OKFFrontmatter(**parsed_yaml)
    
    return {
        "metadata": frontmatter.dict(),
        "content": markdown_content
    }

def traverse_okf_graph(base_dir: str, query: str, max_depth: int = 1) -> List[dict]:
    """
    Traverses a directory of OKF markdown files.
    Matches relevant nodes by title/topic/content, and follows their 'related' edges.
    """
    if not os.path.isdir(base_dir):
        return []

    import re
    STOP_WORDS = {
        "what", "when", "where", "which", "while", "who", "whom", "whose", "why", "how",
        "that", "this", "these", "those", "with", "from", "about", "into", "through",
        "during", "before", "after", "above", "below", "have", "has", "had", "been",
        "were", "their", "there", "they", "them", "some", "such", "than", "then",
        "more", "most", "other", "lead", "leading", "approach", "approaches", "the",
        "and", "for", "are", "can", "all", "any"
    }
    tokens = re.findall(r"\b[a-zA-Z]{3,}\b", query.lower())
    query_words = set(t for t in tokens if t not in STOP_WORDS)
    if not query_words:
        query_words = set(tokens)

    all_docs = {}
    # Index all .md / .okf files
    for root, _, files in os.walk(base_dir):
        for f in files:
            if f.endswith(".md") or f.endswith(".okf"):
                full_path = os.path.join(root, f)
                try:
                    parsed = parse_okf_file(full_path)
                    all_docs[full_path] = parsed
                except Exception:
                    continue

    matched_nodes = []
    visited_paths = set()

    # 1. Find root matches based on keyword scoring and coverage (personal OKF notes only)
    for path, doc in all_docs.items():
        meta = doc["metadata"]
        # Only personal notes are resolved by the local OKF tier; shared notes belong to the RAG vector corpus
        if meta.get("owner") != "personal":
            continue

        title_topic_text = (meta.get("title", "") + " " + " ".join(meta.get("topic", []))).lower()
        full_text = (title_topic_text + " " + doc.get("content", "")).lower()
        
        doc_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", full_text))
        title_topic_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", title_topic_text))

        matched_words = query_words.intersection(doc_words)
        title_topic_matched = query_words.intersection(title_topic_words)
        coverage = len(matched_words) / max(len(query_words), 1)

        # Require genuine topic relevance:
        # Either a match in title/topic with at least 40% query coverage,
        # or multiple distinct matching query concepts covering >= 50% of the query.
        if (title_topic_matched and coverage >= 0.4) or (len(matched_words) >= 2 and coverage >= 0.5):
            score = len(matched_words) + (2 * len(title_topic_matched))
            matched_nodes.append((score, path, doc))
            visited_paths.add(os.path.abspath(path))

    # Sort matches by score descending
    matched_nodes.sort(key=lambda x: x[0], reverse=True)

    # 1. Filter root matches: Keep #1 highest-scoring note, and only include a 2nd if score >= 0.75 * top_score (max 2 primary notes)
    primary_matches = []
    if matched_nodes:
        top_score = matched_nodes[0][0]
        primary_matches.append(matched_nodes[0])
        if len(matched_nodes) > 1 and matched_nodes[1][0] >= 0.75 * top_score:
            primary_matches.append(matched_nodes[1])

    results = []
    # Collect primary matches
    for score, path, doc in primary_matches:
        if len(results) >= 3:
            break
        meta = doc["metadata"]
        norm_path = os.path.relpath(path, base_dir).replace("\\", "/")
        created_dt = meta.get("created")
        year = created_dt.year if hasattr(created_dt, "year") else 2026
        results.append({
            "tier": "OKF",
            "source_type": "okf_graph",
            "title": meta.get("title", "Untitled Note"),
            "path": norm_path,
            "url": None,
            "authors": None,
            "year": year,
            "venue": meta.get("source") or "ARIA Core Knowledge Base",
            "snippet": doc.get("content", ""),
            "node_path": norm_path,
            "source": meta.get("source") or os.path.basename(path),
            "doi": None,
            "arxiv_id": None,
            "is_retracted": False,
            "confidence": meta.get("confidence", "draft"),
            "review_status": "draft" if meta.get("confidence") == "draft" else "verified",
            "content": doc.get("content", ""),
            "topic": meta.get("topic", []),
            "score": score,
            "is_graph_traversal": False
        })

        # 2. Graph Traversal: Follow 'related' links (only if title or topic shares at least 1 word with query_words, cap at 3 total)
        if max_depth > 0 and len(results) < 3:
            parent_dir = os.path.dirname(path)
            for rel in meta.get("related", []):
                if len(results) >= 3:
                    break
                rel_path = os.path.abspath(os.path.join(parent_dir, rel))
                if os.path.exists(rel_path) and rel_path not in visited_paths:
                    visited_paths.add(rel_path)
                    try:
                        rel_doc = parse_okf_file(rel_path)
                        rel_meta = rel_doc["metadata"]

                        rel_title_topic = (rel_meta.get("title", "") + " " + " ".join(rel_meta.get("topic", []))).lower()
                        rel_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", rel_title_topic))
                        if not rel_words.intersection(query_words):
                            continue

                        rel_norm_path = os.path.relpath(rel_path, base_dir).replace("\\", "/")
                        rel_created = rel_meta.get("created")
                        rel_year = rel_created.year if hasattr(rel_created, "year") else 2026
                        results.append({
                            "tier": "OKF",
                            "source_type": "okf_graph",
                            "title": rel_meta.get("title", os.path.basename(rel_path)),
                            "path": rel_norm_path,
                            "url": None,
                            "authors": None,
                            "year": rel_year,
                            "venue": rel_meta.get("source") or f"Linked via {meta.get('title')}",
                            "snippet": rel_doc.get("content", ""),
                            "node_path": rel_norm_path,
                            "source": f"Linked via {meta.get('title')}",
                            "doi": None,
                            "arxiv_id": None,
                            "is_retracted": False,
                            "confidence": rel_meta.get("confidence", "draft"),
                            "review_status": "draft" if rel_meta.get("confidence") == "draft" else "verified",
                            "content": rel_doc.get("content", ""),
                            "topic": rel_meta.get("topic", []),
                            "is_graph_traversal": True
                        })
                    except Exception:
                        pass

    return results[:3]

