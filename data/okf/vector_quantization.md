---
id: note-vq-19
type: method
topic:
  - vector quantization
  - product quantization
  - scalar quantization
  - approximate nearest neighbors
title: "Vector Quantization: Scalar, Product, and Binary Quantization Mechanics"
created: 2026-10-14T09:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Vector Search Research"
related:
  - dense_passage_retrieval.md
  - hybrid_search_rrf.md
owner: personal
confidence: verified
---

High-dimensional vector representations in dense retrieval systems (such as 768-dimensional or 1536-dimensional embeddings) require substantial memory. A corpus of 100 million 768-dimensional float32 vectors consumes over 300 GB of pure VRAM/RAM. Vector quantization compresses high-dimensional floating-point vectors into compact discrete codes while preserving vector similarity distances.

Compression Paradigms and Mathematical Formulations:
1. Scalar Quantization (SQ): Compresses each vector dimension independently. In 8-bit Scalar Quantization (SQ8), each 32-bit floating-point coordinate $x_i$ is mapped into an 8-bit unsigned integer $q_i \in [0, 255]$:
$$q_i = \text{round}\left( \frac{x_i - x_{\min, i}}{x_{\max, i} - x_{\min, i}} \times 255 \right)$$
SQ8 reduces memory by $4\times$ (from 32 bits to 8 bits per component) with less than 1% degradation in recall, utilizing SIMD integer instructions (AVX-512, NEON) for high-speed inner product evaluation.
2. Product Quantization (PQ): Formulated by Jégou et al. (2011), PQ decomposes the original $D$-dimensional vector space into an orthogonal Cartesian product of $M$ low-dimensional sub-spaces of dimension $d^* = D / M$:
$$\mathbb{R}^D = \mathbb{R}^{d^*} \times \dots \times \mathbb{R}^{d^*}$$
For each sub-space, $k$-means clustering trains a codebook of $K$ centroids (typically $K = 256$, fitting into 1 byte). A vector is compressed by projecting each sub-vector to its nearest centroid index, reducing a 768-dimensional vector into an $M$-byte code (e.g., $M = 64$ bytes, achieving a $48\times$ compression ratio). During query search, Asymmetric Distance Computation (ADC) pre-computes lookup tables between the uncompressed query vector and the codebook centroids, evaluating distance as a sum of table lookups in $O(M)$ time without decompressing vectors.
3. Binary Quantization (BQ / 1-bit): Maps positive coordinates to 1 and non-positive to 0: $b_i = \text{sign}(x_i)$. Similarity reduces to Hamming distance computed via hardware `XOR` and `POPCNT` bit-level instructions, yielding up to a $32\times$ memory reduction and $10\times$ search speedup over raw float32 vectors.

References:
1. Jégou, H., Douze, M., & Schmid, C. (2011). "Product Quantization for Nearest Neighbor Search", IEEE Transactions on Pattern Analysis and Machine Intelligence, 33(1), 117-128. [verified]
2. Gray, R. M. (1984). "Vector quantization", IEEE ASSP Magazine, 1(2), 4-29. [verified]
3. Ge, T., et al. (2013). "Optimized Product Quantization", IEEE Transactions on Pattern Analysis and Machine Intelligence, 36(4), 744-755. [verified]
