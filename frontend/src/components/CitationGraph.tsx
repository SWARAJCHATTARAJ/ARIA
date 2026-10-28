import React, { useState } from 'react';
import { Network, ExternalLink, CheckCircle2, AlertCircle, X, Sparkles, BookOpen } from 'lucide-react';
import { Citation, AuditClaim } from '../types';

interface CitationGraphProps {
  query: string;
  citations?: Citation[];
  claims?: AuditClaim[];
  onCitationClick: (citation: Citation) => void;
  onClose?: () => void;
}

export default function CitationGraph({
  query,
  citations = [],
  claims = [],
  onCitationClick,
  onClose
}: CitationGraphProps) {
  const [selectedClaim, setSelectedClaim] = useState<AuditClaim | null>(null);
  const [selectedCitationId, setSelectedCitationId] = useState<number | null>(null);

  // Filter valid cited sources
  const citedSources = citations.filter(c => c && c.id !== undefined);
  const validClaims = claims.filter(c => c && typeof c === 'object');

  // Dimensions
  const width = 820;
  const height = Math.max(340, Math.max(citedSources.length, validClaims.length) * 58 + 80);

  // Column X positions
  const col1X = 70;   // Query node
  const col2X = 330;  // Sources
  const col3X = 640;  // Claims

  // Compute node Y positions
  const queryY = height / 2;

  const sourcePositions = citedSources.map((c, idx) => {
    const total = citedSources.length;
    const spacing = (height - 80) / Math.max(total, 1);
    const y = 50 + idx * spacing + spacing / 2;
    return { citation: c, id: c.id, x: col2X, y };
  });

  const claimPositions = validClaims.map((cl, idx) => {
    const total = validClaims.length;
    const spacing = (height - 80) / Math.max(total, 1);
    const y = 50 + idx * spacing + spacing / 2;
    return { claim: cl, id: idx, x: col3X, y };
  });

  return (
    <div className="my-4 bg-ink-base/95 border border-ink-surface rounded-none overflow-hidden relative shadow-2xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-ink-surface/40 border-b border-ink-surface/60">
        <div className="flex items-center gap-2">
          <Network size={14} className="text-tier-okf animate-pulse" />
          <span className="text-xs font-mono font-medium text-gray-200">Interactive Citation & Evidence Graph</span>
          <span className="text-[10px] font-mono text-ink-muted">
            ({citedSources.length} sources · {validClaims.length} verified claims)
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-white transition-colors p-1"
            title="Close Citation Graph"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="overflow-x-auto p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[760px] select-none"
          style={{ maxHeight: '420px' }}
        >
          <defs>
            <linearGradient id="grad-q-s" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="grad-s-c" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          {/* 1. Connections: Query -> Sources */}
          {sourcePositions.map((sp) => {
            const isHighlight = selectedCitationId === null || selectedCitationId === sp.id;
            const pathD = `M ${col1X + 50} ${queryY} C ${(col1X + col2X) / 2} ${queryY}, ${(col1X + col2X) / 2} ${sp.y}, ${sp.x - 70} ${sp.y}`;
            return (
              <path
                key={`q-s-${sp.id}`}
                d={pathD}
                fill="none"
                stroke="url(#grad-q-s)"
                strokeWidth={isHighlight ? 2 : 0.8}
                strokeOpacity={isHighlight ? 0.75 : 0.15}
                className="transition-all duration-300"
              />
            );
          })}

          {/* 2. Connections: Sources -> Claims */}
          {claimPositions.map((cp) => {
            const cids = cp.claim.citation_ids || [];
            return cids.map((cid) => {
              const sp = sourcePositions.find((s) => s.id === cid);
              if (!sp) return null;
              const isHighlight =
                (selectedCitationId === null && selectedClaim === null) ||
                selectedCitationId === cid ||
                (selectedClaim && selectedClaim.claim_id === cp.claim.claim_id);
              const pathD = `M ${sp.x + 70} ${sp.y} C ${(sp.x + cp.x) / 2} ${sp.y}, ${(sp.x + cp.x) / 2} ${cp.y}, ${cp.x - 75} ${cp.y}`;
              return (
                <path
                  key={`s-c-${cid}-${cp.id}`}
                  d={pathD}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={isHighlight ? 2 : 0.8}
                  strokeOpacity={isHighlight ? 0.75 : 0.15}
                  className="transition-all duration-300"
                />
              );
            });
          })}

          {/* Column 1: Query Node */}
          <g transform={`translate(${col1X}, ${queryY})`}>
            <rect
              x="-60"
              y="-24"
              width="120"
              height="48"
              rx="4"
              className="fill-blue-950/60 stroke-blue-500/60 stroke-1"
            />
            <text x="0" y="-5" textAnchor="middle" className="fill-blue-300 font-mono text-[10px] font-bold">
              RESEARCH QUERY
            </text>
            <text x="0" y="11" textAnchor="middle" className="fill-gray-300 font-sans text-[9px]">
              {query.length > 22 ? query.slice(0, 20) + '...' : query}
            </text>
          </g>

          {/* Column 2: Sources Nodes */}
          {sourcePositions.map((sp) => {
            const isSelected = selectedCitationId === sp.id;
            const title = sp.citation.title || sp.citation.venue || `Source [c:${sp.id}]`;
            const tier = sp.citation.tier || 'OKF';
            return (
              <g
                key={`src-node-${sp.id}`}
                transform={`translate(${sp.x}, ${sp.y})`}
                className="cursor-pointer group"
                onClick={() => {
                  setSelectedCitationId(isSelected ? null : sp.id);
                  onCitationClick(sp.citation);
                }}
              >
                <rect
                  x="-75"
                  y="-20"
                  width="150"
                  height="40"
                  rx="3"
                  className={`transition-all duration-200 ${
                    isSelected
                      ? 'fill-emerald-950/90 stroke-emerald-400 stroke-2'
                      : 'fill-ink-surface/80 stroke-ink-surface hover:stroke-emerald-500/70 stroke-1'
                  }`}
                />
                <text x="-65" y="-3" className="fill-emerald-400 font-mono text-[9px] font-bold">
                  [[c:{sp.id}]] {tier}
                </text>
                <text x="-65" y="11" className="fill-gray-200 font-sans text-[8.5px] truncate">
                  {title.length > 24 ? title.slice(0, 22) + '...' : title}
                </text>
              </g>
            );
          })}

          {/* Column 3: Claims Nodes */}
          {claimPositions.map((cp) => {
            const cov = cp.claim.coverage ?? (cp.claim.status === 'supported' ? 1.0 : 0.5);
            const isSupported = cp.claim.status === 'supported';
            const isSelected = selectedClaim?.claim_id === cp.claim.claim_id;
            const strokeColor = isSupported ? 'stroke-emerald-500/80' : 'stroke-amber-500/80';
            const fillColor = isSelected
              ? isSupported ? 'fill-emerald-950' : 'fill-amber-950'
              : 'fill-ink-surface/80';

            return (
              <g
                key={`claim-node-${cp.id}`}
                transform={`translate(${cp.x}, ${cp.y})`}
                className="cursor-pointer group"
                onClick={() => setSelectedClaim(isSelected ? null : cp.claim)}
              >
                <rect
                  x="-80"
                  y="-20"
                  width="160"
                  height="40"
                  rx="3"
                  className={`transition-all duration-200 stroke-1 ${strokeColor} ${fillColor}`}
                />
                <circle
                  cx="-68"
                  cy="0"
                  r="5"
                  className={isSupported ? 'fill-emerald-400' : 'fill-amber-400'}
                />
                <text x="-56" y="-3" className="fill-gray-200 font-mono text-[9px] font-medium">
                  Claim #{cp.claim.claim_id} ({Math.round(cov * 100)}%)
                </text>
                <text x="-56" y="11" className="fill-gray-400 font-sans text-[8px]">
                  {cp.claim.text.length > 25 ? cp.claim.text.slice(0, 23) + '...' : cp.claim.text}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Claim / Citation Inspector Drawer */}
      {selectedClaim && (
        <div className="p-3 bg-ink-surface/90 border-t border-ink-surface/80 flex flex-col gap-1.5 text-xs font-sans animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedClaim.status === 'supported' ? (
                <CheckCircle2 size={14} className="text-emerald-400" />
              ) : (
                <AlertCircle size={14} className="text-amber-400" />
              )}
              <span className="font-mono font-bold text-[11px] text-gray-200">
                Claim #{selectedClaim.claim_id} — {selectedClaim.status.toUpperCase()} (
                {Math.round((selectedClaim.coverage ?? 1.0) * 100)}% Quote Coverage)
              </span>
            </div>
            <button
              onClick={() => setSelectedClaim(null)}
              className="text-ink-muted hover:text-white p-0.5"
            >
              <X size={12} />
            </button>
          </div>
          <div className="text-gray-100 font-sans text-[12px] bg-ink-base/80 p-2 border border-ink-surface/50">
            "{selectedClaim.text}"
          </div>
          {selectedClaim.evidence && (
            <div className="text-[11px] text-emerald-300 font-sans bg-emerald-950/30 border border-emerald-800/40 p-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/80 block mb-0.5">
                Verbatim Evidence Quote from Source:
              </span>
              "{selectedClaim.evidence}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
