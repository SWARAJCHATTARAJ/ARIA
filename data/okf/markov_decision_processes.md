---
id: note-mdp-23
type: definition
topic:
  - markov decision processes
  - pomdp
  - reinforcement learning
  - dynamic programming
title: Markov Decision Processes, POMDPs, and the Bellman Optimality Equations
created: 2026-10-15T15:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Robotics & Systems Engineering"
related:
  - autonomous_systems.md
  - agentic_planning_state_machines.md
owner: personal
confidence: verified
---

Markov Decision Processes (MDPs) provide the formal mathematical framework for modeling decision-making in autonomous agents and reinforcement learning under stochastic environmental dynamics.

Mathematical Formulation of MDPs:
An MDP is formally defined by a 5-tuple $(S, A, P, R, \gamma)$:
- $S$: State space.
- $A$: Action space.
- $P(s' \mid s, a)$: Transition probability function mapping state-action pairs to distributions over successor states.
- $R(s, a, s')$: Reward function yielding scalar feedback.
- $\gamma \in [0, 1)$: Discount factor balancing immediate versus delayed rewards.
The Markov property posits that future states depend solely upon the current state and action:
$$\mathbb{P}(S_{t+1} = s_{t+1} \mid S_t = s_t, A_t = a_t, \dots, S_0 = s_0, A_0 = a_0) = \mathbb{P}(S_{t+1} = s_{t+1} \mid S_t = s_t, A_t = a_t)$$

The Bellman Equations and Dynamic Programming:
The value function $V^\pi(s)$ under policy $\pi$ satisfies the Bellman Expectation equation:
$$V^\pi(s) = \sum_{a \in A} \pi(a \mid s) \sum_{s' \in S} P(s' \mid s, a) \left[ R(s, a, s') + \gamma V^\pi(s') \right]$$
The optimal value function $V^*(s) = \max_\pi V^\pi(s)$ satisfies the non-linear Bellman Optimality Equation:
$$V^*(s) = \max_{a \in A} \sum_{s' \in S} P(s' \mid s, a) \left[ R(s, a, s') + \gamma V^*(s') \right]$$
Because the Bellman optimality operator forms a $\gamma$-contraction mapping under the infinity norm, Value Iteration and Policy Iteration are guaranteed to converge geometrically to the unique optimal policy $\pi^*$.

Partially Observable MDPs (POMDPs):
When sensory limitations, occlusion, or noise prevent the agent from directly observing the true environmental state, the problem generalizes to a POMDP $(S, A, P, R, \Omega, O, \gamma)$, introducing observation space $\Omega$ and observation probabilities $O(o \mid s', a)$. The agent maintains a belief state $b(s) = \mathbb{P}(S_t = s \mid h_t)$, updating beliefs recursively via Bayes' rule:
$$b'(s') = \frac{O(o \mid s', a) \sum_{s} P(s' \mid s, a) b(s)}{\sum_{s''} O(o \mid s'', a) \sum_{s} P(s'' \mid s, a) b(s)}$$
While exact POMDP solving is PSPACE-complete, approximate methods (point-based value iteration and Monte Carlo Tree Search) enable robust autonomous robot navigation.

References:
1. Bellman, R. (1957). "A Markovian Decision Process", Journal of Mathematics and Mechanics, 6(5), 679-684. [verified]
2. Sutton, R. S., & Barto, A. G. (2018). "Reinforcement Learning: An Introduction", Second Edition, MIT Press. [verified]
3. Kaelbling, L. P., Littman, M. L., & Cassandra, A. R. (1998). "Planning and acting in partially observable stochastic domains", Artificial Intelligence, 101(1-2), 99-134. [verified]
