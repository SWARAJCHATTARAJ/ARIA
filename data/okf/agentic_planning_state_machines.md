---
id: note-agent-14
type: method
topic:
  - agentic planning
  - react
  - tree of thoughts
  - state machines
  - langgraph
title: Agentic Planning Paradigms and Graph-Based State Machine Orchestration
created: 2026-10-11T14:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Agentic Reasoning Research"
related:
  - autonomous_systems.md
  - multi_agent_consensus.md
  - markov_decision_processes.md
owner: personal
confidence: verified
---

Autonomous reasoning agents extend standard generative language models by interleaving cognitive reflection, structured task decomposition, environmental tool interactions, and dynamic state management.

Taxonomy of Agentic Planning Paradigms:
1. ReAct (Reasoning and Acting): Formulates task execution as a sequential trajectory of alternating thought generation, action selection, and observation incorporation: $\tau = (t_1, a_1, o_1, t_2, a_2, o_2, \dots)$. By generating internal verbal reasoning thoughts prior to dispatching concrete tool actions, the model tracks sub-goals, handles unexpected execution exceptions, and dynamically refines intermediate plans.
2. Tree-of-Thoughts (ToT): Extends linear Chain-of-Thought into a generalized tree search over intermediate reasoning steps. Each node represents a partial reasoning state, while edges represent candidate reasoning thoughts evaluated via heuristic lookahead scoring (breadth-first or depth-first search with backtracking). This allows agents to explore multiple deliberate hypotheses, identify unpromising execution paths early, and backtrack to viable alternatives.
3. Graph-Based State Machine Orchestration (LangGraph): Replaces fragile unstructured agent loops with deterministic, cycle-aware directed graphs $G = (V, E)$. Graph vertices $v \in V$ encapsulate distinct functional nodes (such as routing, retrieval, synthesis, claim auditing, and repair), operating over a shared immutable state schema $S$. Graph edges $e \in E$ define conditional routing transitions evaluated on state properties (such as factual confidence thresholds or detected contradictions).

Failure Modes in Complex Agent Workflows:
Complex multi-agent graphs frequently encounter failure modes including: infinite tool invocation loops (caused by ambiguous termination conditions), state mutation races (uncoordinated concurrent updates to shared memory), and goal drift (gradual divergence from the original user objective over lengthy multi-hop reasoning chains). Robust architectures enforce strict loop counters, maximum wall-clock timeouts, deterministic JSON schema output contracts, and persistent checkpointed memory snapshots for state recovery.

References:
1. Yao, S., et al. (2022). "ReAct: Synergizing Reasoning and Acting in Language Models", In Proceedings of ICLR 2023. [verified]
2. Yao, S., et al. (2023). "Tree of Thoughts: Deliberate Problem Solving with Large Language Models", Advances in Neural Information Processing Systems (NeurIPS 2023), 36, 11809-11822. [verified]
3. Shinn, N., et al. (2023). "Reflexion: Language Agents with Verbal Reinforcement Learning", Advances in Neural Information Processing Systems (NeurIPS 2023), 36, 8634-8652. [verified]
