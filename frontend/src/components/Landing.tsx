import React, { useEffect, useState } from 'react';
import { ArrowRight, Activity } from 'lucide-react';

const FLOW_STAGES = [
  { id: 'PLAN', label: 'PLAN', desc: 'Expansion & disambiguation' },
  { id: 'RETRIEVE', label: 'RETRIEVE', desc: '§ OKF · ▲ RAG · ● LIVE' },
  { id: 'WRITE', label: 'WRITE', desc: 'Grounded synthesis' },
  { id: 'CHECK', label: 'CHECK', desc: 'Entailment audit' },
];

export default function Landing({ onStart }: { onStart: () => void }) {
  const [simStage, setSimStage] = useState(0);

  // Sequential PLAN -> RETRIEVE -> WRITE -> CHECK illumination (~1.4s per stage)
  useEffect(() => {
    setSimStage(0);
    const timers = [0, 1, 2, 3, 4].map((i) =>
      setTimeout(() => setSimStage(i), i * 1400)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const currentStage = FLOW_STAGES[Math.min(simStage, FLOW_STAGES.length - 1)];

  return (
    <div className="w-full h-full flex items-center justify-center bg-ink-base text-gray-200 overflow-y-auto overflow-x-hidden p-8 md:p-16 hud-grid relative bg-[radial-gradient(ellipse_at_top,rgba(15,23,42,0.45),rgba(5,8,17,0.9)_55%,rgba(3,5,8,1))]">
      {/* Ambient floating spotlights */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 -left-32 w-[480px] h-[480px] bg-tier-okf/10 rounded-full blur-3xl animate-spotlight" />
        <div className="absolute top-1/3 -right-48 w-[520px] h-[520px] bg-sky-500/10 rounded-full blur-3xl animate-spotlight" style={{ animationDelay: '2.6s' }} />
      </div>

      {/* Orbital rings */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] rounded-full border border-dashed border-ink-surface animate-orbit-spin" />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] rounded-full border border-tier-okf/30 animate-orbit-spin"
          style={{ animationDirection: 'reverse' }}
        />
      </div>

      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
        {/* Left side: staggered hero copy */}
        <div className="lg:col-span-5 space-y-6 pl-4">
          <div
            className="animate-rise-in inline-flex items-center gap-2 px-2.5 py-1 bg-ink-surface/60 border border-ink-surface font-mono text-[9px] uppercase tracking-widest text-tier-okf"
            style={{ animationDelay: '0ms' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-tier-live animate-pulse" />
            Autonomous Verification Engine v2
          </div>

          <h1
            className="animate-rise-in text-5xl md:text-6xl font-bold font-sans text-white leading-[1.1] tracking-tight text-left"
            style={{ animationDelay: '90ms' }}
          >
            Every claim, checked against its source.
          </h1>

          <p
            className="animate-rise-in text-ink-muted text-lg font-sans max-w-md text-left leading-relaxed"
            style={{ animationDelay: '180ms' }}
          >
            Ask a research question. ARIA answers from cited sources, then checks each sentence against them and flags anything it can't support.
          </p>

          <div
            className="animate-rise-in pt-2 flex flex-wrap gap-2"
            style={{ animationDelay: '270ms' }}
          >
            <button
              onClick={onStart}
              className="group relative px-8 py-3.5 bg-tier-okf/10 border border-tier-okf/50 hover:bg-tier-okf/20 text-white font-mono text-xs uppercase tracking-widest transition-all duration-300 ease-out hover:scale-[1.01] hover:shadow-[0_0_30px_rgba(56,189,248,0.2)] flex items-center gap-3"
            >
              Ask a question
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-tier-okf opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>

          {/* Live telemetry chips */}
          <div
            className="animate-rise-in flex items-center gap-2 font-mono text-[9px] text-ink-muted pt-2"
            style={{ animationDelay: '360ms' }}
          >
            <span className="flex items-center gap-1.5 border border-ink-surface px-2 py-1 bg-ink-base">
              <Activity size={10} className="text-tier-okf" /> OKF
            </span>
            <span className="flex items-center gap-1.5 border border-ink-surface px-2 py-1 bg-ink-base">
              <Activity size={10} className="text-tier-rag" /> RAG
            </span>
            <span className="flex items-center gap-1.5 border border-ink-surface px-2 py-1 bg-ink-base">
              <Activity size={10} className="text-tier-live" /> LIVE
            </span>
            <span className="text-[9px] uppercase tracking-wider">engine latency: live</span>
          </div>
        </div>

        {/* Right side: animated Architecture Flow Simulator */}
        <div className="lg:col-span-7 relative flex justify-center items-center py-12">
          <div className="w-full max-w-md p-6 bg-ink-surface/20 border border-ink-surface/60 rounded-none relative animate-rise-in overflow-hidden">
            <div className="hud-scanline" />
            <div className="text-[10px] font-mono text-ink-muted uppercase tracking-wider mb-4 border-b border-ink-surface pb-2 relative">
              Pipeline Architecture Flow Simulator
            </div>

            <svg viewBox="0 0 400 200" className="w-full h-40 mb-2">
              <path
                d="M 20 100 C 90 40, 140 60, 210 100 S 340 160, 380 80"
                fill="none"
                stroke="#1F2A38"
                strokeWidth="1.5"
              />
              <path
                d="M 20 100 C 90 40, 140 60, 210 100 S 340 160, 380 80"
                fill="none"
                stroke="url(#flowGrad)"
                strokeWidth="1.5"
                strokeDasharray="8 10"
                className={simStage > 0 ? 'animate-packet-flow' : 'opacity-0'}
              />
              <defs>
                <linearGradient id="flowGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#5B8DB8" />
                  <stop offset="100%" stopColor="#5B8DB8" />
                </linearGradient>
              </defs>
            </svg>

            <div className="space-y-2 mb-4">
              {FLOW_STAGES.map((s, idx) => {
                const state = idx < simStage ? 'done' : idx === simStage ? 'active' : 'pending';
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 border transition-all ${
                        state === 'done'
                          ? 'bg-gray-200 border-gray-200'
                          : state === 'active'
                          ? 'bg-white border-white shadow-[0_0_8px_rgba(255,255,255,0.5)] animate-pulse'
                          : 'bg-ink-base border-gray-600'
                      }`}
                    />
                    <span className={`font-mono text-[10px] tracking-wider ${state === 'active' ? 'text-white font-bold' : state === 'done' ? 'text-gray-300' : 'text-gray-500'}`}>
                      {s.label}
                    </span>
                    <span className="font-mono text-[9px] text-ink-muted">{s.desc}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 border-t border-ink-surface pt-3 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
                Now in: {currentStage.label} phase
              </span>
              <span className="font-mono text-[9px] text-ink-muted">T+0.00s · deterministic audit armed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
