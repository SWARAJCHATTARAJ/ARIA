---
id: note-nli-08
type: method
topic:
  - natural language inference
  - entailment auditing
  - deberta
  - premise hypothesis verification
title: Natural Language Inference and Entailment-Based Fact Verification
created: 2026-10-08T12:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Verification & Safety Engine"
related:
  - hallucination_detection.md
  - calibrated_uncertainty.md
owner: personal
confidence: verified
---

Natural Language Inference (NLI) provides a formal semantic foundation for automated fact auditing. Formulated as a directional three-class classification task, an NLI model evaluates a premise passage $P$ and a hypothesis claim $H$ to predict whether $H$ is logically entailed ($\text{Entailment}$), contradicted ($\text{Contradiction}$), or under-specified ($\text{Neutral}$) given the ground-truth truth value of $P$.

Mathematical Formulation and DeBERTa Architecture:
Given token sequences $P = (p_1, \dots, p_m)$ and $H = (h_1, \dots, h_n)$, the concatenated input $[\text{CLS}] \circ P \circ [\text{SEP}] \circ H \circ [\text{SEP}]$ is processed by a deep bidirectional transformer. State-of-the-art NLI verification relies on DeBERTa-v3 (Decoding-enhanced BERT with Disentangled Attention):
1. Disentangled Attention: Unlike standard transformers where content and positional vectors are summed into a single embedding, DeBERTa represents each token via separate content vectors $\{c_i\}$ and relative position vectors $\{r_{i-j}\}$. The self-attention matrix decomposes into four pairwise interaction terms:
$$A_{i,j} = c_i c_j^T + c_i r_{i-j}^T + r_{j-i} c_j^T + r_{i-j} r_{i-j}^T$$
This preserves structural word order and syntactic dependency even across cross-sentence premise-hypothesis boundaries.
2. Enhanced Masked Decoder (EMD): Incorporates absolute positions directly into decoding layers to resolve structural relative position ambiguities.
3. Probability Softmax and Calibration: The final classification head computes normalized probabilities:
$$p(\text{class} \mid P, H) = \text{softmax}(W \cdot h_{\text{CLS}} + b)$$
A claim is classified as supported if and only if $p(\text{Entailment}) \ge \tau_{\text{entail}}$ (typically $0.80$) and $p(\text{Contradiction}) \le \tau_{\text{contra}}$ (typically $0.05$).

Application to Retrieval Audit and Contradiction Detection:
In grounded multi-tier retrieval (such as OKF vs. LIVE search), NLI operates as a secondary cross-checking tier. If an external web source entails a proposition while a verified internal document contradicts it, the contradiction probability triggers an explicit factual conflict event, alerting the user to discrepancies between personal notes and open web claims.

References:
1. Williams, A., Nangia, N., & Bowman, S. R. (2018). "A Broad-Coverage Challenge Corpus for Sentence Understanding through Inference", In Proceedings of NAACL-HLT 2018, 1112-1122. [verified]
2. He, P., et al. (2021). "DeBERTa: Decoding-enhanced BERT with Disentangled Attention", In Proceedings of ICLR 2021. [verified]
3. He, P., Gao, J., & Chen, W. (2023). "DeBERTaV3: Improving DeBERTa using ELECTRA-Style Pre-Training with Gradient-Disentangled Embedding Sharing", In Proceedings of ICLR 2023. [verified]
4. Honovich, O., et al. (2022). "TRUE: Re-evaluating Factual Consistency Evaluation Approaches of Abstractive Summarization", In Proceedings of ACL 2022, 3905-3920. [verified]
