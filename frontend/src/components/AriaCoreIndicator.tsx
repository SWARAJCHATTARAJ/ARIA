import React from 'react';
import { getMotionScale } from '../services/motion';

export type AriaCoreState = 'IDLE' | 'THINKING' | 'STREAMING' | 'COMPLETE';

interface AriaCoreIndicatorProps {
  state?: AriaCoreState;
  size?: number;
  className?: string;
}

/**
 * ARIA Core — bespoke geometric orbital/lattice emblem.
 * Serves as the unmistakable visual signature of ARIA in the header,
 * empty state, and active thinking indicator.
 *
 * State kinetics:
 * - IDLE: calm 4s breathing pulse.
 * - THINKING/STREAMING: counter-rotating precision orbital rings.
 * - COMPLETE: crisp scale lock-in.
 */
export default function AriaCoreIndicator({
  state = 'IDLE',
  size = 28,
  className = '',
}: AriaCoreIndicatorProps) {
  const motionScale = getMotionScale();

  const isIdle = state === 'IDLE';
  const isThinking = state === 'THINKING';
  const isStreaming = state === 'STREAMING';
  const isComplete = state === 'COMPLETE';
  const isActive = isThinking || isStreaming;

  const stateClass = isIdle
    ? 'aria-core-idle'
    : isThinking
      ? 'aria-core-thinking'
      : isStreaming
        ? 'aria-core-streaming'
        : isComplete
          ? 'aria-core-complete'
          : '';

  const ringDuration = isStreaming ? 2.2 : 3.2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={`aria-core ${stateClass} ${className}`}
      role="img"
      aria-label={`ARIA core state: ${state}`}
    >
      <g
        className="aria-core-ring"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
      >
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1" opacity="0.5" fill="none" />
        <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1" opacity="0.35" fill="none" />
        <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="1" opacity="0.25" fill="none" />
      </g>

      {/* Core node with state-driven animation */}
      <circle
        cx="24"
        cy="24"
        r="3.5"
        fill="currentColor"
        className={isComplete ? 'aria-core-complete' : isIdle ? 'aria-core-idle' : 'aria-core-thinking'}
      />

      {/* Orbital satellites */}
      <circle cx="43" cy="24" r="1.6" fill="currentColor" opacity="0.75" />
      <circle cx="5" cy="24" r="1.6" fill="currentColor" opacity="0.75" />
      <circle cx="24" cy="43" r="1.4" fill="currentColor" opacity="0.6" />
      <circle cx="24" cy="5" r="1.4" fill="currentColor" opacity="0.6" />

      {/* Direction tick for precision orbit */}
      <circle
        cx={isActive ? 38 : 44}
        cy="24"
        r="2"
        fill="currentColor"
        opacity={isActive ? 0.95 : 0.55}
      />
    </svg>
  );
}
