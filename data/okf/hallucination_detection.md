---
id: note-audit-07
type: method
topic:
  - hallucination detection
  - claim verification
  - fact checking
  - automated auditing
title: Automated Claim Verification and Sentence-Level Hallucination Auditing
created: 2026-10-08T09:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Verification & Safety Engine"
related:
  - nli_entailment_auditing.md
  - calibrated_uncertainty.md
  - rag_architectures.md
owner: personal
confidence: verified
---

Automated hallucination detection in LLM synthesis transforms free-form natural language generation into an auditable, deterministic verification workflow. Rather than evaluating generated text holistically, modern fact-checking engines decompose output answers into discrete atomic factual propositions and verify each claim against cited evidence passages.

The Four-Stage Claim Verification Pipeline:
1. Proposition Extraction: Complex generated paragraphs are parsed into standalone claim units. Compound sentences containing relative clauses, conjunctions, and parenthetical modifiers are split into minimal declarative sentences asserting a single semantic predicate. Non-claim lines (such as section headings, markdown table delimiters, greeting formulas, and colon-terminated introductions) are strictly filtered out to prevent false-negative audit failures.
2. Citation Mapping and Scope Alignment: Each extracted claim is aligned with its corresponding citation markers (e.g., `[[c:N]]`). Claims lacking explicit citations receive an automatic `uncited` flag. The engine verifies that cited source identifiers map directly to loaded passage buffers, eliminating ghost citations or fabricated metadata references.
3. Two-Fold Verification Gating:
   - Verbatim Substring Proof: An LLM fact-checking judge identifies a compact verbatim quote (typically $\le 20$ words) from the cited source passage that directly proves the claim. The orchestrator verifies in deterministic code that this quote exists as an exact, case-normalized substring within the cited source body. Content-word overlap (coverage) between the claim and the quote is calculated: claims achieving $< 60\%$ coverage are flagged as `partially_supported`, while those $< 30\%$ coverage are deemed `unsupported`.
   - Entity and Number Validation: All extracted proper nouns, dates, scientific terms, and numerical quantities in the claim are cross-verified against the full text of the cited source. If the claim introduces a named entity or quantity absent from the source, it is flagged.
4. Auto-Repair and Sentence Deletion: Flagged claims trigger a constrained single-pass regeneration loop where the model is explicitly instructed to repair or delete failing sentences. If repaired claims continue to fail verification, the post-repair deletion engine trims the unsupported sentence spans from the final output and recomputes exact character highlight offsets for the UI.

References:
1. Thorne, J., et al. (2018). "FEVER: a large-scale dataset for Fact Extraction and VERification", In Proceedings of NAACL-HLT 2018, 809-819. [verified]
2. Min, S., et al. (2023). "FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation", In Proceedings of EMNLP 2023, 12076-12100. [verified]
3. Manakul, P., et al. (2023). "SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models", In Proceedings of EMNLP 2023, 9004-9017. [verified]
