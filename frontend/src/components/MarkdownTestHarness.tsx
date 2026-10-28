import React, { useState, useEffect } from 'react';
import MarkdownRenderer from './MarkdownRenderer';
import { Citation } from '../types';

export default function MarkdownTestHarness() {
  const [fixtures, setFixtures] = useState<any>(null);

  useEffect(() => {
    import('../fixtures/mockData').then((mod) => {
      setFixtures(mod.MOCK_FIXTURES);
    });
  }, []);
  const mockCitations: Citation[] = [
    {
      id: 0,
      title: 'Brooks Subsumption Architecture (1986)',
      tier: 'OKF',
      venue: 'IEEE Robotics',
      year: 1986,
      review_status: 'verified',
    },
    {
      id: 1,
      title: 'High-Fidelity CRISPR Cleavage Mitigation',
      tier: 'RAG',
      venue: 'Nature Biotechnology',
      year: 2024,
      review_status: 'scholarly',
    },
  ];

  // Test Case 1: Table with mismatched column counts
  const tableMismatched = `### 1. Table with Mismatched Column Counts
| Metric | Baseline | Target Spec |
| :--- | :--- | :--- |
| Latency | 12ms |
| Throughput | 450 req/s | 1200 req/s | Overflow Cell | Extra Tail |
| Error Rate |
| Cache Hit | 98.4% | 99.9% |`;

  // Test Case 2: Unclosed **bold
  const unclosedBold = `### 2. Unclosed Bold Formatting
This paragraph demonstrates **unclosed bold text that never encounters closing double asterisks and should cleanly render as plain text without throwing an error.

Here is normally closed **bold text** alongside *italic text* for contrast.`;

  // Test Case 3: [text](javascript:alert(1))
  const javascriptLink = `### 3. JavaScript URL Sanitization
Test link 1: [Exploit Attempt](javascript:alert(1)) - must NOT render as an active link.
Test link 2: [Safe External URL](https://example.org) - should render with target="_blank" rel="noopener noreferrer".`;

  // Test Case 4: Raw <script> text
  const rawScript = `### 4. Raw <script> Tag Text
Below is a raw script tag string:
<script>alert("XSS Execution Attempt")</script>
<img src="x" onerror="alert(1)" />
React JSX text escaping prevents this from executing as DOM HTML.`;

  // Test Case 5: Marker split across deltas (interactive simulation)
  const splitSteps = [
    'Brooks introduced subsumption architectures in 1986 [[',
    'Brooks introduced subsumption architectures in 1986 [[c',
    'Brooks introduced subsumption architectures in 1986 [[c:0',
    'Brooks introduced subsumption architectures in 1986 [[c:0]]',
    'Brooks introduced subsumption architectures in 1986 [[c:0]] for autonomous robotics.',
  ];
  const [splitStepIdx, setSplitStepIdx] = useState(0);

  // Test Case 6: Marker with an unknown id
  const unknownId = `### 6. Citation Markers with Known and Unknown IDs
Valid Citation 0: Brooks introduced behavioral decomposition [[c:0]].
Valid Citation 1: Cas9 fidelity mitigation [[c:1]].
Unknown Citation 999: This marker has no matching citation [[c:999]] and must be dropped.
Unknown Citation 42: This marker also has no citation [[c:42]] and must be dropped.`;

  const q3Fixture = fixtures?.live;
  const q3Audit = q3Fixture?.events.find((e: any) => e.event === 'audit');
  const q3Citations: Citation[] = (q3Fixture?.events.filter((e: any) => e.event === 'citation') as any[]) || [];

  const okfFixture = fixtures?.okf;
  const okfAudit = okfFixture?.events.find((e: any) => e.event === 'audit');
  const okfCitations: Citation[] = (okfFixture?.events.filter((e: any) => e.event === 'citation') as any[]) || [];

  return (
    <div className="min-h-screen bg-ink-base text-gray-200 p-6 md:p-12 font-sans max-w-4xl mx-auto space-y-10 select-text">
      {/* Test Page Header */}
      <div className="border-b border-ink-surface pb-4 flex justify-between items-center">
        <div>
          <span className="font-mono text-[10px] text-amber-400 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 border border-amber-500/30">
            Dev-Only Test Page
          </span>
          <h1 className="text-lg font-mono font-bold text-white mt-1">
            Markdown & Citation Parser Test Harness (?test=md)
          </h1>
          <p className="text-xs text-ink-muted font-mono mt-0.5">
            Manual visual verification for edge-case parser inputs (No external dependencies).
          </p>
        </div>
        <a
          href="/"
          className="font-mono text-xs px-3 py-1.5 bg-ink-surface border border-ink-surface hover:border-gray-500 text-gray-300"
        >
          ← Return to Main App
        </a>
      </div>

      {/* Test 1 */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
          Case 1: Table with Mismatched Columns (3 headers, rows with 2, 5, and 1 cells)
        </h2>
        <div className="bg-ink-base p-4 border border-ink-surface">
          <MarkdownRenderer content={tableMismatched} citations={mockCitations} />
        </div>
      </section>

      {/* Test 2 */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
          Case 2: Unclosed **bold Syntax
        </h2>
        <div className="bg-ink-base p-4 border border-ink-surface">
          <MarkdownRenderer content={unclosedBold} citations={mockCitations} />
        </div>
      </section>

      {/* Test 3 */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
          Case 3: javascript: URI Filtering
        </h2>
        <div className="bg-ink-base p-4 border border-ink-surface">
          <MarkdownRenderer content={javascriptLink} citations={mockCitations} />
        </div>
      </section>

      {/* Test 4 */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
          Case 4: Raw &lt;script&gt; Text Escaping
        </h2>
        <div className="bg-ink-base p-4 border border-ink-surface">
          <MarkdownRenderer content={rawScript} citations={mockCitations} />
        </div>
      </section>

      {/* Test 5 */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
            Case 5: Split In-Flight Marker Buffer ([[, [[c, [[c:0, [[c:0]])
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSplitStepIdx((prev) => (prev > 0 ? prev - 1 : 0))}
              className="px-2 py-0.5 text-xs font-mono bg-ink-surface border border-ink-surface hover:text-white"
            >
              Prev
            </button>
            <span className="font-mono text-xs text-ink-muted">
              Step {splitStepIdx + 1} of {splitSteps.length}
            </span>
            <button
              onClick={() => setSplitStepIdx((prev) => (prev < splitSteps.length - 1 ? prev + 1 : prev))}
              className="px-2 py-0.5 text-xs font-mono bg-ink-surface border border-ink-surface hover:text-white"
            >
              Next
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 bg-ink-base border border-ink-surface space-y-1">
            <span className="text-[10px] text-ink-muted uppercase">Raw In-Flight Buffer:</span>
            <div className="text-amber-300 font-bold break-all">"{splitSteps[splitStepIdx]}"</div>
          </div>
          <div className="p-3 bg-ink-base border border-ink-surface space-y-1">
            <span className="text-[10px] text-ink-muted uppercase">Rendered on Screen (isStreaming=true):</span>
            <div className="text-gray-100">
              <MarkdownRenderer
                content={splitSteps[splitStepIdx]}
                citations={mockCitations}
                isStreaming={true}
              />
            </div>
          </div>
        </div>
        <p className="text-[10px] font-mono text-ink-muted">
          Notice: At Steps 1, 2, and 3, raw "[[" or "[[c:0" is buffered and does NOT flash. As soon as Step 4 lands "]]", the badge [§ 1] appears cleanly!
        </p>
      </section>

      {/* Test 6 */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
          Case 6: Marker with Unknown IDs (only 0 and 1 exist in mock context)
        </h2>
        <div className="bg-ink-base p-4 border border-ink-surface">
          <MarkdownRenderer content={unknownId} citations={mockCitations} />
        </div>
      </section>

      {/* Test 7: Audit Sweep against Real Q3 Fixture (James Webb Space Telescope Discoveries) */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3" id="audit-sweep-q3">
        <div className="flex justify-between items-center">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
            Case 7: Audit Sweep on Real Q3 Fixture (JWST 2024 Discoveries)
          </h2>
          <span className="font-mono text-[10px] text-gray-400 bg-ink-surface px-2 py-0.5 border border-ink-surface">
            Recorded: 2026-10-15 • Exact character offsets
          </span>
        </div>
        <p className="text-xs text-ink-muted font-sans">
          Verifies that claim offsets map accurately to rendered paragraphs with individual highlight spans and audit status stamps:
        </p>
        <div className="bg-ink-base p-4 border border-ink-surface">
          <MarkdownRenderer
            content={q3Audit?.answer_final || ''}
            answerFinal={q3Audit?.answer_final}
            auditClaims={q3Audit?.claims}
            citations={q3Citations}
          />
        </div>
      </section>

      {/* Test 8: Audit Sweep against Table Cells (Real OKF Fixture: Autonomous Systems Taxonomy) */}
      <section className="bg-ink-surface/30 p-5 border border-ink-surface space-y-3" id="audit-sweep-table">
        <div className="flex justify-between items-center">
          <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-tier-okf">
            Case 8: Audit Sweep on Table Cells (Real OKF Autonomy Taxonomy)
          </h2>
          <span className="font-mono text-[10px] text-gray-400 bg-ink-surface px-2 py-0.5 border border-ink-surface">
            Recorded: 2026-10-15 • Table cell claims
          </span>
        </div>
        <p className="text-xs text-ink-muted font-sans">
          Verifies that table cell claims map accurately into &lt;td&gt; cells without breaking table borders or alignment:
        </p>
        <div className="bg-ink-base p-4 border border-ink-surface">
          <MarkdownRenderer
            content={okfAudit?.answer_final || ''}
            answerFinal={okfAudit?.answer_final}
            auditClaims={okfAudit?.claims}
            citations={okfCitations}
          />
        </div>
      </section>
    </div>
  );
}
