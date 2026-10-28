---
id: note-sec-16
type: method
topic:
  - ssrf
  - server-side request forgery
  - dns rebinding
  - network security
title: Server-Side Request Forgery Mitigation and Sandboxed Web Fetching
created: 2026-10-12T13:00:00Z
updated: 2026-10-27T12:00:00Z
source: "ARIA Security & Threat Research"
related:
  - prompt_injection_guardrails.md
  - rate_limiting_token_bucket.md
owner: personal
confidence: verified
---

Server-Side Request Forgery (SSRF) occurs when a backend server fetches remote resources from a user-supplied or retrieval-derived URL without adequate network isolation. In autonomous research systems, SSRF allows attackers to probe internal microservices, access cloud instance metadata endpoints (such as AWS/GCP/Azure link-local `169.254.169.254`), or bypass internal firewall perimeters.

Comprehensive SSRF Defense Architecture:
1. Strict IP Range Denylisting: Outbound HTTP fetchers must validate destination IP addresses against RFC 1918 private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), loopback ranges (`127.0.0.0/8`, `::1`), link-local addresses (`169.254.0.0/16`, `fe80::/10`), carrier-grade NAT (`100.64.0.0/10`), and multicast ranges (`224.0.0.0/4`). Any connection resolving to these subnets is immediately rejected with a hard security violation.
2. DNS Rebinding Protection: Attackers exploit Time-of-Check to Time-of-Use (TOCTOU) flaws by configuring a DNS name whose first lookup returns a benign public IP (passing initial preflight checks), while a second lookup during the actual HTTP connection returns `127.0.0.1` or `169.254.169.254`. Robust mitigation requires custom socket connection wrappers: the client resolves DNS once, validates the resulting IP against the denylist, and connects directly to the pinned IP address, passing the original domain name solely inside the HTTP `Host` header and TLS Server Name Indication (SNI) extension.
3. Redirect Following and Scheme Enforcement: HTTP redirect responses (301, 302, 307, 308) must not be followed blindly. Each successive redirect target location must undergo full URL parsing, scheme validation (strictly enforcing `http` or `https` and blocking dangerous pseudo-schemes like `file://`, `gopher://`, or `dict://`), and complete DNS re-validation.
4. Transport Timeouts and Resource Bounds: Web fetching engines enforce strict operational bounds: 5-second socket connection timeouts, 60 KB response body truncation limits, and HTML tag stripping to eliminate malicious binary blobs and resource exhaustion attacks.

References:
1. OWASP Foundation (2021). "A10:2021 - Server-Side Request Forgery (SSRF)", OWASP Top 10 Web Application Security Risks. [verified]
2. Jackson, C., et al. (2007). "Protecting Browsers from DNS Rebinding Attacks", In Proceedings of the 14th ACM Conference on Computer and Communications Security (CCS '07), 421-430. [verified]
3. National Institute of Standards and Technology (2019). "Secure Domain Name System (DNS) Deployment Guide", NIST Special Publication 800-81-2. [verified]
