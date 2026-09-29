import React, { useEffect, useState } from 'react';

interface ConfidenceDialProps {
  level: 'low' | 'medium' | 'high';
}

export default function ConfidenceDial({ level }: ConfidenceDialProps) {
  const [rotation, setRotation] = useState('-90deg'); // Start at 0 (left)

  useEffect(() => {
    // Trigger animation after mount
    const timer = setTimeout(() => {
      if (level === 'high') setRotation('90deg');
      else if (level === 'medium') setRotation('0deg');
      else setRotation('-45deg');
    }, 100);
    return () => clearTimeout(timer);
  }, [level]);

  return (
    <div className="relative w-16 h-8 overflow-hidden flex flex-col items-center justify-end">
      {/* Semi-circle dial background */}
      <div className="absolute top-0 w-16 h-16 rounded-full border-4 border-ink-surface border-b-transparent border-l-tier-rag border-r-tier-okf border-t-tier-live opacity-50" style={{ transform: 'rotate(45deg)' }} />
      
      {/* Needle */}
      <div 
        className="absolute bottom-0 w-0.5 h-8 bg-white origin-bottom animate-gauge transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{ transform: `rotate(${rotation})` }}
      >
        {/* Needle dot */}
        <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 rounded-full bg-white" />
      </div>
    </div>
  );
}
