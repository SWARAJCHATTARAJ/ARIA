---
id: note-raft-17
type: method
topic:
  - consensus
  - raft
  - paxos
  - distributed systems
title: Raft vs. Multi-Paxos Distributed Consensus Algorithms
created: 2026-10-13T10:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Distributed Systems Research"
related:
  - multi_agent_consensus.md
  - cap_pacelc_theorems.md
owner: personal
confidence: verified
---

Distributed consensus algorithms ensure that a cluster of interconnected machines maintains an identical, totally ordered sequence of state machine transitions despite network delays, packet loss, message reordering, and arbitrary server crashes (under non-Byzantine crash-fault models).

Multi-Paxos Mechanics and Complexity:
Formulated by Leslie Lamport (1998), Paxos achieves consensus over a sequence of log slots through two fundamental phases:
1. Phase 1 (Prepare / Promise): A proposer broadcasts `Prepare(n)` with proposal number $n$. Acceptors return `Promise` if $n$ exceeds any previously seen proposal number, returning the highest-numbered proposal accepted so far.
2. Phase 2 (Accept / Acknowledged): If a majority returns promises, the proposer issues `Accept(n, v)` with value $v$. Acceptors accept $(n, v)$ provided they have not promised to a higher proposal.
Multi-Paxos optimizes this by electing a stable leader, amortizing Phase 1 across multiple log entries and achieving consensus in a single round-trip (Phase 2 only). However, Multi-Paxos is notoriously difficult to understand and implement correctly due to complex corner cases during leader transitions and log hole reconciliation.

Raft Algorithm Decomposed:
Ongaro and Ousterhout (2014) designed Raft specifically for understandability and operational ergonomics by decomposing consensus into three independent subproblems:
1. Leader Election: Time is divided into discrete terms. When a follower's randomized election timer (150–300 ms) expires without receiving leader heartbeats, it transitions to Candidate, increments its term, votes for itself, and broadcasts `RequestVote`. A candidate receiving votes from a majority of nodes becomes Leader.
2. Log Replication: The leader accepts client commands, appends entries to its log, and sends `AppendEntries` RPCs. A log entry is committed once replicated across a majority of nodes.
3. Raft Safety Invariants:
   - Election Safety: At most one leader can be elected in a given term.
   - Leader Append-Only: A leader never overwrites or truncates its own log.
   - Leader Completeness: If an entry is committed in a given term, it will be present in the logs of the leaders for all higher-numbered terms. A candidate's log must be at least as up-to-date as the majority to win an election.

References:
1. Ongaro, D., & Ousterhout, J. (2014). "In Search of an Understandable Consensus Algorithm", In Proceedings of USENIX ATC '14, 305-319. [verified]
2. Lamport, L. (1998). "The Part-Time Parliament", ACM Transactions on Computer Systems, 16(2), 133-169. [verified]
3. Chandra, T. D., Griesemer, R., & Redstone, J. (2007). "Paxos Made Live - An Engineering Perspective", In Proceedings of PODC '07, 398-407. [verified]
