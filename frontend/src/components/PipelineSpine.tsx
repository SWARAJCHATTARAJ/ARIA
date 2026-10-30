import React, { useEffect, useState } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { PipelineStage } from '../types';
import { getMotionScale } from '../utils/motion';

interface PipelineSpineProps {
  mode?: 'live' | 'home';
  stage?: PipelineStage;
  tiersFired?: string[];
  isComplete?: boolean;
  onReplay?: () => void;
  /** vertical (default, desktop spine) or horizontal (mobile compact progress strip) */
  orientation?: 'vertical' | 'horizontal';
}

export default function PipelineSpine({
  mode = 'live',
  stage,
  tiersFired = [],
  isComplete = false,
  orientation = 'vertical',
}: PipelineSpineProps) {
  const motionScale = getMotionScale();
  const [homeStep, setHomeStep] = useState(0);
  const [homeReplayKey, setHomeReplayKey] = useState(0);

  // Home mode: plays once on load (about 2.5s total), no auto-loop
  useEffect(() => {
    if (mode !== 'home') return;
    setHomeStep(0);

    const step1 = setTimeout(() => setHomeStep(1), 500 * motionScale);
    const step2 = setTimeout(() => setHomeStep(2), 1100 * motionScale);
    const step3 = setTimeout(() => setHomeStep(3), 1800 * motionScale);
    const step4 = setTimeout(() => setHomeStep(4), 2500 * motionScale);

    return () => {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
      clearTimeout(step4);
    };
  }, [mode, homeReplayKey, motionScale]);

  // Determine stage states based on mode
  const isPlanActive = mode === 'home' ? homeStep === 0 : stage === 'routing';
  const isPlanDone = mode === 'home' ? homeStep >= 1 : stage === 'retrieving' || stage === 'streaming' || stage === 'auditing' || isComplete;

  const isRetrieveActive = mode === 'home' ? homeStep === 1 : stage === 'retrieving';
  const isRetrieveDone = mode === 'home' ? homeStep >= 2 : stage === 'streaming' || stage === 'auditing' || isComplete;

  const isWriteActive = mode === 'home' ? homeStep === 2 : stage === 'streaming';
  const isWriteDone = mode === 'home' ? homeStep >= 3 : stage === 'auditing' || isComplete;

  const isCheckActive = mode === 'home' ? homeStep === 3 : stage === 'auditing';
  const isCheckDone = mode === 'home' ? homeStep >= 4 : isComplete;

  // Active tiers check
  const activeTiers = mode === 'home' 
    ? (homeStep >= 1 ? ['OKF', 'RAG', 'LIVE'] : []) 
    : tiersFired;

  const stages = [
    {
      id: 'plan',
      name: 'PLAN',
      isActive: isPlanActive,
      isDone: isPlanDone,
    },
    {
      id: 'retrieve',
      name: 'RETRIEVE',
      isActive: isRetrieveActive,
      isDone: isRetrieveDone,
      hasSubrows: true,
    },
    {
      id: 'write',
      name: 'WRITE',
      isActive: isWriteActive,
      isDone: isWriteDone,
    },
    {
      id: 'check',
      name: 'CHECK',
      isActive: isCheckActive,
      isDone: isCheckDone,
    },
  ];

  // Horizontal compact strip for narrow viewports (no sub-rows, tier glyphs inline)
  if (orientation === 'horizontal') {
    return (
      <div className="w-full select-none pipeline-progress-h">
        <div className="flex items-center justify-between gap-1 px-3 py-1.5">
          {stages.map((st, idx) => (
            <React.Fragment key={st.id}>
              {idx > 0 && (
                <div
                  className={`flex-1 h-[1.5px] min-w-[6px] transition-colors duration-200 ${
                    st.isDone || st.isActive ? 'bg-gray-300' : 'bg-ink-surface'
                  }`}
                />
              )}
              <div className="flex items-center gap-1 shrink-0">
                <div
                  className={`w-2 h-2 rounded-none border flex items-center justify-center transition-all duration-200 ${
                    st.isDone
                      ? 'bg-gray-200 border-gray-200'
                      : st.isActive
                      ? 'bg-ink-base border-white shadow-[0_0_6px_rgba(255,255,255,0.45)]'
                      : 'bg-ink-base border-gray-600'
                  }`}
                >
                  {st.isDone && <Check size={7} strokeWidth={3.5} className="text-ink-base" />}
                </div>
                <span
                  className={`font-mono text-[9px] tracking-wider ${
                    st.isActive ? 'text-white font-bold' : st.isDone ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  {st.name}
                </span>
              </div>
            </React.Fragment>
          ))}
          {/* Tier glyphs inline at the end: § OKF, ▲ RAG, ● LIVE */}
          <div className="flex items-center gap-1 ml-1 shrink-0 pl-1.5 border-l border-ink-surface">
            {(['OKF', 'RAG', 'LIVE'] as const).map((t) => (
              <span
                key={t}
                className={`font-mono text-[9px] font-bold ${
                  activeTiers.includes(t) ? 'opacity-100' : 'opacity-30'
                } ${t === 'OKF' ? 'text-tier-okf' : t === 'RAG' ? 'text-tier-rag' : 'text-tier-live'}`}
                title={t}
              >
                {t === 'OKF' ? '§' : t === 'RAG' ? '▲' : '●'}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start select-none w-full">
      <div className="relative flex flex-col gap-6 pl-2">
        {/* Continuous background neutral spine line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-ink-surface" />

        {stages.map((st, idx) => {
          const isCurrent = st.isActive;
          const isDone = st.isDone;

          return (
            <div key={st.id} className="relative flex flex-col gap-1.5 z-10">
              <div className="flex items-center gap-3">
                {/* Neutral square marker (white / grey only) */}
                <div
                  className={`w-3 h-3 rounded-none border transition-all duration-200 flex items-center justify-center ${
                    isDone
                      ? 'bg-gray-200 border-gray-200 text-ink-base'
                      : isCurrent
                      ? 'bg-ink-base border-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                      : 'bg-ink-base border-gray-600'
                  }`}
                >
                  {isDone && <Check size={9} strokeWidth={3} className="text-ink-base" />}
                  {isCurrent && !isDone && <div className="w-1.5 h-1.5 bg-white" />}
                </div>

                {/* Stage Name */}
                <span
                  className={`font-mono text-[11px] tracking-wider transition-colors duration-200 ${
                    isCurrent
                      ? 'text-white font-bold'
                      : isDone
                      ? 'text-gray-300'
                      : 'text-gray-400' /* High contrast >4.5:1 on dark background */
                  }`}
                >
                  {st.name}
                </span>
              </div>

              {/* RETRIEVE Sub-rows: § OKF, ▲ RAG, ● LIVE (tier colors appear ONLY here) */}
              {st.hasSubrows && (
                <div className="ml-6 pl-2 border-l border-ink-surface/60 flex flex-col gap-1 py-0.5">
                  {/* OKF Sub-row */}
                  <div
                    className={`flex items-center gap-2 font-mono text-[10px] transition-all duration-300 ${
                      activeTiers.includes('OKF')
                        ? 'opacity-100 font-semibold'
                        : 'opacity-40 text-gray-400'
                    }`}
                  >
                    <span className="text-tier-okf font-bold">§</span>
                    <span className={activeTiers.includes('OKF') ? 'text-gray-200' : 'text-gray-400'}>
                      OKF
                    </span>
                  </div>

                  {/* RAG Sub-row */}
                  <div
                    className={`flex items-center gap-2 font-mono text-[10px] transition-all duration-300 ${
                      activeTiers.includes('RAG')
                        ? 'opacity-100 font-semibold'
                        : 'opacity-40 text-gray-400'
                    }`}
                  >
                    <span className="text-tier-rag font-bold">▲</span>
                    <span className={activeTiers.includes('RAG') ? 'text-gray-200' : 'text-gray-400'}>
                      RAG
                    </span>
                  </div>

                  {/* LIVE Sub-row */}
                  <div
                    className={`flex items-center gap-2 font-mono text-[10px] transition-all duration-300 ${
                      activeTiers.includes('LIVE')
                        ? 'opacity-100 font-semibold'
                        : 'opacity-40 text-gray-400'
                    }`}
                  >
                    <span className="text-tier-live font-bold">●</span>
                    <span className={activeTiers.includes('LIVE') ? 'text-gray-200' : 'text-gray-400'}>
                      LIVE
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Replay Control for Home mode */}
      {mode === 'home' && (
        <button
          onClick={() => setHomeReplayKey((k) => k + 1)}
          className="mt-6 ml-2 flex items-center gap-1.5 text-[11px] font-mono text-gray-400 hover:text-white border border-ink-surface hover:border-gray-500 bg-ink-surface/40 px-2.5 py-1 rounded-none transition-colors"
          title="Replay pipeline animation"
        >
          <RotateCcw size={11} /> Replay
        </button>
      )}
    </div>
  );
}
