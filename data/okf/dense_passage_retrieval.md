---
id: note-dpr-05
type: method
topic:
  - dense passage retrieval
  - vector search
  - hnsw indexing
  - approximate nearest neighbors
title: Dense Passage Retrieval and Hierarchical Navigable Small World Indexing
created: 2026-10-07T11:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Vector Search Research"
related:
  - rag_architectures.md
  - cross_encoder_reranking.md
  - vector_quantization.md
  - hybrid_search_rrf.md
owner: personal
confidence: verified
---

Dense Passage Retrieval (DPR) maps textual documents and search queries into a continuous low-dimensional latent embedding space $\mathbb{R}^d$ ($d \in [384, 1536]$) using twin deep bi-encoder transformers. Unlike sparse lexical inverted indices (such as TF-IDF or BM25), dense retrieval captures deep semantic equivalence, synonyms, and conceptual intent.

Mathematical Framework of DPR:
Given question $q$ and passage $p$, dual encoders $E_Q$ and $E_P$ generate normalized dense representations $v_q = E_Q(q) / \|E_Q(q)\|$ and $v_p = E_P(p) / \|E_P(p)\|$. Relevance scoring is computed via dot-product inner product:
$$s(q, p) = \langle v_q, v_p \rangle$$
During training, the encoders optimize negative log-likelihood of the positive passage over in-batch negatives and hard lexical BM25 negatives using contrastive InfoNCE loss:
$$\mathcal{L} = -\log \frac{\exp(s(q, p^+) / \tau)}{\exp(s(q, p^+) / \tau) + \sum_{j} \exp(s(q, p_j^-) / \tau)}$$

Hierarchical Navigable Small World (HNSW) Indexing:
Brute-force exact k-nearest neighbor (k-NN) search incurs linear complexity $O(N \cdot d)$, which is computationally prohibitive over millions of passage vectors. HNSW solves this by constructing a multi-layer geometric graph structure:
1. Multi-Layer Hierarchy: Lower layers contain dense graphs with all $N$ data vectors, while upper layers form exponentially sparser skip-lists with probability $p = 1 / \ln(M)$.
2. Greedy Routing: Query search begins at the top layer, greedily traversing neighbor edges toward the vector maximizing cosine similarity until reaching a local minimum, then dropping to the next layer to refine search candidates.
3. Search Complexity: HNSW achieves sub-linear logarithmic search time $O(\log N)$ with empirical recall $> 95\%$, governed by graph construction parameters $M$ (maximum outgoing connections per node, typically 16–64) and `efConstruction` / `efSearch` (size of the dynamic candidate priority queue).

Tradeoffs and Limitations:
While HNSW provides microsecond query latency, it demands substantial RAM ($1.5 \times$ to $2.5 \times$ raw vector size to store adjacency matrices). Furthermore, bi-encoders lose token-level interaction, leading to false-positive retrieval when queries require exact entity matching or rare alphanumeric strings.

References:
1. Karpukhin, V., et al. (2020). "Dense Passage Retrieval for Open-Domain Question Answering", In Proceedings of EMNLP 2020, 6769-6781. [verified]
2. Malkov, Y. A., & Yashunin, D. A. (2018). "Efficient and robust approximate nearest neighbor search using Hierarchical Navigable Small World graphs", IEEE Transactions on Pattern Analysis and Machine Intelligence, 42(4), 824-836. [verified]
3. Johnson, J., Douze, M., & Jégou, H. (2019). "Billion-scale similarity search with GPUs", IEEE Transactions on Big Data, 7(3), 535-547. [verified]
