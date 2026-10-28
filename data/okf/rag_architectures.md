---
id: note-rag-04
type: definition
topic:
  - retrieval augmented generation
  - rag architectures
  - query rewriting
  - context compression
title: Modular Retrieval-Augmented Generation and Context Compression
created: 2026-10-06T10:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Information Retrieval Systems"
related:
  - dense_passage_retrieval.md
  - cross_encoder_reranking.md
  - hybrid_search_rrf.md
  - hallucination_detection.md
owner: personal
confidence: verified
---

Retrieval-Augmented Generation (RAG) is an architectural framework that enhances Large Language Models (LLMs) by dynamically retrieving authoritative external knowledge chunks to ground generative inference, mitigating parametric hallucinations and enabling continuous domain adaptation without retraining.

Evolution of RAG Paradigms:
1. Naive RAG: Follows an unconditioned single-turn pipeline: index documents via static chunking, embed with a frozen bi-encoder, execute top-$k$ vector similarity lookup, and concatenate retrieved raw snippets directly into the prompt. Naive RAG degrades rapidly in production due to low precision (retrieving irrelevant chunks), low recall (missing vital context), and prompt context rot where the generator suffers from "lost in the middle" attention attenuation over long token contexts.
2. Advanced & Modular RAG: Implements pre-retrieval, retrieval, post-retrieval, and routing orchestration. Pre-retrieval modules apply query expansion (generating hypothetical document embeddings via HyDE or decomposing complex multi-hop queries into sub-queries via Tree-of-Thought planning). Post-retrieval applies two critical stages: cross-encoder reranking to reorder chunks by cross-attentive relevance, and context compression (selective semantic pruning or extractive summarization) to maximize information density per prompt token.
3. Iterative and Adaptive Routing: Advanced architectures dynamically evaluate retrieval necessity using learned gating routers or confidence thresholds. Self-reflective RAG frameworks (such as Self-RAG) evaluate retrieved chunks with special critique tokens evaluating relevance, grounding fidelity, and utility. When external retrieval is detected as unhelpful or contradictory, adaptive fallback cascades revert to personal knowledge stores or trigger alternative search paradigms.

Failure Modes and Mitigations:
Common failure modes include retrieval noise poisoning (where irrelevant context overrides parametric truth), temporal conflict (outdated documents conflicting with recent facts), and sybil repetition (near-duplicate snippets consuming context limits). Mitigation requires strict deduplication by document checksum or cosine similarity clustering, aggressive chunk metadata filtering, and strict quote-grounded claim auditing prior to client presentation.

References:
1. Lewis, P., et al. (2020). "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", Advances in Neural Information Processing Systems (NeurIPS 2020), 33, 9459-9474. [verified]
2. Gao, Y., et al. (2023). "Modular RAG: Transforming RAG Systems into LEGO-like Configurable Pipelines", arXiv preprint arXiv:2312.10997. [verified]
3. Asai, A., et al. (2023). "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection", In Proceedings of ICLR 2024. [verified]
4. Liu, N. F., et al. (2024). "Lost in the Middle: How Language Models Use Long Contexts", Transactions of the Association for Computational Linguistics, 12, 157-173. [verified]
