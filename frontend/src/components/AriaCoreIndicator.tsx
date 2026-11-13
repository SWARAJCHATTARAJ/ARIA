import React from 'react';

export type AriaCoreState = 'IDLE' | 'THINKING' | 'STREAMING' | 'COMPLETE';

interface AriaCoreIndicatorProps {
  state?: AriaCoreState;
  size?: number;
  className?: string;
}

/**
 * ARIA Core — minimal signature emblem: a single precision dot.
 * - IDLE: calm 4s breathing pulse.
 * - THINKING/STREAMING: subtle 1.2s scale pulse (aria-dot-pulse).
 * - COMPLETE: crisp scale lock-in.
 */
export default function AriaCoreIndicator({
  state = 'IDLE',
  size = 28,
  className = '',
}: AriaCoreIndicatorProps) {
  const isIdle = state === 'IDLE';
  const isActive = state === 'THINKING' || state === 'STREAMING';
  const isComplete = state === 'COMPLETE';

  const stateClass = isComplete
    ? 'aria-core-complete'
    : isActive
      ? 'aria-dot-pulse'
      : 'aria-core-idle';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={`aria-core ${className}`}
      role="img"
      aria-label={`ARIA core state: ${state}`}
    >
      <circle
        cx="24"
        cy="24"
        r={isComplete ? 6.5 : 5.5}
        fill="currentColor"
        opacity={isIdle ? 0.85 : 1}
        className={stateClass}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
      />
    </svg>
  );
}
