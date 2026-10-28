---
id: note-calib-21
type: method
topic:
  - uncertainty quantification
  - conformal prediction
  - temperature scaling
  - model calibration
title: Calibrated Uncertainty Quantification and Conformal Prediction in Language Models
created: 2026-10-15T09:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Verification & Safety Engine"
related:
  - hallucination_detection.md
  - nli_entailment_auditing.md
owner: personal
confidence: verified
---

Deep neural networks and Large Language Models frequently exhibit overconfidence: outputting high probability values for factually incorrect predictions. High softmax probabilities do not equate to true posterior probabilities. Model calibration and uncertainty quantification align model confidence scores with real-world empirical correctness.

Formal Definition of Calibration:
A model predicting class $\hat{y}$ with estimated confidence $\hat{p} \in [0, 1]$ is perfectly calibrated if:
$$\mathbb{P}(\hat{y} = y \mid \hat{p} = p) = p, \quad \forall p \in [0, 1]$$
Calibration quality is evaluated via Expected Calibration Error (ECE), which partitions predictions into $M$ equally-spaced probability bins $B_m$ and measures the weighted absolute difference between bin accuracy and average bin confidence:
$$\text{ECE} = \sum_{m=1}^M \frac{|B_m|}{N} \left| \text{acc}(B_m) - \text{conf}(B_m) \right|$$

Post-Hoc Calibration Techniques:
1. Temperature Scaling: Guo et al. (2017) demonstrated that a single scalar parameter $T > 0$ applied to pre-activation logits $z$ restores calibration without altering argmax classification accuracy:
$$\hat{q}_i = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$$
Optimizing $T$ via negative log-likelihood on a held-out validation set softens overconfident probabilities ($T > 1$) across deep transformers.
2. Conformal Prediction: Provides distribution-free, finite-sample statistical guarantees. Given a user-specified error tolerance $\alpha \in (0, 1)$ (e.g., $\alpha = 0.05$ for $95\%$ coverage), conformal prediction constructs a prediction set $C(X)$ satisfying:
$$\mathbb{P}(Y \in C(X)) \ge 1 - \alpha$$
The method computes non-conformity scores $s_i = 1 - \hat{p}(y_i \mid x_i)$ on calibration data, selects quantile $\hat{q} = \text{Quantile}\left( \lceil (n+1)(1-\alpha) \rceil / n \right)$, and includes all candidate classes satisfying $s(x, y) \le \hat{q}$.

Application to Research Assistants:
In scientific claim verification, calibrated uncertainty prevents false certainty. If a verification verdict falls below a calibrated support threshold, the system flags the claim as uncertain or abstains from answering, directing researchers to consult primary literature.

References:
1. Guo, C., et al. (2017). "On Calibration of Modern Neural Networks", In Proceedings of ICML 2017, 1321-1330. [verified]
2. Angelopoulos, A. N., & Bates, S. (2021). "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification", arXiv preprint arXiv:2107.07511. [verified]
3. Vovk, V., Gammerman, A., & Shafer, G. (2005). "Algorithmic Learning in a Random World", Springer Science & Business Media. [verified]
