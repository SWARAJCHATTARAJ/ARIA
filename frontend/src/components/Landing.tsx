import React from 'react';
import { ArrowRight } from 'lucide-react';
import PipelineSpine from './PipelineSpine';

export default function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="w-full h-full flex items-center justify-start bg-ink-base text-gray-200 overflow-y-auto overflow-x-hidden p-8 md:p-16">
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left Side: Headline & Copy */}
        <div className="lg:col-span-5 space-y-6 pl-4">
          <h1 className="text-5xl md:text-6xl font-bold font-sans text-white leading-[1.1] tracking-tight text-left">
            Every claim, checked against its source.
          </h1>
          
          <p className="text-ink-muted text-lg font-sans max-w-md text-left leading-relaxed">
            Ask a research question. ARIA answers from cited sources, then checks each sentence against them and flags anything it can't support.
          </p>

          <div className="pt-4 flex justify-start">
            <button 
              onClick={onStart}
              className="group relative px-6 py-3 bg-ink-surface border border-ink-muted/30 hover:border-tier-okf/80 text-white font-mono text-xs uppercase tracking-widest transition-all hover:bg-tier-okf/10 flex items-center gap-3 rounded-none"
            >
              Ask a question
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-tier-okf opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        {/* Right Side: Shared Pipeline Diagram (plays once on load over ~2.5s with Replay control) */}
        <div className="lg:col-span-7 relative flex justify-center items-center py-12">
          <div className="w-full max-w-md p-6 bg-ink-surface/20 border border-ink-surface/60 rounded-none relative">
            <div className="text-[10px] font-mono text-ink-muted uppercase tracking-wider mb-4 border-b border-ink-surface pb-2">
              Pipeline Architecture
            </div>
            <PipelineSpine mode="home" />
          </div>
        </div>
      </div>
    </div>
  );
}
