---
id: note-lora-11
type: method
topic:
  - lora
  - qlora
  - parameter-efficient fine-tuning
  - low-rank adaptation
title: LoRA and QLoRA Parameter-Efficient Fine-Tuning Architectures
created: 2026-10-10T09:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Neural Architecture Research"
related:
  - transformer_flashattention.md
  - dpo_preference_optimization.md
owner: personal
confidence: verified
---

Full fine-tuning of modern foundation models requires updating and storing gradients, optimizer states (such as Adam momentum and variance), and weight copies for tens to hundreds of billions of parameters. Parameter-Efficient Fine-Tuning (PEFT) freezes the pre-trained base model weights and trains a minimal subset of adapter parameters, drastically reducing memory consumption while maintaining competitive performance.

Low-Rank Adaptation (LoRA) Mechanics:
Hu et al. (2021) demonstrated that the weight updates $\Delta W$ during domain adaptation possess a low "intrinsic dimension". For a frozen linear weight matrix $W_0 \in \mathbb{R}^{d \times k}$, LoRA decomposes the weight update into two low-rank matrices $B \in \mathbb{R}^{d \times r}$ and $A \in \mathbb{R}^{r \times k}$, with rank $r \ll \min(d, k)$ (typically $r \in [4, 64]$):
$$h = W_0 x + \Delta W x = W_0 x + \frac{\alpha}{r} B A x$$
Matrix $A$ is initialized from a Gaussian distribution $\mathcal{N}(0, \sigma^2)$, while $B$ is initialized to zero, ensuring $\Delta W = 0$ at the start of training. The constant scaling factor $\alpha$ stabilizes hyperparameters across varying choices of rank $r$. During inference, $B A$ can be directly folded into $W_0$, introducing zero latency overhead.

Quantized Low-Rank Adaptation (QLoRA):
Dettmers et al. (2023) introduced QLoRA, reducing fine-tuning memory footprint to a single consumer GPU without performance degradation through three algorithmic innovations:
1. 4-bit NormalFloat (NF4): An information-theoretically optimal quantile quantization data type for normally distributed neural network weights, yielding lower quantization error than 4-bit integer or floating-point formats.
2. Double Quantization (DQ): Quantizes the quantization constants themselves, compressing 32-bit fp32 scaling factors to 8-bit fp8 integers, saving 0.37 bits per parameter.
3. Paged Optimizers: Employs CUDA unified memory to manage page faults during peak memory spikes (such as long-sequence backward passes), paging optimizer states seamlessly between GPU VRAM and CPU system RAM.

References:
1. Hu, E. J., et al. (2021). "LoRA: Low-Rank Adaptation of Large Language Models", In Proceedings of ICLR 2022. [verified]
2. Dettmers, T., et al. (2023). "QLoRA: Efficient Finetuning of Quantized LLMs", Advances in Neural Information Processing Systems (NeurIPS 2023), 36, 10088-10115. [verified]
3. Aghajanyan, A., et al. (2021). "Intrinsic Dimensionality Explains the Effectiveness of Language Model Fine-Tuning", In Proceedings of ACL 2021, 7319-7328. [verified]
