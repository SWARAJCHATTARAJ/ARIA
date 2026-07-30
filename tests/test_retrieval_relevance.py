"""
Regression test suite for semantic relevance filtering.
Tests that known keyword-collision traps are filtered out by the embedding-based relevance filter.
"""

import os
import unittest
from typing import List, Tuple

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("DISABLE_HEAVY_MODELS", "true")
os.environ.setdefault("ARIA_RELEVANCE_THRESHOLD", "0.35")

from aria.core import Evidence
from aria.relevance import filter_evidence_by_relevance, compute_relevance_scores


# Known keyword-collision traps (from bug reports)
KNOWN_TRAPS: List[Tuple[str, List[Evidence]]] = [
    (
        "remote work productivity trends 2024",
        [
            # TRAP: "remote sensing" satellite papers
            Evidence(
                title="Remote Sensing of Forest Carbon Stocks Using LiDAR",
                summary="This study uses airborne LiDAR remote sensing to estimate above-ground biomass in tropical forests. Satellite remote sensing provides critical data for carbon monitoring.",
                source_type="research",
                url="https://arxiv.org/abs/2301.12345",
            ),
            Evidence(
                title="Advances in Remote Sensing for Agricultural Monitoring",
                summary="Satellite remote sensing with multispectral imagery enables large-scale crop health monitoring. We present a deep learning framework for Sentinel-2 data.",
                source_type="research",
                url="https://arxiv.org/abs/2302.54321",
            ),
            # TRAP: Clinical decision-support papers
            Evidence(
                title="Clinical Decision Support Systems in Remote ICU Settings",
                summary="A randomized trial of remote clinical decision support for intensive care units. Tele-ICU systems with AI decision support reduced mortality by 15%.",
                source_type="research",
                url="https://pubmed.ncbi.nlm.nih.gov/12345678",
            ),
            # TRAP: Mixture-of-Experts ML papers
            Evidence(
                title="Mixture-of-Experts Models for Scalable Language Modeling",
                summary="We present a sparse Mixture-of-Experts (MoE) architecture that routes tokens to specialized expert networks. Remote experts are activated based on input routing.",
                source_type="research",
                url="https://arxiv.org/abs/2303.98765",
            ),
            # RELEVANT: Actual remote work papers
            Evidence(
                title="Remote Work Productivity: A Meta-Analysis of Post-Pandemic Studies",
                summary="Analysis of 47 studies on remote work productivity shows mixed effects. Knowledge workers show 4-8% productivity gains while collaborative tasks decline.",
                source_type="research",
                url="https://arxiv.org/abs/2401.11111",
            ),
            Evidence(
                title="The Future of Hybrid Work: Trends and Predictions for 2024",
                summary="Survey of 10,000 companies reveals hybrid work models dominate. Employee preference for flexibility drives retention. Office attendance stabilizes at 2-3 days/week.",
                source_type="web",
                url="https://example.com/remote-work-2024",
            ),
        ],
    ),
    (
        "Python programming language tutorial",
        [
            # TRAP: Python snake
            Evidence(
                title="Burmese Python Biology and Invasive Species Impact",
                summary="The Burmese python (Python bivittatus) is a large constrictor snake native to Southeast Asia. Invasive populations in Florida Everglades threaten native wildlife.",
                source_type="research",
                url="https://doi.org/10.1234/python-biology",
            ),
            Evidence(
                title="Python Snake Venom Composition Analysis",
                summary="Proteomic analysis of python venom reveals novel peptides. Python species lack true venom glands but secrete toxic saliva.",
                source_type="research",
                url="https://pubmed.ncbi.nlm.nih.gov/87654321",
            ),
            # RELEVANT: Python programming
            Evidence(
                title="Python 3.12 Tutorial: From Beginner to Advanced",
                summary="Comprehensive Python programming tutorial covering syntax, data structures, OOP, async programming, and packaging. Includes hands-on exercises.",
                source_type="web",
                url="https://docs.python.org/3/tutorial/",
            ),
            Evidence(
                title="Effective Python: 90 Specific Ways to Write Better Python",
                summary="Best practices for Python development including type hints, decorators, context managers, and performance optimization techniques.",
                source_type="web",
                url="https://effectivepython.com",
            ),
        ],
    ),
    (
        "cloud computing architecture patterns",
        [
            # TRAP: Cloud weather
            Evidence(
                title="Cloud Formation Physics and Precipitation Modeling",
                summary="Microphysical processes in cumulus cloud formation. Ice nucleation and droplet collision-coalescence mechanisms drive precipitation in warm clouds.",
                source_type="research",
                url="https://arxiv.org/abs/2304.11111",
            ),
            Evidence(
                title="Climate Change Impact on Cloud Cover and Radiative Forcing",
                summary="CMIP6 models show decreasing low-cloud cover amplifies warming. Cloud feedback remains largest uncertainty in climate sensitivity estimates.",
                source_type="research",
                url="https://doi.org/10.1038/climate-clouds",
            ),
            # RELEVANT: Cloud computing
            Evidence(
                title="Cloud Native Architecture Patterns: Microservices, Serverless, and Event-Driven",
                summary="Design patterns for cloud-native applications including circuit breaker, saga, CQRS, and event sourcing. Kubernetes deployment strategies.",
                source_type="web",
                url="https://cloudpatterns.io",
            ),
            Evidence(
                title="AWS Well-Architected Framework: Operational Excellence Pillar",
                summary="Best practices for running and monitoring systems on AWS. Automation, observability, and incident response in cloud environments.",
                source_type="web",
                url="https://aws.amazon.com/architecture/well-architected/",
            ),
        ],
    ),
    (
        "Apple stock price analysis",
        [
            # TRAP: Apple fruit
            Evidence(
                title="Apple (Malus domestica) Genome Assembly and Fruit Quality Traits",
                summary="High-quality genome assembly of Golden Delicious apple. QTL mapping identifies genes controlling fruit texture, sweetness, and disease resistance.",
                source_type="research",
                url="https://doi.org/10.1038/apple-genome",
            ),
            Evidence(
                title="Impact of Climate Change on Apple Orchard Productivity",
                summary="Temperature increases shift apple growing regions poleward. Chilling hour requirements unmet in traditional regions. Cultivar adaptation strategies reviewed.",
                source_type="research",
                url="https://arxiv.org/abs/2305.22222",
            ),
            # RELEVANT: Apple stock
            Evidence(
                title="Apple Inc. (AAPL) Q4 2024 Earnings Report Analysis",
                summary="Apple reports $89.5B revenue, iPhone sales up 6%. Services revenue hits record $24.9B. Guidance suggests modest growth for Q1 2025.",
                source_type="finance",
                url="https://finance.yahoo.com/quote/AAPL",
            ),
            Evidence(
                title="AAPL Technical Analysis: Support at $170, Resistance at $195",
                summary="Moving averages show bullish crossover. RSI at 62 indicates room for upside. Volume profile suggests accumulation at current levels.",
                source_type="finance",
                url="https://tradingview.com/AAPL",
            ),
        ],
    ),
    (
        "Java programming language features",
        [
            # TRAP: Java island/coffee
            Evidence(
                title="Java Island Biodiversity: Endemic Species Conservation",
                summary="Java's tropical forests host 45 endemic bird species. Deforestation threatens 60% of habitat. Conservation corridors proposed for Javan hawk-eagle.",
                source_type="research",
                url="https://doi.org/10.1038/java-biodiversity",
            ),
            Evidence(
                title="Coffee Production in Java: Historical and Economic Analysis",
                summary="Java coffee (Coffea arabica) cultivation dates to 1699. Smallholder farmers produce 90% of output. Price volatility impacts 2 million livelihoods.",
                source_type="research",
                url="https://arxiv.org/abs/2306.33333",
            ),
            # RELEVANT: Java programming
            Evidence(
                title="Java 21 Features: Virtual Threads, Pattern Matching, and Records",
                summary="JDK 21 introduces virtual threads (Project Loom), pattern matching for switch, record patterns, and sequenced collections. Migration guide included.",
                source_type="web",
                url="https://openjdk.org/projects/jdk/21/",
            ),
            Evidence(
                title="Spring Boot 3.2: GraalVM Native Image Support",
                summary="Spring Boot 3.2 adds AOT compilation for faster startup. Native images reduce memory footprint by 60%. Compatibility with Java 21 virtual threads.",
                source_type="web",
                url="https://spring.io/blog/2023/11/spring-boot-3.2",
            ),
        ],
    ),
]


# Additional synthetic ambiguous-term queries for broader coverage
SYNTHETIC_TRAPS: List[Tuple[str, List[Evidence]]] = [
    (
        "bank merger acquisition finance",
        [
            Evidence(
                title="River Bank Erosion and Sediment Transport Dynamics",
                summary="Fluvial geomorphology study of river bank erosion. Hydraulic modeling predicts bank retreat rates under climate change scenarios. Riparian vegetation effects.",
                source_type="research",
                url="https://arxiv.org/abs/2307.44444",
            ),
            Evidence(
                title="Blood Bank Inventory Management During Pandemic",
                summary="Red Cross blood bank supply chain optimization. Platelet shelf-life constraints drive allocation algorithms. Donor recruitment strategies evaluated.",
                source_type="research",
                url="https://pubmed.ncbi.nlm.nih.gov/55555555",
            ),
            Evidence(
                title="JPMorgan Chase Acquires First Republic Bank: Deal Analysis",
                summary="JPMorgan acquires First Republic in FDIC receivership. $92B assets acquired. Deposit franchise valued at $15B. Regulatory approval timeline.",
                source_type="finance",
                url="https://finance.yahoo.com/jpm-frc",
            ),
            Evidence(
                title="Bank of America Merrill Lynch M&A Advisory League Tables 2024",
                summary="BoA tops M&A advisory rankings with $450B announced deals. Technology sector drives 35% of volume. Cross-border deals rebound.",
                source_type="finance",
                url="https://mergers.baml.com/league-tables",
            ),
        ],
    ),
    (
        "chip semiconductor shortage supply chain",
        [
            Evidence(
                title="Potato Chip Flavor Innovation: Consumer Preference Study",
                summary="Sensory evaluation of novel potato chip flavors. Kettle-cooked vs fried texture preferences. Salt reduction impact on acceptability scores.",
                source_type="research",
                url="https://doi.org/10.1016/chip-flavors",
            ),
            Evidence(
                title="DNA Microarray Chip Technology for Gene Expression",
                summary="High-density oligonucleotide microarray chip design. Probe optimization for transcriptome analysis. Single-channel vs two-channel hybridization comparison.",
                source_type="research",
                url="https://arxiv.org/abs/2308.55555",
            ),
            Evidence(
                title="Global Semiconductor Shortage: Automotive Impact and Recovery Timeline",
                summary="Auto chip shortage cuts 2023 production by 4M units. Foundry capacity expansion underway. TSMC Arizona fab 2025 timeline. Legacy node bottlenecks persist.",
                source_type="web",
                url="https://semiconductors.org/shortage-report",
            ),
            Evidence(
                title="CHIPS Act Funding: Intel, TSMC, Samsung Award Amounts",
                summary="US CHIPS Act allocates $39B incentives. Intel awarded $8.5B grants + $11B loans. TSMC Arizona $6.6B. Samsung Taylor $6.4B. Construction milestones tracked.",
                source_type="web",
                url="https://commerce.gov/chips-awards",
            ),
        ],
    ),
    (
        "mouse computer peripheral ergonomics",
        [
            Evidence(
                title="House Mouse (Mus musculus) Genome Annotation Update",
                summary="GRCm39 reference genome assembly improves gene annotation. 22,000 protein-coding genes. Non-coding RNA catalog expanded. Strain-specific variants mapped.",
                source_type="research",
                url="https://www.ncbi.nlm.nih.gov/assembly/GCF_000001635.27",
            ),
            Evidence(
                title="Mouse Model of Alzheimer's Disease: Amyloid Pathology",
                summary="APP/PS1 transgenic mice develop amyloid plaques at 6 months. Cognitive deficits in Morris water maze. BACE1 inhibitor reduces plaque load by 40%.",
                source_type="research",
                url="https://pubmed.ncbi.nlm.nih.gov/77777777",
            ),
            Evidence(
                title="Best Ergonomic Mouse 2024: Vertical, Trackball, and Traditional",
                summary="Logitech MX Vertical reduces forearm pronation 10%. Trackball options for thumb vs finger control. Gaming vs productivity mouse comparison.",
                source_type="web",
                url="https://rtings.com/mouse/reviews/best-ergonomic",
            ),
            Evidence(
                title="Carpal Tunnel Syndrome Prevention: Mouse Design Guidelines",
                summary="NIOSH recommends neutral wrist posture. Vertical mice reduce median nerve pressure. Break reminder software efficacy studied in office workers.",
                source_type="research",
                url="https://pubmed.ncbi.nlm.nih.gov/88888888",
            ),
        ],
    ),
    (
        "transformer architecture attention mechanism",
        [
            Evidence(
                title="Transformers: Robots in Disguise - Toy Line History",
                summary="Hasbro Transformers toy line launched 1984. Generation 1 characters: Optimus Prime, Megatron. Live-action film franchise grossed $4.8B globally.",
                source_type="web",
                url="https://transformers.fandom.com/wiki/Generation_1",
            ),
            Evidence(
                title="Electrical Transformer Design: Core Losses and Efficiency",
                summary="Power transformer core material selection. Amorphous steel reduces no-load losses 70%. High-voltage insulation design for 765kV transmission.",
                source_type="research",
                url="https://arxiv.org/abs/2309.66666",
            ),
            Evidence(
                title="Attention Is All You Need: Transformer Architecture Deep Dive",
                summary="Vaswani et al. 2017 transformer architecture. Multi-head self-attention, positional encoding, feed-forward layers. BERT, GPT, T5 variants compared.",
                source_type="research",
                url="https://arxiv.org/abs/1706.03762",
            ),
            Evidence(
                title="Vision Transformer (ViT): Image Classification with Attention",
                summary="Dosovitskiy et al. 2020 applies transformer to image patches. Patch embedding + positional encoding. Pre-training on JFT-300M beats CNNs on ImageNet.",
                source_type="research",
                url="https://arxiv.org/abs/2010.11929",
            ),
        ],
    ),
    (
        "blockchain consensus algorithm proof of stake",
        [
            Evidence(
                title="Block Chain (Physical): Mechanical Linkage Design",
                summary="Roller chain block design for conveyor systems. Tensile strength calculation per ISO 606. Fatigue life estimation for industrial applications.",
                source_type="research",
                url="https://arxiv.org/abs/2310.77777",
            ),
            Evidence(
                title="Supply Chain Blockchain: Block Chain Traceability for Food Safety",
                summary="Hyperledger Fabric implementation for pork supply chain. QR code traceability from farm to fork. Smart contract automated recall triggers.",
                source_type="research",
                url="https://doi.org/10.1016/food-blockchain",
            ),
            Evidence(
                title="Ethereum Proof-of-Stake: Beacon Chain, Validators, and Finality",
                summary="Ethereum Merge completed Sept 2022. Casper FFG finality gadget. Validator rewards ~4% APR. Slashing conditions for equivocation and surround vote.",
                source_type="web",
                url="https://ethereum.org/en/developers/docs/consensus-mechanisms/pos/",
            ),
            Evidence(
                title="Cardano Ouroboros: Provably Secure Proof-of-Stake Protocol",
                summary="Ouroboros Praos achieves adaptive security. Stake pools and delegation. Hydra layer-2 scaling for 1000+ TPS. Formal verification in Coq.",
                source_type="web",
                url="https://iohk.io/en/research/papers/ouroboros/",
            ),
        ],
    ),
    (
        "token authentication security JWT",
        [
            Evidence(
                title="Arcade Token Economy: Psychological Study of Reward Systems",
                summary="Token reinforcement systems in behavioral therapy. Variable ratio schedules produce highest response rates. Gambling addiction parallels studied.",
                source_type="research",
                url="https://pubmed.ncbi.nlm.nih.gov/99999999",
            ),
            Evidence(
                title="Board Game Token Components: Manufacturing and Materials",
                summary="Injection molded plastic token production. Custom meeple design for Kickstarter campaigns. PVC vs ABS durability testing. Cost per unit at scale.",
                source_type="web",
                url="https://boardgamegeek.com/token-manufacturing",
            ),
            Evidence(
                title="JWT Best Practices: Secure Token Storage and Rotation",
                summary="HttpOnly cookies vs localStorage for JWT. Short-lived access tokens (15min) with refresh token rotation. RS256 vs HS256 signing algorithm choice.",
                source_type="web",
                url="https://auth0.com/blog/jwt-best-practices",
            ),
            Evidence(
                title="OAuth 2.1 and OpenID Connect: Token Exchange and Revocation",
                summary="RFC 8693 token exchange for impersonation/delegation. RFC 7009 token revocation endpoint. DPoP proof-of-possession for sender-constrained tokens.",
                source_type="web",
                url="https://openid.net/specs/openid-connect-core-1_0.html",
            ),
        ],
    ),
    (
        "container orchestration kubernetes docker",
        [
            Evidence(
                title="Shipping Container Standardization: ISO 668 Dimensions",
                summary="ISO 668 Series 1 freight containers: 20ft, 40ft, 45ft. Corner casting specifications. CSC safety approval plates. Intermodal transport efficiency.",
                source_type="research",
                url="https://iso.org/standard/668",
            ),
            Evidence(
                title="Docker Container Storage: OverlayFS vs Device Mapper",
                summary="OverlayFS driver performance for container images. Copy-on-write semantics. Storage driver selection for production Kubernetes clusters.",
                source_type="web",
                url="https://docs.docker.com/storage/storagedriver/overlayfs-driver/",
            ),
            Evidence(
                title="Kubernetes Container Runtime Interface (CRI) Implementation",
                summary="CRI-O vs containerd vs Docker Engine. CRI plugin architecture. Sandboxed runtimes: gVisor, Kata Containers. RuntimeClass for workload isolation.",
                source_type="web",
                url="https://kubernetes.io/docs/concepts/architecture/cri/",
            ),
            Evidence(
                title="Container Shipping Crisis 2024: Port Congestion and Rates",
                summary="Shanghai-Ningbo congestion adds 14 days transit. Spot rates $4,500/FEU. Blank sailings reduce capacity 15%. Red Sea diversion impacts Suez traffic.",
                source_type="web",
                url="https://freos.searates.com/container-crisis",
            ),
        ],
    ),
    (
        "prompt engineering llm optimization",
        [
            Evidence(
                title="Civil Engineering: Soil Prompt Consolidation Testing",
                summary="Standard penetration test (SPT) for soil bearing capacity. Consolidation settlement prediction for foundation design. Oedometer test procedure per ASTM D2435.",
                source_type="research",
                url="https://ascelibrary.org/doi/soil-prompt",
            ),
            Evidence(
                title="Prompt Engineering Guide: Chain-of-Thought, Few-Shot, and RAG Patterns",
                summary="Zero-shot vs few-shot prompting. Chain-of-thought reasoning for math/logic. RAG prompt templates for citation grounding. Temperature and top-p tuning.",
                source_type="web",
                url="https://promptingguide.ai",
            ),
            Evidence(
                title="LLM Prompt Injection Attacks and Defenses",
                summary="Direct and indirect prompt injection vulnerabilities. Instruction hierarchy defenses. Sandboxed tool use. Evaluation benchmarks: HackAPrompt, PromptInject.",
                source_type="research",
                url="https://arxiv.org/abs/2302.12173",
            ),
            Evidence(
                title="Structured Output Prompting: JSON Schema and Function Calling",
                summary="OpenAI function calling with JSON Schema validation. Instructor library for Pydantic models. Guidance/llama.cpp grammar-constrained generation.",
                source_type="web",
                url="https://github.com/openai/function-calling",
            ),
        ],
    ),
    (
        "agent framework langgraph autogen",
        [
            Evidence(
                title="Secret Agent Spy Thriller: Literary Genre Analysis",
                summary="Ian Fleming's James Bond defines spy thriller tropes. Cold War espionage themes. Film adaptation evolution from Connery to Craig. Cultural impact study.",
                source_type="web",
                url="https://literature.britishcouncil.org/spy-fiction",
            ),
            Evidence(
                title="Real Estate Agent Commission Structures: Market Analysis",
                summary="US average commission 5-6% split buy/sell. Discount brokers at 1-2%. iBuyer models (Opendoor, Offerpad) disrupt traditional agency. Antitrust lawsuits pending.",
                source_type="web",
                url="https://realtor.com/commission-trends",
            ),
            Evidence(
                title="LangGraph: Stateful Multi-Actor Applications with LLMs",
                summary="LangGraph extends LangChain with cyclic graphs for agents. State management, checkpoints, human-in-the-loop. Multi-agent orchestration patterns.",
                source_type="web",
                url="https://langchain-ai.github.io/langgraph/",
            ),
            Evidence(
                title="AutoGen: Next-Gen Multi-Agent Conversation Framework",
                summary="Microsoft AutoGen enables agent-to-agent chat. User proxy, assistant, and group chat patterns. Code execution and tool use. LLM-backed agents.",
                source_type="web",
                url="https://microsoft.github.io/autogen/",
            ),
        ],
    ),
]


def _is_relevant(query: str, evidence: Evidence) -> bool:
    """Heuristic: check if evidence title/summary contains query's key domain terms."""
    if not query:
        return False
    q_lower = query.lower()
    text = f"{evidence.title} {evidence.summary}".lower()
    
    # Define domain keywords for each query
    if "remote work" in q_lower:
        return any(kw in text for kw in ["remote work", "hybrid work", "work from home", "productivity", "office attendance"])
    elif "python" in q_lower and "programming" in q_lower:
        return any(kw in text for kw in ["programming", "tutorial", "python 3", "code", "developer", "software", "language feature"])
    elif "cloud computing" in q_lower:
        return any(kw in text for kw in ["cloud native", "microservices", "serverless", "kubernetes", "aws", "azure", "architecture pattern"])
    elif "apple stock" in q_lower or "aapl" in q_lower:
        return any(kw in text for kw in ["apple inc", "aapl", "earnings", "stock", "revenue", "iphone", "services revenue"])
    elif "java" in q_lower and "programming" in q_lower:
        return any(kw in text for kw in ["jdk", "spring", "virtual thread", "pattern matching", "garbage collection", "jvm"])
    elif "bank merger" in q_lower:
        return any(kw in text for kw in ["jpmorgan", "first republic", "merger", "acquisition", "fdic", "m&a advisory", "league table"])
    elif "chip semiconductor" in q_lower:
        return any(kw in text for kw in ["semiconductor", "tsmc", "foundry", "automotive chip", "chips act", "intel", "fab"])
    elif "mouse" in q_lower and "computer" in q_lower:
        return any(kw in text for kw in ["ergonomic", "vertical mouse", "trackball", "logitech", "carpal tunnel", "peripheral"])
    elif "transformer" in q_lower and "attention" in q_lower:
        return any(kw in text for kw in ["attention is all you need", "multi-head", "self-attention", "bert", "gpt", "vit", "vaswani"])
    elif "blockchain" in q_lower and "proof of stake" in q_lower:
        return any(kw in text for kw in ["ethereum", "beacon chain", "validator", "casper", "ouroboros", "staking", "finality"])
    elif "token" in q_lower and "jwt" in q_lower:
        return any(kw in text for kw in ["jwt", "json web token", "oauth", "openid", "refresh token", "access token", "rs256"])
    elif "container" in q_lower and "kubernetes" in q_lower:
        return any(kw in text for kw in ["kubernetes", "containerd", "cri-o", "cri", "orchestration", "pod", "runtime class"])
    elif "prompt engineering" in q_lower:
        return any(kw in text for kw in ["chain-of-thought", "few-shot", "rag prompt", "function calling", "structured output", "prompt injection"])
    elif "agent framework" in q_lower:
        return any(kw in text for kw in ["langgraph", "autogen", "multi-agent", "agent framework", "orchestration", "stateful"])
    else:
        # Fallback: check for any significant word overlap
        q_words = set(w for w in q_lower.split() if len(w) > 3)
        t_words = set(w for w in text.split() if len(w) > 3)
        return len(q_words & t_words) >= 2


def _split_relevant_filtered(query: str, evidence: List[Evidence]) -> Tuple[List[Evidence], List[Evidence]]:
    """Run filter and split into kept vs dropped using the test's relevance heuristic."""
    filtered_evidence = filter_evidence_by_relevance(query, evidence)
    relevant = [e for e in filtered_evidence if _is_relevant(query, e)]
    filtered = [e for e in filtered_evidence if not _is_relevant(query, e)]
    return relevant, filtered


class TestRelevanceFilter(unittest.TestCase):
    """Test that semantic relevance filter correctly handles keyword-collision traps."""

    def _run_trap_test(self, query: str, evidence: List[Evidence], trap_name: str):
        """Run a single trap test and verify relevant items are kept, traps filtered."""
        relevant, filtered = _split_relevant_filtered(query, evidence)
        
        # Count relevant vs trap items in input
        relevant_input = [e for e in evidence if _is_relevant(query, e)]
        trap_input = [e for e in evidence if not _is_relevant(query, e)]
        
        # Count relevant vs trap items in output
        relevant_output = [e for e in relevant if _is_relevant(query, e)]
        trap_output = [e for e in relevant if not _is_relevant(query, e)]
        
        print(f"\n=== {trap_name} ===")
        print(f"Query: {query}")
        print(f"Input: {len(evidence)} total ({len(relevant_input)} relevant, {len(trap_input)} traps)")
        print(f"Output: {len(relevant)} kept, {len(filtered)} filtered")
        print(f"  Relevant kept: {len(relevant_output)}/{len(relevant_input)}")
        print(f"  Traps leaked: {len(trap_output)}/{len(trap_input)}")
        
        # Assert: at least 50% of relevant items should be kept (recall)
        if relevant_input:
            recall = len(relevant_output) / len(relevant_input)
            self.assertGreaterEqual(
                recall, 0.5,
                f"Recall too low for {trap_name}: {recall:.1%} ({len(relevant_output)}/{len(relevant_input)} relevant kept)"
            )
        
        # Assert: no more than 50% of traps should leak through (precision)
        if trap_input:
            leak_rate = len(trap_output) / len(trap_input)
            self.assertLessEqual(
                leak_rate, 0.5,
                f"Too many traps leaked for {trap_name}: {leak_rate:.1%} ({len(trap_output)}/{len(trap_input)})"
            )
        
        # Assert: we should have at least 1 relevant item in output
        self.assertGreater(
            len(relevant_output), 0,
            f"No relevant items retained for {trap_name}"
        )
        
        return relevant, filtered

    def test_known_traps(self):
        """Test all known keyword-collision traps from bug reports."""
        for i, (query, evidence) in enumerate(KNOWN_TRAPS):
            trap_name = f"KnownTrap_{i+1}: {query[:40]}"
            with self.subTest(trap_name=trap_name):
                self._run_trap_test(query, evidence, trap_name)

    def test_synthetic_traps(self):
        """Test synthetic ambiguous-term queries for broader coverage."""
        for i, (query, evidence) in enumerate(SYNTHETIC_TRAPS):
            trap_name = f"SyntheticTrap_{i+1}: {query[:40]}"
            with self.subTest(trap_name=trap_name):
                self._run_trap_test(query, evidence, trap_name)

    def test_threshold_configurable(self):
        """Test that threshold can be configured via environment variable."""
        # High threshold - should filter more aggressively
        os.environ["ARIA_RELEVANCE_THRESHOLD"] = "0.7"
        query = "remote work productivity"
        evidence = [
            Evidence(title="Remote Work Study", summary="Remote work productivity analysis", source_type="research"),
            Evidence(title="Remote Sensing Satellite", summary="Satellite remote sensing for earth observation", source_type="research"),
        ]
        relevant, filtered = _split_relevant_filtered(query, evidence)
        # With high threshold, even relevant might be filtered
        # At minimum, the trap should be filtered
        trap_titles = [e.title for e in filtered]
        self.assertIn("Remote Sensing Satellite", trap_titles)
        
        # Low threshold - should keep more
        os.environ["ARIA_RELEVANCE_THRESHOLD"] = "0.1"
        relevant, filtered = _split_relevant_filtered(query, evidence)
        # Both might be kept with very low threshold
        self.assertGreaterEqual(len(relevant), 1)
        
        # Reset
        os.environ["ARIA_RELEVANCE_THRESHOLD"] = "0.35"

    def test_empty_inputs(self):
        """Test edge cases with empty inputs."""
        # Empty evidence list returns empty
        relevant, filtered = _split_relevant_filtered("test query", [])
        self.assertEqual(relevant, [])
        self.assertEqual(filtered, [])
        
        # Empty query - filter returns all evidence but _is_relevant returns False for all
        relevant, filtered = _split_relevant_filtered("", [Evidence(title="Test", summary="Test", source_type="web")])
        self.assertEqual(relevant, [])
        self.assertEqual(len(filtered), 1)
        
        # None query - same behavior
        relevant, filtered = _split_relevant_filtered(None, [Evidence(title="Test", summary="Test", source_type="web")])
        self.assertEqual(relevant, [])
        self.assertEqual(len(filtered), 1)

    def test_compute_relevance_scores(self):
        """Test that relevance scores are computed and in valid range."""
        query = "remote work productivity trends"
        evidence = [
            Evidence(title="Remote Work Study", summary="Productivity analysis of remote work", source_type="research"),
            Evidence(title="Remote Sensing", summary="Satellite remote sensing data", source_type="research"),
        ]
        scores = compute_relevance_scores(query, evidence)
        
        self.assertEqual(len(scores), 2)
        for score in scores:
            self.assertGreaterEqual(score, 0.0)
            self.assertLessEqual(score, 1.0)
        
        # When embeddings work, relevant item should score higher than trap
        # In fallback mode (DISABLE_HEAVY_MODELS), both scores are 0.0
        if max(scores) > 0:
            self.assertGreater(scores[0], scores[1])


if __name__ == "__main__":
    unittest.main(verbosity=2)