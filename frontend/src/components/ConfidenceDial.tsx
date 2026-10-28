import React, { useEffect, useState, useRef } from 'react';
import { getMotionScale, isReducedMotion } from '../utils/motion';

interface ConfidenceDialProps {
  confidence?: number; // 0.0 - 1.0
  tierAgreement?: string | null;
  claimsSupported?: number;
  claimsTotal?: number;
  unsupportedShare?: number; // 0.0 - 1.0
  size?: 'sm' | 'md';
  isAudited?: boolean;
}

export default function ConfidenceDial({
  confidence = 0.85,
  tierAgreement,
  claimsSupported,
  claimsTotal,
  unsupportedShare = 0,
  size = 'sm',
  isAudited = true,
}: ConfidenceDialProps) {
  const [rotation, setRotation] = useState('-90deg');
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const motionScale = getMotionScale();
  const reducedMotion = isReducedMotion();

  // Compute needle angle: -90deg (0%) to +90deg (100%)
  const clampedConfidence = Math.max(0, Math.min(1, confidence));
  const targetDeg = Math.round(-90 + clampedConfidence * 180);
  const targetPercent = Math.round(clampedConfidence * 100);

  // Compute spring overshoot based on tier_agreement or unsupported share
  const overshootDeg = React.useMemo(() => {
    if (reducedMotion) return 0;
    if (tierAgreement) {
      const lower = tierAgreement.toLowerCase();
      if (lower.includes('high') || lower === 'full') return 4;
      if (lower.includes('moderate') || lower.includes('partial')) return 12;
      return 22; // low agreement / conflict
    }
    return Math.round(unsupportedShare * 20) + 5;
  }, [tierAgreement, unsupportedShare, reducedMotion]);

  useEffect(() => {
    // Needle starts only after audit
    if (!isAudited) {
      setRotation('-90deg');
      setDisplayNumber(null);
      return;
    }

    if (reducedMotion) {
      setRotation(`${targetDeg}deg`);
      setDisplayNumber(targetPercent);
      return;
    }

    // 700ms duration animation (scaled by ?slow=1 motionScale)
    const totalDuration = 700 * motionScale;
    const overDeg = Math.min(90, targetDeg + overshootDeg);

    // 1. Swing to overshoot
    setRotation(`${overDeg}deg`);

    // Settle to final target
    const settleTimer = setTimeout(() => {
      setRotation(`${targetDeg}deg`);
    }, totalDuration * 0.65);

    // 2. Count up the number in step
    let startTimestamp: number | null = null;
    let animId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min(1, (timestamp - startTimestamp) / totalDuration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayNumber(Math.round(eased * targetPercent));

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    };

    animId = requestAnimationFrame(step);

    return () => {
      clearTimeout(settleTimer);
      cancelAnimationFrame(animId);
    };
  }, [isAudited, targetDeg, targetPercent, overshootDeg, motionScale, reducedMotion]);

  const isMedium = size === 'md';
  const widthClass = isMedium ? 'w-20 h-10' : 'w-16 h-8';
  const ringClass = isMedium ? 'w-20 h-20' : 'w-16 h-16';
  const needleHeight = isMedium ? 'h-10' : 'h-8';

  const showClaimsRatio = typeof claimsTotal === 'number' && claimsTotal > 0 && typeof claimsSupported === 'number';

  return (
    <div className="flex items-center gap-2 select-none">
      <div
        className={`relative ${widthClass} overflow-hidden flex flex-col items-center justify-end`}
        title={isAudited ? `Confidence: ${targetPercent}% (${targetDeg}°)` : 'Awaiting audit'}
      >
        {/* Semi-circle dial background */}
        <div
          className={`absolute top-0 ${ringClass} rounded-full border-4 border-ink-surface border-b-transparent border-l-tier-rag border-r-tier-okf border-t-tier-live opacity-60`}
          style={{ transform: 'rotate(45deg)' }}
        />

        {/* Needle: swings over 700ms with spring overshoot */}
        <div
          className={`absolute bottom-0 w-0.5 ${needleHeight} bg-white origin-bottom ${
            reducedMotion ? '' : 'transition-transform duration-[calc(700ms*var(--motion-scale,1))] ease-[cubic-bezier(0.2,0.8,0.2,1)]'
          }`}
          style={{ transform: `rotate(${rotation})` }}
        >
          {/* Needle pivot */}
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full bg-white shadow-sm" />
        </div>
      </div>

      <div className="flex flex-col">
        <span className="font-mono text-[10px] text-gray-200 font-semibold">
          {displayNumber !== null ? `${displayNumber}%` : '--'}
        </span>
        {showClaimsRatio && (
          <span className="font-mono text-[9px] text-ink-muted">
            {claimsSupported} of {claimsTotal} claims supported
          </span>
        )}
      </div>
    </div>
  );
}
