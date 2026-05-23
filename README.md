# ARIA: Autonomous Research & Intelligence Assistant

[![Python Version](https://img.shields.io/badge/python-3.9%20%7C%203.10%20%7C%203.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Framework](https://img.shields.io/badge/orchestration-LangGraph-purple.svg)](https://github.com/langchain-ai/langgraph)
[![Platform](https://img.shields.io/badge/frontend-Streamlit-FF4B4B.svg)](https://streamlit.io/)
[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://emoaswda2wujafzekfe3pv.streamlit.app/)

> **Architected & Developed by Swaraj Chattaraj**

⚡ **Live Demo:** [Open ARIA on Streamlit Community Cloud](https://emoaswda2wujafzekfe3pv.streamlit.app/)

ARIA is a lightweight, local-first Autonomous Research Assistant designed around a stateful LangGraph workflow. I built it to compile deep research briefs on complex queries by coordinating parallel web searches, querying local documents, and validating synthesized reports using a self-correcting logic engine.

Unlike simple linear Retrieval-Augmented Generation (RAG) prompts that are prone to hallucinating sources, ARIA operates on a feedback loop—verifying claims against retrieved evidence before producing the final markdown reports and publication-ready PDF briefs.

---

## 📐 System Architecture & Flow

ARIA models the research loop as a state machine where execution transitions dynamically based on content verification status.

```mermaid
graph TD
    User[User Question] --> Planner[1. Research Planner]
    Planner -->|Generate Sub-Queries| Retriever[2. Multi-Source Retriever]
    
    subgraph Parallel Retrieval Engine
        Retriever -->|Concurrent Run| WebDDG[DuckDuckGo Search]
        Retriever -->|Concurrent Run| WebWiki[Wikipedia API]
        Retriever -->|Concurrent Run| WebAlex[OpenAlex Academic]
        Retriever -->|Concurrent Run| LocalChroma[ChromaDB Vector Store]
    end
    
    WebDDG --> Synthesizer[3. LLM Synthesizer]
    WebWiki --> Synthesizer
    WebAlex --> Synthesizer
    LocalChroma --> Synthesizer
    
    Synthesizer -->|Draft Report| Critic[4. Fact Verifier & Critic]
    
    Critic -->|Needs More Evidence / Generate New Queries| Retriever
    Critic -->|PASSED Validation| Publisher[5. Report Publisher]
    
    Publisher --> UI[Streamlit Glassmorphic Dashboard]
    Publisher --> PDF[Branded ReportLab PDF]
```

### Stateful execution nodes:
1. **Planner**: Evaluates the user query to construct up to 5 distinct search queries aimed at covering different facets of the topic.
2. **Retriever**: Executes multithreaded network requests to search APIs and local indexes. The results are parsed, cleaned, and stored in the graph state.
3. **Synthesizer**: Compiles the retrieved evidence into a structured markdown document, referencing facts via inline numerical citations.
4. **Verifier & Critic**: Audit every line of the synthesized text. If claims lack support or information gaps are found, it generates secondary search queries and routes execution back to the Retriever.
5. **Publisher**: Converts the final output into markdown reports and generates formatted ReportLab PDF documents with dynamic running page numbers.

---

## 💡 Why I Built This (My Motivation)

I started this project because I wanted to understand how agentic RAG works beyond simple chatbots. In typical tutorial-style RAG pipelines, you embed a document, run a vector search, stuff the context into a prompt, and get a single response. This is fine for basic Q&A, but it breaks down on complex research tasks. Linear prompts hallucinate, fail to cover multiple angles of a query, and have no way to double-check their own work.

I wanted to build something that acts more like a human analyst:
- It breaks a big question down into sub-queries.
- It pulls evidence from multiple independent sources (local files, web pages, academic APIs).
- It drafts a report and *actually audits* its own claims against the sources.
- If it notices it made an assertion without proof, it goes back and does more research.

By implementing this as a stateful graph workflow, I learned how to orchestrate cyclical LLM applications and prevent infinite agent loops, which is one of the hardest parts of building autonomous agents.

---

## 🛠️ Deep Engineering Decisions & Rationale

### 1. Stateful Graph Loops (LangGraph) over Linear Chains
Typical AI agents run on unconstrained ReAct loops which can easily run off-track, consume high API budgets, or fail to terminate. I used **LangGraph** to construct a predictable state machine. By formalizing transitions (e.g., `Plan -> Search -> Synthesize -> Verify -> Loop or Terminate`), I restrict agent execution to structured paths and protect against infinite loops.

### 2. Thread-Pool Search Concurrency
To avoid bottlenecking the web browser's event loop, retrieval is routed through a `ThreadPoolExecutor` context. By executing searches across Wikipedia, OpenAlex, DuckDuckGo, and ChromaDB concurrently, network latency is noticeably faster in testing:

```python
with ThreadPoolExecutor(max_workers=4) as executor:
    f_wiki = executor.submit(wikipedia_search, query, 2)
    f_openalex = executor.submit(openalex_search, query, 2)
    f_arxiv = executor.submit(arxiv_search, query, 2)
    f_ddg = executor.submit(duckduckgo_instant_answer, query)
    
    evidence.extend(f_wiki.result())
    evidence.extend(f_openalex.result())
    ...
```

### 3. Dynamic Two-Pass PDF Canvas (ReportLab)
Standard ReportLab rendering lacks built-in awareness of the final page count, resulting in hardcoded headers and footers. I extended ReportLab's standard canvas to implement a two-pass `NumberedCanvas` renderer. It records layout coordinates in a state array, processes the document fully, and draws professional running headers and footers with `"Page X of Y"` page numbers before writing the file bytes:

```python
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()
```

### 4. SQLite Dependency Override for Streamlit Cloud
ChromaDB requires modern SQLite binaries that are often missing in serverless hosting platforms like Streamlit Community Cloud (which runs on legacy Debian bases). ARIA resolves this on boot by checking for and monkeypatching standard library `sqlite3` modules with `pysqlite3-binary` at runtime:
```python
try:
    __import__('pysqlite3')
    import sys
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass
```

---

## 🚧 Challenges I Faced (My Development Journey)

During development and deployment, I ran into several real-world engineering issues that forced me to refine my approach:

- **ChromaDB SQLite Crash on Streamlit Cloud:** When I first deployed the app, it crashed immediately because the serverless Linux image hosted by Streamlit ran an old version of SQLite, which ChromaDB rejected. I fixed this by importing `pysqlite3-binary` and overriding `sys.modules['sqlite3']` before any other imports.
- **Runaway Verification Loops:** Early on, the Verifier node would sometimes get stuck in an infinite loop. It would find minor discrepancies, formulate new search queries, search, draft, and fail verification again, spinning endlessly. I solved this by adding `max_iterations` as a hard cap in the graph state, forcing the loop to terminate and output the best-available draft.
- **ReportLab's "Page 1 of 1" Footer Bug:** I wanted a clean "Page X of Y" footer in the generated PDF reports, but ReportLab compiles pages one-by-one and has no idea what "Y" is until it finishes the last page. I had to build a custom `NumberedCanvas` that intercepts `showPage()` to save page states, allowing me to compute the total pages and paint the footers in a second pass during `save()`.

---

## 💬 Interview Q&A (How I Explain ARIA)

If you are reviewing my project or interviewing me, here are the key technical concepts I can walk you through:

### 1. Why LangGraph instead of a simple LangChain chain?
Linear chains only move forward (`Input -> Prompt -> Output`). Research is iterative; a human reads, drafts, checks for errors, and goes back to look up what is missing. LangGraph allows me to define cycles in my agent's architecture, turning it into a state machine. I can easily define nodes (`plan`, `search`, `draft`, `verify`) and use conditional edges to route execution back to search if verification fails.

### 2. What does `ThreadPoolExecutor` do and why did I use it?
Search tasks (hitting DuckDuckGo, Wikipedia, arXiv, and local ChromaDB) are completely I/O-bound. Running them sequentially would block execution and make the user wait for each API request to resolve one after another. I used Python's `ThreadPoolExecutor` to execute these network requests concurrently. It keeps the Streamlit app responsive and cuts down on total waiting time significantly.

### 3. What is ChromaDB and what does "vector search" mean?
ChromaDB is an open-source vector database. When a user uploads a PDF or writes a note, ARIA splits the text into chunks and runs them through an embedding model to convert text into high-dimensional numerical vectors (representing semantic meaning). When the agent searches the database, it converts the search query into a vector and calculates the cosine distance to find the chunks with the most similar meaning. This is "vector search"—finding relevant information by semantic concept rather than exact keyword matches.

### 4. What happens when the Verifier fails?
When the `verify` node runs, it compares the drafted report against the retrieved evidence. If the verifier model flags missing evidence or ungrounded claims, it outputs `STATUS: NEEDS_MORE_RESEARCH` and generates 1 or 2 new target search queries. The conditional edge checks this status and routes execution back to the `search` node. The search node runs the new queries, appends the new evidence to the graph state, and passes it back to `draft` for a second pass.

### 5. What is the `pysqlite3` monkeypatch fixing exactly?
ChromaDB uses SQLite under the hood to store metadata. It requires SQLite version 3.35.0 or higher. Many cloud hosting environments (like Streamlit Cloud) run older versions of Debian or CentOS which packages SQLite 3.31.0. The monkeypatch intercepts imports of python's standard library `sqlite3` and replaces it with `pysqlite3-binary` (which packages a modern SQLite binary inside it), satisfying ChromaDB's version check.

---

## 🔒 Security Best Practices

ARIA is engineered with secure-by-default workflows:
- **No Hardcoded Credentials**: API tokens and project parameters are fetched dynamically from the environment or `.env` files via `python-dotenv`.
- **Environment Isolation**: `.gitignore` strictly ignores local `.env` configs, database directories (`.aria_chroma_db`), compiled python bytecodes (`__pycache__`), local log files (`*.log`), and generated reports.
- **Input Sanitization**: File uploads are restricted to standard PDF formats, validated against a maximum size constraint (15 MB), and checked to prevent path traversal vulnerability vectors.

---

## 🚀 Local Setup

### 1. Clone & Set Up Directory
```bash
git clone https://github.com/SWARAJCHATTARAJ/ARIA.git
cd ARIA
```

### 2. Environment Configuration
Create a virtual environment and install requirements:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3. API Keys Configuration
Create a `.env` file in the root directory:
```env
OPENROUTER_API_KEY=your_openrouter_api_key_here
ARIA_LLM_PROVIDER=openrouter
ARIA_MODEL=google/gemma-2-9b-it:free
```
*(If no OpenRouter key is configured, ARIA automatically switches to zero-cost offline extractive synthesis mode).*

### 4. Run Streamlit Application
```bash
streamlit run app.py
```

---

## 🧪 Testing

I use Python's native `unittest` framework to verify imports, chunking functions, security limits, and search mode paths.

Run the test suite from the project root:
```bash
python -m unittest test_aria.py
```

---

## What I Learned

Building ARIA taught me how agentic RAG differs from simple chatbots.
The hardest bug I fixed was ChromaDB crashing on Streamlit Cloud due to
an outdated SQLite version  I solved it by monkeypatching pysqlite3 at runtime.
