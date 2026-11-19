import React, { useState, useEffect } from 'react';
import { ArrowUpRight, Clock, Sparkles } from 'lucide-react';
import { getHistory } from '../services/storage';
import { HistoryEntry } from '../types';

interface HomeProps {
  onStartQuery: (query: string) => void;
}

const LEGEND = [
  { label: 'OKF', color: '#60A5FA', desc: 'Deterministic Notes' },
  { label: 'RAG', color: '#A78BFA', desc: 'Vector Chunks' },
  { label: 'LIVE', color: '#F59E0B', desc: 'Scholarly Web' },
];

const TOPIC_PILLS = [
  { label: 'Autonomous Systems Taxonomy', query: 'What is the definition and taxonomy of autonomous systems in artificial intelligence?' },
  { label: 'CRISPR Off-Target Mitigation', query: 'What are the off-target mitigation strategies for CRISPR gene editing?' },
  { label: 'JWST 2024 Deep Field', query: 'What were the latest discoveries of the James Webb Space Telescope in 2024?' },
  { label: 'Byzantine Fault Tolerance', query: 'How do multi-agent consensus protocols handle Byzantine fault tolerance?' },
];

export default function Home({ onStartQuery }: HomeProps) {
  const [queryInput, setQueryInput] = useState('');
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const history = getHistory();
      setRecentHistory(history.slice(0, 3));
    } catch {
      // storage quiet fallback
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (!trimmed) return;
    onStartQuery(trimmed);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-y-auto hud-scroll bg-[#09090B] text-[#EDEDED] select-text">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 sm:px-10 py-3.5 border-b border-white/[0.07] bg-[#09090B] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-mono text-[#EDEDED] font-semibold tracking-[-0.02em]">
            ARIA
          </span>
          <span className="text-[11px] font-mono text-[#71717A] hidden sm:inline">
            Autonomous Research Engine
          </span>
        </div>

        <div className="flex items-center gap-4">
          {LEGEND.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5" title={item.desc}>
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[11px] font-mono text-[#8B8B8E]">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Editorial Open Workspace */}
      <div className="flex-1 w-full max-w-3xl mx-auto px-6 sm:px-8 py-14 flex flex-col justify-center items-center animate-fade-slide">
        {/* Minimal Typographic Header on Canvas (no container card, no glows, no cheesy gradients) */}
        <div className="w-full text-center space-y-3 mb-8">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[4px] border border-white/[0.07] bg-[#111115] text-[11px] font-mono text-[#8B8B8E]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA]" />
            <span>Workspace Active</span>
            <span className="text-[#71717A]">·</span>
            <span className="tabular-nums">Tri-Tier Evidence Synthesis</span>
          </div>

          <h1 className="text-[32px] sm:text-[38px] font-semibold text-[#EDEDED] tracking-[-0.02em] leading-tight">
            Research Workspace
          </h1>
          <p className="text-[14px] text-[#8B8B8E] max-w-lg mx-auto leading-relaxed">
            Multi-tier evidence synthesis across structured knowledge notes, dense vectors, and live academic papers.
          </p>
        </div>

        {/* Spacious Centered Multi-line Research Composer */}
        <form
          onSubmit={handleSubmit}
          className="w-full bg-[#111115] border border-white/[0.07] focus-within:border-white/[0.18] rounded-[8px] p-3 shadow-none transition-all duration-150"
        >
          <textarea
            value={queryInput}
            onChange={(e) => {
              setQueryInput(e.target.value);
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask a research question or enter a scientific concept..."
            rows={2}
            className="w-full bg-transparent p-2 text-[15px] text-[#EDEDED] placeholder-[#71717A] focus:outline-none resize-none leading-relaxed font-sans"
            aria-label="Research query"
          />

          <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] mt-1 text-[11px] font-mono text-[#71717A]">
            <span className="hidden sm:inline">Press Enter ↵ to synthesize · Shift+Enter for new line</span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="submit"
                disabled={!queryInput.trim()}
                className="btn-primary text-[12px] py-1.5 px-4 rounded-[6px]"
              >
                Synthesize
              </button>
            </div>
          </div>
        </form>

        {/* Understated Horizontal Row of Topic Pills (plain text, no quotes) */}
        <div className="w-full mt-6 space-y-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TOPIC_PILLS.map((pill) => (
              <button
                key={pill.label}
                type="button"
                onClick={() => onStartQuery(pill.query)}
                className="px-3 py-1.5 bg-[#111115] hover:bg-[#18181E] border border-white/[0.07] hover:border-white/[0.14] rounded-[6px] text-[12px] font-sans text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>{pill.label}</span>
                <ArrowUpRight size={11} className="text-[#71717A] opacity-70" />
              </button>
            ))}
          </div>
        </div>

        {/* Continue Recent Research (from History) */}
        {recentHistory.length > 0 && (
          <div className="w-full mt-10 pt-6 border-t border-white/[0.07]">
            <div className="flex items-center gap-2 mb-3 text-[11px] font-mono uppercase tracking-wider text-[#71717A]">
              <Clock size={12} />
              <span>Continue Recent Research</span>
            </div>
            <div className="space-y-1.5">
              {recentHistory.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onStartQuery(h.query)}
                  className="w-full text-left px-3.5 py-2.5 bg-[#111115] hover:bg-[#18181E] border border-white/[0.07] hover:border-white/[0.14] rounded-[6px] text-[13px] text-[#EDEDED] hover:text-white flex items-center justify-between group active:scale-[0.98] transition-all"
                >
                  <span className="truncate pr-4">{h.query}</span>
                  <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-[#71717A]">
                    {typeof h.confidence === 'number' && (
                      <span className="text-[#60A5FA] tabular-nums">
                        {Math.round(h.confidence * 100)}%
                      </span>
                    )}
                    <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer Bar */}
      <div className="w-full max-w-4xl mx-auto px-8 py-3.5 border-t border-white/[0.07] flex items-center justify-between text-[11px] font-mono text-[#71717A] shrink-0">
        <span>Deterministic quote matching & claim coverage verification.</span>
        <span className="tabular-nums">ARIA v2.0</span>
      </div>
    </div>
  );
}
