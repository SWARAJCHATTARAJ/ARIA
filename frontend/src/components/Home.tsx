import React, { useState } from 'react';

interface HomeProps {
  /** Hands the query to the New Question workspace and executes it. */
  onStartQuery: (query: string) => void;
}

const LEGEND = [
  { glyph: '§', label: 'OKF Structured', color: '#60A5FA' },
  { glyph: '▲', label: 'RAG Vector', color: '#A78BFA' },
  { glyph: '●', label: 'LIVE Academic', color: '#F59E0B' },
];

const BENCHMARKS = [
  'What is the definition and taxonomy of autonomous systems in artificial intelligence?',
  'What are the off-target mitigation strategies for CRISPR gene editing?',
  'How do multi-agent consensus protocols handle Byzantine fault tolerance?',
];

const PIPELINE_STEPS = [
  {
    index: '01',
    name: 'PLAN',
    tag: 'SEMANTIC ROUTER',
    detail: 'Query decomposition & routing.',
  },
  {
    index: '02',
    name: 'RETRIEVE',
    tag: 'OKF · RAG · LIVE',
    detail: 'Parallel search across structured notes, vector chunks, and live academic papers.',
  },
  {
    index: '03',
    name: 'WRITE',
    tag: 'INLINE CITATION',
    detail: 'Source-grounded academic synthesis.',
  },
  {
    index: '04',
    name: 'CHECK',
    tag: 'LLM JUDGE AUDIT',
    detail: 'Verbatim quote matching, entity coverage checks, and unsupported-claim pruning.',
  },
];

export default function Home({ onStartQuery }: HomeProps) {
  const [omniQuery, setOmniQuery] = useState('');
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const submitQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onStartQuery(trimmed);
  };

  const handleOmniSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitQuery(omniQuery);
  };

  const handleOmniKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuery(omniQuery);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-y-auto overflow-x-hidden hud-scroll">
      {/* Top bar: engine pill + tier legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-10 pt-5 pb-2 shrink-0">
        <div className="ui-card inline-flex items-center gap-2.5 px-3 py-1.5">
          <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
          <span className="font-mono text-[10px] tracking-[0.14em] text-[#A1A1AA] uppercase">
            ARIA RESEARCH ENGINE · TRI-TIER RETRIEVAL
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider">
              <span style={{ color: l.color }} className="font-bold">
                {l.glyph}
              </span>
              <span className="text-[#A1A1AA]">{l.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Main two-column workbench */}
      <div className="flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center px-4 md:px-10 py-8">
        {/* Left column: hero + omnibox + benchmarks */}
        <div className="lg:col-span-7 space-y-6 animate-view-enter">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-[#F4F4F6] leading-[1.1]">
            Every claim, traced to its primary source.
          </h1>

          <p className="text-sm sm:text-base text-[#A1A1AA] leading-relaxed max-w-xl">
            ARIA orchestrates multi-tier retrieval across structured knowledge notes, vector
            literature, and live academic indices—verifying synthesized answers through verbatim
            quote matching and entity coverage checks.
          </p>

          {/* Direct search omnibox */}
          <form onSubmit={handleOmniSubmit} className="ui-card flex items-stretch gap-2 p-2 max-w-xl">
            <input
              type="text"
              value={omniQuery}
              onChange={(e) => setOmniQuery(e.target.value)}
              onKeyDown={handleOmniKeyDown}
              placeholder="Ask a research question..."
              aria-label="Ask a research question"
              className="flex-1 min-w-0 bg-transparent px-3 text-sm text-[#F4F4F6] placeholder-[#52525B] focus:outline-none"
              style={{ fontSize: '16px' }}
            />
            <button
              type="submit"
              disabled={!omniQuery.trim()}
              className="ui-btn shrink-0 px-4 py-2.5 bg-[#F4F4F6] text-[#09090B] hover:bg-white font-medium text-sm flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-[#F4F4F6]"
            >
              <span>Ask Question</span>
              <span aria-hidden="true">-&gt;</span>
            </button>
          </form>

          {/* Benchmark query cards */}
          <div className="space-y-2 pt-1">
            {BENCHMARKS.map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => submitQuery(query)}
                className="ui-card ui-card-interactive block w-full text-left px-4 py-3 text-xs text-[#A1A1AA] hover:text-[#F4F4F6]"
              >
                "{query}"
              </button>
            ))}
          </div>
        </div>

        {/* Right column: interactive 4-stage pipeline inspector */}
        <div className="lg:col-span-5 w-full animate-view-enter" style={{ animationDelay: '60ms' }}>
          <div
            className="w-full max-w-md lg:ml-auto p-5 md:p-6"
            style={{ background: '#0D0D11', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/[0.07]">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#A1A1AA]">
                Pipeline Inspector
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#52525B]">
                4 stages
              </span>
            </div>

            <div className="space-y-2">
              {PIPELINE_STEPS.map((step) => {
                const isExpanded = expandedStep === step.index;
                return (
                  <button
                    key={step.index}
                    type="button"
                    onMouseEnter={() => setExpandedStep(step.index)}
                    onMouseLeave={() => setExpandedStep(null)}
                    onFocus={() => setExpandedStep(step.index)}
                    onClick={() => setExpandedStep(isExpanded ? null : step.index)}
                    aria-expanded={isExpanded}
                    className={`block w-full text-left p-3.5 transition-all duration-150 ease-out ${
                      isExpanded
                        ? 'border-white/[0.16] bg-[#16161C]'
                        : 'border-white/[0.07] bg-transparent hover:bg-[#16161C]'
                    } border`}
                    style={{ borderRadius: '8px' }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs tracking-wider min-w-0 truncate">
                        <span className="text-[#52525B]">{step.index}</span>
                        <span className="text-[#F4F4F6] font-semibold"> · {step.name}</span>
                      </span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[#52525B] shrink-0">
                        {step.tag}
                      </span>
                    </div>
                    <div
                      className={`overflow-hidden transition-all duration-200 ease-out ${
                        isExpanded ? 'max-h-16 opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'
                      }`}
                    >
                      <p className="text-[11px] text-[#A1A1AA] leading-relaxed">{step.detail}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <div className="w-full max-w-6xl mx-auto px-4 md:px-10 pb-5 pt-4 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-[#52525B] shrink-0">
        <span>
          Unsupported claims are flagged or pruned via quote &amp; coverage checks · Citations anchored via DOI &amp; arXiv
        </span>
        <span>ARIA · Open Knowledge Fabric</span>
      </div>
    </div>
  );
}
