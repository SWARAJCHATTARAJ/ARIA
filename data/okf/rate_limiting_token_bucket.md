---
id: note-rate-25
type: method
topic:
  - rate limiting
  - token bucket
  - leaky bucket
  - traffic shaping
  - api security
title: "Rate Limiting Algorithms: Token Bucket, Leaky Bucket, and Sliding Window Counters"
created: 2026-10-16T12:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Systems Architecture & API Security"
related:
  - ssrf_sandboxed_fetching.md
  - multi_agent_consensus.md
owner: personal
confidence: verified
---

Modern asynchronous API services and LLM inference endpoints must protect upstream compute and token budgets from denial-of-service degradation, cascading overload, and abusive traffic spikes. Rate limiting algorithms enforce traffic contracts, smooth bursty request distributions, and provide predictable quality of service.

Comparative Mechanics of Rate Limiting Paradigms:
1. Token Bucket Algorithm: The token bucket maintains an accumulator holding up to capacity $C$ tokens. Tokens refill continuously at a fixed rate of $r$ tokens per second. An incoming request requiring $k$ units checks if available tokens $T \ge k$. If satisfied, $k$ tokens are decremented ($T \leftarrow T - k$) and the request passes; otherwise, the request is rejected immediately with HTTP 429 Too Many Requests (accompanied by a computed `Retry-After: (k - T) / r` header). The token bucket permits instantaneous burst traffic up to capacity $C$ while bounding long-term sustained throughput strictly to rate $r$.
2. Leaky Bucket Algorithm: Requests enter a first-in-first-out (FIFO) queue of capacity $B$ and drain out at a constant, uniform rate $r$ requests per second. If the queue overflows, arriving packets are dropped. Unlike the token bucket which allows controlled bursts, the leaky bucket smooths output traffic into a perfectly uniform, jitter-free flow, making it ideal for downstream services sensitive to instantaneous burst concurrency.
3. Sliding Window Counter: Fixed window counters suffer from boundary double-spend vulnerability, where an attacker sends the full threshold at the end of window $t$ and again at the beginning of window $t+1$, resulting in $2\times$ the allowed limit in a single window duration. The sliding window counter eliminates this edge artifact by estimating rolling request volume:
$$\text{Estimated Count} = \text{Count}_{\text{current}} + \text{Count}_{\text{previous}} \times \left( 1 - \frac{t - t_{\text{start}}}{\text{WindowSize}} \right)$$

Distributed In-Memory Coordination:
In distributed multi-instance architectures, tracking rate limits requires fast, atomic coordination (e.g., Redis Lua scripts executing single-roundtrip `EVAL` transactions). Lua script execution prevents race conditions between checking available capacity and decrementing tokens, maintaining strict invariant safety under high concurrency.

References:
1. Turner, J. S. (1986). "New directions in communications (or which way to the information age?)", IEEE Communications Magazine, 24(10), 8-15. [verified]
2. Tanenbaum, A. S., & Wetherall, D. (2011). "Computer Networks", Fifth Edition, Prentice Hall. [verified]
3. Fielding, R., et al. (2022). "HTTP Semantics - RFC 9110", Internet Engineering Task Force (IETF). [verified]
