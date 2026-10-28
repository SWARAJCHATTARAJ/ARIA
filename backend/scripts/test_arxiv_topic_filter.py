import re
import sys

# STOP_WORDS from backend/utils/academic_search.py
STOP_WORDS = {
    "what", "when", "where", "which", "while", "who", "whom", "whose", "why", "how",
    "that", "this", "these", "those", "with", "from", "about", "into", "through",
    "during", "before", "after", "above", "below", "have", "has", "had", "been",
    "were", "their", "there", "they", "them", "some", "such", "than", "then",
    "more", "most", "other", "the", "and", "for", "are", "can", "all", "any",
    "was", "will"
}

def check_paper_topic_filter(query: str, paper_title: str, paper_abstract: str):
    q_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", query.lower())) - STOP_WORDS
    paper_tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", (paper_title + " " + paper_abstract).lower()))
    overlap = q_tokens.intersection(paper_tokens)
    kept = len(overlap) >= 2
    return {
        "query": query,
        "query_content_tokens": sorted(list(q_tokens)),
        "paper_title": paper_title,
        "overlap_count": len(overlap),
        "overlap_tokens": sorted(list(overlap)),
        "action": "KEPT" if kept else "DROPPED (less than 2 distinct content words)"
    }

if __name__ == "__main__":
    crispr_query = "What are the off-target mitigation strategies for CRISPR gene editing?"
    irrelevant_title = "Interpretable neural architecture search and transfer learning"
    irrelevant_abstract = (
        "Neural architecture search (NAS) has automated the design of deep neural networks "
        "for computer vision and speech recognition. In this work, we propose an interpretable "
        "search space coupled with transfer learning representations across downstream tasks."
    )
    
    res = check_paper_topic_filter(crispr_query, irrelevant_title, irrelevant_abstract)
    print("=" * 80)
    print("TEST: arXiv Topic Filter on CRISPR Question")
    print("=" * 80)
    print(f"Query:                 {res['query']}")
    print(f"Content Words (>=3):   {res['query_content_tokens']}")
    print(f"Paper Title:           {res['paper_title']}")
    print(f"Matched Words:         {res['overlap_tokens']} (Count: {res['overlap_count']})")
    print(f"Filter Decision:       {res['action']}")
    print("=" * 80)
    
    # Also test a relevant paper
    relevant_title = "Engineered Cas9 nucleases for high-fidelity genome editing and off-target mitigation"
    relevant_abstract = "High-fidelity Cas9 variants reduce off-target cleavage while maintaining robust on-target editing."
    res_rel = check_paper_topic_filter(crispr_query, relevant_title, relevant_abstract)
    print("\nControl (Relevant Paper):")
    print(f"Paper Title:           {res_rel['paper_title']}")
    print(f"Matched Words:         {res_rel['overlap_tokens']} (Count: {res_rel['overlap_count']})")
    print(f"Filter Decision:       {res_rel['action']}")
    print("=" * 80)
