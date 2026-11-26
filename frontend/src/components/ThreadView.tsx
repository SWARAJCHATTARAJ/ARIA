import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
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
  Image as ImageIcon,
  BarChart2,
  ExternalLink,
  Layers,
  Scale,
  Compass,
  Flame,
  HelpCircle,
  FileCode2,
} from 'lucide-react';
import MarkdownRenderer, { sanitizeHref } from './MarkdownRenderer';
import { DomainPicker } from './ui/DomainPicker';
import { saveOrDownloadFile, showDownloadToast } from '../utils/nativeDownload';
import { streamQuery } from '../services/sseClient';
import {
  Citation,
  Message,
  MessageTelemetry,
  AuditClaim,
  HistoryEntry,
  FigureData,
  ChartData,
  FollowUpCard,
  RecencyFilter,
  SourceTierFilter,
} from '../types';
import { API_BASE_URL } from '../services/config';
import { exportPdfApi, ExportPdfPayload } from '../services/api';
import { useSettingsStore } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { addHistoryEntry, getHistory, addToCollection, isInCollection } from '../services/storage';
import { exportAllBibtex, exportAllRis, exportLatexArticle } from '../utils/citations';
import { getResearchPulse, recordQueryCompleted } from '../utils/researchPulse';
import { triggerLightHaptic } from '../utils/haptics';

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

function getFollowUpQuestions(query: string, content: string, telemetry?: MessageTelemetry): string[] {
  if (Array.isArray(telemetry?.followup_questions) && telemetry!.followup_questions!.length > 0) {
    return telemetry!.followup_questions!.slice(0, 3);
  }

  const qClean = query
    .replace(/^(what is the|what are the|what is a|what is an|what is|what are|how does|how do|explain|describe|overview of)\s+/i, '')
    .replace(/[?.!]+$/, '')
    .trim();
  const subject = qClean || 'this topic';

  // Extract real proper nouns / concepts from prose lines only (NEVER plug section headings into templates)
  const prose = content
    .split('\n')
    .filter((l) => {
      const s = l.trim();
      return s && !s.startsWith('#') && !s.startsWith('|') && !s.startsWith('```') && s !== '---';
    })
    .join(' ')
    .replace(/\[\[c:\d+\]\]|\[\d+\]|[*_`]/g, '');

  const entities: string[] = [];
  const seen = new Set<string>();
  const subjectLower = subject.toLowerCase();
  const ignore = new Set([
    'The', 'However', 'Moreover', 'Furthermore', 'Additionally', 'Therefore', 'Table', 'Figure', 'ARIA', 'OKF', 'RAG', 'LIVE',
  ]);

  const entityMatches = prose.match(/(?<![.!?]\s)\b([A-Z][a-zA-Z0-9-]+(?:\s+(?:of|and|the|for)?\s*[A-Z][a-zA-Z0-9-]+){0,2})\b/g) || [];
  for (const raw of entityMatches) {
    const ent = raw.trim();
    const el = ent.toLowerCase();
    if (ent.length < 3 || ent.length > 42 || ignore.has(ent) || subjectLower.includes(el) || seen.has(el)) {
      continue;
    }
    seen.add(el);
    entities.push(ent);
    if (entities.length >= 3) break;
  }

  const lowerBlob = `${query} ${prose.slice(0, 1200)}`.toLowerCase();
  const isGeoHistory = /(country|island|parliament|constitution|emperor|gdp|prefecture|economy|population|geography|history|republic|monarchy)/.test(lowerBlob);

  if (entities.length >= 2) {
    if (isGeoHistory) {
      return [
        `How did ${entities[0]} shape the modern institutions and development of ${subject}?`,
        `What primary economic or demographic trends connect ${entities[1]} to ${subject} today?`,
        entities[2]
          ? `How have recent policy shifts influenced ${entities[2]} within ${subject}?`
          : `Which historical turning points most strongly define contemporary ${subject}?`,
      ];
    }
    return [
      `How does ${entities[0]} interact with the core processes underlying ${subject}?`,
      `What empirical evidence characterizes ${entities[1]} in studies of ${subject}?`,
      entities[2]
        ? `What trade-offs or constraints distinguish ${entities[2]} in ${subject}?`
        : `What measurable limitations bound current findings on ${subject}?`,
    ];
  }

  if (isGeoHistory) {
    return [
      `How have historical and constitutional reforms shaped contemporary governance in ${subject}?`,
      `Which macroeconomic and demographic indicators define ${subject}'s current trajectory?`,
      `What regional and international factors most influence ${subject}'s long-term outlook?`,
    ];
  }

  return [
    `What quantitative metrics verify the primary findings reported for ${subject}?`,
    `What key trade-offs or constraints appear across real-world applications of ${subject}?`,
    `How have recent peer-reviewed studies refined models of ${subject}?`,
  ];
}

function getFollowUpCards(query: string, content: string, telemetry?: MessageTelemetry): FollowUpCard[] {
  if (Array.isArray(telemetry?.followup_cards) && telemetry!.followup_cards!.length > 0) {
    return telemetry!.followup_cards!.slice(0, 3);
  }
  const questions = getFollowUpQuestions(query, content, telemetry);
  const intents: Array<{ intent: FollowUpCard['intent']; label: string }> = [
    { intent: 'deep_dive', label: 'Deep Dive' },
    { intent: 'counter_view', label: 'Counter-View' },
    { intent: 'applied', label: 'Applied' },
  ];
  return questions.slice(0, 3).map((q, idx) => ({
    intent: intents[idx]?.intent || 'deep_dive',
    label: intents[idx]?.label || 'Deep Dive',
    question: q,
  }));
}

const STREAM_STEPS = [
  { id: 'routing', label: 'Planning' },
  { id: 'retrieving', label: 'Retrieving' },
  { id: 'streaming', label: 'Synthesizing' },
  { id: 'auditing', label: 'Verifying' },
] as const;

/**
 * Kinetic Research Stage Pill:
 * - While streaming: smooth animated stage indicator (`Planning` -> `Retrieving [N]` -> `Synthesizing` -> `Verifying`)
 *   with live retrieved source chips fading in cleanly.
 * - When complete: collapses cleanly into a single verification summary pill expandable on click.
 */
function ResearchTraceBar({
  telemetry,
  isStreaming,
  citations = [],
  hasError = false,
}: {
  telemetry?: MessageTelemetry;
  isStreaming?: boolean;
  citations?: Citation[];
  hasError?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const stage = telemetry?.stage;
  const tiers = telemetry?.retrieval?.tiers || [];
  const citationsCount = citations.length;

  const entailmentScore = telemetry?.audit?.entailment_score ?? telemetry?.audit?.confidence;
  const verificationStatus =
    telemetry?.audit?.verification_status ||
    (entailmentScore && entailmentScore >= 0.75
      ? 'verified'
      : citationsCount > 0
      ? 'partial'
      : 'unverified');

  const activeStageIdx =
    stage === 'auditing' ? 3 : stage === 'streaming' ? 2 : stage === 'retrieving' ? 1 : 0;

  if (isStreaming && !hasError) {
    return (
      <div className="space-y-2 select-none w-full">
        <div className="inline-flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--aria-accent)]/30 bg-slate-50 dark:bg-[#09090B] text-[11px] font-mono transition-all duration-300">
          {STREAM_STEPS.map((step, idx) => {
            const isCurrent = idx === activeStageIdx;
            const isDone = idx < activeStageIdx;
            return (
              <React.Fragment key={step.id}>
                <span
                  className={`inline-flex items-center gap-1.5 transition-all duration-200 ${
                    isCurrent
                      ? 'text-[var(--aria-accent)] font-semibold'
                      : isDone
                      ? 'text-emerald-400'
                      : 'text-slate-400 dark:text-[#52525B]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      isCurrent
                        ? 'bg-[var(--aria-accent)] animate-pulse'
                        : isDone
                        ? 'bg-emerald-400'
                        : 'bg-slate-300 dark:bg-[#27272A]'
                    }`}
                  />
                  <span>
                    {step.id === 'retrieving' && citationsCount > 0
                      ? `Retrieving (${citationsCount})`
                      : step.label}
                  </span>
                </span>
                {idx < STREAM_STEPS.length - 1 && (
                  <span className="text-slate-300 dark:text-white/15">→</span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Live fading retrieved source chips */}
        {citationsCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {citations.slice(0, 5).map((c, idx) => (
              <span
                key={c.id}
                style={{ ['--stagger-i' as any]: idx }}
                className="stagger-card inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] text-[10px] font-mono text-slate-600 dark:text-[#8B8B8E] max-w-[190px]"
              >
                <span className="text-[var(--aria-accent)] font-semibold">[{c.id + 1}]</span>
                <span className="truncate">{c.venue || c.title || c.tier}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const statusLabel = hasError
    ? 'Failed'
    : verificationStatus === 'verified'
    ? 'Verified'
    : verificationStatus === 'partial'
    ? 'Partial'
    : 'Unverified';

  const scorePct =
    typeof entailmentScore === 'number' && entailmentScore > 0
      ? `${Math.round(entailmentScore * 100)}%`
      : null;

  const activeTierLabel = tiers.length > 0 ? tiers.join(' · ') : 'LIVE';

  return (
    <div className="space-y-1.5 select-none w-full">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border transition-all duration-200 cursor-pointer active:scale-[0.98] ${
            hasError
              ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15'
              : 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#09090B] hover:bg-slate-100 dark:hover:bg-[#18181E] text-slate-600 dark:text-[#8B8B8E] hover:text-slate-900 dark:hover:text-[#EDEDED]'
          }`}
        >
          {hasError ? (
            <AlertCircle size={12} className="text-red-400 shrink-0" />
          ) : verificationStatus === 'verified' ? (
            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
          ) : (
            <CheckCircle2 size={12} className="text-amber-400 shrink-0" />
          )}

          <span
            className={`font-semibold ${
              hasError
                ? 'text-red-400'
                : verificationStatus === 'verified'
                ? 'text-emerald-500 dark:text-emerald-400'
                : 'text-amber-500 dark:text-amber-400'
            }`}
          >
            {statusLabel}
          </span>

          {scorePct && !hasError && (
            <>
              <span className="text-slate-300 dark:text-white/15">·</span>
              <span className="text-slate-800 dark:text-zinc-200 font-semibold tabular-nums">{scorePct}</span>
            </>
          )}

          {citationsCount > 0 && (
            <>
              <span className="text-slate-300 dark:text-white/15">·</span>
              <span className="text-slate-500 dark:text-[#8B8B8E] tabular-nums">
                {citationsCount} {citationsCount === 1 ? 'source' : 'sources'}
              </span>
            </>
          )}

          <span className="text-slate-300 dark:text-white/15 hidden sm:inline">·</span>
          <span className="hidden sm:inline text-[10px] tracking-wider text-slate-500 dark:text-[#71717A] uppercase">
            {activeTierLabel}
          </span>

          <ChevronDown
            size={12}
            className={`text-slate-400 dark:text-[#71717A] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Spring-style Accordion Expansion on Click */}
      <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
        <div className="accordion-inner">
          <div className="p-3 bg-slate-50/80 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] rounded-[8px] space-y-2 text-[11px] font-mono mt-1">
            <div className="flex items-center justify-between text-slate-600 dark:text-[#8B8B8E]">
              <span>Active Retrieval Tiers</span>
              <span className="text-[var(--aria-accent)] font-semibold">{activeTierLabel}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-[#8B8B8E]">
              <span>Pipeline Stage</span>
              <span className="text-slate-900 dark:text-[#EDEDED] uppercase">{stage || 'complete'}</span>
            </div>
            {scorePct && (
              <div className="flex items-center justify-between text-slate-600 dark:text-[#8B8B8E]">
                <span>Deterministic Entailment</span>
                <span className={`${(entailmentScore ?? 0) >= 0.75 ? 'text-emerald-400' : 'text-amber-400'} tabular-nums font-semibold`}>
                  {scorePct}
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
              {fig.source_url && sanitizeHref(fig.source_url) && (
                <a
                  href={sanitizeHref(fig.source_url)}
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
  isExportingBib?: boolean;
  isExportingTex?: boolean;
  isExportingRis?: boolean;
  isExportingMd?: boolean;
  isBackendReachable: boolean;
  isMockActive: boolean;
  feedbackStatus?: string;
  onCitationClick: (citation: Citation, claim?: AuditClaim) => void;
  onExecuteQuery: (query: string) => void;
  onCopy: (id: string, content: string) => void;
  onDownloadBibtex: (citations?: Citation[], msg?: Message) => void;
  onDownloadLatex: (citations?: Citation[], msg?: Message) => void;
  onDownloadRis: (citations?: Citation[], msg?: Message) => void;
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
    isExportingBib = false,
    isExportingTex = false,
    isExportingRis = false,
    isExportingMd = false,
    isBackendReachable,
    isMockActive,
    feedbackStatus,
    onCitationClick,
    onExecuteQuery,
    onCopy,
    onDownloadBibtex,
    onDownloadLatex,
    onDownloadRis,
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
          {/* Header Verification Strip with Kinetic Stage Stepper / Collapsible Summary Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-white/[0.07]">
            <ResearchTraceBar
              telemetry={msg.telemetry}
              isStreaming={msg.isStreaming}
              citations={msg.citations || []}
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
          <div className="text-[15px] text-slate-800 dark:text-[#EDEDED] leading-[1.7]">
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

          {/* Interactive Curiosity Pathways (Deep Dive / Counter-View / Applied) */}
          {!msg.isStreaming && msg.content && (
            <div className="pt-3 border-t border-slate-200 dark:border-white/[0.05] space-y-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-[#71717A]">
                <Sparkles size={11} className="text-[var(--aria-accent)]" />
                <span>Curiosity Pathways</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {getFollowUpCards(msg.query || '', msg.content, msg.telemetry).map((card, idx) => {
                  const Icon =
                    card.intent === 'counter_view'
                      ? Scale
                      : card.intent === 'applied'
                      ? Compass
                      : Layers;
                  const intentAccent =
                    card.intent === 'counter_view'
                      ? 'text-amber-400'
                      : card.intent === 'applied'
                      ? 'text-emerald-400'
                      : 'text-[var(--aria-accent)]';
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onExecuteQuery(card.question)}
                      className="text-left p-2.5 bg-slate-50 dark:bg-[#09090B] hover:bg-slate-100 dark:hover:bg-[#18181E] border border-slate-200 dark:border-white/[0.07] hover:border-slate-300 dark:hover:border-white/[0.15] rounded-[7px] space-y-1.5 transition-all duration-200 hover:translate-x-[3px] active:scale-[0.985] cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider ${intentAccent}`}>
                          <Icon size={11} />
                          <span>{card.label}</span>
                        </span>
                        <ArrowUpRight size={11} className="text-slate-400 dark:text-[#71717A] group-hover:text-[var(--aria-accent)] transition-colors" />
                      </div>
                      <p className="text-[12px] text-slate-800 dark:text-[#EDEDED] leading-snug line-clamp-2">
                        {card.question}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Bar + Academic Export Pack */}
          {!msg.isStreaming && msg.content && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-white/[0.07]">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => onCopy(msg.id, msg.content)}
                  className="flex items-center gap-1.5 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] active:scale-[0.96] transition-all cursor-pointer"
                >
                  {isCopied ? <Check size={13} className="text-emerald-400 morph-pop" /> : <Copy size={13} />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => onDownloadBibtex(msg.citations, msg)}
                  disabled={isExportingBib || !msg.citations || msg.citations.length === 0}
                  className="flex items-center gap-1 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.96] transition-all cursor-pointer"
                  title="Export BibTeX (.bib)"
                >
                  {isExportingBib ? <Loader2 size={12} className="animate-spin text-[var(--aria-accent)]" /> : <Download size={12} />}
                  <span>.BIB</span>
                </button>

                <button
                  onClick={() => onDownloadLatex(msg.citations, msg)}
                  disabled={isExportingTex || !msg.citations || msg.citations.length === 0}
                  className="flex items-center gap-1 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.96] transition-all cursor-pointer"
                  title="Export Overleaf LaTeX (.tex)"
                >
                  {isExportingTex ? <Loader2 size={12} className="animate-spin text-[var(--aria-accent)]" /> : <FileCode2 size={12} />}
                  <span>.TEX</span>
                </button>

                <button
                  onClick={() => onDownloadRis(msg.citations, msg)}
                  disabled={isExportingRis || !msg.citations || msg.citations.length === 0}
                  className="flex items-center gap-1 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.96] transition-all cursor-pointer"
                  title="Export RIS for Zotero / Mendeley (.ris)"
                >
                  {isExportingRis ? <Loader2 size={12} className="animate-spin text-[var(--aria-accent)]" /> : <Download size={12} />}
                  <span>.RIS</span>
                </button>

                <button
                  onClick={() => onDownloadMarkdown(msg)}
                  disabled={isExportingMd}
                  className="flex items-center gap-1 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] disabled:opacity-40 active:scale-[0.96] transition-all cursor-pointer"
                  title="Export Markdown (.md)"
                >
                  {isExportingMd ? <Loader2 size={12} className="animate-spin text-[var(--aria-accent)]" /> : <FileText size={12} />}
                  <span>.MD</span>
                </button>

                <button
                  onClick={() => onDownloadPdf(msg)}
                  disabled={isExportingPdf}
                  className="flex items-center gap-1 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-[var(--aria-accent)] dark:hover:text-[var(--aria-accent)] disabled:opacity-40 active:scale-[0.96] transition-all cursor-pointer"
                  title="Export Publication PDF"
                >
                  {isExportingPdf ? <Loader2 size={12} className="animate-spin text-[var(--aria-accent)]" /> : <FileText size={12} />}
                  <span>PDF</span>
                </button>

                <button
                  onClick={() => onSaveToCollection(msg)}
                  className="flex items-center gap-1.5 text-[12px] font-sans font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-[#EDEDED] active:scale-[0.96] transition-all cursor-pointer"
                  title="Save to Collection"
                >
                  <Bookmark
                    size={13}
                    className={isSaved ? 'text-[var(--aria-accent)] fill-[var(--aria-accent)] morph-pop' : ''}
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
      prev.isExportingBib === next.isExportingBib &&
      prev.isExportingTex === next.isExportingTex &&
      prev.isExportingRis === next.isExportingRis &&
      prev.isExportingMd === next.isExportingMd &&
      prev.isBackendReachable === next.isBackendReachable &&
      prev.isMockActive === next.isMockActive &&
      prev.feedbackStatus === next.feedbackStatus
    );
  }
);

interface ThreadViewProps {
  onCitationClick: (citation: Citation, claim?: AuditClaim) => void;
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
  onOpenShortcuts?: () => void;
}

export default function ThreadView({
  onCitationClick,
  isFocusMode,
  onToggleFocus,
  onQueryStateChange,
  onUpdateActiveTelemetry,
  onUpdateActiveCitations,
  onMockStateChange,
  activeTelemetry: _activeTelemetry,
  activeCitations: _activeCitations,
  isMockActive = false,
  onToggleSidebar: _onToggleSidebar,
  pendingQuery,
  onPendingQueryConsumed,
  onSourcesExpand: _onSourcesExpand,
  isInspectorOpen = false,
  onToggleInspector,
  onQueryErrorChange,
  onOpenShortcuts,
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
  const [isExportingBib, setIsExportingBib] = useState<Record<string, boolean>>({});
  const [isExportingTex, setIsExportingTex] = useState<Record<string, boolean>>({});
  const [isExportingRis, setIsExportingRis] = useState<Record<string, boolean>>({});
  const [isExportingMd, setIsExportingMd] = useState<Record<string, boolean>>({});
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([]);
  const [pulse, setPulse] = useState(() => getResearchPulse());

  const { settings } = useSettingsStore();
  const { accessToken } = useAuth();
  const [selectedTopic, setSelectedTopic] = useState<string>(() => settings.defaultDomain || 'auto');
  const [sourceTier, setSourceTier] = useState<SourceTierFilter>(() => settings.defaultSourceTier || 'all');
  const [recency, setRecency] = useState<RecencyFilter>(() => settings.defaultRecency || 'all');

  useEffect(() => {
    if (settings.defaultDomain) setSelectedTopic(settings.defaultDomain);
  }, [settings.defaultDomain]);
  useEffect(() => {
    if (settings.defaultSourceTier) setSourceTier(settings.defaultSourceTier);
  }, [settings.defaultSourceTier]);
  useEffect(() => {
    if (settings.defaultRecency) setRecency(settings.defaultRecency);
  }, [settings.defaultRecency]);

  // Listen for global '/' & Cmd+K focus composer events
  useEffect(() => {
    const handleFocusComposer = () => {
      const target = textareaRef.current || emptyTextareaRef.current;
      target?.focus();
    };
    window.addEventListener('aria:focus-composer', handleFocusComposer);
    return () => window.removeEventListener('aria:focus-composer', handleFocusComposer);
  }, []);

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
      const payload: ExportPdfPayload = {
        query: msg.query || 'Research Overview',
        answer_final: msg.content,
        confidence: msg.telemetry?.audit?.confidence ?? 0.85,
        tiers: msg.telemetry?.retrieval?.tiers || ['LIVE'],
        claims: msg.telemetry?.audit?.claims || [],
        sources: msg.citations || [],
        figures: msg.figures || msg.telemetry?.figures || [],
        chart: msg.chart || msg.telemetry?.chart || null,
        full_ledger: settings.includeLedgerInPdf,
        clickable_urls: true,
        pdf_style: settings.pdfLayoutStyle,
      };
      const blob = await exportPdfApi(payload, 90000, accessToken || undefined);
      const safeQuery = (msg.query || 'aria-research-paper').trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_');
      await saveOrDownloadFile(blob, `${safeQuery}.pdf`, 'application/pdf', {
        autoOpen: settings.autoOpenAfterExport,
      });
      triggerLightHaptic(settings.nativeHaptics);
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
          if (Array.isArray(evt.followup_questions) && evt.followup_questions.length > 0) {
            updatedTelemetry.followup_questions = evt.followup_questions;
          }
          if (Array.isArray(evt.followup_cards) && evt.followup_cards.length > 0) {
            updatedTelemetry.followup_cards = evt.followup_cards;
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

      let hasStructuralUpdate = false;
      for (const e of coalescedEvents) {
        if (e.event !== 'token') {
          hasStructuralUpdate = true;
        }
      }

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

      if ((hasStructuralUpdate || currentTelemetry.stage !== prevTelemetryStage) && onUpdateActiveTelemetry) {
        onUpdateActiveTelemetry({ ...currentTelemetry, query: queryText.trim() });
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
          compareMode: settings.defaultMode === 'deep_compare',
          sourceTier,
          recency,
          strictAcademic: settings.entailmentStrictness === 'strict',
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
            const finalStage = currentTelemetry.stage === 'error' ? 'error' : 'complete';
            currentTelemetry = {
              ...currentTelemetry,
              stage: finalStage,
              query: queryText.trim(),
            };
            if (onUpdateActiveTelemetry) {
              onUpdateActiveTelemetry(currentTelemetry);
            }
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== ariaMsgId) return msg;
                const msgFinalStage = msg.telemetry?.stage === 'error' ? 'error' : 'complete';
                return {
                  ...msg,
                  isStreaming: false,
                  telemetry: {
                    ...(msg.telemetry || {}),
                    stage: msgFinalStage,
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
                const verifiedCount = (currentTelemetry.audit?.claims || []).filter(
                  (c: any) => typeof c === 'object' && (c.status === 'supported' || c.verdict === 'supported')
                ).length;
                setPulse(recordQueryCompleted(verifiedCount));
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

  const handleDownloadBibtex = async (citations: Citation[] = [], msg?: Message) => {
    if (!citations || citations.length === 0) {
      showDownloadToast('No citations available to export.', true);
      return;
    }
    const msgKey = msg?.id || 'all';
    try {
      setIsExportingBib((prev) => ({ ...prev, [msgKey]: true }));
      const bibContent = exportAllBibtex(citations);
      const blob = new Blob([bibContent], { type: 'text/plain;charset=utf-8' });
      const safeQuery = msg?.query ? msg.query.trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_') : 'aria-citations';
      await saveOrDownloadFile(blob, `${safeQuery}.bib`, 'text/plain', {
        autoOpen: settings.autoOpenAfterExport,
      });
      triggerLightHaptic(settings.nativeHaptics);
    } catch (err: any) {
      showDownloadToast(`BibTeX Export Error: ${err?.message || 'Export error'}`, true);
    } finally {
      setIsExportingBib((prev) => ({ ...prev, [msgKey]: false }));
    }
  };

  const handleDownloadLatex = async (citations: Citation[] = [], msg?: Message) => {
    if (!citations || citations.length === 0) {
      showDownloadToast('No citations available to export.', true);
      return;
    }
    const msgKey = msg?.id || 'all';
    try {
      setIsExportingTex((prev) => ({ ...prev, [msgKey]: true }));
      const texContent = exportLatexArticle({
        query: msg?.query || 'ARIA Research Synthesis',
        content: msg?.content || '',
        citations,
      });
      const safeQuery = msg?.query ? msg.query.trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_') : 'aria-article';
      await saveOrDownloadFile(new Blob([texContent], { type: 'application/x-tex;charset=utf-8' }), `${safeQuery}.tex`, 'application/x-tex', {
        autoOpen: settings.autoOpenAfterExport,
      });
      triggerLightHaptic(settings.nativeHaptics);
    } catch (err: any) {
      showDownloadToast(`LaTeX Export Error: ${err?.message || 'Export error'}`, true);
    } finally {
      setIsExportingTex((prev) => ({ ...prev, [msgKey]: false }));
    }
  };

  const handleDownloadRis = async (citations: Citation[] = [], msg?: Message) => {
    if (!citations || citations.length === 0) {
      showDownloadToast('No citations available to export.', true);
      return;
    }
    const msgKey = msg?.id || 'all';
    try {
      setIsExportingRis((prev) => ({ ...prev, [msgKey]: true }));
      const risContent = exportAllRis(citations);
      const safeQuery = msg?.query ? msg.query.trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_') : 'aria-citations';
      await saveOrDownloadFile(new Blob([risContent], { type: 'application/x-research-info-systems;charset=utf-8' }), `${safeQuery}.ris`, 'application/x-research-info-systems', {
        autoOpen: settings.autoOpenAfterExport,
      });
      triggerLightHaptic(settings.nativeHaptics);
    } catch (err: any) {
      showDownloadToast(`RIS Export Error: ${err?.message || 'Export error'}`, true);
    } finally {
      setIsExportingRis((prev) => ({ ...prev, [msgKey]: false }));
    }
  };

  const handleDownloadMarkdown = async (msg: Message) => {
    if (!msg.content) {
      showDownloadToast('No synthesis content to export.', true);
      return;
    }
    try {
      setIsExportingMd((prev) => ({ ...prev, [msg.id]: true }));
      const blob = new Blob([msg.content], { type: 'text/markdown;charset=utf-8' });
      if (!blob || blob.size === 0) {
        throw new Error('Empty markdown content');
      }
      const safeQuery = (msg.query || 'aria-synthesis').trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_');
      await saveOrDownloadFile(blob, `${safeQuery}.md`, 'text/markdown', {
        autoOpen: settings.autoOpenAfterExport,
      });
      triggerLightHaptic(settings.nativeHaptics);
    } catch (err: any) {
      console.error('Download Markdown failed:', err);
      showDownloadToast(`Markdown Export Error: ${err?.message || 'Export error'}`, true);
    } finally {
      setIsExportingMd((prev) => ({ ...prev, [msg.id]: false }));
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

          {onOpenShortcuts && (
            <button
              onClick={onOpenShortcuts}
              className="hidden md:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#111115] border border-transparent hover:border-white/[0.08] transition-colors cursor-pointer"
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
            >
              <HelpCircle size={13} />
              <span>?</span>
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
        className="flex-1 overflow-y-auto p-4 sm:p-6 pb-32 sm:pb-28 space-y-6 select-text hud-scroll"
      >
        {/* Open Editorial Workspace (Empty State): pristine typography on canvas */}
        {messages.length === 0 && (
          <div className="flex-1 min-h-[70vh] flex flex-col items-center justify-center py-8 animate-fade-slide">
            <div className="w-full max-w-2xl text-center space-y-2 mb-6">
              {settings.showResearchPulse && pulse.queriesCount > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-[#111115] border border-slate-200 dark:border-white/[0.08] text-[11px] font-mono text-slate-600 dark:text-[#8B8B8E] mb-1 animate-fade-slide">
                  <Flame size={12} className="text-[var(--aria-accent)]" />
                  <span className="tabular-nums text-slate-900 dark:text-[#EDEDED] font-medium">
                    {pulse.currentDayStreak}-day streak
                  </span>
                  <span className="text-slate-300 dark:text-white/15">·</span>
                  <span className="tabular-nums">{pulse.verifiedClaimsRead} claims verified</span>
                  {pulse.sourcesExplored > 0 && (
                    <>
                      <span className="hidden sm:inline text-slate-300 dark:text-white/15">·</span>
                      <span className="hidden sm:inline tabular-nums">{pulse.sourcesExplored} sources inspected</span>
                    </>
                  )}
                </div>
              )}
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

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-white/[0.05] mt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <DomainPicker
                    value={selectedTopic}
                    onChange={setSelectedTopic}
                    direction="down"
                  />

                  <button
                    type="button"
                    onClick={() => setSourceTier((prev) => (prev === 'all' ? 'peer_reviewed' : 'all'))}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-mono transition-all cursor-pointer ${
                      sourceTier === 'peer_reviewed'
                        ? 'border-[var(--aria-accent)] bg-[var(--aria-accent)]/12 text-[var(--aria-accent)] font-semibold'
                        : 'border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Toggle between All Verified Sources and Peer-Reviewed Academic Literature Only"
                  >
                    {sourceTier === 'peer_reviewed' ? 'Peer-Reviewed' : 'All Sources'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setRecency((prev) => (prev === 'all' ? '5y' : prev === '5y' ? '2y' : 'all'))
                    }
                    className={`px-2 py-1 rounded-lg border text-[11px] font-mono transition-all cursor-pointer ${
                      recency !== 'all'
                        ? 'border-[var(--aria-accent)] bg-[var(--aria-accent)]/12 text-[var(--aria-accent)] font-semibold'
                        : 'border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Cycle publication recency cutoff: All Time -> Last 5 Years -> Last 2 Years"
                  >
                    {recency === '2y' ? 'Last 2 Yrs' : recency === '5y' ? 'Last 5 Yrs' : 'All Time'}
                  </button>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <span className="hidden md:inline text-[11px] text-slate-500 dark:text-zinc-500 font-mono">
                    / focus · ? shortcuts
                  </span>
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
            isExportingBib={Boolean(isExportingBib[msg.id])}
            isExportingTex={Boolean(isExportingTex[msg.id])}
            isExportingRis={Boolean(isExportingRis[msg.id])}
            isExportingMd={Boolean(isExportingMd[msg.id])}
            isBackendReachable={isBackendReachable}
            isMockActive={isMockActive}
            feedbackStatus={feedbackSent[msg.id]}
            onCitationClick={onCitationClick}
            onExecuteQuery={executeQuery}
            onCopy={handleCopy}
            onDownloadBibtex={handleDownloadBibtex}
            onDownloadLatex={handleDownloadLatex}
            onDownloadRis={handleDownloadRis}
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
            className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 max-w-4xl mx-auto bg-white dark:bg-[#0B0F1A] border border-slate-200 dark:border-white/[0.08] focus-within:border-slate-400 dark:focus-within:border-white/[0.18] rounded-2xl p-2 transition-all duration-150 shadow-sm dark:shadow-none"
          >
            <div className="flex items-center gap-1 shrink-0">
              <DomainPicker
                value={selectedTopic}
                onChange={setSelectedTopic}
                direction="up"
                className="shrink-0"
              />
              <button
                type="button"
                onClick={() => setSourceTier((prev) => (prev === 'all' ? 'peer_reviewed' : 'all'))}
                className={`px-1.5 py-1 rounded-lg border text-[10px] font-mono transition-all cursor-pointer ${
                  sourceTier === 'peer_reviewed'
                    ? 'border-[var(--aria-accent)] bg-[var(--aria-accent)]/12 text-[var(--aria-accent)] font-semibold'
                    : 'border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
                }`}
                title="Peer-Reviewed Only toggle"
              >
                {sourceTier === 'peer_reviewed' ? 'Peer-Rev' : 'All'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setRecency((prev) => (prev === 'all' ? '5y' : prev === '5y' ? '2y' : 'all'))
                }
                className={`px-1.5 py-1 rounded-lg border text-[10px] font-mono transition-all cursor-pointer ${
                  recency !== 'all'
                    ? 'border-[var(--aria-accent)] bg-[var(--aria-accent)]/12 text-[var(--aria-accent)] font-semibold'
                    : 'border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:text-zinc-200'
                }`}
                title="Recency window: All Time / Last 5 Years / Last 2 Years"
              >
                {recency === '2y' ? '2Y' : recency === '5y' ? '5Y' : 'All'}
              </button>
            </div>

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
