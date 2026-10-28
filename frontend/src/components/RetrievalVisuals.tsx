import React, { useEffect, useState, useRef } from 'react';
import { Citation } from '../types';
import { getMotionScale, isReducedMotion } from '../utils/motion';

interface RetrievalVisualsProps {
  okfNodePaths?: string[];
  ragScores?: number[];
  sources?: any[];
  citations?: Citation[];
  onHighlightSource?: (id: number | string) => void;
}

export default function RetrievalVisuals({
  okfNodePaths = [],
  ragScores = [],
  sources = [],
  citations = [],
  onHighlightSource,
}: RetrievalVisualsProps) {
  const motionScale = getMotionScale();
  const reducedMotion = isReducedMotion();

  // 1. OKF State
  const [activeOkfIndex, setActiveOkfIndex] = useState(0);
  const okfFired = okfNodePaths && okfNodePaths.length > 0;

  useEffect(() => {
    if (!okfFired) return;
    if (reducedMotion) {
      setActiveOkfIndex(okfNodePaths.length - 1);
      return;
    }

    const hopDuration = 180 * motionScale;
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 0; i < okfNodePaths.length; i++) {
      const timer = setTimeout(() => {
        setActiveOkfIndex(i);
        if (i === okfNodePaths.length - 1 && onHighlightSource) {
          // Highlight last node card once
          onHighlightSource(okfNodePaths[i]);
        }
      }, i * hopDuration);
      timers.push(timer);
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [okfFired, okfNodePaths.length, motionScale, reducedMotion]);

  // 2. RAG State (Scattered -> Row over 600ms)
  const [isRagAligned, setIsRagAligned] = useState(false);
  const ragFired = ragScores && ragScores.length > 0;

  useEffect(() => {
    if (!ragFired) return;
    if (reducedMotion) {
      setIsRagAligned(true);
      return;
    }

    const timer = setTimeout(() => {
      setIsRagAligned(true);
    }, 50 * motionScale);

    return () => clearTimeout(timer);
  }, [ragFired, motionScale, reducedMotion]);

  // 3. LIVE State (Staggered 120ms lines to markers)
  const liveSources = sources.filter((s) => s.tier === 'LIVE' || s.source_type === 'arxiv' || s.source_type === 'openalex' || s.source_type === 'duckduckgo' || s.source_type === 'wikipedia');
  const liveFired = liveSources.length > 0;
  const [visibleLiveCount, setVisibleLiveCount] = useState(0);

  useEffect(() => {
    if (!liveFired) return;
    if (reducedMotion) {
      setVisibleLiveCount(liveSources.length);
      return;
    }

    const staggerDuration = 120 * motionScale;
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 1; i <= liveSources.length; i++) {
      const timer = setTimeout(() => {
        setVisibleLiveCount(i);
      }, i * staggerDuration);
      timers.push(timer);
    }

    return () => timers.forEach(clearTimeout);
  }, [liveFired, liveSources.length, motionScale, reducedMotion]);

  // If no retrieval visual data present, do not render
  if (!okfFired && !ragFired && !liveFired) {
    return null;
  }

  return (
    <div className="p-3 bg-ink-base border border-ink-surface font-mono text-xs select-none space-y-3">
      {/* 1. OKF Node Path Pulse */}
      {okfFired && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-tier-okf flex items-center justify-between">
            <span className="font-bold flex items-center gap-1">§ OKF Graph Traversal</span>
            <span className="text-[9px] text-ink-muted">{okfNodePaths.length} nodes</span>
          </div>

          <div className="relative flex items-center gap-2 pl-1 py-1">
            {/* Connecting Line */}
            <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-[1px] bg-ink-surface/80 z-0" />

            {okfNodePaths.map((path, idx) => {
              const isPassed = activeOkfIndex >= idx;
              const isCurrent = activeOkfIndex === idx;

              return (
                <div key={idx} className="relative z-10 flex items-center gap-1 group">
                  <div
                    className={`w-2.5 h-2.5 rounded-full border transition-all duration-200 ${
                      isPassed
                        ? 'bg-tier-okf border-tier-okf shadow-[0_0_6px_rgba(91,141,184,0.6)]'
                        : 'bg-ink-surface border-gray-600'
                    } ${isCurrent ? 'scale-125' : ''}`}
                    title={path}
                  />
                  <span className="text-[9px] text-gray-400 truncate max-w-[80px]">
                    {path.split('/').pop()?.replace('.md', '')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. RAG Dense Alignment */}
      {ragFired && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-tier-rag flex items-center justify-between">
            <span className="font-bold flex items-center gap-1">▲ RAG Similarity Projection</span>
            <span className="text-[9px] text-ink-muted">{ragScores.length} vectors</span>
          </div>

          <div className="flex items-center gap-3 pl-1 py-1 overflow-hidden min-h-[28px]">
            {ragScores.map((score, idx) => {
              // Scattered offsets before settling into row
              const scatterX = !isRagAligned && !reducedMotion ? (idx % 2 === 0 ? -12 : 12) : 0;
              const scatterY = !isRagAligned && !reducedMotion ? (idx % 2 === 0 ? 6 : -6) : 0;

              return (
                <div
                  key={idx}
                  className="flex items-center gap-1 transition-all duration-[calc(600ms*var(--motion-scale,1))] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                  style={{
                    transform: `translate(${scatterX}px, ${scatterY}px)`,
                    opacity: isRagAligned || reducedMotion ? 1 : 0.4,
                  }}
                >
                  <div className="w-2 h-2 bg-tier-rag rounded-none" />
                  <span className="text-[9px] font-mono text-gray-300">
                    {score.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. LIVE Staggered Sources */}
      {liveFired && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-tier-live flex items-center justify-between">
            <span className="font-bold flex items-center gap-1">● LIVE Sources Discovery</span>
            <span className="text-[9px] text-ink-muted">{liveSources.length} external</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pl-1 py-1">
            {liveSources.slice(0, visibleLiveCount).map((s, idx) => {
              const type = s.source_type || 'web';
              // Check if citation arrived
              const isFilled = citations.some((c) => c.tier === 'LIVE');

              return (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] animate-[fadeIn_160ms_ease-out]"
                >
                  <div
                    className={`w-2 h-2 border border-tier-live rounded-none transition-colors duration-200 ${
                      isFilled ? 'bg-tier-live' : 'bg-transparent'
                    }`}
                  />
                  <span className="text-[9px] text-gray-300 uppercase tracking-wider px-1 py-0.2 bg-ink-surface border border-ink-surface">
                    {type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
