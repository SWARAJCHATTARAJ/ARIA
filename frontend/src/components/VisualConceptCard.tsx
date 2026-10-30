import React, { useState, useEffect } from 'react';
import { ExternalLink, Maximize2, X, ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { VisualCardData, Citation } from '../types';
import CitationConstellation from './CitationConstellation';

interface VisualConceptCardProps {
  query: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
}

export default function VisualConceptCard({ query, citations = [] }: VisualConceptCardProps) {
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
          if (mounted) setData({ found: false, image_url: null });
        }
      } catch {
        if (mounted) setData({ found: false, image_url: null });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (query) {
      fetchVisualCard();
    } else if (mounted) {
      setLoading(false);
    }
    return () => {
      mounted = false;
    };
  }, [query]);

  // No strictly verified Wikipedia image -> Live Interactive Citation & Entailment
  // Topology Graph (spinner state AND missing-image state both render this).
  if (loading || !data?.found || !(data.thumbnail_url || data.original_image_url || data.image_url)) {
    return <CitationConstellation query={query} citations={citations} loading={loading} />;
  }

  // 1. Wikipedia Verified Image Card
  const imgSrc = data.original_image_url || data.thumbnail_url || data.image_url || '';
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
              <ShieldCheck size={11} /> Verified Wikipedia Concept
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
