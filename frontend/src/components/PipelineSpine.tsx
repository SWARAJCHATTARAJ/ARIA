import React from 'react';
import { PipelineStage } from '../types';

interface PipelineSpineProps {
  mode?: 'live' | 'home';
  stage?: PipelineStage;
  tiersFired?: string[];
  isComplete?: boolean;
  /** vertical (default, desktop spine) or horizontal (mobile compact progress strip) */
  orientation?: 'vertical' | 'horizontal';
}

const DOT_CLASSES = {
  done: 'w-[7px] h-[7px] rounded-full bg-[#60A5FA]',
  active: 'w-[7px] h-[7px] rounded-full bg-[#60A5FA] aria-dot-pulse',
  pending: 'w-[7px] h-[7px] rounded-full border border-[#3F3F46] bg-transparent',
} as const;

function dotState(isActive: boolean, isDone: boolean): keyof typeof DOT_CLASSES {
  if (isDone) return 'done';
  if (isActive) return 'active';
  return 'pending';
}

function PipelineSpineInner({
  mode = 'live',
  stage,
  tiersFired = [],
  isComplete = false,
  orientation = 'vertical',
}: PipelineSpineProps) {
  // Determine stage states based on mode
  const isPlanActive = mode === 'home' ? false : stage === 'routing';
  const isPlanDone = mode === 'home' ? false : stage === 'retrieving' || stage === 'streaming' || stage === 'auditing' || isComplete;

  const isRetrieveActive = mode === 'home' ? false : stage === 'retrieving';
  const isRetrieveDone = mode === 'home' ? false : stage === 'streaming' || stage === 'auditing' || isComplete;

  const isWriteActive = mode === 'home' ? false : stage === 'streaming';
  const isWriteDone = mode === 'home' ? false : stage === 'auditing' || isComplete;

  const isCheckActive = mode === 'home' ? false : stage === 'auditing';
  const isCheckDone = mode === 'home' ? false : isComplete;

  // Active tiers check
  const activeTiers = tiersFired;

  const stages = [
    { id: 'plan', name: 'PLAN', isActive: isPlanActive, isDone: isPlanDone },
    { id: 'retrieve', name: 'RETRIEVE', isActive: isRetrieveActive, isDone: isRetrieveDone, hasSubrows: true },
    { id: 'write', name: 'WRITE', isActive: isWriteActive, isDone: isWriteDone },
    { id: 'check', name: 'CHECK', isActive: isCheckActive, isDone: isCheckDone },
  ];

  // Horizontal compact strip for narrow viewports (tier glyphs inline)
  if (orientation === 'horizontal') {
    return (
      <div className="w-full select-none flex items-center justify-between gap-1 px-3 py-1.5">
        {stages.map((st, idx) => (
          <React.Fragment key={st.id}>
            {idx > 0 && (
              <div
                className={`flex-1 h-[1.5px] min-w-[6px] transition-colors duration-200 ${
                  st.isDone || st.isActive ? 'bg-[#60A5FA]/60' : 'bg-[#27272A]'
                }`}
              />
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={DOT_CLASSES[dotState(st.isActive, st.isDone)]} />
              <span
                className={`font-mono text-[9px] tracking-wider ${
                  st.isActive
                    ? 'text-[#F4F4F6] font-bold'
                    : st.isDone
                    ? 'text-[#A1A1AA]'
                    : 'text-[#52525B]'
                }`}
              >
                {st.name}
              </span>
            </div>
          </React.Fragment>
        ))}
        {/* Tier glyphs inline at the end: § OKF, ▲ RAG, ● LIVE */}
        <div className="flex items-center gap-1 ml-1 shrink-0 pl-1.5 border-l border-white/[0.07]">
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
    );
  }

  return (
    <div className="flex flex-col items-start select-none w-full">
      <div className="relative flex flex-col gap-6 pl-2">
        {/* Continuous background neutral spine line */}
        <div className="absolute left-[3.5px] top-2 bottom-2 w-[1px] bg-[#27272A]" />

        {stages.map((st) => {
          const isCurrent = st.isActive;
          const isDone = st.isDone;
          const dot = dotState(isCurrent, isDone);

          return (
            <div key={st.id} className="relative flex flex-col gap-1.5 z-10">
              <div className="flex items-center gap-3">
                {/* 7px status dot: pulses ONLY while this stage is executing */}
                <span className={DOT_CLASSES[dot]} />

                {/* Stage Name */}
                <span
                  className={`font-mono text-[11px] tracking-wider transition-colors duration-200 ${
                    isCurrent
                      ? 'text-[#F4F4F6] font-bold'
                      : isDone
                      ? 'text-[#A1A1AA]'
                      : 'text-[#52525B]'
                  }`}
                >
                  {st.name}
                </span>
              </div>

              {/* RETRIEVE Sub-rows: § OKF, ▲ RAG, ● LIVE (tier colors appear ONLY here) */}
              {st.hasSubrows && (
                <div className="ml-5 pl-2 border-l border-white/[0.07] flex flex-col gap-1 py-0.5">
                  {(['OKF', 'RAG', 'LIVE'] as const).map((t) => (
                    <div
                      key={t}
                      className={`flex items-center gap-2 font-mono text-[10px] transition-opacity duration-300 ${
                        activeTiers.includes(t) ? 'opacity-100 font-semibold' : 'opacity-40'
                      }`}
                    >
                      <span
                        className={`${t === 'OKF' ? 'text-tier-okf' : t === 'RAG' ? 'text-tier-rag' : 'text-tier-live'} font-bold`}
                      >
                        {t === 'OKF' ? '§' : t === 'RAG' ? '▲' : '●'}
                      </span>
                      <span
                        className={
                          activeTiers.includes(t) ? 'text-[#F4F4F6]' : 'text-[#52525B]'
                        }
                      >
                        {t}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Memoized: heavy render trees (markdown / graphs / SVG) only re-render
// when their props actually change during a streaming update.
const PipelineSpineMemo = React.memo(PipelineSpineInner);
PipelineSpineMemo.displayName = 'PipelineSpine';
export default PipelineSpineMemo;
