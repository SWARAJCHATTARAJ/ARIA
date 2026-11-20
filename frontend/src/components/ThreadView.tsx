import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Loader2,
  Download,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Maximize2,
  Minimize2,
  Check,
  FileText,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  Bookmark,
  ArrowUpRight,
  Sparkles,
  Clock,
  Square,
  ChevronDown,
  PanelRightOpen,
  Layers,
  Image as ImageIcon,
  BarChart2,
  ExternalLink,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import { DomainPicker } from './ui/DomainPicker';
import { saveOrDownloadFile, showDownloadToast } from '../utils/nativeDownload';
import { streamQuery } from '../services/sseClient';
import { Citation, Message, MessageTelemetry, PipelineStage, AuditClaim, HistoryEntry, FigureData, ChartData } from '../types';
import { API_BASE_URL } from '../services/config';
import { useSettingsContext } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { addHistoryEntry, getHistory, addToCollection, isInCollection } from '../services/storage';

const TOPIC_PILLS = [
  {
    id: 'auto-systems',
    label: 'Autonomous Systems Taxonomy',
    query: 'What is the definition and taxonomy of autonomous systems in artificial intelligence?',
  },
  {
    id: 'crispr-mitigation',
    label: 'CRISPR Off-Target Mitigation',
    query: 'What are the off-target mitigation strategies for CRISPR gene editing?',
  },
  {
    id: 'jwst-deep-field',
    label: 'JWST 2024 Deep Field',
    query: 'What were the latest discoveries of the James Webb Space Telescope in 2024?',
  },
  {
    id: 'bft-consensus',
    label: 'Byzantine Fault Tolerance',
    query: 'How do multi-agent consensus protocols handle Byzantine fault tolerance?',
  },
];

function getFollowUpQuestions(query: string, content: string): string[] {
  const qLower = query.toLowerCase();
  const cLower = content.toLowerCase();

  if (qLower.includes('crispr') || cLower.includes('cas9')) {
    return [
      'How do high-fidelity Cas9 variants like SpCas9-HF1 compare in on-target efficiency?',
      'What are the in vivo delivery barriers for prime editing guide RNAs?',
      'How do base editors mitigate double-strand break insertions and deletions?',
    ];
  }
  if (qLower.includes('autonomous') || cLower.includes('autonomy')) {
    return [
      'What formal verification methods certify Level 4 and Level 5 autonomous decision boundaries?',
      'How do asynchronous multi-agent coordination protocols mitigate packet drops?',
      'What architectural patterns prevent cascade failures in distributed perception pipelines?',
    ];
  }
  if (qLower.includes('jwst') || qLower.includes('webb') || cLower.includes('redshift')) {
    return [
      'How do JWST high-redshift (z > 10) observations constrain Lambda-CDM cosmological models?',
      'What spectroscopic signatures from NIRSpec confirm active galactic nuclei in early epochs?',
      'What dust extinction correction parameters are applied to JWST deep-field spectra?',
    ];
  }
  if (qLower.includes('byzantine') || qLower.includes('consensus') || cLower.includes('fault tolerance')) {
    return [
      'How does PBFT message complexity scale as node count increases beyond 100?',
      'What are the formal latency bounds of DAG-based consensus protocols like Narwhal?',
      'How do leaderless consensus mechanisms prevent eclipse attacks under network partitions?',
    ];
  }
  if (qLower.includes('pvc') || cLower.includes('polyvinyl chloride')) {
    return [
      'What thermal degradation mechanisms trigger dehydrochlorination in unplasticized PVC?',
      'How do bio-based plasticizers compare to phthalates in migration resistance?',
      'What catalytic recycling pathways recover chlorine without generating dioxins?',
    ];
  }

  // Derive from headings if available
  const headings = content.match(/^##\s+(.+)$/gm);
  if (headings && headings.length >= 2) {
    const cleanHeadings = headings.map((h) => h.replace(/^##\s+/, '').trim());
    return [
      `What empirical benchmarks validate ${cleanHeadings[1] || 'core mechanisms'}?`,
      `How do technical limitations impact real-world applications in this domain?`,
      `What recent comparative studies evaluate alternative architectures or formulations?`,
    ];
  }

  return [
    'What empirical benchmarks validate the theoretical formulation?',
    'What are the primary technical failure modes and operational limitations?',
    'How do recent 2024–2026 experimental studies compare with prior findings?',
  ];
}

/**
 * Inline Collapsible Research Trace:
 * Rendered directly inside the active answer header as a compact, single-line status bar:
 * PLAN -> RETRIEVE [OKF · RAG · LIVE] -> SYNTHESIZE -> VERIFY
 * Smoothly expands on click to show retrieval details and collapses cleanly into Verified pill.
 */
function ResearchTraceBar({
  telemetry,
  isStreaming,
  citationsCount = 0,
  hasError = false,
}: {
  telemetry?: MessageTelemetry;
  isStreaming?: boolean;
  citationsCount?: number;
  hasError?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const stage = telemetry?.stage;
  const tiers = telemetry?.retrieval?.tiers || [];

  const isPlanning = stage === 'routing' || stage === 'retrieving';
  const isRetrieving = stage === 'retrieving';
  const isSynthesizing = stage === 'streaming';
  const isAuditing = stage === 'auditing';
  const isComplete = stage === 'complete';

  const entailmentScore = telemetry?.audit?.entailment_score ?? telemetry?.audit?.confidence;
  const verificationStatus =
    telemetry?.audit?.verification_status ||
    (entailmentScore && entailmentScore >= 0.75
      ? 'verified'
      : citationsCount > 0
      ? 'partial'
      : 'unverified');

  const statusLabel = hasError
    ? 'Failed'
    : isStreaming
    ? stage === 'routing'
      ? 'Planning'
      : stage === 'retrieving'
      ? 'Retrieving'
      : stage === 'streaming'
      ? 'Synthesizing'
      : stage === 'auditing'
      ? 'Verifying'
      : 'Analyzing'
    : verificationStatus === 'verified'
    ? 'Verified'
    : verificationStatus === 'partial'
    ? 'Partial'
    : 'Unverified';

  const scorePct =
    typeof entailmentScore === 'number' && entailmentScore > 0
      ? `${Math.round(entailmentScore * 100)}%`
      : null;

  return (
    <div className="space-y-1.5 select-none w-full">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className={`w-full sm:w-auto inline-flex items-center justify-between gap-2 px-3 py-1.5 sm:py-1 rounded-[6px] border transition-all cursor-pointer active:scale-[0.98] ${
            hasError
              ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15'
              : 'border-slate-200 dark:border-white/[0.07] bg-slate-50 dark:bg-[#09090B] hover:bg-slate-100 dark:hover:bg-[#18181E] text-slate-600 dark:text-[#8B8B8E] hover:text-slate-900 dark:hover:text-[#EDEDED]'
          }`}
        >
          {/* Left: Verified / Status badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {hasError ? (
              <AlertCircle size={13} className="text-red-400 shrink-0" />
            ) : isStreaming ? (
              <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] animate-pulse shrink-0" />
            ) : verificationStatus === 'verified' ? (
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            ) : (
              <CheckCircle2 size={13} className="text-[#60A5FA] shrink-0" />
            )}

            <span
              className={`font-semibold ${
                hasError
                  ? 'text-red-400'
                  : isStreaming
                  ? 'text-[#60A5FA]'
                  : verificationStatus === 'verified'
                  ? 'text-emerald-400'
                  : 'text-slate-900 dark:text-[#EDEDED]'
              }`}
            >
              {statusLabel}
            </span>

            {citationsCount > 0 && (
              <span className="text-slate-500 dark:text-[#71717A] text-[10.5px]">
                · {citationsCount} {citationsCount === 1 ? 'source' : 'sources'}
              </span>
            )}

            {scorePct && !isStreaming && !hasError && (
              <span className="hidden xs:inline-block ml-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-[10px] text-slate-700 dark:text-zinc-300 font-mono tabular-nums">
                {scorePct}
              </span>
            )}
          </div>

          {/* Desktop: Stage transition arrows */}
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500 dark:text-[#71717A] font-mono ml-2">
            <span className="text-slate-400 dark:text-[#71717A] text-[10px] mr-1">·</span>
            <span className={isPlanning ? 'text-slate-900 dark:text-[#EDEDED] font-semibold' : ''}>PLAN</span>
            <span>→</span>
            <span className={isRetrieving ? 'text-slate-900 dark:text-[#EDEDED] font-semibold' : ''}>
              RETRIEVE
              {tiers.length > 0 && (
                <span className="ml-1 inline-flex gap-1">
                  {tiers.includes('OKF') && <span className="text-[#60A5FA]">OKF</span>}
                  {tiers.includes('RAG') && <span className="text-[#A78BFA]">RAG</span>}
                  {tiers.includes('LIVE') && <span className="text-[#F59E0B]">LIVE</span>}
                </span>
              )}
            </span>
            <span>→</span>
            <span className={isSynthesizing ? 'text-slate-900 dark:text-[#EDEDED] font-semibold' : ''}>SYNTHESIZE</span>
            <span>→</span>
            <span
              className={
                hasError
                  ? 'text-red-400 font-semibold'
                  : isAuditing || isComplete
                  ? 'text-[#60A5FA] font-semibold'
                  : ''
              }
            >
              {hasError ? 'FAILED' : 'VERIFY'}
            </span>
          </div>

          {/* Mobile Right: Compact Expandable Pipeline toggle */}
          <div className="flex items-center gap-1 shrink-0 text-[10.5px] text-slate-500 dark:text-[#71717A]">
            <span className="sm:hidden font-sans">Pipeline</span>
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
      </div>

      {/* Accordion Smooth Height Expansion */}
      <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
        <div className="accordion-inner">
          <div className="p-3 bg-slate-50 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] rounded-[6px] space-y-2 text-[11px] font-mono mt-1">
            <div className="flex items-center justify-between text-slate-600 dark:text-[#8B8B8E] pb-1.5 border-b border-slate-200 dark:border-white/[0.05]">
              <span>Active Retrieval Route</span>
              <span className="text-[#60A5FA] font-semibold">Cascade (Tri-Tier Concurrent)</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-1.5 rounded-[4px] bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.05]">
                <div className="text-[10px] text-slate-500 dark:text-[#71717A]">OKF TIER</div>
                <div className="text-[#60A5FA] font-semibold mt-0.5">
                  {tiers.includes('OKF') ? 'Active' : 'Standby'}
                </div>
              </div>
              <div className="p-1.5 rounded-[4px] bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.05]">
                <div className="text-[10px] text-slate-500 dark:text-[#71717A]">RAG TIER</div>
                <div className="text-[#A78BFA] font-semibold mt-0.5">
                  {tiers.includes('RAG') ? 'Active' : 'Standby'}
                </div>
              </div>
              <div className="p-1.5 rounded-[4px] bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.05]">
                <div className="text-[10px] text-slate-500 dark:text-[#71717A]">LIVE TIER</div>
                <div className="text-[#F59E0B] font-semibold mt-0.5">
                  {tiers.includes('LIVE') ? 'Active' : 'Standby'}
                </div>
              </div>
            </div>
            {(telemetry?.audit?.confidence !== undefined || (telemetry as any)?.audit_confidence !== undefined) && (
              <div className="flex items-center justify-between text-slate-600 dark:text-[#8B8B8E] pt-1">
                <span>Deterministic Claim Entailment Score</span>
                <span className={`${(telemetry?.audit?.confidence ?? (telemetry as any)?.audit_confidence ?? 0) >= 0.75 ? 'text-emerald-400' : 'text-amber-400'} tabular-nums font-semibold`}>
                  {Math.round((telemetry?.audit?.confidence ?? (telemetry as any)?.audit_confidence ?? 0) * 100)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualFiguresGrid({ figures }: { figures?: FigureData[] }) {
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  if (!figures || figures.length === 0) return null;

  const validFigures = figures.filter((f) => f.url && !failedUrls[f.url]);
  if (validFigures.length === 0) return null;

  return (
    <div className="my-4 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-sans text-zinc-400 uppercase tracking-wider font-medium">
        <ImageIcon size={13} className="text-[#60A5FA]" />
        <span>Verified Topic Figures & Diagrams</span>
      </div>
      <div className={`grid gap-3 ${validFigures.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {validFigures.map((fig, idx) => (
          <div
            key={idx}
            className="p-3 bg-[#09090B] border border-white/[0.08] hover:border-white/[0.16] rounded-[8px] space-y-2.5 transition-all"
          >
            <div className="relative overflow-hidden rounded-[6px] bg-[#050811] flex items-center justify-center min-h-[170px] max-h-72 border border-white/[0.04]">
              <img
                src={fig.url}
                alt={fig.title || 'Topic figure'}
                loading="lazy"
                className="max-h-72 w-full object-contain mx-auto transition-transform hover:scale-[1.02] duration-300"
                onError={() => setFailedUrls((prev) => ({ ...prev, [fig.url]: true }))}
              />
            </div>
            <div className="space-y-1">
              <div className="text-[12px] font-semibold text-[#EDEDED] font-sans leading-snug">
                Figure {idx + 1}: {fig.title}
              </div>
              {fig.caption && (
                <p className="text-[11px] text-zinc-400 font-sans leading-relaxed line-clamp-2">
                  {fig.caption}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] font-sans text-zinc-500 pt-1.5 border-t border-white/[0.05]">
              <span className="truncate max-w-[200px]">{fig.attribution || 'Wikimedia Commons'}</span>
              {fig.source_url && (
                <a
                  href={fig.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#60A5FA] hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                  title="View primary image record"
                >
                  <span>Source</span>
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopicChart({ chart }: { chart?: ChartData }) {
  if (!chart || !chart.categories || chart.categories.length === 0 || !chart.series || chart.series.length === 0) {
    return null;
  }

  const { title, caption, x_label, y_label, categories, series, source_citation } = chart;
  const seriesColors = ['#60A5FA', '#34D399', '#A78BFA', '#F59E0B', '#EC4899'];

  const allValues = series.flatMap((s) => s.data);
  const maxVal = Math.max(...allValues, 10.0);
  const minVal = Math.min(0, ...allValues);
  const range = maxVal - minVal || 1.0;

  const chartHeight = 220;
  const padTop = 20;
  const padBottom = 40;
  const padLeft = 45;
  const padRight = 20;
  const innerH = chartHeight - padTop - padBottom;

  return (
    <div className="my-4 p-4 bg-[#09090B] border border-white/[0.08] rounded-[8px] space-y-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#EDEDED] font-sans">
            <BarChart2 size={13} className="text-[#60A5FA]" />
            <span>{title || 'Quantitative Comparative Analysis'}</span>
          </div>
          {series.length > 1 && (
            <div className="flex items-center gap-2 text-[10px] font-sans">
              {series.map((s, sIdx) => (
                <div key={sIdx} className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: seriesColors[sIdx % seriesColors.length] }}
                  />
                  <span className="text-zinc-400">{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {caption && (
          <p className="text-[11px] font-sans text-zinc-400 leading-relaxed">
            {caption}
          </p>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 540 ${chartHeight}`}
          className="w-full h-auto min-w-[420px] select-none"
        >
          {[0, 0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
            const y = padTop + innerH - frac * innerH;
            const val = minVal + frac * range;
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={540 - padRight}
                  y2={y}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray={idx === 0 ? 'none' : '3 3'}
                  strokeWidth="0.8"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#71717A"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {val >= 100 ? Math.round(val) : val >= 10 ? val.toFixed(1) : val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {categories.map((cat, cIdx) => {
            const totalWidth = 540 - padLeft - padRight;
            const catSlotW = totalWidth / categories.length;
            const catCenterX = padLeft + cIdx * catSlotW + catSlotW / 2;

            const groupW = Math.min(catSlotW * 0.75, 60);
            const barW = Math.max(8, (groupW / series.length) - 3);

            return (
              <g key={cIdx}>
                {series.map((s, sIdx) => {
                  const val = s.data[cIdx] ?? 0;
                  const barH = Math.max(2, ((val - minVal) / range) * innerH);
                  const barX = catCenterX - (groupW / 2) + sIdx * (barW + 3);
                  const barY = padTop + innerH - barH;
                  const color = seriesColors[sIdx % seriesColors.length];

                  return (
                    <g key={sIdx} className="transition-all hover:opacity-80">
                      <rect
                        x={barX}
                        y={barY}
                        width={barW}
                        height={barH}
                        fill={color}
                        rx="2"
                        opacity="0.85"
                      />
                      {val > 0 && (
                        <text
                          x={barX + barW / 2}
                          y={barY - 3}
                          textAnchor="middle"
                          fill="#D4D4D8"
                          fontSize="8.5"
                          fontFamily="monospace"
                          fontWeight="600"
                        >
                          {val >= 100 ? Math.round(val) : val.toFixed(1).replace(/\.0$/, '')}
                        </text>
                      )}
                    </g>
                  );
                })}

                <text
                  x={catCenterX}
                  y={chartHeight - 14}
                  textAnchor="middle"
                  fill="#A1A1AA"
                  fontSize="9.5"
                  fontFamily="monospace"
                >
                  {cat.length > 14 ? cat.slice(0, 12) + '…' : cat}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10px] font-sans text-zinc-500 pt-1 border-t border-white/[0.04]">
        <span>Y: {y_label || 'Value'} · X: {x_label || 'Parameter'}</span>
        <span>{source_citation || 'ARIA Autonomous Research Grounding'}</span>
      </div>
    </div>
  );
}

const DOMAIN_OPTIONS = [
  { id: 'auto', label: 'All Domains' },
  { id: 'cs', label: 'CS & AI' },
  { id: 'chem', label: 'Chemistry & Materials' },
  { id: 'bio', label: 'Bio & Medicine' },
  { id: 'physics', label: 'Physics & Astronomy' },
  { id: 'eng', label: 'Engineering' },
  { id: 'math', label: 'Mathematics' },
  { id: 'econ', label: 'Economics & Finance' },
  { id: 'law', label: 'Law & Policy' },
] as const;

function SearchSubmitButton({
  disabled,
  isLoading,
  onStop,
}: {
  disabled: boolean;
  isLoading: boolean;
  onStop: () => void;
}) {
  if (isLoading) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="w-7 h-7 bg-[#18181E] hover:bg-[#202026] border border-red-500/40 text-red-400 rounded-full flex items-center justify-center transition-all active:scale-[0.95] cursor-pointer shrink-0"
        title="Stop streaming (Esc)"
        aria-label="Stop streaming"
      >
        <Square size={10} className="fill-current" />
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={disabled}
      className="search-btn-trigger w-7 h-7 bg-[#60A5FA] hover:bg-[#3B82F6] disabled:opacity-30 disabled:cursor-not-allowed text-[#09090B] hover:text-white rounded-full transition-all active:scale-[0.94] flex items-center justify-center cursor-pointer shadow-sm shrink-0"
      title="Synthesize Evidence (Enter)"
      aria-label="Synthesize query"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="search-glass"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" className="search-glass-handle" />
        <path d="M 8 7 A 5 5 0 0 1 14 7" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      </svg>
    </button>
  );
}

interface MessageItemProps {
  msg: Message;
  isCopied: boolean;
  isSaved: boolean;
  isExportingPdf: boolean;
  isBackendReachable: boolean;
  isMockActive: boolean;
  feedbackStatus?: string;
  onCitationClick: (citation: Citation) => void;
  onExecuteQuery: (query: string) => void;
  onCopy: (id: string, content: string) => void;
  onDownloadBibtex: (citations?: Citation[]) => void;
  onDownloadMarkdown: (msg: Message) => void;
  onDownloadPdf: (msg: Message) => void;
  onSaveToCollection: (msg: Message) => void;
  onFeedback: (msg: Message, type: 'positive' | 'negative') => void;
}

const MessageItem = React.memo(
  function MessageItem({
    msg,
    isCopied,
    isSaved,
    isExportingPdf,
    isBackendReachable,
    isMockActive,
    feedbackStatus,
    onCitationClick,
    onExecuteQuery,
    onCopy,
    onDownloadBibtex,
    onDownloadMarkdown,
    onDownloadPdf,
    onSaveToCollection,
    onFeedback,
  }: MessageItemProps) {
    if (msg.role === 'user') {
      return (
        <div className="space-y-4">
          <div className="flex justify-end">
            <div className="p-3 px-3.5 bg-slate-100 dark:bg-[#18181E] border border-slate-200 dark:border-white/[0.07] rounded-[8px] text-[13.5px] text-slate-900 dark:text-[#EDEDED] max-w-2xl leading-[1.6]">
              {msg.content}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="p-3.5 sm:p-6 bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.07] rounded-[8px] space-y-4 w-full shadow-sm dark:shadow-none">
          {/* Header Verification Strip with Inline Collapsible Research Trace */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.07]">
            <ResearchTraceBar
              telemetry={msg.telemetry}
              isStreaming={msg.isStreaming}
              citationsCount={msg.citations?.length || 0}
              hasError={Boolean(msg.error)}
            />
          </div>

          {/* Error Banner with Retry */}
          {msg.error && (
            <div className="p-3 bg-red-50 dark:bg-[#09090B] border border-red-500/30 text-red-500 dark:text-red-400 text-[12px] font-mono rounded-[8px] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={14} className="shrink-0 text-red-400" />
                <span className="truncate">{msg.error}</span>
              </div>
              {msg.query && (
                <button
                  type="button"
                  onClick={() => onExecuteQuery(msg.query!)}
                  className="shrink-0 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/[0.10] border border-slate-200 dark:border-white/[0.10] text-slate-800 dark:text-[#EDEDED] text-[11px] rounded transition-colors flex items-center gap-1 cursor-pointer"
                  title="Retry query"
                >
                  <RotateCcw size={11} />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* Markdown Content */}
          <div className="text-[13.5px] text-slate-800 dark:text-[#EDEDED] leading-[1.6]">
            {msg.content ? (
              <MarkdownRenderer
                content={msg.content}
                citations={msg.citations}
                onCitationClick={onCitationClick}
                isStreaming={msg.isStreaming}
                auditClaims={msg.telemetry?.audit?.claims?.filter((c): c is AuditClaim => typeof c === 'object' && c !== null)}
                answerFinal={msg.telemetry?.audit?.answer_final}
              />
            ) : msg.isStreaming ? (
              <div className="flex items-center gap-2 py-4 text-slate-500 dark:text-[#8B8B8E] text-[13px] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#60A5FA] animate-pulse" />
                <span>Retrieving and synthesizing primary evidence...</span>
              </div>
            ) : null}
          </div>

          {/* Verified Topic Figures & Diagrams */}
          {!msg.isStreaming && (msg.figures || msg.telemetry?.figures) && (
            <VisualFiguresGrid figures={msg.figures || msg.telemetry?.figures} />
          )}

          {/* Topic-Wise Quantitative Data Graph */}
          {!msg.isStreaming && (msg.chart || msg.telemetry?.chart) && (
            <TopicChart chart={msg.chart || msg.telemetry?.chart} />
          )}

          {/* Contextual Follow-Up Questions */}
          {!msg.isStreaming && msg.content && (
            <div className="pt-3 border-t border-slate-200 dark:border-white/[0.05] space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-[#71717A]">
                <Sparkles size={11} className="text-[#60A5FA]" />
                <span>Follow-up Research Questions</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {getFollowUpQuestions(msg.query || '', msg.content).map((fq, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onExecuteQuery(fq)}
                    className="text-left px-3 py-1.5 bg-slate-50 dark:bg-[#09090B] hover:bg-slate-100 dark:hover:bg-[#18181E] border border-slate-200 dark:border-white/[0.07] hover:border-slate-300 dark:hover:border-white/[0.14] rounded-[6px] text-[12px] text-slate-800 dark:text-[#EDEDED] flex items-center gap-1.5 active:scale-[0.98] transition-all cursor-pointer group"
                  >
                    <span className="line-clamp-1">{fq}</span>
                    <ArrowUpRight size={11} className="text-slate-400 dark:text-[#71717A] group-hover:text-blue-600 dark:group-hover:text-[#60A5FA] shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Bar */}
          {!msg.isStreaming && msg.content && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-white/[0.07]">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onCopy(msg.id, msg.content)}
                  className="flex items-center gap-1.5 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
                >
                  {isCopied ? <Check size={13} className="text-[#60A5FA]" /> : <Copy size={13} />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => onDownloadBibtex(msg.citations)}
                  disabled={!msg.citations || msg.citations.length === 0}
                  className="flex items-center gap-1.5 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.98] transition-all cursor-pointer"
                  title="Export BibTeX"
                >
                  <Download size={13} />
                  <span>.BIB</span>
                </button>

                <button
                  onClick={() => onDownloadMarkdown(msg)}
                  className="flex items-center gap-1.5 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
                  title="Export Markdown (.md)"
                >
                  <FileText size={13} />
                  <span>.MD</span>
                </button>

                <button
                  onClick={() => onDownloadPdf(msg)}
                  disabled={isExportingPdf}
                  className="flex items-center gap-1.5 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.98] transition-all cursor-pointer"
                  title="Export PDF Report"
                >
                  {isExportingPdf ? (
                    <>
                      <Loader2 size={12} className="animate-spin text-[#60A5FA]" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <FileText size={13} />
                      <span>PDF</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => onSaveToCollection(msg)}
                  className="flex items-center gap-1.5 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
                  title="Save to Collection"
                >
                  <Bookmark
                    size={13}
                    className={isSaved ? 'text-[#60A5FA] fill-[#60A5FA]' : ''}
                  />
                  <span>{isSaved ? 'Saved' : 'Save'}</span>
                </button>
              </div>

              {isBackendReachable && !isMockActive && (
                <div className="flex items-center gap-2">
                  {feedbackStatus ? (
                    <span className="text-[12px] font-mono text-[#60A5FA] flex items-center gap-1">
                      <Check size={13} /> Feedback Recorded
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => onFeedback(msg, 'positive')}
                        className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
                        title="Helpful"
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        onClick={() => onFeedback(msg, 'negative')}
                        className="p-1 text-[#8B8B8E] hover:text-red-400 active:scale-[0.98] transition-all cursor-pointer"
                        title="Unhelpful"
                      >
                        <ThumbsDown size={13} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.msg === next.msg &&
      prev.isCopied === next.isCopied &&
      prev.isSaved === next.isSaved &&
      prev.isExportingPdf === next.isExportingPdf &&
      prev.isBackendReachable === next.isBackendReachable &&
      prev.isMockActive === next.isMockActive &&
      prev.feedbackStatus === next.feedbackStatus
    );
  }
);

interface ThreadViewProps {
  onCitationClick: (citation: Citation) => void;
  isFocusMode: boolean;
  onToggleFocus: () => void;
  onQueryStateChange?: (hasQuery: boolean) => void;
  onUpdateActiveTelemetry?: (telemetry: MessageTelemetry | undefined) => void;
  onUpdateActiveCitations?: (citations: Citation[]) => void;
  onMockStateChange?: (isMock: boolean) => void;
  activeTelemetry?: MessageTelemetry;
  activeCitations?: Citation[];
  isMockActive?: boolean;
  onToggleSidebar?: () => void;
  pendingQuery?: string | null;
  onPendingQueryConsumed?: () => void;
  onSourcesExpand?: () => void;
  isInspectorOpen?: boolean;
  onToggleInspector?: () => void;
  onQueryErrorChange?: (hasError: boolean) => void;
}

export default function ThreadView({
  onCitationClick,
  isFocusMode,
  onToggleFocus,
  onQueryStateChange,
  onUpdateActiveTelemetry,
  onUpdateActiveCitations,
  onMockStateChange,
  activeTelemetry,
  activeCitations: _activeCitations,
  isMockActive = false,
  onToggleSidebar: _onToggleSidebar,
  pendingQuery,
  onPendingQueryConsumed,
  onSourcesExpand: _onSourcesExpand,
  isInspectorOpen = false,
  onToggleInspector,
  onQueryErrorChange,
}: ThreadViewProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const emptyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [emptyInput, setEmptyInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [savedCollectionIds, setSavedCollectionIds] = useState<Record<string, boolean>>({});
  const [feedbackSent, setFeedbackSent] = useState<Record<string, 'positive' | 'negative' | 'flagged'>>({});
  const [isBackendReachable, setIsBackendReachable] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<Record<string, boolean>>({});
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);

  const { settings } = useSettingsContext();
  const { accessToken } = useAuth();
  const [selectedTopic, setSelectedTopic] = useState<string>(() => settings.defaultDomain || 'auto');

  useEffect(() => {
    if (settings.defaultDomain) {
      setSelectedTopic(settings.defaultDomain);
    }
  }, [settings.defaultDomain]);

  useEffect(() => {
    try {
      const history = getHistory();
      setRecentHistory(history.slice(0, 3));
    } catch {
      // storage quiet fallback
    }
  }, [messages.length]);

  const handleDownloadPdf = async (msg: Message) => {
    try {
      setIsExportingPdf((prev) => ({ ...prev, [msg.id]: true }));
      const payload = {
        query: msg.query || 'Research Overview',
        answer_final: msg.content,
        confidence: msg.telemetry?.audit?.confidence ?? 0.85,
        tiers: msg.telemetry?.retrieval?.tiers || ['OKF'],
        claims: msg.telemetry?.audit?.claims || [],
        sources: msg.citations || [],
        figures: msg.figures || msg.telemetry?.figures || [],
        chart: msg.chart || msg.telemetry?.chart || null,
      };
      const exportHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        exportHeaders['Authorization'] = `Bearer ${accessToken}`;
      }
      const res = await fetch(`${API_BASE_URL}/api/export/pdf`, {
        method: 'POST',
        headers: exportHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let errMsg = `PDF export failed (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.detail) errMsg = `${errJson.detail} (${res.status})`;
        } catch {}
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Received empty PDF blob from server');
      }
      const safeQuery = (msg.query || 'aria-research-paper').trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_');
      await saveOrDownloadFile(blob, `${safeQuery}.pdf`, 'application/pdf');
    } catch (err: any) {
      console.error('Download PDF failed:', err);
      showDownloadToast(`PDF Export Error: ${err?.message || 'Network error'}`, true);
    } finally {
      setIsExportingPdf((prev) => ({ ...prev, [msg.id]: false }));
    }
  };

  const handleSaveToCollection = (msg: Message) => {
    if (!msg.content) return;
    try {
      addToCollection({
        query: msg.query || 'Research Overview',
        content: msg.content.replace(/[#*`>\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
        confidence: msg.telemetry?.audit?.confidence,
      });
      setSavedCollectionIds((prev) => ({ ...prev, [msg.id]: true }));
    } catch {
      // ignore
    }
  };

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    },
    []
  );

  const finalContentRef = useRef('');
  const finalConfidenceRef = useRef<number | undefined>(undefined);
  const lastQueryRef = useRef('');
  const executedPendingRef = useRef<string | null>(null);

  // Probe backend health
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (mounted && res.ok) setIsBackendReachable(true);
      } catch {
        if (mounted) setIsBackendReachable(false);
      }
    };
    checkHealth();
    return () => {
      mounted = false;
    };
  }, []);

  // Inform parent when queries exist
  useEffect(() => {
    if (onQueryStateChange) {
      onQueryStateChange(messages.length > 0);
    }
  }, [messages.length, onQueryStateChange]);

  // Clean up in-flight requests and timers on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (streamThrottleCleanupRef.current) {
        streamThrottleCleanupRef.current();
      }
    };
  }, []);

  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollEnabledRef = useRef<boolean>(true);
  const streamThrottleCleanupRef = useRef<(() => void) | null>(null);
  const pendingEventsRef = useRef<any[]>([]);

  // Smooth direct scroll without fighting compositor or touch events
  const performAutoScroll = useCallback(() => {
    if (!isAutoScrollEnabledRef.current) return;
    const container = messagesScrollRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;

    // Track user scroll position: if scrolled > 80px up, pause auto-scroll immediately
    const checkScrollPosition = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 80) {
        isAutoScrollEnabledRef.current = false;
      } else if (distanceFromBottom <= 20) {
        isAutoScrollEnabledRef.current = true;
      }
    };

    const handleUserInteraction = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom > 80) {
        isAutoScrollEnabledRef.current = false;
      }
    };

    el.addEventListener('scroll', checkScrollPosition, { passive: true });
    el.addEventListener('wheel', handleUserInteraction, { passive: true });
    el.addEventListener('touchstart', handleUserInteraction, { passive: true });

    return () => {
      el.removeEventListener('scroll', checkScrollPosition);
      el.removeEventListener('wheel', handleUserInteraction);
      el.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Direct scroll on new message arrival (no smooth scroll loops)
  useEffect(() => {
    if (isAutoScrollEnabledRef.current && messagesScrollRef.current) {
      messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (streamThrottleCleanupRef.current) {
      streamThrottleCleanupRef.current();
      streamThrottleCleanupRef.current = null;
    }
    setIsLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  };

  const executeQuery = (queryText: string, mockKey?: string) => {
    if (!queryText.trim() || isLoading) return;
    if (onQueryErrorChange) onQueryErrorChange(false);
    if (onUpdateActiveTelemetry) onUpdateActiveTelemetry({ stage: 'routing' });

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMsgId = `user-${Date.now()}`;
    const ariaMsgId = `aria-${Date.now()}`;

    const userMessage: Message = {
      id: userMsgId,
      role: 'user',
      content: queryText.trim(),
      timestamp: Date.now(),
    };

    const initialAriaMessage: Message = {
      id: ariaMsgId,
      role: 'aria',
      content: '',
      query: queryText.trim(),
      citations: [],
      telemetry: { stage: 'routing' },
      isStreaming: true,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, initialAriaMessage]);
    setInput('');
    setEmptyInput('');
    setIsLoading(true);

    finalContentRef.current = '';
    finalConfidenceRef.current = undefined;
    lastQueryRef.current = queryText.trim();

    let currentTelemetry: MessageTelemetry = { stage: 'routing' };

    const applyEvent = (msg: Message, evt: any): Message => {
      const updatedTelemetry = { ...(msg.telemetry || currentTelemetry) };
      let updatedContent = msg.content;
      let updatedCitations = msg.citations ? [...msg.citations] : [];
      let updatedFigures: FigureData[] = msg.figures || updatedTelemetry.figures || [];
      let updatedChart: ChartData | undefined = msg.chart || updatedTelemetry.chart;
      let updatedQueuePosition: number | null = msg.queuePosition ?? null;

      switch (evt.event) {
        case 'queued':
          updatedQueuePosition = evt.position ?? 1;
          break;

        case 'start':
          updatedTelemetry.stage = 'routing';
          break;

        case 'route':
          updatedTelemetry.stage = 'retrieving';
          updatedTelemetry.route = {
            route_decision: evt.route_decision || 'cascade',
          };
          break;

        case 'retrieve':
          updatedTelemetry.stage = 'streaming';
          updatedTelemetry.retrieval = {
            tiers: evt.tiers,
            okf_node_paths: evt.okf_node_paths,
            rag_scores: evt.rag_scores,
            sources: evt.sources,
          };
          break;

        case 'figures':
          if (Array.isArray(evt.figures)) {
            updatedFigures = evt.figures;
            updatedTelemetry.figures = evt.figures;
          }
          break;

        case 'chart':
          if (evt.chart) {
            updatedChart = evt.chart;
            updatedTelemetry.chart = evt.chart;
          } else {
            updatedChart = undefined;
            updatedTelemetry.chart = undefined;
          }
          break;

        case 'citation': {
          const newCit: Citation = {
            id: evt.id,
            title: evt.title,
            path: evt.path,
            url: evt.url,
            authors: evt.authors,
            year: evt.year,
            venue: evt.venue,
            snippet: evt.snippet,
            source_type: evt.source_type,
            tier: evt.tier,
            doi: evt.doi,
            arxiv_id: evt.arxiv_id,
            is_retracted: evt.is_retracted,
            review_status: evt.review_status,
          };
          if (!updatedCitations.some((c) => c.id === newCit.id)) {
            updatedCitations.push(newCit);
            if (onUpdateActiveCitations) onUpdateActiveCitations(updatedCitations);
          }
          break;
        }

        case 'token':
          if (evt.delta) {
            updatedContent += evt.delta;
          }
          updatedQueuePosition = null;
          break;

        case 'audit':
          updatedTelemetry.stage = 'auditing';
          updatedTelemetry.audit = {
            claims: evt.claims,
            removed_claims: evt.removed_claims,
            conflicts: evt.conflicts_found || evt.conflicts,
            retractions: evt.retractions_found || evt.retractions,
            confidence: evt.confidence,
            entailment_score: evt.entailment_score ?? evt.confidence,
            verification_status: evt.verification_status,
            tier_agreement: evt.tier_agreement,
            answer_final: evt.answer_final,
            repaired: evt.repaired ?? false,
          };
          if (evt.sources) {
            updatedTelemetry.retrieval = {
              ...updatedTelemetry.retrieval,
              sources: evt.sources,
            };
          }
          if (evt.answer_final) {
            updatedContent = evt.answer_final;
            finalContentRef.current = evt.answer_final;
          }
          if (typeof evt.confidence === 'number' && evt.confidence > 0) {
            finalConfidenceRef.current = evt.confidence;
          }
          break;

        case 'done':
          updatedTelemetry.stage = 'complete';
          if (Array.isArray(evt.figures) && evt.figures.length > 0) {
            updatedFigures = evt.figures;
            updatedTelemetry.figures = evt.figures;
          }
          if (evt.chart) {
            updatedChart = evt.chart;
            updatedTelemetry.chart = evt.chart;
          }
          currentTelemetry = updatedTelemetry;
          return {
            ...msg,
            content: updatedContent,
            citations: updatedCitations,
            telemetry: updatedTelemetry,
            figures: updatedFigures,
            chart: updatedChart,
            queuePosition: null,
            isStreaming: false,
          };

        case 'error':
          updatedTelemetry.stage = 'error';
          currentTelemetry = updatedTelemetry;
          return {
            ...msg,
            content: updatedContent,
            citations: updatedCitations,
            telemetry: updatedTelemetry,
            figures: updatedFigures,
            chart: updatedChart,
            queuePosition: null,
            isStreaming: false,
            error: evt.message || 'Stream connection error',
          };
      }

      currentTelemetry = updatedTelemetry;

      return {
        ...msg,
        content: updatedContent,
        citations: updatedCitations,
        telemetry: updatedTelemetry,
        figures: updatedFigures,
        chart: updatedChart,
        queuePosition: updatedQueuePosition,
      };
    };

    pendingEventsRef.current = [];
    let throttleTimer: number | null = null;
    let lastFlushTime = 0;
    const THROTTLE_INTERVAL_MS = 75; // Responsive ~75ms token batching for smooth WebView/Tauri scrolling

    const flushEvents = () => {
      if (throttleTimer !== null) {
        window.clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      lastFlushTime = performance.now();

      if (pendingEventsRef.current.length === 0) return;
      const events = pendingEventsRef.current;
      pendingEventsRef.current = [];

      const coalescedEvents: any[] = [];
      for (const e of events) {
        if (
          e.event === 'token' &&
          coalescedEvents.length > 0 &&
          coalescedEvents[coalescedEvents.length - 1].event === 'token'
        ) {
          coalescedEvents[coalescedEvents.length - 1].delta =
            (coalescedEvents[coalescedEvents.length - 1].delta || '') + (e.delta || '');
        } else {
          coalescedEvents.push(e);
        }
      }

      const prevTelemetryStage = currentTelemetry.stage;

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== ariaMsgId) return msg;
          let next = msg;
          for (const e of coalescedEvents) {
            next = applyEvent(next, e);
          }
          return next;
        })
      );

      if (currentTelemetry.stage !== prevTelemetryStage && onUpdateActiveTelemetry) {
        onUpdateActiveTelemetry(currentTelemetry);
      }

      performAutoScroll();
    };

    const scheduleFlush = (immediate = false) => {
      if (immediate) {
        flushEvents();
        return;
      }

      const now = performance.now();
      const elapsed = now - lastFlushTime;

      if (elapsed >= THROTTLE_INTERVAL_MS) {
        flushEvents();
      } else if (throttleTimer === null) {
        throttleTimer = window.setTimeout(() => {
          flushEvents();
        }, THROTTLE_INTERVAL_MS - elapsed);
      }
    };

    streamThrottleCleanupRef.current = () => {
      if (throttleTimer !== null) {
        window.clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      pendingEventsRef.current = [];
    };

    if (onUpdateActiveCitations) onUpdateActiveCitations([]);
    if (onUpdateActiveTelemetry) onUpdateActiveTelemetry(currentTelemetry);

    const streamHeaders: Record<string, string> = {};
    if (accessToken) {
      streamHeaders['Authorization'] = `Bearer ${accessToken}`;
    }

    (async () => {
      try {
        await streamQuery({
          query: queryText.trim(),
          topic: selectedTopic !== 'auto' ? selectedTopic : undefined,
          compareMode: false,
          signal: abortController.signal,
          mockFixtureKey: mockKey,
          customHeaders: streamHeaders,

          onMockState: (isMock) => {
            if (onMockStateChange) onMockStateChange(isMock);
          },
          onEvent: (evt) => {
            pendingEventsRef.current.push(evt);
            if (
              evt.event === 'done' ||
              evt.event === 'error' ||
              evt.event === 'audit' ||
              evt.event === 'route' ||
              evt.event === 'retrieve'
            ) {
              scheduleFlush(true);
            } else {
              scheduleFlush(false);
            }
          },
          onError: (err: any) => {
            // If aborted by user, clean exit without error banner
            if (abortController.signal.aborted) {
              setIsLoading(false);
              return;
            }
            scheduleFlush(true);
            if (streamThrottleCleanupRef.current) {
              streamThrottleCleanupRef.current();
              streamThrottleCleanupRef.current = null;
            }
            setIsLoading(false);
            if (onQueryErrorChange) onQueryErrorChange(true);
            const status = err?.status;
            const rawMsg = err?.message || 'Failed to connect to backend';

            let friendlyMsg = rawMsg;
            if (status === 401 || rawMsg.includes('401') || rawMsg.toLowerCase().includes('unauthorized')) {
              friendlyMsg = 'Authentication required or session expired (HTTP 401).';
            } else if (status === 500 || rawMsg.includes('500')) {
              friendlyMsg = 'Server encountered an internal error. Please retry.';
            } else if (rawMsg.toLowerCase().includes('failed to fetch') || rawMsg.toLowerCase().includes('networkerror')) {
              friendlyMsg = `Network connection failed (${API_BASE_URL}). Please verify your connection or backend status.`;
            } else if (status) {
              friendlyMsg = `Request failed (HTTP ${status}): ${rawMsg}`;
            }

            const errorTelemetry: MessageTelemetry = {
              ...currentTelemetry,
              stage: 'error',
            };
            if (onUpdateActiveTelemetry) {
              onUpdateActiveTelemetry(errorTelemetry);
            }

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === ariaMsgId
                  ? {
                      ...msg,
                      isStreaming: false,
                      error: friendlyMsg,
                      telemetry: errorTelemetry,
                    }
                  : msg
              )
            );
          },
          onDone: () => {
            scheduleFlush(true);
            if (streamThrottleCleanupRef.current) {
              streamThrottleCleanupRef.current();
              streamThrottleCleanupRef.current = null;
            }
            setIsLoading(false);
            if (onQueryErrorChange) onQueryErrorChange(false);
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== ariaMsgId) return msg;
                const finalStage = msg.telemetry?.stage === 'error' ? 'error' : 'complete';
                return {
                  ...msg,
                  isStreaming: false,
                  telemetry: {
                    ...(msg.telemetry || {}),
                    stage: finalStage,
                  },
                  error: !msg.content && !msg.error ? 'No response received from model.' : msg.error,
                };
              })
            );
            if (!isMockActive && !mockKey && finalContentRef.current) {
              try {
                addHistoryEntry({
                  query: lastQueryRef.current,
                  snippet: finalContentRef.current
                    .replace(/[#*`>\[\]]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 220),
                  confidence: finalConfidenceRef.current,
                });
              } catch {
                // storage quiet ignore
              }
            }
          },
        });
      } catch (err: any) {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === ariaMsgId
                ? {
                    ...msg,
                    isStreaming: false,
                    error: err?.message || 'Unexpected streaming error',
                  }
                : msg
            )
          );
        }
      } finally {
        // Guaranteed cleanup of streaming state across all paths
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((msg) => (msg.id === ariaMsgId && msg.isStreaming ? { ...msg, isStreaming: false } : msg))
        );
        if (streamThrottleCleanupRef.current) {
          streamThrottleCleanupRef.current();
          streamThrottleCleanupRef.current = null;
        }
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    })();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(input);
  };

  const handleEmptySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeQuery(emptyInput);
  };

  useEffect(() => {
    if (pendingQuery && executedPendingRef.current !== pendingQuery) {
      executedPendingRef.current = pendingQuery;
      executeQuery(pendingQuery);
      if (onPendingQueryConsumed) onPendingQueryConsumed();
    }
  }, [pendingQuery]);

  const handleCopy = (msgId: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleDownloadBibtex = async (citations: Citation[] = []) => {
    if (!citations || citations.length === 0) {
      showDownloadToast('No citations available to export.', true);
      return;
    }
    try {
      const bibContent = citations
        .map((cit) => {
          const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
          const key = (authorsStr.split(' ')[0] || 'source').replace(/[^a-zA-Z]/g, '') + (cit.year || '2026');
          return `@article{${key},\n  title={${cit.title || 'Untitled'}},\n  author={${authorsStr || 'Unknown'}},\n  journal={${cit.venue || 'Web'}},\n  year={${cit.year || '2026'}}${cit.doi ? `,\n  doi={${cit.doi}}` : ''}${cit.url ? `,\n  url={${cit.url}}` : ''}\n}`;
        })
        .join('\n\n');

      const blob = new Blob([bibContent], { type: 'text/plain;charset=utf-8' });
      if (!blob || blob.size === 0) {
        throw new Error('Failed to generate BibTeX content');
      }
      await saveOrDownloadFile(blob, 'aria-citations.bib', 'text/plain');
    } catch (err: any) {
      console.error('Download BibTeX failed:', err);
      showDownloadToast(`BibTeX Export Error: ${err?.message || 'Export error'}`, true);
    }
  };

  const handleDownloadMarkdown = async (msg: Message) => {
    if (!msg.content) {
      showDownloadToast('No synthesis content to export.', true);
      return;
    }
    try {
      const blob = new Blob([msg.content], { type: 'text/markdown;charset=utf-8' });
      if (!blob || blob.size === 0) {
        throw new Error('Empty markdown content');
      }
      const safeQuery = (msg.query || 'aria-synthesis').trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_');
      await saveOrDownloadFile(blob, `${safeQuery}.md`, 'text/markdown');
    } catch (err: any) {
      console.error('Download Markdown failed:', err);
      showDownloadToast(`Markdown Export Error: ${err?.message || 'Export error'}`, true);
    }
  };

  const handleFeedback = async (msg: Message, type: 'positive' | 'negative' | 'flagged') => {
    if (isMockActive || !isBackendReachable) return;

    const msgIdx = messages.findIndex((m) => m.id === msg.id);
    let userQuery = '';
    for (let i = msgIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userQuery = messages[i].content;
        break;
      }
    }

    try {
      const feedbackHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        feedbackHeaders['Authorization'] = `Bearer ${accessToken}`;
      }
      const res = await fetch(`${API_BASE_URL}/api/feedback`, {
        method: 'POST',
        headers: feedbackHeaders,
        body: JSON.stringify({
          message_id: msg.id,
          verdict: type,
          query: userQuery || undefined,
          tiers: msg.telemetry?.retrieval?.tiers || [],
          route_engine: null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'stored') {
          setFeedbackSent((prev) => ({ ...prev, [msg.id]: type }));
        }
      }
    } catch {
      // Quiet failure
    }
  };

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full relative h-full overflow-hidden select-text bg-[#09090B]">
      {/* Thread Header: desktop only (>= md:flex), mobile is handled by unified MobileTopBar */}
      <div className="hidden md:flex px-6 py-3 border-b border-white/[0.07] justify-between items-center bg-[#09090B] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-[#EDEDED] font-sans tracking-[-0.01em]">
            ARIA Workspace
          </span>
          {isMockActive && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-[4px] bg-[#111115] border border-[#60A5FA] text-[#60A5FA]">
              MOCK DATA
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLoading && (
            <button
              onClick={handleStopGeneration}
              className="px-2.5 py-1 bg-[#111115] hover:bg-[#18181E] border border-red-500/40 text-red-400 rounded-[6px] text-[11px] font-sans font-medium flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
              title="Stop streaming"
            >
              <Square size={11} className="fill-current" />
              <span>Stop</span>
            </button>
          )}

          <button
            onClick={onToggleFocus}
            className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#111115] transition-colors cursor-pointer active:scale-[0.98]"
            title={isFocusMode ? 'Exit Focus' : 'Focus'}
          >
            {isFocusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>

          {onToggleInspector && (
            <button
              onClick={onToggleInspector}
              className={`p-1.5 rounded-[6px] transition-all cursor-pointer active:scale-[0.98] ${
                isInspectorOpen
                  ? 'text-[#60A5FA] bg-[#18181E] border border-[#60A5FA]/30'
                  : 'text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-[#111115] border border-transparent'
              }`}
              title="Toggle Research Inspector (Ctrl+] / ⌘])"
              aria-label="Toggle Research Inspector"
            >
              <PanelRightOpen size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div
        ref={messagesScrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28 sm:pb-24 space-y-6 select-text hud-scroll"
      >
        {/* Open Editorial Workspace (Empty State): pristine typography on canvas */}
        {messages.length === 0 && (
          <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center py-8 animate-fade-slide">
            <div className="w-full max-w-2xl text-center space-y-2 mb-6">
              <h1 className="text-[19px] sm:text-[24px] font-medium tracking-[-0.02em] text-slate-900 dark:text-zinc-100 font-sans">
                What would you like to research?
              </h1>
              <p className="text-[12px] text-slate-600 dark:text-zinc-400 leading-relaxed max-w-[300px] mx-auto font-sans">
                Grounded scientific synthesis across verified knowledge graphs, dense vector indexes, and primary literature.
              </p>
            </div>

            {/* Sleek Input Card */}
            <form
              onSubmit={handleEmptySubmit}
              className="w-full max-w-2xl bg-white dark:bg-[#0B0F1A] border border-slate-200 dark:border-white/[0.08] focus-within:border-slate-400 dark:focus-within:border-white/[0.18] rounded-2xl p-3 shadow-sm dark:shadow-xl transition-all duration-150"
            >
              <textarea
                ref={emptyTextareaRef}
                value={emptyInput}
                onChange={(e) => {
                  setEmptyInput(e.target.value);
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEmptySubmit(e);
                  }
                }}
                placeholder="Ask a research question or enter a scientific concept..."
                rows={2}
                className="w-full bg-transparent px-3 py-2.5 text-[13.5px] font-normal text-slate-900 dark:text-[#EDEDED] placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none resize-none leading-snug font-sans"
                aria-label="Research query"
              />

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/[0.05] mt-1">
                {/* Sleek custom Obsidian DomainPicker */}
                <DomainPicker
                  value={selectedTopic}
                  onChange={setSelectedTopic}
                  direction="down"
                />

                <div className="flex items-center gap-2 ml-auto">
                  <span className="hidden sm:inline text-[11px] text-slate-500 dark:text-zinc-500 font-sans">Enter ↵</span>
                  <SearchSubmitButton
                    disabled={!emptyInput.trim() || isLoading}
                    isLoading={isLoading}
                    onStop={handleStopGeneration}
                  />
                </div>
              </div>
            </form>

            {/* Minimal Starter Prompts */}
            <div className="w-full max-w-2xl mt-4">
              <div className="flex flex-wrap items-center justify-center gap-2 px-1">
                {TOPIC_PILLS.map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => executeQuery(pill.query)}
                    className="text-[11.5px] font-sans text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 border border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/[0.14] bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.05] rounded-full px-2.5 py-1 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Continue Recent Research (from History) */}
            {recentHistory.length > 0 && (
              <div className="w-full max-w-2xl mt-8 pt-6 border-t border-slate-200 dark:border-white/[0.07]">
                <div className="flex items-center gap-2 mb-3 text-[11px] font-sans font-medium uppercase tracking-wider text-slate-500 dark:text-zinc-500">
                  <Clock size={12} />
                  <span>Continue Recent Research</span>
                </div>
                <div className="space-y-1.5">
                  {recentHistory.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => executeQuery(h.query)}
                      className="w-full text-left px-3.5 py-2.5 bg-white hover:bg-slate-50 dark:bg-[#111115] dark:hover:bg-[#18181E] border border-slate-200 hover:border-slate-300 dark:border-white/[0.07] dark:hover:border-white/[0.14] rounded-[6px] text-[13px] font-sans text-slate-800 hover:text-slate-900 dark:text-[#EDEDED] dark:hover:text-white flex items-center justify-between group active:scale-[0.98] transition-all"
                    >
                      <span className="truncate pr-4">{h.query}</span>
                      <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-slate-500 dark:text-[#71717A]">
                        {typeof h.confidence === 'number' && (
                          <span className="text-blue-600 dark:text-[#60A5FA] tabular-nums">
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
        )}

        {messages.map((msg) => (
          <MessageItem
            key={msg.id}
            msg={msg}
            isCopied={copiedMsgId === msg.id}
            isSaved={Boolean(savedCollectionIds[msg.id] || isInCollection(msg.query || ''))}
            isExportingPdf={Boolean(isExportingPdf[msg.id])}
            isBackendReachable={isBackendReachable}
            isMockActive={isMockActive}
            feedbackStatus={feedbackSent[msg.id]}
            onCitationClick={onCitationClick}
            onExecuteQuery={executeQuery}
            onCopy={handleCopy}
            onDownloadBibtex={handleDownloadBibtex}
            onDownloadMarkdown={handleDownloadMarkdown}
            onDownloadPdf={handleDownloadPdf}
            onSaveToCollection={handleSaveToCollection}
            onFeedback={handleFeedback}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Docked Composer (Visible once a query exists) */}
      {messages.length > 0 && (
        <div className="p-3 bg-slate-50/95 dark:bg-[#050811] border-t border-slate-200 dark:border-white/[0.06] shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 max-w-4xl mx-auto bg-white dark:bg-[#0B0F1A] border border-slate-200 dark:border-white/[0.08] focus-within:border-slate-400 dark:focus-within:border-white/[0.18] rounded-2xl p-2 transition-all duration-150 shadow-sm dark:shadow-none"
          >
            {/* Sleek custom Obsidian DomainPicker */}
            <DomainPicker
              value={selectedTopic}
              onChange={setSelectedTopic}
              direction="up"
              className="shrink-0"
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask a follow-up..."
              rows={1}
              className="flex-1 min-h-[36px] max-h-[110px] bg-transparent px-3 py-2 text-[13px] font-normal text-slate-900 dark:text-[#EDEDED] placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none resize-none leading-[1.35] font-sans"
            />

            <SearchSubmitButton
              disabled={!input.trim() || isLoading}
              isLoading={isLoading}
              onStop={handleStopGeneration}
            />
          </form>
        </div>
      )}
    </div>
  );
}
