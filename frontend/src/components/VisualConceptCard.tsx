import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, ExternalLink, Maximize2, X, Sparkles, Layers, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { VisualCardData } from '../types';

interface VisualConceptCardProps {
  query: string;
}

export default function VisualConceptCard({ query }: VisualConceptCardProps) {
  const [data, setData] = useState<VisualCardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const fetchVisualCard = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/visual-card?query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json: VisualCardData = await res.json();
          if (mounted) setData(json);
        } else {
          if (mounted) setData({ found: false });
        }
      } catch {
        if (mounted) setData({ found: false });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (query) {
      fetchVisualCard();
    }
    return () => {
      mounted = false;
    };
  }, [query]);

  if (loading) {
    return (
      <div className="w-full h-44 bg-ink-surface/30 border border-ink-surface/60 rounded-none flex flex-col items-center justify-center p-4 text-ink-muted">
        <div className="w-6 h-6 border-2 border-tier-okf border-t-transparent rounded-full animate-spin mb-2" />
        <span className="font-mono text-[10px] uppercase tracking-wider">Fetching Visual Concept...</span>
      </div>
    );
  }

  // 1. Wikipedia Verified Image Card
  if (data?.found && (data.thumbnail_url || data.original_image_url)) {
    const imgSrc = data.original_image_url || data.thumbnail_url;
    return (
      <>
        <div className="w-full bg-ink-base/80 border border-ink-surface/80 rounded-none overflow-hidden group hover:border-tier-okf/50 transition-all duration-200">
          <div className="relative aspect-[16/10] overflow-hidden bg-black/40">
            <img
              src={imgSrc}
              alt={data.title || 'Concept Diagram'}
              className="w-full h-full object-contain p-1 group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
            <button
              onClick={() => setIsZoomed(true)}
              className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white/80 hover:text-white rounded-none border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Click to Zoom Diagram"
            >
              <Maximize2 size={13} />
            </button>
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono">
              <span className="text-emerald-400 flex items-center gap-1 font-medium bg-black/60 px-1.5 py-0.5 border border-emerald-500/30">
                <ShieldCheck size={11} /> Wikipedia Concept
              </span>
              {data.page_url && (
                <a
                  href={data.page_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gray-300 hover:text-white flex items-center gap-0.5 bg-black/60 px-1.5 py-0.5 border border-white/20"
                >
                  Source <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
          <div className="p-2.5 space-y-1">
            <h4 className="text-xs font-sans font-bold text-gray-100 truncate">{data.title}</h4>
            {data.description && (
              <p className="text-[11px] font-sans text-gray-400 line-clamp-2 leading-tight">
                {data.description}
              </p>
            )}
          </div>
        </div>

        {/* Lightbox Zoom Modal */}
        {isZoomed && (
          <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
            onClick={() => setIsZoomed(false)}
          >
            <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setIsZoomed(false)}
                className="absolute -top-10 right-0 text-white/80 hover:text-white p-1 font-mono text-xs flex items-center gap-1"
              >
                <X size={16} /> Close
              </button>
              <img
                src={imgSrc}
                alt={data.title}
                className="max-w-full max-h-[80vh] object-contain border border-ink-surface"
              />
              <div className="mt-3 text-center">
                <span className="text-sm font-sans font-semibold text-white block">{data.title}</span>
                {data.description && <span className="text-xs text-gray-400 font-sans">{data.description}</span>}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // 2. Auto-Generated SVG Concept Visual (When no Wikipedia image exists)
  return (
    <div className="w-full bg-ink-base/80 border border-ink-surface/80 rounded-none p-3 space-y-2">
      <div className="flex items-center justify-between border-b border-ink-surface/50 pb-1.5">
        <span className="font-mono text-[10px] text-tier-okf uppercase tracking-wider flex items-center gap-1">
          <Layers size={12} /> Concept Architecture
        </span>
        <span className="font-mono text-[9px] text-ink-muted">ARIA Verified Flow</span>
      </div>

      <svg viewBox="0 0 280 120" className="w-full h-auto select-none">
        <defs>
          <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Tier 1: Query Input */}
        <rect x="10" y="42" width="60" height="36" rx="2" className="fill-blue-950/70 stroke-blue-500/60 stroke-1" />
        <text x="40" y="58" textAnchor="middle" className="fill-blue-300 font-mono text-[8px] font-bold">QUERY</text>
        <text x="40" y="70" textAnchor="middle" className="fill-gray-300 font-sans text-[7px]">Technical Subject</text>

        {/* Arrow 1 */}
        <path d="M 70 60 L 105 60" fill="none" stroke="url(#flow-grad)" strokeWidth="1.5" markerEnd="url(#arrow)" />

        {/* Tier 2: Evidence Grounding */}
        <rect x="105" y="32" width="70" height="56" rx="2" className="fill-emerald-950/70 stroke-emerald-500/60 stroke-1" />
        <text x="140" y="50" textAnchor="middle" className="fill-emerald-300 font-mono text-[8px] font-bold">EVIDENCE</text>
        <text x="140" y="62" textAnchor="middle" className="fill-gray-300 font-sans text-[7px]">OKF / RAG / LIVE</text>
        <text x="140" y="74" textAnchor="middle" className="fill-emerald-400 font-mono text-[6.5px]">Exact Substrings</text>

        {/* Arrow 2 */}
        <path d="M 175 60 L 210 60" fill="none" stroke="#10b981" strokeWidth="1.5" />

        {/* Tier 3: Verified Claim Synthesis */}
        <rect x="210" y="42" width="60" height="36" rx="2" className="fill-emerald-900/60 stroke-emerald-400 stroke-1" />
        <text x="240" y="58" textAnchor="middle" className="fill-emerald-200 font-mono text-[8px] font-bold">VERIFIED</text>
        <text x="240" y="70" textAnchor="middle" className="fill-gray-200 font-sans text-[7px]">&gt;=60% Coverage</text>
      </svg>

      <p className="text-[10px] font-sans text-gray-400 leading-tight">
        Factual claims are verified against cited sources with exact substring coverage.
      </p>
    </div>
  );
}
