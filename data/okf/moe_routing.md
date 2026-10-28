---
id: note-moe-13
type: method
topic:
  - mixture of experts
  - moe routing
  - conditional computation
  - sparse models
title: Sparse Mixture of Experts Architecture and Load-Balancing Routing
created: 2026-10-11T10:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Neural Architecture Research"
related:
  - transformer_flashattention.md
  - speculative_decoding.md
owner: personal
confidence: verified
---

Sparse Mixture of Experts (MoE) decouples parameter count from computational cost by substituting standard dense feed-forward networks (FFN) with a collection of $E$ independent expert sub-networks, activating only a small subset of $k$ experts ($k \ll E$, typically top-1 or top-2) per input token. This achieves the capacity of trillion-parameter models while maintaining the inference compute budget of a much smaller dense model.

Gating and Routing Formulation:
For an input token representation $x \in \mathbb{R}^d$, the routing gate computes logits across all $E$ experts:
$$H(x) = W_g x + \epsilon, \quad \epsilon \sim \mathcal{N}(0, \text{Softplus}(W_{\text{noise}} x))$$
The top-$k$ gating operator sets unselected expert logits to $-\infty$ prior to softmax normalization:
$$G(x)_i = \begin{cases} \frac{\exp(H(x)_i)}{\sum_{j \in \text{Top-k}} \exp(H(x)_j)} & \text{if } H(x)_i \in \text{Top-k}(H(x), k) \\ 0 & \text{otherwise} \end{cases}$$
The combined block output is computed as the weighted sum of expert activations:
$$y = \sum_{i=1}^E G(x)_i \cdot \text{Expert}_i(x)$$

Routing Collapse and Auxiliary Load-Balancing Loss:
Without intervention, gradient updates cause "expert collapse," where a handful of early-performing experts receive all token traffic while remaining experts receive zero gradients. To ensure uniform load distribution across all available accelerators, an auxiliary load-balancing loss $\mathcal{L}_{\text{balance}}$ is added during training:
$$\mathcal{L}_{\text{balance}} = \alpha \cdot E \sum_{i=1}^E m_i \cdot P_i$$
where $m_i$ is the fraction of tokens dispatched to expert $i$, $P_i$ is the average routing probability allocated to expert $i$ across the batch, and $\alpha$ is a scaling hyperparameter (typically $0.01$). Additionally, expert capacity factors limit the maximum buffer size per expert; overflow tokens bypass expert computation via residual connections to avoid memory bottlenecks.

References:
1. Shazeer, N., et al. (2017). "Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer", In Proceedings of ICLR 2017. [verified]
2. Fedus, W., Zoph, B., & Shazeer, N. (2022). "Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity", Journal of Machine Learning Research, 23(120), 1-39. [verified]
3. Lepikhin, D., et al. (2021). "GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding", In Proceedings of ICLR 2021. [verified]
