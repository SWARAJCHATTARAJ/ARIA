from __future__ import annotations

import logging
import os
from functools import lru_cache

from .core import Evidence

logger = logging.getLogger("aria.relevance")


@lru_cache(maxsize=1)
def _get_embedding_model():
    """Load and cache the sentence transformer model."""
    model_name = os.getenv("ARIA_RELEVANCE_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    try:
        from sentence_transformers import SentenceTransformer
        logger.info(f"Loading relevance embedding model: {model_name}")
        return SentenceTransformer(model_name)
    except Exception as e:
        logger.warning(f"Failed to load sentence-transformer model '{model_name}': {e}")
        return None


def _get_threshold() -> float:
    """Get the similarity threshold from environment variable."""
    try:
        return float(os.getenv("ARIA_RELEVANCE_THRESHOLD", "0.20"))
    except ValueError:
        return 0.20


def _get_max_evidence() -> int:
    """Get max evidence items to keep after filtering."""
    try:
        return int(os.getenv("ARIA_RELEVANCE_MAX_EVIDENCE", "30"))
    except ValueError:
        return 30


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    import math
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def filter_evidence_by_relevance(
    query: str,
    evidence: list[Evidence],
    threshold: float | None = None,
    max_evidence: int | None = None,
) -> list[Evidence]:
    """
    Filter evidence by semantic similarity to the query.
    
    Args:
        query: The original research question
        evidence: List of Evidence items to filter
        threshold: Cosine similarity threshold (default from ARIA_RELEVANCE_THRESHOLD env var, 0.35)
        max_evidence: Maximum number of evidence items to retain (default from ARIA_RELEVANCE_MAX_EVIDENCE env var, 20)
    
    Returns:
        Filtered list of Evidence items sorted by relevance (highest first)
    """
    if not query or not evidence:
        return evidence
    
    threshold = threshold if threshold is not None else _get_threshold()
    max_evidence = max_evidence if max_evidence is not None else _get_max_evidence()
    
    model = _get_embedding_model()
    if model is None:
        logger.warning("Relevance filter: embedding model unavailable, skipping filter")
        return evidence[:max_evidence]
    
    try:
        query_embedding = model.encode(query, convert_to_tensor=False, normalize_embeddings=True)
        
        scored_evidence = []
        for ev in evidence:
            text = f"{ev.title or ''}. {ev.summary or ''}".strip()
            if not text:
                scored_evidence.append((ev, 0.0))
                continue
            
            ev_embedding = model.encode(text, convert_to_tensor=False, normalize_embeddings=True)
            sim = _cosine_similarity(query_embedding.tolist(), ev_embedding.tolist())
            scored_evidence.append((ev, sim))
        
        scored_evidence.sort(key=lambda x: x[1], reverse=True)
        
        filtered = [ev for ev, sim in scored_evidence if sim >= threshold]
        filtered = filtered[:max_evidence]
        
        dropped = len(evidence) - len(filtered)
        if dropped > 0:
            logger.info(f"Relevance filter: dropped {dropped} evidence items below threshold {threshold:.2f} (kept {len(filtered)}/{len(evidence)})")
            for ev, sim in scored_evidence:
                if sim < threshold:
                    logger.debug(f"  Dropped (sim={sim:.3f}): {ev.title[:80]}")
        
        return filtered
    
    except Exception as e:
        logger.warning(f"Relevance filter failed: {e}, returning unfiltered evidence")
        return evidence[:max_evidence]


def compute_relevance_scores(query: str, evidence: list[Evidence]) -> list[float]:
    """
    Compute cosine similarity scores between query and each evidence item.
    
    Args:
        query: The original research question
        evidence: List of Evidence items to score
    
    Returns:
        List of similarity scores (0.0 to 1.0) in same order as evidence
    """
    if not query or not evidence:
        return [0.0] * len(evidence)
    
    model = _get_embedding_model()
    if model is None:
        return [0.0] * len(evidence)
    
    try:
        query_embedding = model.encode(query, convert_to_tensor=False, normalize_embeddings=True)
        
        scores = []
        for ev in evidence:
            text = f"{ev.title or ''}. {ev.summary or ''}".strip()
            if not text:
                scores.append(0.0)
                continue
            ev_embedding = model.encode(text, convert_to_tensor=False, normalize_embeddings=True)
            sim = _cosine_similarity(query_embedding.tolist(), ev_embedding.tolist())
            scores.append(sim)
        
        return scores
    
    except Exception as e:
        logger.warning(f"Relevance scoring failed: {e}")
        return [0.0] * len(evidence)