import React from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, Globe, Activity } from 'lucide-react';
import ConfidenceDial from './ConfidenceDial';

interface SourcePanelProps {
  onClose: () => void;
  activeQuery?: boolean;
}

export default function SourcePanel({ onClose, activeQuery = false }: SourcePanelProps) {
  return (
    <div className="h-full flex flex-col bg-ink-surface/50 border-l border-ink-surface">
      <div className="p-4 border-b border-ink-surface flex justify-between items-center bg-ink-surface">
        <h3 className="font-mono text-xs uppercase tracking-wider text-ink-muted">Telemetry & Sources</h3>
        <button onClick={onClose} className="text-ink-muted hover:text-white">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {!activeQuery ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <div className="relative">
              <Activity size={32} className="text-ink-muted animate-pulse" />
              <div className="absolute inset-0 border-2 border-dashed border-ink-muted rounded-full animate-[spin_4s_linear_infinite]" />
            </div>
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-gray-300">Awaiting Signal</div>
              <div className="text-[10px] font-mono text-ink-muted mt-1">Telemetry systems online.</div>
            </div>
          </div>
        ) : (
          <>
            {/* Route Trace */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-ink-muted uppercase">Live Route Trace</div>
              <div className="bg-ink-base rounded-none p-3 font-mono text-xs space-y-3 border border-ink-surface relative">
                {/* Decorative corner bracket */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-tier-okf" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-tier-okf" />
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Nodes Traversed:</span>
                  <span className="text-tier-okf">4</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">RAG Score:</span>
                  <span className="text-tier-rag">0.92</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-ink-surface/50">
                  <span className="text-gray-400">Confidence:</span>
                  <ConfidenceDial level="high" />
                </div>
              </div>
            </div>

            {/* Source Cards */}
            <div className="space-y-4">
              <div className="text-[10px] font-mono text-ink-muted uppercase">Citation Index</div>

              {/* OKF Source */}
              <div className="bg-ink-base [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,0_100%)] border-l-2 border-tier-okf p-3 relative group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono text-tier-okf bg-tier-okf/10 px-1.5 py-0.5">
                    <FileText size={10} />
                    <span>ai_definition.md</span>
                  </div>
                  <span className="text-[8px] font-mono text-ink-muted">ID: 0x9A2F</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed font-sans mt-2 mb-3 pl-2 border-l border-ink-surface">
                  "Autonomous Intelligence refers to AI systems that can independently plan, execute, and adapt their actions to achieve high-level goals without human intervention."
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-ink-surface pt-2">
                  <span className="text-[10px] font-mono text-tier-okf flex items-center gap-1 border border-tier-okf/30 px-1.5 py-0.5 bg-tier-okf/5 animate-stamp shadow-sm">
                    <CheckCircle2 size={10} /> VERIFIED
                  </span>
                  <button className="text-[10px] font-mono text-ink-muted hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                    Edit Note
                  </button>
                </div>
              </div>

              {/* Live Source with Warning */}
              <div className="bg-ink-base [clip-path:polygon(0_0,calc(100%-12px)_0,100%_12px,100%_100%,0_100%)] border-l-2 border-warning p-3 relative group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono text-warning bg-warning/10 px-1.5 py-0.5">
                    <Globe size={10} />
                    <span>arXiv:2401.001</span>
                  </div>
                  <span className="text-[8px] font-mono text-ink-muted">EXT. LINK</span>
                </div>
                <div className="bg-warning/5 border border-warning/20 p-2 mb-2">
                  <p className="text-[10px] font-mono text-warning flex items-start gap-2">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    FLAGGED IN RETRACTION WATCH DB (2024-03-15)
                  </p>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed font-sans pl-2 border-l border-ink-surface">
                  "Recent papers suggest autonomous intelligence is still in its infancy..."
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-ink-surface pt-2">
                  <span className="text-[10px] font-mono text-tier-live flex items-center gap-1">
                    LIVE SNAPSHOT
                  </span>
                  <button className="text-[10px] font-mono text-ink-muted hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                    Copy BibTeX
                  </button>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  );
}
