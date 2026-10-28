---
id: note-spec-10
type: method
topic:
  - speculative decoding
  - kv-cache optimization
  - llm inference
  - latency reduction
title: Speculative Decoding and Key-Value Cache Memory Optimization
created: 2026-10-09T14:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Neural Architecture Research"
related:
  - transformer_flashattention.md
  - moe_routing.md
owner: personal
confidence: verified
---

Autoregressive inference in Large Language Models (LLMs) is fundamentally memory-bandwidth bound during generation. Generating a sequence of length $T$ requires $T$ consecutive forward passes, each reloading billions of model weights from GPU memory (HBM) into processor cores to compute a single token, resulting in low arithmetic intensity and high latency.

Speculative Decoding Framework:
Introduced independently by Leviathan et al. (2023) and Chen et al. (2023), speculative decoding accelerates autoregressive generation without altering the target model's output probability distribution:
1. Speculative Drafting: A compact, high-speed draft model $M_q$ (e.g., a 1B–7B parameter model) autoregressively drafts a short burst of $\gamma$ candidate tokens $(x_1, \dots, x_\gamma)$ in sequence.
2. Parallel Target Verification: The large target model $M_p$ (e.g., 70B–120B parameter model) receives the prompt extended by the $\gamma$ speculative tokens and executes a single forward pass over all candidates concurrently.
3. Modified Rejection Sampling: For each candidate token $x_i$, the verifier calculates acceptance probability:
$$\alpha_i = \min\left(1, \frac{p(x_i \mid x_{<i})}{q(x_i \mid x_{<i})}\right)$$
A uniform sample $r \sim U[0, 1]$ decides acceptance. If $r \le \alpha_i$, $x_i$ is accepted. If rejected at token $k \le \gamma$, all subsequent tokens are discarded, and a residual token is sampled from the rectified distribution $\max(0, p(x) - q(x)) / \sum_{x} \max(0, p(x) - q(x))$. This guarantees that the final output distribution mathematically matches target model sampling identically.

Key-Value (KV) Cache Optimization:
Autoregressive decoding maintains a Key-Value (KV) cache storing past token representations to avoid recomputing self-attention projections. At batch size $B$, sequence length $L$, layers $N$, and hidden dimension $D$, KV cache memory scales as $O(2 \cdot B \cdot L \cdot N \cdot D)$. Techniques such as Multi-Query Attention (MQA, sharing one KV head across all query heads), Grouped-Query Attention (GQA, grouping query heads per KV head), and PagedAttention (allocating non-contiguous physical memory blocks to eliminate fragmentation) reduce KV memory footprint by up to 80%, enabling higher batch concurrency and longer sequence contexts.

References:
1. Leviathan, Y., Kalman, M., & Matias, Y. (2023). "Fast Inference from Transformers via Speculative Decoding", In Proceedings of ICML 2023, 19274-19286. [verified]
2. Chen, C., et al. (2023). "Accelerating Large Language Model Decoding with Speculative Sampling", arXiv preprint arXiv:2302.01318. [verified]
3. Kwon, W., et al. (2023). "Efficient Memory Management for Large Language Model Serving with PagedAttention", In Proceedings of SOSP 2023, 611-626. [verified]
4. Ainslie, J., et al. (2023). "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints", In Proceedings of EMNLP 2023, 4895-4901. [verified]
