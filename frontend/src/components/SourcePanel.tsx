import React from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, Globe } from 'lucide-react';
import ConfidenceDial from './ConfidenceDial';

interface SourcePanelProps {
  onClose: () => void;
}

export default function SourcePanel({ onClose }: SourcePanelProps) {
  return (
    <div className="h-full flex flex-col bg-ink-surface/50 border-l border-ink-surface">
      <div className="p-4 border-b border-ink-surface flex justify-between items-center bg-ink-surface">
        <h3 className="font-mono text-xs uppercase tracking-wider text-ink-muted">Route Trace & Sources</h3>
        <button onClick={onClose} className="text-ink-muted hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Route Trace */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono text-ink-muted uppercase">Pipeline Execution</div>
          <div className="bg-ink-base rounded-md p-3 font-mono text-xs space-y-3">
            <div className="flex justify-between items-center">
              <span>Confidence:</span>
              <ConfidenceDial level="high" />
            </div>
            <div className="flex justify-between"><span>Dristi_Engine:</span> <span className="text-gray-300">V1_Fast</span></div>
            <div className="flex justify-between"><span>Cascade:</span> <span className="text-gray-300">OKF + LIVE</span></div>
          </div>
        </div>

        {/* Source Cards */}
        <div className="space-y-4">
          <div className="text-[10px] font-mono text-ink-muted uppercase">Retrieved Evidence</div>

          {/* OKF Source */}
          <div className="bg-ink-base rounded-md border-t-2 border-tier-okf p-3 relative overflow-hidden group">
            <div className="flex items-center gap-2 mb-2 text-xs font-mono text-ink-muted">
              <FileText size={12} className="text-tier-okf" />
              <span>ai_definition.md</span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed font-sans mt-2 mb-3">
              "Autonomous Intelligence refers to AI systems that can independently plan, execute, and adapt their actions to achieve high-level goals without human intervention."
            </p>
            <div className="flex justify-center mb-3">
              <button className="text-[10px] font-mono text-ink-muted hover:text-white transition-colors border border-ink-surface px-2 py-1 rounded w-full">
                Expand Context
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-ink-surface pt-2">
              <span className="text-[10px] font-mono text-tier-okf flex items-center gap-1 border border-tier-okf/30 px-1.5 py-0.5 rounded bg-tier-okf/10 animate-stamp shadow-sm">
                <CheckCircle2 size={10} /> VERIFIED
              </span>
              <button className="text-[10px] font-mono text-ink-muted hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                Edit OKF Note
              </button>
            </div>
          </div>

          {/* Live Source with Warning */}
          <div className="bg-ink-base rounded-md border-t-2 border-warning p-3 relative overflow-hidden group">
            <div className="flex items-center gap-2 mb-2 text-xs font-mono text-ink-muted">
              <Globe size={12} className="text-warning" />
              <span>arXiv:2401.001</span>
            </div>
            <div className="bg-warning/10 border border-warning/20 rounded p-2 mb-2">
              <p className="text-xs text-warning flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                This paper was flagged in the Retraction Watch database on 2024-03-15. Proceed with caution.
              </p>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed font-sans">
              "Recent papers suggest autonomous intelligence is still in its infancy..."
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-ink-surface pt-2">
              <span className="text-[10px] font-mono text-tier-live flex items-center gap-1">
                Live Source (Snapshot stored)
              </span>
              <button className="text-[10px] font-mono text-ink-muted hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                Copy BibTeX
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
