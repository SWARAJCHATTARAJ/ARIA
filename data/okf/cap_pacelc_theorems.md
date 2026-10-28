---
id: note-cap-18
type: definition
topic:
  - cap theorem
  - pacelc theorem
  - consistency models
  - distributed storage
title: The CAP Theorem, PACELC Extension, and Distributed Consistency Models
created: 2026-10-13T14:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Distributed Systems Research"
related:
  - raft_paxos_consensus.md
  - multi_agent_consensus.md
owner: personal
confidence: verified
---

Modern distributed database architectures are governed by fundamental trade-offs between consistency, availability, fault tolerance, and query latency during normal operations and network partitions.

The CAP Theorem:
Conjectured by Eric Brewer (2000) and formally proven by Gilbert and Lynch (2002), the CAP theorem states that a distributed read-write register cannot simultaneously achieve all three properties in an asynchronous network:
1. Consistency (Linearizability): Every read operation returns the value of the most recent write or an error.
2. Availability: Every non-failing node must return a non-error response for every request received (without guaranteeing it contains the latest write).
3. Partition Tolerance: The system continues to operate despite an arbitrary number of messages being dropped or delayed by network boundaries.
Because real-world physical networks inevitably experience partitions (fiber cuts, hardware failures, routing loops), distributed architectures must be designed for partition tolerance ($P$), forcing an architectural choice between Consistency ($CP$) or Availability ($AP$) during a partition event.

The PACELC Theorem:
Daniel Abadi (2012) expanded CAP, arguing that CAP only characterizes system behavior when partitions occur, which represent exceptional operational events. The PACELC theorem models the complete state space:
$$\text{If Partition }(P) \implies \text{Tradeoff between Availability }(A) \text{ and Consistency }(C);$$
$$\text{Else }(E) \implies \text{Tradeoff between Latency }(L) \text{ and Consistency }(C).$$
Systems are classified into four distinct operational quadrants:
- PC/EC (e.g., Google Spanner, CockroachDB): Chooses Consistency during partitions, and Consistency during normal operations (accepting multi-datacenter round-trip commit latency).
- PA/EL (e.g., Apache Cassandra, DynamoDB with eventual consistency): Chooses Availability during partitions, and Latency during normal operations (returning local replica reads without quorum roundtrips).
- PA/EC (e.g., MongoDB with majority write concern): Reverts to AP under partitions, but prioritizes consistency under normal conditions.

Linearizability vs. Eventual Consistency:
Linearizability establishes global real-time ordering across all read-write operations, while eventual consistency guarantees only that replicas converge to an identical state if no further updates occur, trading immediate correctness for sub-millisecond local responses.

References:
1. Brewer, E. A. (2000). "Towards Robust Distributed Systems", In Proceedings of PODC 2000, 7. [verified]
2. Gilbert, S., & Lynch, N. (2002). "Brewer's conjecture and the feasibility of consistent, available, partition-tolerant web services", ACM SIGACT News, 33(2), 51-59. [verified]
3. Abadi, D. J. (2012). "Consistency Tradeoffs in Modern Distributed Database System Design: CAP is Only Part of the Story", Computer, 45(2), 37-42. [verified]
