<div align="center">

# ARIA

**Autonomous Research & Intelligence Assistant**

*Every claim, checked against its source.*

[![Status](https://img.shields.io/badge/status-in--development-blue)]()
[![License](https://img.shields.io/badge/license-MIT-black)]()

</div>

---

## What it is

ARIA answers research questions and shows its work. It doesn't just generate
an answer and attach some links at the bottom — every sentence it writes is
checked, after the fact, against the exact source it claims to come from. If
a sentence can't be backed up by what was actually retrieved, it gets removed
before you ever see it, not just flagged.

No source. No sentence. That's the whole idea.

## How it works

```
PLAN → RETRIEVE → WRITE → CHECK → PUBLISH
```

**Plan** — breaks the question down and decides what to look for.

**Retrieve** — a three-tier cascade, cheapest and most trustworthy first:

| Tier | What it is | Cost |
|---|---|---|
| **OKF** | A small, hand-curated knowledge base — real notes, real citations, written and verified by hand | Free, instant |
| **RAG** | Semantic search over that same knowledge base using real sentence embeddings (`BAAI/bge-small-en-v1.5`, ONNX, no GPU) | Free, local |
| **LIVE** | arXiv, OpenAlex, Wikipedia, DuckDuckGo | Network calls |

Only falls through to the next tier if the current one comes up empty.

**Write** — drafts an answer with inline citation markers, one claim per
sentence.

**Check** — the part that actually matters. Every sentence gets pulled out,
matched to its cited source, and checked:

- Does an exact quote exist in that source backing this sentence up?
- Do the specific numbers and named entities in the sentence actually appear
  in that source?
- Is the overlap high enough to count as real support, not just loosely
  related?

Sentences that fail are rewritten once against the real source material. If
they still fail, they're deleted — not shown with a caveat, deleted. If
deleting too much leaves nothing substantial, ARIA says plainly that it
couldn't produce a verified answer, instead of shipping something thin and
pretending it's complete.

**Publish** — what's left, with citations, a confidence score, and an honest
flag on anything the answer only partially covers.

## What it deliberately does *not* claim

- Not "zero hallucination." Nothing that generates text can promise that
  honestly. What it does promise: nothing ships without a specific, checkable
  source behind it.
- Not NLI entailment. The verification is a judge model doing exact-quote
  matching plus number/entity checks, not a formal entailment classifier.
- Not infinite scale. It runs on free-tier infrastructure on purpose — Groq's
  free API limits, a small Azure VM, Supabase's free tier. That's a design
  constraint the whole system is built around, not an oversight.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, LangGraph, Python |
| LLM | Groq (`openai/gpt-oss-120b`) for both writing and judging |
| Embeddings | `fastembed` + `BAAI/bge-small-en-v1.5`, ONNX runtime — no `torch`, no GPU required |
| Vector search | Supabase (Postgres + `pgvector`) |
| Frontend | React, Vite, TypeScript |
| Hosting | Azure VM (API) + Vercel (frontend) |

## Security, because it talks to the open web

- Every Supabase table runs with row-level security on; the anonymous key
  can't read or write anything by default.
- Any URL ARIA fetches goes through an SSRF guard — private IP ranges,
  loopback, link-local, and cloud metadata endpoints are blocked, including
  against DNS-rebinding attempts, and the guard re-checks the IP after the
  connection opens, not just at DNS resolution.
- Retrieved text is treated as data, never as instructions — tested directly
  against prompt-injection attempts in web content.
- Rate-limited, with a visible daily cap, because the whole thing runs on
  free API tiers with hard limits.

## Status

Actively being built. The retrieval cascade, the claim-checking pipeline, and
the core security work are done and tested against real queries. The
frontend and the account/login flow are still in progress — this README
describes the system as designed, and will be updated as each piece lands
for real.

## Why this exists

Most "AI research assistant" demos show an LLM writing a plausible-sounding
answer with footnotes that don't actually support what's above them. ARIA is
an attempt to build the thing that checks that gap instead of papering over
it — on a budget of exactly zero dollars in infrastructure cost, because
that constraint forces every design decision to actually be defensible.

---

<div align="center">

Built by [Swaraj Chattaraj](https://swarajchattaraj.tech)

</div>
