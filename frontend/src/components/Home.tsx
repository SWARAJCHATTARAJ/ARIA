import React, { useState } from 'react';

interface HomeProps {
  onStartQuery: (query: string) => void;
}

const LEGEND = [
  { label: 'OKF', color: '#5E8BFF' },
  { label: 'RAG', color: '#A78BFA' },
  { label: 'LIVE', color: '#34D399' },
];

const BENCHMARKS = [
  'What is the definition and taxonomy of autonomous systems in artificial intelligence?',
  'What are the off-target mitigation strategies for CRISPR gene editing?',
  'How do multi-agent consensus protocols handle Byzantine fault tolerance?',
];

const PIPELINE_STEPS = [
  {
    step: '01',
    name: 'PLAN',
    desc: 'Query decomposition and routing.',
  },
  {
    step: '02',
    name: 'RETRIEVE',
    desc: 'Parallel search across OKF notes, RAG vector chunks, and live academic papers.',
  },
  {
    step: '03',
    name: 'WRITE',
    desc: 'Source-grounded synthesis with strict inline citation anchors.',
  },
  {
    step: '04',
    name: 'CHECK',
    desc: 'Verbatim quote validation, entity coverage analysis, and claim verification.',
  },
];

export default function Home({ onStartQuery }: HomeProps) {
  const [queryInput, setQueryInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (!trimmed) return;
    onStartQuery(trimmed);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-y-auto hud-scroll bg-[#0A0A0B] text-[#EDEDED]">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-[#262629] bg-[#141416] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-mono text-[#EDEDED] font-semibold tracking-wider">
            ARIA
          </span>
          <span className="text-[12px] font-mono text-[#8B8B8E]">
            Research Engine
          </span>
        </div>

        <div className="flex items-center gap-4">
          {LEGEND.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[12px] font-mono text-[#8B8B8E]">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 w-full max-w-6xl mx-auto px-8 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Hero Headline, Input, Sample Benchmarks */}
        <div className="lg:col-span-7 space-y-6 animate-fade-slide">
          <div className="space-y-4">
            <h1 className="text-[40px] font-semibold text-[#EDEDED] leading-tight tracking-tight">
              Every claim, traced to its primary source.
            </h1>
            <p className="text-[16px] text-[#8B8B8E] leading-relaxed max-w-xl">
              Autonomous research engine orchestrating multi-tier retrieval across structured knowledge notes, vector indexes, and live academic papers.
            </p>
          </div>

          {/* Search Input Box */}
          <form onSubmit={handleSubmit} className="p-2 bg-[#141416] border border-[#262629] rounded-[8px] flex items-center gap-2 max-w-xl">
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Ask a research question..."
              className="flex-1 bg-transparent px-3 py-2 text-[14px] text-[#EDEDED] placeholder-[#8B8B8E] focus:outline-none"
              aria-label="Research query"
            />
            <button
              type="submit"
              disabled={!queryInput.trim()}
              className="btn-primary shrink-0"
            >
              Ask Question
            </button>
          </form>

          {/* Sample Benchmarks */}
          <div className="space-y-2 pt-2">
            <p className="text-[12px] font-mono text-[#8B8B8E] uppercase tracking-wider">
              Example Research Queries
            </p>
            <div className="space-y-2">
              {BENCHMARKS.map((bench) => (
                <button
                  key={bench}
                  type="button"
                  onClick={() => onStartQuery(bench)}
                  className="w-full text-left p-4 bg-[#141416] border border-[#262629] rounded-[8px] text-[14px] text-[#8B8B8E] hover:text-[#EDEDED] hover:border-[#38383C] transition-colors"
                >
                  "{bench}"
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: 4-Stage Verification Pipeline Card */}
        <div className="lg:col-span-5 animate-fade-slide">
          <div className="p-6 bg-[#141416] border border-[#262629] rounded-[8px] space-y-4">
            <div className="pb-3 border-b border-[#262629] flex items-center justify-between">
              <h2 className="text-[16px] font-semibold text-[#EDEDED]">
                Verification Pipeline
              </h2>
              <span className="text-[12px] font-mono text-[#8B8B8E]">
                4 Stages
              </span>
            </div>

            <div className="space-y-3">
              {PIPELINE_STEPS.map((step) => (
                <div
                  key={step.step}
                  className="p-3 bg-[#0A0A0B] border border-[#262629] rounded-[6px] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-mono font-semibold text-[#5E8BFF]">
                      {step.step} · {step.name}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8B8B8E] leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bar */}
      <div className="w-full max-w-6xl mx-auto px-8 py-4 border-t border-[#262629] flex items-center justify-between text-[12px] font-mono text-[#8B8B8E] shrink-0">
        <span>Unsupported claims are verified via quote matching and coverage checks.</span>
        <span>ARIA 2.0</span>
      </div>
    </div>
  );
}
