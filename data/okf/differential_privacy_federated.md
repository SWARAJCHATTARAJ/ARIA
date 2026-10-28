---
id: note-priv-24
type: method
topic:
  - differential privacy
  - federated learning
  - dp-sgd
  - secure multi-party computation
title: Differential Privacy Guarantees and Federated Learning Orchestration
created: 2026-10-16T09:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Security & Privacy Engineering"
related:
  - multi_agent_consensus.md
  - prompt_injection_guardrails.md
owner: personal
confidence: verified
---

In decentralized intelligence architectures, aggregating private user telemetry or collaborative research notes across edge devices presents acute privacy risks: model inversion attacks, membership inference, and training data reconstruction. Differential Privacy (DP) combined with Federated Learning (FL) establishes mathematically rigorous information-theoretic confidentiality boundaries.

Mathematical Definition of Differential Privacy:
Introduced by Dwork et al. (2006), a randomized algorithm $\mathcal{M}$ satisfies $(\epsilon, \delta)$-Differential Privacy if for all neighboring datasets $D, D'$ differing by at most a single individual record, and for all measurement subsets $S \subseteq \text{Range}(\mathcal{M})$:
$$\mathbb{P}(\mathcal{M}(D) \in S) \le e^\epsilon \cdot \mathbb{P}(\mathcal{M}(D') \in S) + \delta$$
Here, $\epsilon > 0$ defines the strict privacy loss budget (smaller $\epsilon$ enforces stronger privacy guarantees), while $\delta \ge 0$ represents the negligible failure probability bound (typically $\delta \ll 1 / |D|$).

Differentially Private SGD (DP-SGD):
Abadi et al. (2016) developed DP-SGD to train deep neural networks under formal $(\epsilon, \delta)$-DP bounds via two core algorithmic modifications:
1. Per-Sample Gradient Clipping: For each sample gradient $g_i(\theta) = \nabla_\theta \ell(\theta, x_i)$, the $L_2$ norm is bounded by clipping threshold $C$:
$$\bar{g}_i(\theta) = g_i(\theta) / \max\left(1, \frac{\|g_i(\theta)\|_2}{C}\right)$$
This bounds the global sensitivity $\Delta_2 = C / B$.
2. Calibrated Gaussian Noise Injection: Isotropic Gaussian noise is added to the mini-batch sum:
$$\tilde{g} = \frac{1}{B} \left( \sum_{i=1}^B \bar{g}_i(\theta) + \mathcal{N}(0, \sigma^2 C^2 I) \right)$$
The Moments Accountant tracks privacy loss accumulation across training iterations, providing tighter composite bounds than standard composition theorems.

Federated Learning (FedAvg):
McMahan et al. (2017) formulated Federated Averaging (FedAvg), where $K$ distributed client nodes compute local SGD updates on decentralized private data, transmitting only parameter tensors $w_t^k$ to a central coordinator. The server aggregates updates via weighted averaging:
$$w_{t+1} = \sum_{k=1}^K \frac{n_k}{n} w_{t+1}^k$$
Coupling FedAvg with secure aggregation (SMPC) and DP-SGD ensures neither the central coordinator nor eavesdropping nodes can reconstruct raw client observations.

References:
1. Dwork, C., et al. (2006). "Our Data, Ourselves: Privacy Via Distributed Noise Generation", In Proceedings of EUROCRYPT 2006, 486-503. [verified]
2. Abadi, M., et al. (2016). "Deep Learning with Differential Privacy", In Proceedings of the 2016 ACM SIGSAC Conference on Computer and Communications Security (CCS '16), 308-318. [verified]
3. McMahan, B., et al. (2017). "Communication-Efficient Learning of Deep Networks from Decentralized Data", In Proceedings of AISTATS 2017, 1273-1282. [verified]
