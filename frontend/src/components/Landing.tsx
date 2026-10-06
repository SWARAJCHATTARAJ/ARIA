import React, { useEffect, useState } from 'react';
import { ArrowRight, Activity, CheckCircle2 } from 'lucide-react';

export default function Landing({ onStart }: { onStart: () => void }) {
  const [activeStage, setActiveStage] = useState(-1);

  // Scroll or time-triggered animation for the 6-stage pipeline
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStage((prev) => (prev + 1) % 7);
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  const stages = [
    { name: 'ROUTE', color: 'bg-ink-muted' },
    { name: 'PLAN', color: 'bg-tier-rag' },
    { name: 'RETRIEVE', color: 'bg-tier-okf' },
    { name: 'SYNTH', color: 'bg-tier-rag' },
    { name: 'AUDIT', color: 'bg-tier-live' },
    { name: 'FINAL', color: 'bg-white' },
  ];

  return (
    <div className="w-full h-full flex items-center justify-start bg-ink-base text-gray-200 overflow-y-auto overflow-x-hidden p-8 md:p-16">
      
      {/* Asymmetric Layout */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Side: Headline & Copy (Secondary Element) */}
        <div className="lg:col-span-5 space-y-6 pl-4">
          <div className="inline-flex items-center gap-2 px-2 py-1 bg-ink-surface text-[10px] font-mono uppercase tracking-widest text-tier-okf">
            <Activity size={12} className="text-tier-live animate-pulse" />
            Dristi V2 Engine Active
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold font-sans text-white leading-[1.1] tracking-tight text-left">
            Research with rigorous certainty.
          </h1>
          
          <p className="text-ink-muted text-lg font-sans max-w-md text-left">
            ARIA cascades through personal knowledge, live web data, and structural retrieval to deliver synthesized, hallucination-free intelligence.
          </p>

          <div className="pt-4 flex justify-start">
            <button 
              onClick={onStart}
              className="group relative px-6 py-3 bg-ink-surface border border-ink-muted/30 hover:border-tier-okf/80 text-white font-mono text-xs uppercase tracking-widest transition-all hover:bg-tier-okf/10 flex items-center gap-3 rounded-none"
            >
              Initialize Query
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              {/* Sharp corner accent */}
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-tier-okf opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        {/* Right Side: The Focal Pipeline Diagram */}
        <div className="lg:col-span-7 relative flex justify-center items-center py-12">
          
          <div className="relative w-full max-w-2xl grid grid-cols-1 gap-2 border-l border-ink-surface/50 pl-8 ml-8">
            
            {stages.map((stage, idx) => {
              const isActive = activeStage >= idx;
              const isCurrent = activeStage === idx;
              
              return (
                <div key={idx} className="relative flex items-center gap-6 group">
                  {/* The connection line */}
                  {idx !== stages.length - 1 && (
                    <div className={`absolute left-[5px] top-6 w-px h-8 transition-colors duration-500 ${isActive ? stage.color : 'bg-ink-surface/50'}`} />
                  )}
                  
                  {/* The Stage Node */}
                  <div className={`relative z-10 w-3 h-3 rounded-none border transition-all duration-300 ${isActive ? stage.color + ' border-transparent shadow-[0_0_10px_rgba(255,255,255,0.2)]' : 'bg-ink-base border-ink-muted/30'} ${isCurrent ? 'scale-150 animate-pulse' : ''}`}>
                  </div>
                  
                  {/* The Stage Card */}
                  <div className={`flex-1 p-4 border transition-all duration-500 flex items-center justify-between ${isCurrent ? 'bg-ink-surface/80 border-tier-okf/50 translate-x-2' : isActive ? 'bg-ink-surface/30 border-ink-surface text-gray-300' : 'bg-transparent border-transparent text-ink-muted/50'}`}>
                    <span className="font-mono text-sm tracking-widest">{stage.name}</span>
                    {isActive && idx === 4 && <CheckCircle2 size={16} className="text-tier-live animate-stamp" />}
                  </div>
                </div>
              );
            })}

          </div>

        </div>

      </div>
    </div>
  );
}
