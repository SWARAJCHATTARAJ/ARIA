import React from 'react';
import { Network } from 'lucide-react';
import { Citation } from '../types';

interface CitationConstellationProps {
  query: string;
  citations?: Citation[];
  loading?: boolean;
  compact?: boolean;
}

// Tier color-coding (hex mirrors tailwind.config.js tier palette)
function tierColor(tier?: string): string {
  switch (tier) {
    case 'OKF':
      return '#5B8DB8';
    case 'RAG':
      return '#8A82A8';
    case 'LIVE':
      return '#D9A441';
    default:
      return '#8A95A5';
  }
}

function tierGlyph(tier?: string): string {
  switch (tier) {
    case 'OKF':
      return '§';
    case 'RAG':
      return '▲';
    case 'LIVE':
      return '●';
    default:
      return '■';
  }
}

/**
 * Interactive SVG Citation & Entailment Constellation Graph (Part 3.2).
 * Plots the Query node at the center, connected by animated data links to each
 * retrieved Citation node, color-coded by retrieval tier (§ OKF / ▲ RAG / ● LIVE).
 * Replaces the previous "FETCHING VISUAL CONCEPT..." spinner / missing-image state.
 */
export default function CitationConstellation({
  query,
  citations = [],
  loading = false,
  compact = false,
}: CitationConstellationProps) {
  const width = 300;
  const height = compact ? 132 : 170;
  const cx = width / 2;
  const cy = height / 2;
  const orbitR = compact ? 44 : 58;

  const validCitations = citations.filter((c) => c && c.id !== undefined);
  const nodes = validCitations.slice(0, 10).map((c, idx) => {
    const count = Math.min(validCitations.length, 10);
    const angle = (2 * Math.PI * idx) / Math.max(count, 1) - Math.PI / 2;
    const jitter = compact ? 0 : ((idx % 3) - 1) * 5;
    return {
      citation: c,
      x: cx + Math.cos(angle) * (orbitR + jitter),
      y: cy + Math.sin(angle) * (orbitR * 0.82 + jitter),
      color: tierColor(c.tier),
      glyph: tierGlyph(c.tier),
      id: c.id,
    };
  });

  const queryLabel = query
    ? query.replace(/^(what|how|why|explain|describe)\b[^:]*?:?\s*/i, '')
    : 'Research Query';

  return (
    <div className="w-full bg-ink-base/80 border border-ink-surface/80 rounded-none p-2 relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-surface/50 pb-1.5 mb-1">
        <span className="font-mono text-[10px] text-tier-okf uppercase tracking-wider flex items-center gap-1">
          <Network size={11} className="animate-pulse" /> Citation &amp; Entailment Topology
        </span>
        <span className="font-mono text-[9px] text-ink-muted">
          {loading ? 'LIVE SCAN' : `[1-${citations.length}]`}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className={`w-full select-none ${compact ? 'h-auto' : 'h-auto max-h-[170px]'}`}>
        <defs>
          <radialGradient id="cc-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5B8DB8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#5B8DB8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient glow field behind query node */}
        <circle cx={cx} cy={cy} r={orbitR * 1.35} fill="url(#cc-glow)" />

        {/* Animated data links: query center -> each citation node */}
        {nodes.map((n) => (
          <line
            key={`link-${n.id}-${n.citation.tier || ''}`}
            x1={cx}
            y1={cy}
            x2={n.x}
            y2={n.y}
            stroke={n.color}
            strokeWidth={1.4}
            strokeOpacity={0.55}
            className="constellation-link"
          />
        ))}

        {/* Citation nodes on the orbit */}
        {nodes.map((n) => (
          <g key={`node-${n.id}`} className="constellation-node">
            <circle cx={n.x} cy={n.y} r={9} fill="#0A0E14" stroke={n.color} strokeWidth={1.6} />
            <text
              x={n.x}
              y={n.y + 3}
              textAnchor="middle"
              fontSize={7.5}
              fontFamily="JetBrains Mono, monospace"
              fill={n.color}
            >
              {n.id + 1}
            </text>
            <text
              x={n.x}
              y={n.y - 13}
              textAnchor="middle"
              fontSize={6.5}
              fontFamily="JetBrains Mono, monospace"
              fill={n.color}
              opacity={0.9}
            >
              {n.glyph}
            </text>
          </g>
        ))}

        {/* Central query node */}
        <g>
          <circle cx={cx} cy={cy} r={15} fill="#0A0E14" stroke="#5B8DB8" strokeWidth={2} />
          <text
            x={cx}
            y={cy + 3}
            textAnchor="middle"
            fontSize={7}
            fontFamily="JetBrains Mono, monospace"
            fill="#9FC1DD"
          >
            QUERY
          </text>
        </g>
      </svg>

      <p className="text-[9px] font-mono text-ink-muted leading-tight px-1">
        {queryLabel.length > 64 ? `${queryLabel.slice(0, 62)}…` : queryLabel}
      </p>

      {/* Tier legend */}
      <div className="flex items-center justify-center gap-2.5 mt-1 pb-0.5">
        {['OKF', 'RAG', 'LIVE'].map((t) => (
          <span key={t} className="font-mono text-[8px] flex items-center gap-1" style={{ color: tierColor(t) }}>
            <span>{tierGlyph(t)}</span>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
