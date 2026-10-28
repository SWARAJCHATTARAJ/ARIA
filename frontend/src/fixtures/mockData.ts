export interface SSEEvent {
  event: string;
  [key: string]: any;
}

export interface MockFixture {
  id: string;
  query: string;
  label: string;
  events: SSEEvent[];
}

export const MOCK_FIXTURES: Record<string, MockFixture> = {
  "okf": {
    "id": "okf",
    "query": "What is the definition and taxonomy of autonomous systems in artificial intelligence?",
    "label": "OKF Resolvable: Autonomous Systems Taxonomy",
    "events": [
      {
            "event": "start",
            "thread_id": "479ea7d6-3b65-42b9-8f0c-80ed46afd5ab"
      },
      {
            "event": "route",
            "route_decision": "cascade"
      },
      {
            "event": "retrieve",
            "tiers": [
                  "OKF"
            ],
            "okf_node_paths": [
                  "autonomous_systems.md",
                  "multi_agent_consensus.md"
            ],
            "rag_scores": [],
            "sources": [
                  {
                        "source": "ARIA seed note (draft)",
                        "source_type": "okf_graph",
                        "tier": "OKF",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": null,
                        "published": null,
                        "cited": false
                  },
                  {
                        "source": "Linked via Taxonomy of Autonomous Systems and Operational Boundaries",
                        "source_type": "okf_graph",
                        "tier": "OKF",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": null,
                        "published": null,
                        "cited": false
                  }
            ]
      },
      {
            "event": "citation",
            "id": 0,
            "title": "Taxonomy of Autonomous Systems and Operational Boundaries",
            "path": "autonomous_systems.md",
            "url": null,
            "authors": null,
            "year": 2026,
            "venue": "ARIA seed note (draft)",
            "snippet": "An autonomous system is a computational or physical entity capable of perceiving its environment, formulating goal-directed plans, and executing actions over extended operational horizons without continuous human intervention.\n\nTaxonomy of Autonomy Levels (adapted from SAE J3016 and NIST ALFUS):\n- Level 0 (No Automation): System provides warnings or momentary intervention; human controls all execution.\n- Level 1 (Driver / Operator Assistance): Execution of either steering or acceleration/deceleration using environmental information.\n- Level 2 (Partial Automation): Simultaneous execution of multiple sub-tasks with human monitoring and immediate fallback readiness.\n- Level 3 (Conditional Automation): System handles all aspects of dynamic performance within an Operational Design Domain (ODD); human intervenes upon request.\n- Level 4 (High Automation): System sustains complete dynamic performance and automated fallback within defined ODD even if human fails to intervene.\n- Level 5 (Full Automation): Unconditional automated performance across all environmental and operational conditions manageable by human operators.\n\nArchitectural Models:\n1. Sense-Plan-Act (SPA): Classical hierarchical planning through centralized state representations.\n2. Subsumption Architecture: Layered reactive behaviors without centralized world models (Brooks, 1986).\n3. Hybrid Cognitive Architectures: Coupling fast reflex loops with asynchronous symbolic deliberation.\n\nReferences:\n1. SAE International (2021). \"Taxonomy and Definitions for Terms Related to Driving Automation Systems for On-Road Motor Vehicles\", Standard J3016_202104. [verified]\n2. Brooks, R. (1986). \"A robust layered control system for a mobile robot\", IEEE Journal on Robotics and Automation, 2(1), 14-23. [verified]\n3. Huang, H. M., et al. (2005). \"Autonomy Levels for Unmanned Systems (ALFUS) Framework Volume I: Terminology\", NIST Special Publication 1011. [verified]",
            "source_type": "okf_graph",
            "tier": "OKF",
            "doi": null,
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "draft",
            "cited": false,
            "rank": null,
            "published": null
      },
      {
            "event": "citation",
            "id": 1,
            "title": "Byzantine Fault Tolerant Consensus in Multi-Agent Reasoning",
            "path": "multi_agent_consensus.md",
            "url": null,
            "authors": null,
            "year": 2026,
            "venue": "ARIA seed note (draft)",
            "snippet": "Consensus in decentralized multi-agent systems requires establishing agreement on shared state variables despite message delays, network partitions, and adversarial or arbitrary (Byzantine) node failures.\n\nFoundational Protocols and Bounds:\n1. Byzantine Generals Problem: In synchronous systems with unauthenticated messages, consensus is impossible unless more than two-thirds of nodes are non-faulty: $n \\ge 3f + 1$, where $f$ denotes the maximum number of Byzantine failures (Lamport, Shostak, & Pease, 1982).\n2. FLP Impossibility Result: Deterministic asynchronous consensus cannot guarantee liveness in the presence of even a single unannounced crash failure (Fischer, Lynch, & Paterson, 1985).\n3. Practical Byzantine Fault Tolerance (PBFT): Provides safety and liveness under partial synchrony using three-phase message exchanges (Pre-prepare, Prepare, Commit) with polynomial complexity $O(n^2)$ (Castro & Liskov, 1999).\n\nApplication to Multi-Agent Reasoning Pipelines:\n- Hypotheses proposed by individual agents require quorum verification ($2f + 1$ matching endorsements) prior to commitment into verified shared memory.\n- In conflicting evidence regimes, agents isolate irreconcilable assertions into auditable dispute logs rather than averaging probabilities into an invalid compromise.\n\nReferences:\n1. Lamport, L., Shostak, R., & Pease, M. (1982). \"The Byzantine Generals Problem\", ACM Transactions on Programming Languages and Systems, 4(3), 382-401. [verified]\n2. Fischer, M. J., Lynch, N. A., & Paterson, M. S. (1985). \"Impossibility of Distributed Consensus with One Faulty Process\", Journal of the ACM, 32(2), 374-382. [verified]\n3. Castro, M., & Liskov, B. (1999). \"Practical Byzantine Fault Tolerance\", In Proceedings of the Third USENIX Symposium on Operating Systems Design and Implementation (OSDI '99), pp. 173-186; extended in ACM Transactions on Computer Systems (TOCS), 20(4), 398-461 (2002). [verified]",
            "source_type": "okf_graph",
            "tier": "OKF",
            "doi": null,
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "draft",
            "cited": false,
            "rank": null,
            "published": null
      },
      {
            "event": "token",
            "delta": "**"
      },
      {
            "event": "token",
            "delta": "Definition"
      },
      {
            "event": "token",
            "delta": "**"
      },
      {
            "event": "token",
            "delta": "  \n"
      },
      {
            "event": "token",
            "delta": "An"
      },
      {
            "event": "token",
            "delta": " autonomous"
      },
      {
            "event": "token",
            "delta": " system"
      },
      {
            "event": "token",
            "delta": " is"
      },
      {
            "event": "token",
            "delta": " a"
      },
      {
            "event": "token",
            "delta": " computational"
      },
      {
            "event": "token",
            "delta": " or"
      },
      {
            "event": "token",
            "delta": " physical"
      },
      {
            "event": "token",
            "delta": " entity"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " can"
      },
      {
            "event": "token",
            "delta": " perceive"
      },
      {
            "event": "token",
            "delta": " its"
      },
      {
            "event": "token",
            "delta": " environment"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " formulate"
      },
      {
            "event": "token",
            "delta": " goal"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "direct"
      },
      {
            "event": "token",
            "delta": "ed"
      },
      {
            "event": "token",
            "delta": " plans"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " execute"
      },
      {
            "event": "token",
            "delta": " actions"
      },
      {
            "event": "token",
            "delta": " over"
      },
      {
            "event": "token",
            "delta": " extended"
      },
      {
            "event": "token",
            "delta": " operational"
      },
      {
            "event": "token",
            "delta": " horizons"
      },
      {
            "event": "token",
            "delta": " without"
      },
      {
            "event": "token",
            "delta": " continuous"
      },
      {
            "event": "token",
            "delta": " human"
      },
      {
            "event": "token",
            "delta": " intervention"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "0"
      },
      {
            "event": "token",
            "delta": "]]"
      },
      {
            "event": "token",
            "delta": ".\n\n"
      },
      {
            "event": "token",
            "delta": "**"
      },
      {
            "event": "token",
            "delta": "Tax"
      },
      {
            "event": "token",
            "delta": "onomy"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " Aut"
      },
      {
            "event": "token",
            "delta": "onomy"
      },
      {
            "event": "token",
            "delta": " Levels"
      },
      {
            "event": "token",
            "delta": "**"
      },
      {
            "event": "token",
            "delta": "  \n\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": " Level"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Design"
      },
      {
            "event": "token",
            "delta": "ation"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Core"
      },
      {
            "event": "token",
            "delta": " Capability"
      },
      {
            "event": "token",
            "delta": " |\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": "-------"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": "-------------"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": "----------------"
      },
      {
            "event": "token",
            "delta": "-"
      },
      {
            "event": "token",
            "delta": "|\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "0"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " No"
      },
      {
            "event": "token",
            "delta": " Automation"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " System"
      },
      {
            "event": "token",
            "delta": " only"
      },
      {
            "event": "token",
            "delta": " provides"
      },
      {
            "event": "token",
            "delta": " warnings"
      },
      {
            "event": "token",
            "delta": " or"
      },
      {
            "event": "token",
            "delta": " moment"
      },
      {
            "event": "token",
            "delta": "ary"
      },
      {
            "event": "token",
            "delta": " intervention"
      },
      {
            "event": "token",
            "delta": ";"
      },
      {
            "event": "token",
            "delta": " human"
      },
      {
            "event": "token",
            "delta": " controls"
      },
      {
            "event": "token",
            "delta": " all"
      },
      {
            "event": "token",
            "delta": " execution"
      },
      {
            "event": "token",
            "delta": "."
      },
      {
            "event": "token",
            "delta": " |\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "1"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Driver"
      },
      {
            "event": "token",
            "delta": "/"
      },
      {
            "event": "token",
            "delta": "Operator"
      },
      {
            "event": "token",
            "delta": " Assistance"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Executes"
      },
      {
            "event": "token",
            "delta": " either"
      },
      {
            "event": "token",
            "delta": " steering"
      },
      {
            "event": "token",
            "delta": " or"
      },
      {
            "event": "token",
            "delta": " acceleration"
      },
      {
            "event": "token",
            "delta": "/de"
      },
      {
            "event": "token",
            "delta": "celer"
      },
      {
            "event": "token",
            "delta": "ation"
      },
      {
            "event": "token",
            "delta": " using"
      },
      {
            "event": "token",
            "delta": " environmental"
      },
      {
            "event": "token",
            "delta": " information"
      },
      {
            "event": "token",
            "delta": "."
      },
      {
            "event": "token",
            "delta": " |\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "2"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Partial"
      },
      {
            "event": "token",
            "delta": " Automation"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Sim"
      },
      {
            "event": "token",
            "delta": "ult"
      },
      {
            "event": "token",
            "delta": "aneously"
      },
      {
            "event": "token",
            "delta": " executes"
      },
      {
            "event": "token",
            "delta": " multiple"
      },
      {
            "event": "token",
            "delta": " sub"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "tasks"
      },
      {
            "event": "token",
            "delta": " while"
      },
      {
            "event": "token",
            "delta": " human"
      },
      {
            "event": "token",
            "delta": " monitors"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " remains"
      },
      {
            "event": "token",
            "delta": " ready"
      },
      {
            "event": "token",
            "delta": " to"
      },
      {
            "event": "token",
            "delta": " take"
      },
      {
            "event": "token",
            "delta": " over"
      },
      {
            "event": "token",
            "delta": "."
      },
      {
            "event": "token",
            "delta": " |\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "3"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Conditional"
      },
      {
            "event": "token",
            "delta": " Automation"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Handles"
      },
      {
            "event": "token",
            "delta": " all"
      },
      {
            "event": "token",
            "delta": " dynamic"
      },
      {
            "event": "token",
            "delta": " performance"
      },
      {
            "event": "token",
            "delta": " within"
      },
      {
            "event": "token",
            "delta": " a"
      },
      {
            "event": "token",
            "delta": " defined"
      },
      {
            "event": "token",
            "delta": " Operational"
      },
      {
            "event": "token",
            "delta": " Design"
      },
      {
            "event": "token",
            "delta": " Domain"
      },
      {
            "event": "token",
            "delta": " ("
      },
      {
            "event": "token",
            "delta": "OD"
      },
      {
            "event": "token",
            "delta": "D"
      },
      {
            "event": "token",
            "delta": ");"
      },
      {
            "event": "token",
            "delta": " human"
      },
      {
            "event": "token",
            "delta": " interven"
      },
      {
            "event": "token",
            "delta": "es"
      },
      {
            "event": "token",
            "delta": " on"
      },
      {
            "event": "token",
            "delta": " request"
      },
      {
            "event": "token",
            "delta": "."
      },
      {
            "event": "token",
            "delta": " |\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "4"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " High"
      },
      {
            "event": "token",
            "delta": " Automation"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Sust"
      },
      {
            "event": "token",
            "delta": "ains"
      },
      {
            "event": "token",
            "delta": " complete"
      },
      {
            "event": "token",
            "delta": " dynamic"
      },
      {
            "event": "token",
            "delta": " performance"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " automated"
      },
      {
            "event": "token",
            "delta": " fallback"
      },
      {
            "event": "token",
            "delta": " within"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " O"
      },
      {
            "event": "token",
            "delta": "DD"
      },
      {
            "event": "token",
            "delta": " even"
      },
      {
            "event": "token",
            "delta": " if"
      },
      {
            "event": "token",
            "delta": " human"
      },
      {
            "event": "token",
            "delta": " fails"
      },
      {
            "event": "token",
            "delta": " to"
      },
      {
            "event": "token",
            "delta": " intervene"
      },
      {
            "event": "token",
            "delta": "."
      },
      {
            "event": "token",
            "delta": " |\n"
      },
      {
            "event": "token",
            "delta": "|"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "5"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Full"
      },
      {
            "event": "token",
            "delta": " Automation"
      },
      {
            "event": "token",
            "delta": " |"
      },
      {
            "event": "token",
            "delta": " Provides"
      },
      {
            "event": "token",
            "delta": " unconditional"
      },
      {
            "event": "token",
            "delta": " automated"
      },
      {
            "event": "token",
            "delta": " performance"
      },
      {
            "event": "token",
            "delta": " across"
      },
      {
            "event": "token",
            "delta": " all"
      },
      {
            "event": "token",
            "delta": " environmental"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " operational"
      },
      {
            "event": "token",
            "delta": " conditions"
      },
      {
            "event": "token",
            "delta": " manageable"
      },
      {
            "event": "token",
            "delta": " by"
      },
      {
            "event": "token",
            "delta": " humans"
      },
      {
            "event": "token",
            "delta": "."
      },
      {
            "event": "token",
            "delta": " |\n\n"
      },
      {
            "event": "token",
            "delta": "The"
      },
      {
            "event": "token",
            "delta": " taxonomy"
      },
      {
            "event": "token",
            "delta": " adap"
      },
      {
            "event": "token",
            "delta": "ts"
      },
      {
            "event": "token",
            "delta": " SAE"
      },
      {
            "event": "token",
            "delta": " J"
      },
      {
            "event": "token",
            "delta": "301"
      },
      {
            "event": "token",
            "delta": "6"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " N"
      },
      {
            "event": "token",
            "delta": "IST"
      },
      {
            "event": "token",
            "delta": " AL"
      },
      {
            "event": "token",
            "delta": "F"
      },
      {
            "event": "token",
            "delta": "US"
      },
      {
            "event": "token",
            "delta": " definitions"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " autonomy"
      },
      {
            "event": "token",
            "delta": " levels"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "0"
      },
      {
            "event": "token",
            "delta": "]]."
      },
      {
            "event": "audit",
            "answer_final": "**Definition**  \nAn autonomous system is a computational or physical entity capable of perceiving its environment, formulating goal‑directed plans, and executing actions over extended operational horizons without continuous human intervention [[c:0]].\n\n**Taxonomy of Autonomy Levels**  \n\n| Level | Designation | Core Capability (as defined in the sources) |\n|-------|-------------|---------------------------------------------|\n| 0 | No Automation | System provides warnings or momentary intervention; human controls all execution [[c:0]]. |\n| 1 | Driver/Operator Assistance | Executes either steering or acceleration/deceleration using environmental information [[c:0]]. |\n| 2 | Partial Automation | Simultaneously executes multiple sub‑tasks while the human monitors and remains ready to take over [[c:0]]. |\n| 3 | Conditional Automation | Handles all dynamic performance within a defined Operational Design Domain (ODD); human intervenes on request [[c:0]]. |\n| 4 | High Automation | Sustains complete dynamic performance and automated fallback within the ODD even if the human fails to intervene [[c:0]]. |\n| 5 | Full Automation | Provides unconditional automated performance across all environmental and operational conditions manageable by humans [[c:0]]. |\n\n**Architectural Models**  \nCommon architectures for autonomous systems include the Sense‑Plan‑Act (SPA) hierarchy, the subsumption architecture of layered reactive behaviors, and hybrid cognitive architectures that combine fast reflex loops with asynchronous symbolic deliberation [[c:0]].",
            "claims": [
                  {
                        "claim_id": 0,
                        "text": "An autonomous system is a computational or physical entity capable of perceiving its environment, formulating goal‑directed plans, and executing actions over extended operational horizons without continuous human intervention.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "An autonomous system is a computational or physical entity capable of perceiving its environment, formulating goal-directed plans, and executing actions over extended operational horizons without continuous human intervention.",
                        "note": "Fully supported: Verified by verbatim evidence quote and entity check.",
                        "supported": true,
                        "status": "supported",
                        "coverage": 1.0,
                        "start": 17,
                        "end": 251
                  },
                  {
                        "claim_id": 1,
                        "text": "System provides warnings or momentary intervention; human controls all execution.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "System provides warnings or momentary intervention; human controls all execution.",
                        "note": "Fully supported: Verified by verbatim evidence quote and entity check.",
                        "supported": true,
                        "status": "supported",
                        "coverage": 1.0,
                        "start": 450,
                        "end": 539
                  },
                  {
                        "claim_id": 2,
                        "text": "Executes either steering or acceleration/deceleration using environmental information.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "Execution of either steering or acceleration/deceleration using environmental information.",
                        "note": "Audit flagged: unverified entities: Executes.",
                        "supported": false,
                        "status": "partially_supported",
                        "coverage": 0.857,
                        "start": 577,
                        "end": 671
                  },
                  {
                        "claim_id": 3,
                        "text": "Simultaneously executes multiple sub‑tasks while the human monitors and remains ready to take over.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "Simultaneous execution of multiple sub-tasks with human monitoring and immediate fallback readiness.",
                        "note": "Audit flagged: insufficient quote coverage (36.4% < 60%); unverified entities: Simultaneously.",
                        "supported": false,
                        "status": "partially_supported",
                        "coverage": 0.364,
                        "start": 701,
                        "end": 808
                  },
                  {
                        "claim_id": 4,
                        "text": "Handles all dynamic performance within a defined Operational Design Domain (ODD); human intervenes on request.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "System handles all aspects of dynamic performance within an Operational Design Domain (ODD); human intervenes upon request.",
                        "note": "Fully supported: Verified by verbatim evidence quote and entity check.",
                        "supported": true,
                        "status": "supported",
                        "coverage": 0.917,
                        "start": 842,
                        "end": 960
                  },
                  {
                        "claim_id": 5,
                        "text": "Sustains complete dynamic performance and automated fallback within the ODD even if the human fails to intervene.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "System sustains complete dynamic performance and automated fallback within defined ODD even if human fails to intervene.",
                        "note": "Fully supported: Verified by verbatim evidence quote and entity check.",
                        "supported": true,
                        "status": "supported",
                        "coverage": 1.0,
                        "start": 987,
                        "end": 1108
                  },
                  {
                        "claim_id": 6,
                        "text": "Provides unconditional automated performance across all environmental and operational conditions manageable by humans.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "Unconditional automated performance across all environmental and operational conditions manageable by human operators.",
                        "note": "Fully supported: Verified by verbatim evidence quote and entity check.",
                        "supported": true,
                        "status": "supported",
                        "coverage": 0.8,
                        "start": 1135,
                        "end": 1261
                  },
                  {
                        "claim_id": 7,
                        "text": "Common architectures for autonomous systems include the Sense‑Plan‑Act (SPA) hierarchy, the subsumption architecture of layered reactive behaviors, and hybrid cognitive architectures that combine fast reflex loops with asynchronous symbolic deliberation.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "1. Sense-Plan-Act (SPA): Classical hierarchical planning through centralized state representations.; 3. Hybrid Cognitive Architectures: Coupling fast reflex loops with asynchronous symbolic deliberation.",
                        "note": "Audit flagged: unverified entities: Common.",
                        "supported": false,
                        "status": "partially_supported",
                        "coverage": 0.625,
                        "start": 1292,
                        "end": 1554
                  }
            ],
            "removed_claims": [],
            "conflicts": [],
            "retractions": [],
            "confidence": 0.69,
            "tier_agreement": null,
            "repaired": true,
            "sources": [
                  {
                        "source": "ARIA seed note (draft)",
                        "source_type": "okf_graph",
                        "tier": "OKF",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": null,
                        "published": null,
                        "cited": true
                  },
                  {
                        "source": "Linked via Taxonomy of Autonomous Systems and Operational Boundaries",
                        "source_type": "okf_graph",
                        "tier": "OKF",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": null,
                        "published": null,
                        "cited": false
                  }
            ]
      },
      {
            "event": "done"
      }
]
  },
  "rag": {
    "id": "rag",
    "query": "What are the off-target mitigation strategies for CRISPR gene editing?",
    "label": "RAG Fallback: CRISPR Mitigation Strategies",
    "events": [
      {
            "event": "start",
            "thread_id": "19e99c75-5e4e-4a1f-aed5-7e9727f3af18"
      },
      {
            "event": "route",
            "route_decision": "cascade"
      },
      {
            "event": "retrieve",
            "tiers": [
                  "RAG"
            ],
            "okf_node_paths": [],
            "rag_scores": [
                  0.8404
            ],
            "sources": [
                  {
                        "source": "ARIA Molecular Biology Synthesis",
                        "source_type": "pgvector",
                        "tier": "RAG",
                        "similarity": 0.8404,
                        "is_retracted": false,
                        "rank": null,
                        "published": null,
                        "cited": false
                  }
            ]
      },
      {
            "event": "citation",
            "id": 0,
            "title": "CRISPR Cas9 off-target mitigation",
            "path": "okf/crispr_cas9_mechanisms.md",
            "url": null,
            "authors": null,
            "year": 2026,
            "venue": "ARIA Molecular Biology Synthesis",
            "snippet": "Off-target cleavage during CRISPR-Cas9 genome editing presents substantial challenges for therapeutic translation. Key mitigation strategies include:\n1. High-fidelity engineered Cas9 nucleases (such as SpCas9-HF1, eSpCas9, and HypaCas9) featuring mutated contact residues that destabilize non-target strand binding.\n2. Paired nickase configurations (Cas9n D10A) creating adjacent single-strand breaks on opposing strands, requiring dual guide RNA recognition.\n3. Prime editing systems and transient delivery via ribonucleoprotein (RNP) complexes, restricting nuclease exposure duration to diminish off-target accumulation.\n\nReferences:\n1. Kleinstiver, B. P., et al. (2016). \"High-fidelity CRISPR–Cas9 nucleases with no detectable genome-wide off-target effects\", Nature, 529(7587), 490-495. [verified]\n2. Ran, F. A., et al. (2013). \"Double nicking by RNA-guided CRISPR Cas9 for enhanced genome editing specificity\", Cell, 154(6), 1380-1389. [verified]\n3. Anzalone, A. V., et al. (2019). \"Search-and-replace genome editing without double-strand breaks or donor DNA\", Nature, 576(7785), 149-157. [verified]",
            "source_type": "pgvector",
            "tier": "RAG",
            "doi": null,
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "verified",
            "cited": false,
            "rank": null,
            "published": null
      },
      {
            "event": "token",
            "delta": "-"
      },
      {
            "event": "token",
            "delta": " Use"
      },
      {
            "event": "token",
            "delta": " high"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "f"
      },
      {
            "event": "token",
            "delta": "idelity"
      },
      {
            "event": "token",
            "delta": " engineered"
      },
      {
            "event": "token",
            "delta": " Cas"
      },
      {
            "event": "token",
            "delta": "9"
      },
      {
            "event": "token",
            "delta": " variants"
      },
      {
            "event": "token",
            "delta": " ("
      },
      {
            "event": "token",
            "delta": "e"
      },
      {
            "event": "token",
            "delta": ".g"
      },
      {
            "event": "token",
            "delta": ".,"
      },
      {
            "event": "token",
            "delta": " Sp"
      },
      {
            "event": "token",
            "delta": "Cas"
      },
      {
            "event": "token",
            "delta": "9"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "HF"
      },
      {
            "event": "token",
            "delta": "1"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " e"
      },
      {
            "event": "token",
            "delta": "Sp"
      },
      {
            "event": "token",
            "delta": "Cas"
      },
      {
            "event": "token",
            "delta": "9"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " Hyp"
      },
      {
            "event": "token",
            "delta": "a"
      },
      {
            "event": "token",
            "delta": "Cas"
      },
      {
            "event": "token",
            "delta": "9"
      },
      {
            "event": "token",
            "delta": ")"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " contain"
      },
      {
            "event": "token",
            "delta": " mutations"
      },
      {
            "event": "token",
            "delta": " weakening"
      },
      {
            "event": "token",
            "delta": " non"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "target"
      },
      {
            "event": "token",
            "delta": " strand"
      },
      {
            "event": "token",
            "delta": " interactions"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " thereby"
      },
      {
            "event": "token",
            "delta": " reducing"
      },
      {
            "event": "token",
            "delta": " off"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "target"
      },
      {
            "event": "token",
            "delta": " cleavage"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "0"
      },
      {
            "event": "token",
            "delta": "]]"
      },
      {
            "event": "token",
            "delta": ".\n\n"
      },
      {
            "event": "token",
            "delta": "-"
      },
      {
            "event": "token",
            "delta": " Apply"
      },
      {
            "event": "token",
            "delta": " paired"
      },
      {
            "event": "token",
            "delta": " nick"
      },
      {
            "event": "token",
            "delta": "ase"
      },
      {
            "event": "token",
            "delta": " strategy"
      },
      {
            "event": "token",
            "delta": " ("
      },
      {
            "event": "token",
            "delta": "Cas"
      },
      {
            "event": "token",
            "delta": "9"
      },
      {
            "event": "token",
            "delta": "n"
      },
      {
            "event": "token",
            "delta": " D"
      },
      {
            "event": "token",
            "delta": "10"
      },
      {
            "event": "token",
            "delta": "A"
      },
      {
            "event": "token",
            "delta": ")"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " creates"
      },
      {
            "event": "token",
            "delta": " two"
      },
      {
            "event": "token",
            "delta": " adjacent"
      },
      {
            "event": "token",
            "delta": " single"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "strand"
      },
      {
            "event": "token",
            "delta": " n"
      },
      {
            "event": "token",
            "delta": "icks"
      },
      {
            "event": "token",
            "delta": " only"
      },
      {
            "event": "token",
            "delta": " when"
      },
      {
            "event": "token",
            "delta": " two"
      },
      {
            "event": "token",
            "delta": " guide"
      },
      {
            "event": "token",
            "delta": " RN"
      },
      {
            "event": "token",
            "delta": "As"
      },
      {
            "event": "token",
            "delta": " bind"
      },
      {
            "event": "token",
            "delta": " correctly"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " increasing"
      },
      {
            "event": "token",
            "delta": " specificity"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "0"
      },
      {
            "event": "token",
            "delta": "]]"
      },
      {
            "event": "token",
            "delta": ".\n\n"
      },
      {
            "event": "token",
            "delta": "-"
      },
      {
            "event": "token",
            "delta": " Employ"
      },
      {
            "event": "token",
            "delta": " prime"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "editing"
      },
      {
            "event": "token",
            "delta": " systems"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " deliver"
      },
      {
            "event": "token",
            "delta": " Cas"
      },
      {
            "event": "token",
            "delta": "9"
      },
      {
            "event": "token",
            "delta": " as"
      },
      {
            "event": "token",
            "delta": " rib"
      },
      {
            "event": "token",
            "delta": "on"
      },
      {
            "event": "token",
            "delta": "ucle"
      },
      {
            "event": "token",
            "delta": "oprote"
      },
      {
            "event": "token",
            "delta": "in"
      },
      {
            "event": "token",
            "delta": " ("
      },
      {
            "event": "token",
            "delta": "R"
      },
      {
            "event": "token",
            "delta": "NP"
      },
      {
            "event": "token",
            "delta": ")"
      },
      {
            "event": "token",
            "delta": " complexes"
      },
      {
            "event": "token",
            "delta": " for"
      },
      {
            "event": "token",
            "delta": " transient"
      },
      {
            "event": "token",
            "delta": " activity"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " limiting"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " time"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " nuc"
      },
      {
            "event": "token",
            "delta": "lease"
      },
      {
            "event": "token",
            "delta": " is"
      },
      {
            "event": "token",
            "delta": " present"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " cur"
      },
      {
            "event": "token",
            "delta": "bing"
      },
      {
            "event": "token",
            "delta": " off"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "target"
      },
      {
            "event": "token",
            "delta": " events"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "0"
      },
      {
            "event": "token",
            "delta": "]]."
      },
      {
            "event": "audit",
            "answer_final": "- High‑fidelity engineered Cas9 nucleases such as SpCas9‑HF1, eSpCas9, and HypaCas9 contain mutated contact residues that destabilize non‑target strand binding, reducing off‑target cleavage [[c:0]].\n\n- Paired nickase configurations using the Cas9n D10A mutant create adjacent single‑strand breaks on opposite DNA strands, requiring two guide RNAs and thereby increasing specificity [[c:0]].\n\n- Prime‑editing systems and delivery of Cas9 as ribonucleoprotein (RNP) complexes provide transient nuclease activity, limiting off‑target accumulation [[c:0]].",
            "claims": [
                  {
                        "claim_id": 0,
                        "text": "High‑fidelity engineered Cas9 nucleases such as SpCas9‑HF1, eSpCas9, and HypaCas9 contain mutated contact residues that destabilize non‑target strand binding, reducing off‑target cleavage.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "High-fidelity engineered Cas9 nucleases (such as SpCas9-HF1, eSpCas9, and HypaCas9) featuring mutated contact residues that destabilize non-target strand binding.",
                        "note": "Fully supported: Verified by verbatim evidence quote and entity check.",
                        "supported": true,
                        "status": "supported",
                        "coverage": 0.842,
                        "start": 0,
                        "end": 198
                  },
                  {
                        "claim_id": 1,
                        "text": "Paired nickase configurations using the Cas9n D10A mutant create adjacent single‑strand breaks on opposite DNA strands, requiring two guide RNAs and thereby increasing specificity.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "Paired nickase configurations (Cas9n D10A) creating adjacent single-strand breaks on opposing strands, requiring dual guide RNA recognition.",
                        "note": "Audit flagged: insufficient quote coverage (56.2% < 60%).",
                        "supported": false,
                        "status": "partially_supported",
                        "coverage": 0.562,
                        "start": 200,
                        "end": 390
                  },
                  {
                        "claim_id": 2,
                        "text": "Prime‑editing systems and delivery of Cas9 as ribonucleoprotein (RNP) complexes provide transient nuclease activity, limiting off‑target accumulation.",
                        "citation_ids": [
                              0
                        ],
                        "evidence": "Prime editing systems and transient delivery via ribonucleoprotein (RNP) complexes, restricting nuclease exposure duration to diminish off-target accumulation.",
                        "note": "Fully supported: Verified by verbatim evidence quote and entity check.",
                        "supported": true,
                        "status": "supported",
                        "coverage": 0.727,
                        "start": 392,
                        "end": 552
                  }
            ],
            "removed_claims": [],
            "conflicts": [],
            "retractions": [],
            "confidence": 0.7,
            "tier_agreement": null,
            "repaired": true,
            "sources": [
                  {
                        "source": "ARIA Molecular Biology Synthesis",
                        "source_type": "pgvector",
                        "tier": "RAG",
                        "similarity": 0.8404,
                        "is_retracted": false,
                        "rank": null,
                        "published": null,
                        "cited": true
                  }
            ]
      },
      {
            "event": "done"
      }
]
  },
  "live": {
    "id": "live",
    "query": "What were the latest discoveries of the James Webb Space Telescope in 2024?",
    "label": "Live Web Search: JWST 2024 Discoveries",
    "events": [
      {
            "event": "start",
            "thread_id": "a6f6f441-4cf1-4565-bedf-7e6e5a88a2cb"
      },
      {
            "event": "route",
            "route_decision": "cascade"
      },
      {
            "event": "retrieve",
            "tiers": [
                  "LIVE"
            ],
            "okf_node_paths": [],
            "rag_scores": [],
            "sources": [
                  {
                        "source": "https://doi.org/10.1117/1.jatis.10.1.011208",
                        "source_type": "openalex",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 1,
                        "published": "2024-02-05",
                        "cited": false
                  },
                  {
                        "source": "https://doi.org/10.3847/1538-3881/ad890d",
                        "source_type": "openalex",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 2,
                        "published": "2024-12-10",
                        "cited": false
                  },
                  {
                        "source": "https://blog.jameswebbdiscovery.com/2024/03/james-webb-space-telescope-discoveries.html",
                        "source_type": "duckduckgo",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 3,
                        "published": "2024",
                        "cited": false
                  },
                  {
                        "source": "https://doi.org/10.33140/ssj.01.02.10",
                        "source_type": "openalex",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 4,
                        "published": "2024-08-02",
                        "cited": false
                  },
                  {
                        "source": "https://blog.jaseph.com/top-5-james-webb-telescope-discoveries-in-2024/8934/",
                        "source_type": "duckduckgo",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 5,
                        "published": "2024",
                        "cited": false
                  }
            ]
      },
      {
            "event": "citation",
            "id": 0,
            "title": "Lessons learned from systems engineering on the James Webb Space Telescope",
            "path": null,
            "url": "https://doi.org/10.1117/1.jatis.10.1.011208",
            "authors": [
                  "Michael Menzel",
                  "Keith Parrish",
                  "Lee D. Feinberg",
                  "Paul H. Geithner",
                  "Julie Van Campen",
                  "Michael W. McElwain",
                  "Sandra Irish"
            ],
            "year": 2024,
            "venue": "Journal of Astronomical Telescopes Instruments and Systems",
            "snippet": "The James Webb Space Telescope is NASA’s flagship mission and successor to the highly successful Hubble Space Telescope. It is an infrared observatory featuring a cryogenic 6.6 m aperture, deployable optical telescope element with a payload of four science instruments assembled into an integrated science instrument module that provide imagery and spectroscopy in the near infrared band between 0.6 and 5 μm and in the mid-infrared band between 5 and 28 μm. JWST was successfully launched on December 25, 2021, aboard an Ariane 5 launch vehicle. All 50 major deployments were successfully completed by January 8, 2022. The observatory performed all mid-course correction maneuvers and achieved its operational mission orbit around the Sun-Earth second Lagrange Point. All commissioning and calibration activities have been completed and JWST has begun its science mission. Its present performance meets or out-performs all requirements. Launching over 20 years after its mission concept review, the JWST",
            "source_type": "openalex",
            "tier": "LIVE",
            "doi": "10.1117/1.jatis.10.1.011208",
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "scholarly",
            "cited": false,
            "rank": 1,
            "published": "2024-02-05"
      },
      {
            "event": "citation",
            "id": 1,
            "title": "Searching for Planets Orbiting Vega with the James Webb Space Telescope",
            "path": null,
            "url": "https://doi.org/10.3847/1538-3881/ad890d",
            "authors": [
                  "Charles Beichman",
                  "G. Bryden",
                  "Jorge D. Llop-Sayson",
                  "Marie Ygouf",
                  "Alexandra Z. Greenbaum",
                  "Jarron Leisenring",
                  "Andras Gáspár",
                  "John Krist",
                  "George H. Rieke",
                  "Schuyler Grace Wolff",
                  "Kate Y. L. Su",
                  "K. W. Hodapp",
                  "Michael R. Meyer",
                  "Doug Kelly",
                  "Martha L. Boyer",
                  "Doug Johnstone",
                  "Scott Horner",
                  "Marcia J. Rieke"
            ],
            "year": 2024,
            "venue": "The Astronomical Journal",
            "snippet": "Abstract The most prominent of the IRAS debris disk systems, α Lyrae (Vega), at a distance of 7.7 pc, has been observed by both the NIRCam and MIRI instruments on the James Webb Space Telescope. This paper describes NIRCam coronagraphic observations, which have achieved F444W contrast levels of 3 × 10−7 at 1″ (7.7 au), 1 × 10−7 at 2″ (15 au), and a few × 10−8 beyond 5″ (38 au), corresponding to masses of <3, 2, and 0.5 M J for a system age of 700 Myr. Two F444W objects are identified in the outer MIRI debris disk, around 48 au. One of these is detected by MIRI and appears to be extended with a spectral energy distribution similar to those of distant extragalactic sources. The second one also appears extended in the NIRCam data suggestive of an extragalactic nature. The NIRCam limits within the inner disk (1″–10″) correspond",
            "source_type": "openalex",
            "tier": "LIVE",
            "doi": "10.3847/1538-3881/ad890d",
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "scholarly",
            "cited": false,
            "rank": 2,
            "published": "2024-12-10"
      },
      {
            "event": "citation",
            "id": 2,
            "title": "James Webb Space Telescope Discoveries Tracker",
            "path": null,
            "url": "https://blog.jameswebbdiscovery.com/2024/03/james-webb-space-telescope-discoveries.html",
            "authors": null,
            "year": 2024,
            "venue": "DuckDuckGo",
            "snippet": "Mar 19, 2024 · James Webb Telescope Unlocks the Universe's Secrets: March 2024 Discoveries The James Webb Space Telescope (JWST), humanity's most powerful observatory, continues to revolutionize our understanding of the cosmos.",
            "source_type": "duckduckgo",
            "tier": "LIVE",
            "doi": null,
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "unreviewed_web",
            "cited": false,
            "rank": 3,
            "published": "2024"
      },
      {
            "event": "citation",
            "id": 3,
            "title": "The James Webb Space Telescope (JWST) Anomalies Resolved",
            "path": null,
            "url": "https://doi.org/10.33140/ssj.01.02.10",
            "authors": [
                  "James R. Arnold"
            ],
            "year": 2024,
            "venue": "Space science journal.",
            "snippet": "A model of the universe is offered that can derive the Hubble Constant independent of empirical measurement, using just a midline estimate of the age of the universe and simple arithmetic calculations. It can explain the JWST discoveries of apparent anomalous early galaxy formations without need of substantial revisions to established astrophysical theories, as the new findings have seemed to require. Concepts of “Dark energy”, cosmic flatness, cosmic inflation, and an accelerating expansion of the universe are rendered unnecessary or at least partly misinterpreted.",
            "source_type": "openalex",
            "tier": "LIVE",
            "doi": "10.33140/ssj.01.02.10",
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "scholarly",
            "cited": false,
            "rank": 4,
            "published": "2024-08-02"
      },
      {
            "event": "citation",
            "id": 4,
            "title": "Top 5 James Webb Telescope Discoveries in 2024: Exoplanets ...",
            "path": null,
            "url": "https://blog.jaseph.com/top-5-james-webb-telescope-discoveries-in-2024/8934/",
            "authors": null,
            "year": 2024,
            "venue": "DuckDuckGo",
            "snippet": "Sep 27, 2024 · The top James Webb Space Telescope discoveries of 2024, including exoplanet breakthroughs, deep space images, and insights into star formation. Learn how JWST is transforming our understanding of the universe.",
            "source_type": "duckduckgo",
            "tier": "LIVE",
            "doi": null,
            "arxiv_id": null,
            "is_retracted": false,
            "review_status": "unreviewed_web",
            "cited": false,
            "rank": 5,
            "published": "2024"
      },
      {
            "event": "token",
            "delta": "In"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "202"
      },
      {
            "event": "token",
            "delta": "4"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " James"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "Web"
      },
      {
            "event": "token",
            "delta": "b"
      },
      {
            "event": "token",
            "delta": " Space"
      },
      {
            "event": "token",
            "delta": " Telescope"
      },
      {
            "event": "token",
            "delta": " was"
      },
      {
            "event": "token",
            "delta": " used"
      },
      {
            "event": "token",
            "delta": " to"
      },
      {
            "event": "token",
            "delta": " obtain"
      },
      {
            "event": "token",
            "delta": " very"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "high"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "contrast"
      },
      {
            "event": "token",
            "delta": " N"
      },
      {
            "event": "token",
            "delta": "IR"
      },
      {
            "event": "token",
            "delta": "Cam"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " M"
      },
      {
            "event": "token",
            "delta": "IRI"
      },
      {
            "event": "token",
            "delta": " images"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " nearby"
      },
      {
            "event": "token",
            "delta": " star"
      },
      {
            "event": "token",
            "delta": " Vega"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " reaching"
      },
      {
            "event": "token",
            "delta": " contrast"
      },
      {
            "event": "token",
            "delta": " levels"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "3"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "×"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "10"
      },
      {
            "event": "token",
            "delta": "⁻"
      },
      {
            "event": "token",
            "delta": "⁷"
      },
      {
            "event": "token",
            "delta": " at"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "1"
      },
      {
            "event": "token",
            "delta": "″"
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " revealing"
      },
      {
            "event": "token",
            "delta": " two"
      },
      {
            "event": "token",
            "delta": " faint"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " extended"
      },
      {
            "event": "token",
            "delta": " objects"
      },
      {
            "event": "token",
            "delta": " in"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " outer"
      },
      {
            "event": "token",
            "delta": " debris"
      },
      {
            "event": "token",
            "delta": " disk"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " appear"
      },
      {
            "event": "token",
            "delta": " consistent"
      },
      {
            "event": "token",
            "delta": " with"
      },
      {
            "event": "token",
            "delta": " distant"
      },
      {
            "event": "token",
            "delta": " extr"
      },
      {
            "event": "token",
            "delta": "agal"
      },
      {
            "event": "token",
            "delta": "actic"
      },
      {
            "event": "token",
            "delta": " sources"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "1"
      },
      {
            "event": "token",
            "delta": "]]"
      },
      {
            "event": "token",
            "delta": ".\n\n"
      },
      {
            "event": "token",
            "delta": "The"
      },
      {
            "event": "token",
            "delta": " telescope"
      },
      {
            "event": "token",
            "delta": " also"
      },
      {
            "event": "token",
            "delta": " reported"
      },
      {
            "event": "token",
            "delta": " observations"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " apparently"
      },
      {
            "event": "token",
            "delta": " “"
      },
      {
            "event": "token",
            "delta": "an"
      },
      {
            "event": "token",
            "delta": "omal"
      },
      {
            "event": "token",
            "delta": "ous"
      },
      {
            "event": "token",
            "delta": "”"
      },
      {
            "event": "token",
            "delta": " early"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "forming"
      },
      {
            "event": "token",
            "delta": " galaxies"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " challenge"
      },
      {
            "event": "token",
            "delta": " standard"
      },
      {
            "event": "token",
            "delta": " expectations"
      },
      {
            "event": "token",
            "delta": " for"
      },
      {
            "event": "token",
            "delta": " galaxy"
      },
      {
            "event": "token",
            "delta": " growth"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " prompting"
      },
      {
            "event": "token",
            "delta": " theoretical"
      },
      {
            "event": "token",
            "delta": " work"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " seeks"
      },
      {
            "event": "token",
            "delta": " to"
      },
      {
            "event": "token",
            "delta": " explain"
      },
      {
            "event": "token",
            "delta": " these"
      },
      {
            "event": "token",
            "delta": " findings"
      },
      {
            "event": "token",
            "delta": " without"
      },
      {
            "event": "token",
            "delta": " revis"
      },
      {
            "event": "token",
            "delta": "ing"
      },
      {
            "event": "token",
            "delta": " established"
      },
      {
            "event": "token",
            "delta": " cosm"
      },
      {
            "event": "token",
            "delta": "ology"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "3"
      },
      {
            "event": "token",
            "delta": "]]"
      },
      {
            "event": "token",
            "delta": ".\n\n"
      },
      {
            "event": "token",
            "delta": "A"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "“"
      },
      {
            "event": "token",
            "delta": "Discover"
      },
      {
            "event": "token",
            "delta": "ies"
      },
      {
            "event": "token",
            "delta": " Tracker"
      },
      {
            "event": "token",
            "delta": "”"
      },
      {
            "event": "token",
            "delta": " entry"
      },
      {
            "event": "token",
            "delta": " notes"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " JW"
      },
      {
            "event": "token",
            "delta": "ST"
      },
      {
            "event": "token",
            "delta": " continued"
      },
      {
            "event": "token",
            "delta": " to"
      },
      {
            "event": "token",
            "delta": " unlock"
      },
      {
            "event": "token",
            "delta": " new"
      },
      {
            "event": "token",
            "delta": " insights"
      },
      {
            "event": "token",
            "delta": " throughout"
      },
      {
            "event": "token",
            "delta": " March"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "202"
      },
      {
            "event": "token",
            "delta": "4"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " though"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " source"
      },
      {
            "event": "token",
            "delta": " does"
      },
      {
            "event": "token",
            "delta": " not"
      },
      {
            "event": "token",
            "delta": " list"
      },
      {
            "event": "token",
            "delta": " specific"
      },
      {
            "event": "token",
            "delta": " results"
      },
      {
            "event": "token",
            "delta": " beyond"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " statement"
      },
      {
            "event": "token",
            "delta": " that"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " observ"
      },
      {
            "event": "token",
            "delta": "atory"
      },
      {
            "event": "token",
            "delta": " is"
      },
      {
            "event": "token",
            "delta": " revolution"
      },
      {
            "event": "token",
            "delta": "izing"
      },
      {
            "event": "token",
            "delta": " our"
      },
      {
            "event": "token",
            "delta": " understanding"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " cosmos"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "2"
      },
      {
            "event": "token",
            "delta": "]]"
      },
      {
            "event": "token",
            "delta": ".\n\n"
      },
      {
            "event": "token",
            "delta": "Another"
      },
      {
            "event": "token",
            "delta": " summary"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " year"
      },
      {
            "event": "token",
            "delta": "’s"
      },
      {
            "event": "token",
            "delta": " highlights"
      },
      {
            "event": "token",
            "delta": " lists"
      },
      {
            "event": "token",
            "delta": " the"
      },
      {
            "event": "token",
            "delta": " “"
      },
      {
            "event": "token",
            "delta": "top"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "5"
      },
      {
            "event": "token",
            "delta": "”"
      },
      {
            "event": "token",
            "delta": " JW"
      },
      {
            "event": "token",
            "delta": "ST"
      },
      {
            "event": "token",
            "delta": " discoveries"
      },
      {
            "event": "token",
            "delta": " of"
      },
      {
            "event": "token",
            "delta": " "
      },
      {
            "event": "token",
            "delta": "202"
      },
      {
            "event": "token",
            "delta": "4"
      },
      {
            "event": "token",
            "delta": " as"
      },
      {
            "event": "token",
            "delta": " including"
      },
      {
            "event": "token",
            "delta": " breakthroughs"
      },
      {
            "event": "token",
            "delta": " in"
      },
      {
            "event": "token",
            "delta": " ex"
      },
      {
            "event": "token",
            "delta": "oplan"
      },
      {
            "event": "token",
            "delta": "et"
      },
      {
            "event": "token",
            "delta": " science"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " striking"
      },
      {
            "event": "token",
            "delta": " deep"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "space"
      },
      {
            "event": "token",
            "delta": " images"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " and"
      },
      {
            "event": "token",
            "delta": " new"
      },
      {
            "event": "token",
            "delta": " information"
      },
      {
            "event": "token",
            "delta": " on"
      },
      {
            "event": "token",
            "delta": " star"
      },
      {
            "event": "token",
            "delta": "‑"
      },
      {
            "event": "token",
            "delta": "formation"
      },
      {
            "event": "token",
            "delta": " processes"
      },
      {
            "event": "token",
            "delta": ","
      },
      {
            "event": "token",
            "delta": " but"
      },
      {
            "event": "token",
            "delta": " it"
      },
      {
            "event": "token",
            "delta": " provides"
      },
      {
            "event": "token",
            "delta": " no"
      },
      {
            "event": "token",
            "delta": " further"
      },
      {
            "event": "token",
            "delta": " detail"
      },
      {
            "event": "token",
            "delta": " [["
      },
      {
            "event": "token",
            "delta": "c"
      },
      {
            "event": "token",
            "delta": ":"
      },
      {
            "event": "token",
            "delta": "4"
      },
      {
            "event": "token",
            "delta": "]]."
      },
      {
            "event": "audit",
            "answer_final": "In 2024 JWST used NIRCam and MIRI to image the nearby star Vega, achieving F444W contrast levels of 3 × 10⁻⁷ at 1″, 1 × 10⁻⁷ at 2″, and a few × 10⁻⁸ beyond 5″, and identified two faint, extended objects in the outer debris disk that resemble distant extragalactic sources [[c:1]].\n\nA Discoveries Tracker entry dated 19 March 2024 notes that JWST continued to unlock new insights throughout that month, emphasizing the observatory’s ongoing impact on our understanding of the cosmos [[c:2]].\n\nA September 2024 summary lists the top five JWST discoveries of the year, highlighting breakthroughs in exoplanet science, striking deep‑space images, and new information on star‑formation processes [[c:4]].",
            "claims": [
                  {
                        "claim_id": 0,
                        "text": "In 2024 JWST used NIRCam and MIRI to image the nearby star Vega, achieving F444W contrast levels of 3 × 10⁻⁷ at 1″, 1 × 10⁻⁷ at 2″, and a few × 10⁻⁸ beyond 5″, and identified two faint, extended objects in the outer debris disk that resemble distant extragalactic sources.",
                        "citation_ids": [
                              1
                        ],
                        "evidence": "achieved F444W contrast levels of 3 × 10−7 at 1″ (7.7 au), 1 × 10−7 at 2″ (15 au), and a few × 10−8 beyond 5″ (38 au), corresponding to masses of <3, 2, and 0.5 M J for a system age of 700 Myr.; Two F444W objects are identified in the outer MIRI debris disk, around 48 au. One of these is detected by MIRI and appears to be extended with a spectral energy distribution similar to those of distant extragalactic sources.",
                        "note": "Audit flagged: unverified numbers: 2024; unverified entities: 2024.",
                        "supported": false,
                        "status": "partially_supported",
                        "coverage": 0.667,
                        "start": 0,
                        "end": 272
                  },
                  {
                        "claim_id": 1,
                        "text": "A Discoveries Tracker entry dated 19 March 2024 notes that JWST continued to unlock new insights throughout that month, emphasizing the observatory’s ongoing impact on our understanding of the cosmos.",
                        "citation_ids": [
                              2
                        ],
                        "evidence": "Mar 19, 2024 · James Webb Telescope Unlocks the Universe's Secrets: March 2024 Discoveries; The James Webb Space Telescope (JWST), humanity's most powerful observatory, continues to revolutionize our understanding of the cosmos.",
                        "note": "Audit flagged: insufficient quote coverage (40.0% < 60%).",
                        "supported": false,
                        "status": "partially_supported",
                        "coverage": 0.4,
                        "start": 282,
                        "end": 482
                  },
                  {
                        "claim_id": 2,
                        "text": "A September 2024 summary lists the top five JWST discoveries of the year, highlighting breakthroughs in exoplanet science, striking deep‑space images, and new information on star‑formation processes.",
                        "citation_ids": [
                              4
                        ],
                        "evidence": "Sep 27, 2024 · The top James Webb Space Telescope discoveries of 2024, including exoplanet breakthroughs, deep space images, and insights into star formation.",
                        "note": "Audit flagged: insufficient quote coverage (42.1% < 60%); unverified entities: September.",
                        "supported": false,
                        "status": "partially_supported",
                        "coverage": 0.421,
                        "start": 741,
                        "end": 948
                  }
            ],
            "removed_claims": [
                  {
                        "text": "JWST observations have also revealed apparently “anomalous” early‑forming galaxies whose masses challenge standard expectations for galaxy growth, prompting theoretical work to explain these findings without revising established cosmology.",
                        "reason": "Source quote coverage below 30% (0.0%)"
                  }
            ],
            "conflicts": [],
            "retractions": [],
            "confidence": 0.39,
            "tier_agreement": null,
            "repaired": true,
            "sources": [
                  {
                        "source": "https://doi.org/10.1117/1.jatis.10.1.011208",
                        "source_type": "openalex",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 1,
                        "published": "2024-02-05",
                        "cited": false
                  },
                  {
                        "source": "https://doi.org/10.3847/1538-3881/ad890d",
                        "source_type": "openalex",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 2,
                        "published": "2024-12-10",
                        "cited": true
                  },
                  {
                        "source": "https://blog.jameswebbdiscovery.com/2024/03/james-webb-space-telescope-discoveries.html",
                        "source_type": "duckduckgo",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 3,
                        "published": "2024",
                        "cited": true
                  },
                  {
                        "source": "https://doi.org/10.33140/ssj.01.02.10",
                        "source_type": "openalex",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 4,
                        "published": "2024-08-02",
                        "cited": false
                  },
                  {
                        "source": "https://blog.jaseph.com/top-5-james-webb-telescope-discoveries-in-2024/8934/",
                        "source_type": "duckduckgo",
                        "tier": "LIVE",
                        "similarity": null,
                        "is_retracted": false,
                        "rank": 5,
                        "published": "2024",
                        "cited": true
                  }
            ]
      },
      {
            "event": "done"
      }
]
  },
  "retraction": {
    "id": "retraction",
    "query": "Is ambient hyperconductivity confirmed in synthesized phosphor-apatite? (test fixture)",
    "label": "Test Fixture: Retraction Watch Alert (Fictional)",
    "events": [
      {
        "event": "start",
        "thread_id": "mock-retract-thread"
      },
      {
        "event": "route",
        "dristi_available": false,
        "dristi_engine": "V1",
        "route_decision": "cascade",
        "escalated": false,
        "v1_confidence": 0.74,
        "v2_confidence": null,
        "latency_ms": 19.1
      },
      {
        "event": "retrieve",
        "tiers": [
          "LIVE"
        ],
        "okf_node_paths": [],
        "rag_scores": [],
        "sources": [
          {
            "source": "synth-phys/2026.001 (test fixture)",
            "source_type": "preprint",
            "tier": "LIVE",
            "similarity": null,
            "is_retracted": true,
            "rank": 1,
            "published": "2026-03-01",
            "cited": true
          },
          {
            "source": "empirical-rep/2026.042 (test fixture)",
            "source_type": "scholarly_article",
            "tier": "LIVE",
            "similarity": null,
            "is_retracted": false,
            "rank": 2,
            "published": "2026-04-12",
            "cited": true
          }
        ]
      },
      {
        "event": "citation",
        "id": 0,
        "title": "Observation of Ambient Hyperconductivity in Phospho-Silicate Matrices (test fixture)",
        "path": null,
        "url": null,
        "authors": "Kovacs, E. et al. (test fixture)",
        "year": 2026,
        "venue": "Synthetic Physics Preprints (test fixture)",
        "snippet": "We report preliminary evidence of ambient hyperconductivity in modified phospho-silicate matrices below 380 K at standard atmospheric pressure (test fixture).",
        "source_type": "preprint",
        "tier": "LIVE",
        "doi": null,
        "arxiv_id": null,
        "is_retracted": true,
        "review_status": "preprint",
        "cited": true
      },
      {
        "event": "citation",
        "id": 1,
        "title": "Crystallographic Refutation and Impurity Pinning Analysis (test fixture)",
        "path": null,
        "url": null,
        "authors": "Vanderbilt Materials Consortium (test fixture)",
        "year": 2026,
        "venue": "Journal of Empirical Replications (test fixture)",
        "snippet": "Independent replications confirm that anomalous resistance transitions originate exclusively from ferromagnetic domain pinning of nickel impurities rather than superconductivity (test fixture).",
        "source_type": "scholarly_article",
        "tier": "LIVE",
        "doi": null,
        "arxiv_id": null,
        "is_retracted": false,
        "review_status": "scholarly",
        "cited": true
      },
      {
        "event": "token",
        "delta": "### Hyperconductivity Evaluation (test fixture)\n\nNo, ambient hyperconductivity has **not** been confirmed in synthetic phospho-silicate matrices.\n\nWhile an initial preprint asserted zero electrical resistance above 380 K [[c:0]], independent multi-center crystallographic replications refuting the phenomenon established that ferromagnetic domain pinning of nickel impurities caused the observed measurement artifacts [[c:1]]."
      },
      {
        "event": "audit",
        "answer_final": "### Hyperconductivity Evaluation (test fixture)\n\nNo, ambient hyperconductivity has **not** been confirmed in synthetic phospho-silicate matrices.\n\nWhile an initial preprint asserted zero electrical resistance above 380 K [[c:0]], independent multi-center crystallographic replications refuting the phenomenon established that ferromagnetic domain pinning of nickel impurities caused the observed measurement artifacts [[c:1]].",
        "confidence": 0.38,
        "tier_agreement": "conflicting",
        "claims": [
          {
            "claim_id": 0,
            "text": "No, ambient hyperconductivity has not been confirmed in synthetic phospho-silicate matrices.",
            "status": "supported",
            "citation_ids": [
              1
            ],
            "supported": true,
            "evidence": "Independent replications confirm that anomalous resistance transitions originate exclusively from ferromagnetic domain pinning of nickel impurities rather than superconductivity (test fixture).",
            "start": 46,
            "end": 140
          },
          {
            "claim_id": 1,
            "text": "While an initial preprint asserted zero electrical resistance above 380 K, independent multi-center crystallographic replications refuting the phenomenon established that ferromagnetic domain pinning of nickel impurities caused the observed measurement artifacts.",
            "status": "unsupported",
            "citation_ids": [
              0
            ],
            "supported": false,
            "evidence": "Refuted by independent crystallographic replications (test fixture).",
            "note": "Citation [[c:0]] flagged in Retraction Watch DB for unverified measurement artifacts (test fixture).",
            "start": 143,
            "end": 422
          }
        ],
        "conflicts": [
          "Preprint assertion directly refuted by independent crystallographic replications (test fixture)"
        ],
        "retractions": [
          "Synthetic Physics Preprints #2026.001 flagged in Retraction Watch DB (test fixture)"
        ],
        "repaired": false,
        "sources": [
          {
            "source": "synth-phys/2026.001 (test fixture)",
            "source_type": "preprint",
            "tier": "LIVE",
            "similarity": null,
            "is_retracted": true,
            "rank": 1,
            "published": "2026-03-01",
            "cited": true
          },
          {
            "source": "empirical-rep/2026.042 (test fixture)",
            "source_type": "scholarly_article",
            "tier": "LIVE",
            "similarity": null,
            "is_retracted": false,
            "rank": 2,
            "published": "2026-04-12",
            "cited": true
          }
        ]
      },
      {
        "event": "done"
      }
    ]
  },
  "conflict": {
    "id": "conflict",
    "query": "Do synthetic neural networks demonstrate discontinuous capability jumps? (test fixture)",
    "label": "Test Fixture: Cross-Tier Conflict (Fictional)",
    "events": [
      {
        "event": "start",
        "thread_id": "mock-conflict-thread"
      },
      {
        "event": "route",
        "dristi_available": false,
        "dristi_engine": "V1",
        "route_decision": "cascade",
        "escalated": false,
        "v1_confidence": 0.81,
        "v2_confidence": null,
        "latency_ms": 21.0
      },
      {
        "event": "retrieve",
        "tiers": [
          "OKF",
          "LIVE"
        ],
        "okf_node_paths": [
          "sim_notes/phase_transitions.md"
        ],
        "rag_scores": [],
        "sources": [
          {
            "source": "sim_notes/phase_transitions.md",
            "source_type": "personal_note",
            "tier": "OKF",
            "similarity": null,
            "is_retracted": false,
            "rank": 1,
            "published": "2025-06-20",
            "cited": true
          },
          {
            "source": "metric-studies/2026.088 (test fixture)",
            "source_type": "preprint",
            "tier": "LIVE",
            "similarity": null,
            "is_retracted": false,
            "rank": 2,
            "published": "2026-03-12",
            "cited": true
          }
        ]
      },
      {
        "event": "citation",
        "id": 0,
        "title": "Discontinuous First-Order Phase Transitions in Parameter Scaling (test fixture)",
        "path": "sim_notes/phase_transitions.md",
        "url": null,
        "authors": "Personal Research Note (test fixture)",
        "year": 2025,
        "venue": "Personal OKF Knowledge Graph (test fixture)",
        "snippet": "Synthetic neural competencies exhibit sharp first-order phase transitions occurring strictly when network parameter mass surpasses critical threshold theta (test fixture).",
        "source_type": "markdown_note",
        "tier": "OKF",
        "doi": null,
        "arxiv_id": null,
        "is_retracted": false,
        "review_status": "draft",
        "cited": true
      },
      {
        "event": "citation",
        "id": 1,
        "title": "Continuous Metric Geometry in Model Benchmark Scaling (test fixture)",
        "path": null,
        "url": null,
        "authors": "Algorithmic Measurement Group (test fixture)",
        "year": 2026,
        "venue": "Neural Computing Preprints (test fixture)",
        "snippet": "Observed step discontinuities in benchmark accuracy dissolve into continuous smooth scaling functions when evaluated with continuous metric projections (test fixture).",
        "source_type": "preprint",
        "tier": "LIVE",
        "doi": null,
        "arxiv_id": null,
        "is_retracted": false,
        "review_status": "preprint",
        "cited": true
      },
      {
        "event": "token",
        "delta": "### Phase Discontinuity vs Metric Projection (test fixture)\n\nThe epistemological evaluation of synthetic cognitive emergence features clear tension:\n\n1. **Discontinuous Transition Model:** Earlier hypothesis posits sudden jump dynamics once parameter scale crosses critical threshold thresholds [[c:0]].\n2. **Continuous Metric Model:** Systematic evaluation demonstrates that apparent discrete jumps are evaluation artifacts created by step-threshold scoring metrics [[c:1]].\n\nCurrent empirical synthesis strongly indicates smooth scaling dynamics rather than true physical phase jumps."
      },
      {
        "event": "audit",
        "answer_final": "### Phase Discontinuity vs Metric Projection (test fixture)\n\nThe epistemological evaluation of synthetic cognitive emergence features clear tension:\n\n1. **Discontinuous Transition Model:** Earlier hypothesis posits sudden jump dynamics once parameter scale crosses critical threshold thresholds [[c:0]].\n2. **Continuous Metric Model:** Systematic evaluation demonstrates that apparent discrete jumps are evaluation artifacts created by step-threshold scoring metrics [[c:1]].\n\nCurrent empirical synthesis strongly indicates smooth scaling dynamics rather than true physical phase jumps.",
        "confidence": 0.62,
        "tier_agreement": "conflicting",
        "claims": [
          {
            "claim_id": 0,
            "text": "Discontinuous Transition Model: Earlier hypothesis posits sudden jump dynamics once parameter scale crosses critical threshold thresholds.",
            "status": "partially_supported",
            "citation_ids": [
              0
            ],
            "supported": false,
            "evidence": "Synthetic neural competencies exhibit sharp first-order phase transitions occurring strictly when network parameter mass surpasses critical threshold theta (test fixture).",
            "note": "Contested by newer continuous metric geometry evaluations (test fixture).",
            "start": 150,
            "end": 303
          },
          {
            "claim_id": 1,
            "text": "Continuous Metric Model: Systematic evaluation demonstrates that apparent discrete jumps are evaluation artifacts created by step-threshold scoring metrics.",
            "status": "supported",
            "citation_ids": [
              1
            ],
            "supported": true,
            "evidence": "Observed step discontinuities in benchmark accuracy dissolve into continuous smooth scaling functions when evaluated with continuous metric projections (test fixture).",
            "start": 305,
            "end": 476
          },
          {
            "claim_id": 2,
            "text": "Current empirical synthesis strongly indicates smooth scaling dynamics rather than true physical phase jumps.",
            "status": "uncited",
            "citation_ids": [],
            "supported": false,
            "evidence": "",
            "note": "Uncited claim: Synthesis assertion without direct supporting marker.",
            "start": 479,
            "end": 588
          }
        ],
        "conflicts": [
          "OKF discontinuous transition hypothesis directly contested by continuous metric findings (test fixture)"
        ],
        "retractions": [],
        "repaired": false,
        "sources": [
          {
            "source": "sim_notes/phase_transitions.md",
            "source_type": "personal_note",
            "tier": "OKF",
            "similarity": null,
            "is_retracted": false,
            "rank": 1,
            "published": "2025-06-20",
            "cited": true
          },
          {
            "source": "metric-studies/2026.088 (test fixture)",
            "source_type": "preprint",
            "tier": "LIVE",
            "similarity": null,
            "is_retracted": false,
            "rank": 2,
            "published": "2026-03-12",
            "cited": true
          }
        ]
      },
      {
        "event": "done"
      }
    ]
  }
};
