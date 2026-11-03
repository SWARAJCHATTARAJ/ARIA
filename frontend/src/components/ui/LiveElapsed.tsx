import React, { useEffect, useState } from 'react';

interface LiveElapsedProps {
  running: boolean;
  /** 's' renders T+X.Xs (250ms ticks), 'ms' renders raw milliseconds (100ms ticks) */
  mode?: 's' | 'ms';
  className?: string;
}

/**
 * LiveElapsed — isolated 100/250ms clock chip. Owns its interval and its
 * re-renders so the parent (heavy thread view) never re-renders on tick.
 */
export default function LiveElapsed({ running, mode = 's', className = '' }: LiveElapsedProps) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    if (!running) return;
    setMs(0);
    const start = performance.now();
    const id = window.setInterval(
      () => setMs(performance.now() - start),
      mode === 's' ? 250 : 100
    );
    return () => window.clearInterval(id);
  }, [running, mode]);

  if (!running) {
    return <span className={className}>{mode === 'ms' ? '--' : 'T+0.0s'}</span>;
  }

  return (
    <span className={className} aria-hidden={false}>
      {mode === 's' ? `T+${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`}
    </span>
  );
}
