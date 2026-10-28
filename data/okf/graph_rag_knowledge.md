---
id: note-grag-22
type: method
topic:
  - knowledge graphs
  - graph rag
  - entity extraction
  - community detection
title: Knowledge Graph Indexing and Community-Summarized GraphRAG
created: 2026-10-15T12:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Information Retrieval Systems"
related:
  - rag_architectures.md
  - hybrid_search_rrf.md
owner: personal
confidence: verified
---

Standard dense vector retrieval excels at local question answering ("What is X's primary finding?"), but fails on global, corpus-wide synthesis queries ("What are the overarching themes and conflicts across this entire literature collection?"). GraphRAG unifies structured Knowledge Graphs (KG) with generative language models to enable holistic, multi-hop reasoning over unstructured text corpora.

The GraphRAG Generation Pipeline:
1. Entity and Relationship Extraction: An LLM processes source document chunks to extract named entities (nodes $V$) along with directional relationships (edges $E$), attributes, and evidence claims. Extracted triples undergo entity resolution and deduplication to merge aliases into canonical nodes.
2. Hierarchical Community Detection: The resulting knowledge graph is partitioned into modular clusters using the Leiden community detection algorithm. The Leiden algorithm optimizes modularity while guaranteeing well-connected, non-empty sub-communities across multiple hierarchical levels:
$$Q = \frac{1}{2m} \sum_{i,j} \left( A_{ij} - \frac{k_i k_j}{2m} \right) \delta(c_i, c_j)$$
where $A_{ij}$ is edge weight, $k_i$ is degree, and $c_i$ is community assignment.
3. Community Summarization: For each detected community at each hierarchical level, an LLM synthesizes a dense, pre-computed community summary report capturing key entities, core themes, structural narratives, and unresolved controversies.
4. Global Query Execution via Map-Reduce: When answering a global synthesis question, the system queries community summaries in parallel (Map phase) to generate intermediate rating-weighted candidate responses, followed by a final synthesis pass (Reduce phase) that merges candidate summaries into an authoritative, structured overview with full entity lineage.

Advantages over Pure Vector Search:
GraphRAG avoids the "needle in a haystack" fragmentation problem of flat vector indices. By pre-aggregating high-level themes into community summaries, the system achieves complete conceptual coverage on broad exploratory queries without scanning millions of individual text chunks into prompt context.

References:
1. Edge, D., et al. (2024). "From Local to Global: A Graph RAG Approach to Query-Focused Summarization", arXiv preprint arXiv:2404.16130. [verified]
2. Traag, V. A., Waltman, L., & van Eck, N. J. (2019). "From Louvain to Leiden: guaranteeing well-connected communities", Scientific Reports, 9(1), 5233. [verified]
3. Hogan, A., et al. (2021). "Knowledge Graphs", ACM Computing Surveys, 54(4), 1-37. [verified]
