import React from 'react';
import { PipelineStage } from '../types';

interface PipelineSpineProps {
  mode?: 'live' | 'home';
  stage?: PipelineStage;
  tiersFired?: string[];
  isComplete?: boolean;
  orientation?: 'vertical' | 'horizontal';
}

function PipelineSpineInner({
  mode = 'live',
  stage,
  tiersFired = [],
  isComplete = false,
  orientation = 'vertical',
}: PipelineSpineProps) {
  const isPlanActive = mode === 'home' ? false : stage === 'routing';
  const isPlanDone = mode === 'home' ? false : stage === 'retrieving' || stage === 'streaming' || stage === 'auditing' || isComplete;

  const isRetrieveActive = mode === 'home' ? false : stage === 'retrieving';
  const isRetrieveDone = mode === 'home' ? false : stage === 'streaming' || stage === 'auditing' || isComplete;

  const isWriteActive = mode === 'home' ? false : stage === 'streaming';
  const isWriteDone = mode === 'home' ? false : stage === 'auditing' || isComplete;

  const isCheckActive = mode === 'home' ? false : stage === 'auditing';
  const isCheckDone = mode === 'home' ? false : isComplete;

  const stages = [
    { id: 'plan', name: 'PLAN', isActive: isPlanActive, isDone: isPlanDone },
    { id: 'retrieve', name: 'RETRIEVE', isActive: isRetrieveActive, isDone: isRetrieveDone, hasSubrows: true },
    { id: 'write', name: 'WRITE', isActive: isWriteActive, isDone: isWriteDone },
    { id: 'check', name: 'CHECK', isActive: isCheckActive, isDone: isCheckDone },
  ];

  if (orientation === 'horizontal') {
    return (
      <div className="w-full select-none flex items-center justify-between gap-2 px-4 py-2 bg-[#141416] border-b border-[#262629]">
        {stages.map((st, idx) => (
          <React.Fragment key={st.id}>
            {idx > 0 && (
              <div
                className={`flex-1 h-[1px] min-w-[8px] ${
                  st.isDone || st.isActive ? 'bg-[#5E8BFF]' : 'bg-[#262629]'
                }`}
              />
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`w-2 h-2 rounded-full ${
                  st.isActive || st.isDone
                    ? 'bg-[#5E8BFF]'
                    : 'border border-[#262629] bg-transparent'
                }`}
              />
              <span
                className={`font-mono text-[12px] ${
                  st.isActive
                    ? 'text-[#EDEDED] font-semibold'
                    : st.isDone
                    ? 'text-[#8B8B8E]'
                    : 'text-[#8B8B8E]/50'
                }`}
              >
                {st.name}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start select-none w-full">
      <div className="relative flex flex-col gap-6 pl-2">
        <div className="absolute left-[3.5px] top-2 bottom-2 w-[1px] bg-[#262629]" />

        {stages.map((st) => {
          const isCurrent = st.isActive;
          const isDone = st.isDone;

          return (
            <div key={st.id} className="relative flex flex-col gap-2 z-10">
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isCurrent || isDone
                      ? 'bg-[#5E8BFF]'
                      : 'border border-[#262629] bg-transparent'
                  }`}
                />

                <span
                  className={`font-mono text-[12px] tracking-wider ${
                    isCurrent
                      ? 'text-[#EDEDED] font-semibold'
                      : isDone
                      ? 'text-[#8B8B8E]'
                      : 'text-[#8B8B8E]/50'
                  }`}
                >
                  {st.name}
                </span>
              </div>

              {st.hasSubrows && (
                <div className="ml-5 pl-2 border-l border-[#262629] flex flex-col gap-1 py-1">
                  {(['OKF', 'RAG', 'LIVE'] as const).map((t) => {
                    const active = tiersFired.includes(t);
                    return (
                      <div
                        key={t}
                        className={`flex items-center gap-2 font-mono text-[12px] ${
                          active ? 'opacity-100' : 'opacity-40'
                        }`}
                      >
                        <span
                          style={{
                            color: t === 'OKF' ? '#5E8BFF' : t === 'RAG' ? '#A78BFA' : '#34D399',
                          }}
                          className="font-semibold"
                        >
                          {t}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PipelineSpineMemo = React.memo(PipelineSpineInner);
PipelineSpineMemo.displayName = 'PipelineSpine';
export default PipelineSpineMemo;
