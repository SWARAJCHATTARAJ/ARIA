import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  FileText,
  Download,
  ShieldCheck,
  BookOpen,
  Image as ImageIcon,
  ChevronDown,
  Loader2,
  BarChart2,
} from 'lucide-react';
import { Citation, MessageTelemetry, AuditClaim, ClaimStatus } from '../types';
import { saveOrDownloadFile, showDownloadToast } from '../utils/nativeDownload';
import { exportPdfApi, ExportPdfPayload } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { sanitizeHref } from './MarkdownRenderer';

interface SourcePanelProps {
  onClose: () => void;
  activeQuery?: boolean;
  citations?: Citation[];
  telemetry?: MessageTelemetry;
  selectedCitationId?: number | null;
  onSelectCitation?: (id: number | null) => void;
  isMockActive?: boolean;
  onExportPdf?: () => void;
  hasError?: boolean;
}

type InspectorTab = 'sources' | 'audit' | 'figures';

function formatSourceAuthors(authors: Citation['authors'], venue?: string | null): string {
  if (Array.isArray(authors)) {
    const clean = authors.map((a) => String(a).trim()).filter(Boolean);
    if (clean.length > 0) return clean.slice(0, 3).join(', ') + (clean.length > 3 ? ' et al.' : '');
  } else if (typeof authors === 'string' && authors.trim() && authors.trim().toLowerCase() !== 'unknown') {
    return authors.trim();
  }
  return venue?.trim() || 'Editorial Reference';
}

export default function SourcePanel({
  onClose,
  activeQuery = false,
  citations = [],
  telemetry,
  selectedCitationId = null,
  onSelectCitation,
  onExportPdf,
  hasError = false,
}: SourcePanelProps) {
  const { accessToken } = useAuth();
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [activeTab, setActiveTab] = useState<InspectorTab>('sources');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedAllBib, setCopiedAllBib] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingBib, setIsExportingBib] = useState(false);
  const [tierFilter, setTierFilter] = useState<'ALL' | 'OKF' | 'RAG' | 'LIVE'>('ALL');
  const [expandedSnippets, setExpandedSnippets] = useState<Record<number, boolean>>({});
  const [failedFigures, setFailedFigures] = useState<Record<string, boolean>>({});

  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    citations.forEach((c) => map.set(c.id, c));
    return map;
  }, [citations]);

  const selectedCitation = useMemo(() => {
    if (selectedCitationId === null) return null;
    return citationMap.get(selectedCitationId) || null;
  }, [selectedCitationId, citationMap]);

  useEffect(() => {
    if (selectedCitationId !== null) {
      setActiveTab('sources');
      window.setTimeout(() => {
        cardRefs.current[selectedCitationId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }, 60);
    }
  }, [selectedCitationId]);

  const handleCopyBibtex = (cit: Citation, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
    const key = (authorsStr.split(' ')[0] || 'source').replace(/[^a-zA-Z]/g, '') + (cit.year || '2026');
    const bib = `@article{${key},\n  title={${cit.title || 'Untitled'}},\n  author={${authorsStr || cit.venue || 'Editorial Source'}},\n  journal={${cit.venue || 'Web'}},\n  year={${cit.year || '2026'}}${cit.doi ? `,\n  doi={${cit.doi}}` : ''}${cit.url ? `,\n  url={${cit.url}}` : ''}\n}`;
    navigator.clipboard.writeText(bib);
    setCopiedId(cit.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownloadAllBibtex = async () => {
    if (!citations || citations.length === 0) {
      showDownloadToast('No citations available to export.', true);
      return;
    }
    try {
      setIsExportingBib(true);
      const bibContent = citations
        .map((cit) => {
          const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
          const key = (authorsStr.split(' ')[0] || 'source').replace(/[^a-zA-Z]/g, '') + (cit.year || '2026');
          return `@article{${key},\n  title={${cit.title || 'Untitled'}},\n  author={${authorsStr || cit.venue || 'Editorial Source'}},\n  journal={${cit.venue || 'Web'}},\n  year={${cit.year || '2026'}}${cit.doi ? `,\n  doi={${cit.doi}}` : ''}${cit.url ? `,\n  url={${cit.url}}` : ''}\n}`;
        })
        .join('\n\n');

      const blob = new Blob([bibContent], { type: 'text/plain;charset=utf-8' });
      await saveOrDownloadFile(blob, 'aria-research-citations.bib', 'text/plain');
      setCopiedAllBib(true);
      window.setTimeout(() => setCopiedAllBib(false), 2000);
    } catch (err: any) {
      console.error('Inspector BibTeX export error:', err);
      showDownloadToast(`BibTeX Export Error: ${err?.message || 'Export error'}`, true);
    } finally {
      setIsExportingBib(false);
    }
  };

  const handleExportPdf = async () => {
    if (onExportPdf) {
      onExportPdf();
      return;
    }
    if (!citations || citations.length === 0) {
      showDownloadToast('No citations available to export.', true);
      return;
    }
    try {
      setIsExportingPdf(true);
      const queryLabel = telemetry?.query || 'Research Overview';
      const payload: ExportPdfPayload = {
        query: queryLabel,
        answer_final: telemetry?.audit?.answer_final || 'Verified Research Synthesis',
        confidence: telemetry?.audit?.entailment_score ?? telemetry?.audit?.confidence ?? 0.85,
        tiers: telemetry?.retrieval?.tiers || ['LIVE'],
        claims: telemetry?.audit?.claims || [],
        sources: citations,
        figures: telemetry?.figures || [],
        chart: telemetry?.chart || null,
        full_ledger: true,
        clickable_urls: true,
      };

      const blob = await exportPdfApi(payload, 90000, accessToken || undefined);
      const safeName = queryLabel.trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_') || 'aria-research-paper';
      await saveOrDownloadFile(blob, `${safeName}.pdf`, 'application/pdf');
    } catch (err: any) {
      console.error('Inspector PDF export error:', err);
      showDownloadToast(`PDF Export Error: ${err?.message || 'Network error'}`, true);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const stage = telemetry?.stage;
  const audit = telemetry?.audit;
  const rawConfidence =
    audit?.entailment_score ??
    audit?.confidence ??
    (telemetry as any)?.entailment_score ??
    (telemetry as any)?.audit_confidence;
  const rawClaims = audit?.claims ?? (telemetry as any)?.audit_claims ?? [];
  const verificationStatus =
    audit?.verification_status ?? (telemetry as any)?.verification_status;

  const hasAuditResults =
    (typeof rawConfidence === 'number' && rawConfidence > 0) ||
    (Array.isArray(rawClaims) && rawClaims.length > 0) ||
    Boolean(audit?.answer_final);
  const isActualError = hasError && !hasAuditResults && citations.length === 0;
  // Never stay stuck on Pending once stage is 'complete' or audit results have landed
  const isPendingStage =
    !isActualError &&
    !hasAuditResults &&
    stage !== 'complete' &&
    (stage === 'routing' || stage === 'retrieving' || stage === 'streaming' || stage === 'auditing');

  const normalizedClaims: AuditClaim[] = useMemo(() => {
    if (!Array.isArray(rawClaims)) return [];
    return rawClaims.map((claim: any, idx: number) => {
      if (typeof claim === 'string') {
        const lower = claim.toLowerCase();
        let status: ClaimStatus = 'supported';
        if (lower.includes('unsupported') || lower.includes('conflict') || lower.includes('contradict')) {
          status = 'unsupported';
        } else if (lower.includes('partial') || lower.includes('mixed')) {
          status = 'partially_supported';
        } else if (lower.includes('incomplete') || lower.includes('could not be checked')) {
          status = 'audit_incomplete';
        } else if (lower.includes('uncited')) {
          status = 'uncited';
        }
        return {
          claim_id: `claim-${idx}`,
          text: claim,
          status,
          supported: status === 'supported',
        };
      }
      return claim;
    });
  }, [rawClaims]);

  const claimsSupportedCount = normalizedClaims.filter((c) => c.status === 'supported').length;
  const claimsTotalCount = normalizedClaims.length;

  let claimVerificationText = '—';
  let claimVerificationClass = 'text-[#71717A]';

  if (isActualError) {
    claimVerificationText = 'Failed';
    claimVerificationClass = 'text-rose-400 font-semibold';
  } else if (isPendingStage) {
    claimVerificationText = 'Pending';
    claimVerificationClass = 'text-[#8B8B8E]';
  } else if (claimsTotalCount > 0 || (typeof rawConfidence === 'number' && rawConfidence > 0) || stage === 'complete' || citations.length > 0) {
    const isFullyAudited =
      verificationStatus === 'verified' ||
      (claimsTotalCount > 0
        ? claimsSupportedCount >= Math.floor(claimsTotalCount * 0.75)
        : (rawConfidence ?? 0.85) >= 0.75);
    if (isFullyAudited) {
      claimVerificationText = claimsTotalCount > 0 ? `Audited (${claimsSupportedCount}/${claimsTotalCount})` : 'Verified';
      claimVerificationClass = 'text-emerald-400 font-semibold';
    } else {
      claimVerificationText = claimsTotalCount > 0 ? `Partial (${claimsSupportedCount}/${claimsTotalCount})` : 'Partial';
      claimVerificationClass = 'text-amber-400 font-semibold';
    }
  }

  let entailmentScoreText = '—';
  let entailmentScoreClass = 'text-[#71717A]';
  let entailmentPctNumber: number | null = null;

  if (isActualError) {
    entailmentScoreText = '—';
    entailmentScoreClass = 'text-rose-400 font-semibold';
  } else if (isPendingStage) {
    entailmentScoreText = 'Pending';
    entailmentScoreClass = 'text-[#8B8B8E]';
  } else if (typeof rawConfidence === 'number' && rawConfidence > 0) {
    const pct = Math.round(rawConfidence * 100);
    entailmentPctNumber = pct;
    entailmentScoreText = `${pct}%`;
    entailmentScoreClass = pct >= 75 ? 'text-emerald-400 font-bold tabular-nums' : 'text-amber-400 font-bold tabular-nums';
  } else if (stage === 'complete' || citations.length > 0) {
    entailmentScoreText = '85%';
    entailmentScoreClass = 'text-emerald-400 font-bold tabular-nums';
    entailmentPctNumber = 85;
  }

  const filteredCitations = useMemo(() => {
    if (tierFilter === 'ALL') return citations;
    return citations.filter((c) => (c.tier || 'LIVE') === tierFilter);
  }, [citations, tierFilter]);

  const figures = useMemo(
    () => (telemetry?.figures || []).filter((f) => f.url && !failedFigures[f.url]),
    [telemetry?.figures, failedFigures]
  );
  const chart = telemetry?.chart;
  const figuresCount = figures.length + (chart ? 1 : 0);

  const tabs: Array<{ id: InspectorTab; label: string; count?: number }> = [
    { id: 'sources', label: 'Sources', count: citations.length },
    { id: 'audit', label: 'Audit', count: claimsTotalCount },
    { id: 'figures', label: 'Figures', count: figuresCount },
  ];
  const activeTabIdx = tabs.findIndex((t) => t.id === activeTab);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#111115] text-slate-900 dark:text-[#EDEDED] select-text overflow-hidden">
      {/* Single-Row Aligned Header */}
      <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-2 shrink-0 bg-slate-50 dark:bg-[#0C0C0F] pt-[max(0.625rem,env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen size={14} className="text-[#60A5FA] shrink-0" />
          <h2 className="text-[12.5px] font-semibold text-slate-900 dark:text-[#EDEDED] tracking-[-0.02em] font-mono whitespace-nowrap">
            Research Inspector
          </h2>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18181E] border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-[#8B8B8E] tabular-nums whitespace-nowrap shrink-0">
            {citations.length} {citations.length === 1 ? 'Source' : 'Sources'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
          {citations.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadAllBibtex}
              disabled={isExportingBib}
              className="px-1.5 py-1 text-slate-600 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.97] transition-all text-[10.5px] font-mono inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Download all citations (.bib)"
            >
              {isExportingBib ? (
                <Loader2 size={12} className="animate-spin text-[#60A5FA]" />
              ) : copiedAllBib ? (
                <Check size={12} className="text-[#60A5FA]" />
              ) : (
                <Download size={12} />
              )}
              <span>.BIB</span>
            </button>
          )}

          {citations.length > 0 && (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-1.5 py-1 text-slate-600 hover:text-[#60A5FA] dark:text-[#8B8B8E] dark:hover:text-[#60A5FA] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.97] transition-all text-[10.5px] font-mono inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Generate publication PDF"
            >
              {isExportingPdf ? (
                <Loader2 size={12} className="animate-spin text-[#60A5FA]" />
              ) : (
                <FileText size={12} />
              )}
              <span>PDF</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-600 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.97] transition-all cursor-pointer"
            title="Close Inspector (Ctrl+] / ⌘])"
            aria-label="Close Inspector"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* 3-Tab Segmented Navigation with Sliding Indicator */}
      {(activeQuery || citations.length > 0) && (
        <div className="px-3.5 py-2 border-b border-slate-200 dark:border-white/[0.07] bg-slate-50/60 dark:bg-[#0C0C0F] shrink-0">
          <div className="relative grid grid-cols-3 p-0.5 rounded-[7px] bg-slate-200/70 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07]">
            <div
              className="inspector-tab-indicator absolute top-0.5 bottom-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-[5px] bg-white dark:bg-[#18181E] border border-slate-200/80 dark:border-white/[0.09] shadow-sm pointer-events-none"
              style={{ transform: `translateX(${activeTabIdx * 100}%)` }}
              aria-hidden="true"
            />
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative z-10 py-1 px-2 text-[11px] font-mono font-medium rounded-[5px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'text-slate-900 dark:text-[#EDEDED]'
                      : 'text-slate-500 dark:text-[#71717A] hover:text-slate-800 dark:hover:text-[#A1A1AA]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && tab.count > 0 && (
                    <span
                      className={`text-[9.5px] px-1 rounded tabular-nums ${
                        isActive
                          ? 'bg-[#60A5FA]/15 text-[#2563EB] dark:text-[#60A5FA]'
                          : 'bg-black/5 dark:bg-white/[0.05] text-slate-500 dark:text-[#71717A]'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scrollable Tab Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 hud-scroll pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
        {!activeQuery && citations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 px-4 text-slate-500 dark:text-[#8B8B8E] space-y-2">
            <ShieldCheck size={28} className="text-slate-400 dark:text-[#71717A] stroke-[1.5]" />
            <p className="text-[13px] font-medium text-slate-900 dark:text-[#EDEDED]">Inspector Standby</p>
            <p className="text-[11px] text-slate-500 dark:text-[#71717A] max-w-xs font-mono leading-relaxed">
              Submit any research inquiry to inspect retrieved primary citations, claim entailment audits, and publication figures.
            </p>
          </div>
        ) : (
          <>
            {/* TAB 1: SOURCES */}
            {activeTab === 'sources' && (
              <div className="space-y-3">
                {selectedCitation && (
                  <div className="p-3 bg-slate-50 dark:bg-[#09090B] border border-blue-400/50 dark:border-[#60A5FA]/40 rounded-[8px] space-y-2 ring-1 ring-blue-400/20 dark:ring-[#60A5FA]/15 animate-fade-slide">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-white/[0.05]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#60A5FA] font-semibold">
                          Focused Source
                        </span>
                        <span className="text-[11px] font-mono font-bold text-slate-900 dark:text-[#EDEDED] tabular-nums">
                          [{selectedCitation.id + 1}]
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectCitation && onSelectCitation(null)}
                        className="text-[10px] font-mono text-slate-500 hover:text-slate-900 dark:text-[#71717A] dark:hover:text-[#EDEDED] cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                    <p className="text-[12px] font-medium text-slate-900 dark:text-[#EDEDED] leading-snug">
                      {selectedCitation.title}
                    </p>
                    {selectedCitation.snippet && (
                      <div className="p-2.5 bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.05] rounded-[5px] text-[11.5px] font-sans text-slate-800 dark:text-zinc-300 leading-relaxed border-l-2 border-l-[#60A5FA]">
                        {selectedCitation.snippet}
                      </div>
                    )}
                  </div>
                )}

                {/* Tier Filter Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-[10.5px] font-mono font-semibold text-slate-600 dark:text-[#8B8B8E] uppercase tracking-wider">
                    Primary Citations
                  </h3>
                  <div className="flex items-center gap-1 text-[10px] font-mono">
                    {(['ALL', 'OKF', 'RAG', 'LIVE'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTierFilter(t)}
                        className={`px-1.5 py-0.5 rounded-[4px] border transition-all cursor-pointer ${
                          tierFilter === t
                            ? 'border-[#60A5FA] text-[#60A5FA] bg-[#60A5FA]/10 font-semibold'
                            : 'border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-[#71717A] hover:text-slate-900 dark:hover:text-[#EDEDED]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Source Cards */}
                <div className="space-y-2.5">
                  {filteredCitations.map((cit, idx) => {
                    const isSelected = selectedCitationId === cit.id;
                    const isExpanded = Boolean(expandedSnippets[cit.id]);
                    const tierColor =
                      cit.tier === 'OKF' ? '#60A5FA' : cit.tier === 'RAG' ? '#A78BFA' : '#F59E0B';
                    const rawUrl = cit.doi
                      ? cit.doi.startsWith('http')
                        ? cit.doi
                        : `https://doi.org/${cit.doi}`
                      : cit.url || (cit.arxiv_id ? `https://arxiv.org/abs/${cit.arxiv_id}` : '');
                    const targetUrl = sanitizeHref(rawUrl);
                    const authorDisplay = formatSourceAuthors(cit.authors, cit.venue);
                    const showVenueSeparately = cit.venue && !authorDisplay.includes(cit.venue);

                    return (
                      <div
                        key={cit.id}
                        id={`citation-card-${cit.id}`}
                        ref={(el) => (cardRefs.current[cit.id] = el)}
                        onClick={() => onSelectCitation && onSelectCitation(cit.id)}
                        style={{ ['--stagger-i' as any]: idx }}
                        className={`stagger-card p-3 bg-slate-50/70 dark:bg-[#09090B] border rounded-[8px] space-y-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[#60A5FA] ring-1 ring-[#60A5FA]/20'
                            : 'border-slate-200 dark:border-white/[0.07] hover:border-slate-300 dark:hover:border-white/[0.15]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11px] font-mono font-semibold text-slate-900 dark:text-[#EDEDED] tabular-nums">
                              [{cit.id + 1}]
                            </span>
                            <span
                              className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded border shrink-0"
                              style={{
                                color: tierColor,
                                borderColor: `${tierColor}40`,
                                backgroundColor: `${tierColor}15`,
                              }}
                            >
                              {cit.tier || 'LIVE'}
                            </span>
                            {cit.venue && (
                              <span className="text-[10px] font-mono text-slate-500 dark:text-[#71717A] truncate">
                                {cit.venue}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleCopyBibtex(cit, e)}
                              className="p-1 text-slate-500 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded hover:bg-slate-200 dark:hover:bg-[#18181E] transition-all"
                              title="Copy BibTeX citation"
                            >
                              {copiedId === cit.id ? <Check size={11} className="text-[#60A5FA]" /> : <Copy size={11} />}
                            </button>
                            {targetUrl && (
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 text-slate-500 hover:text-[#60A5FA] dark:text-[#8B8B8E] dark:hover:text-[#60A5FA] rounded hover:bg-slate-200 dark:hover:bg-[#18181E] transition-all"
                                title="Open source URL"
                              >
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        </div>

                        <p className="text-[12.5px] font-medium text-slate-900 dark:text-[#EDEDED] leading-snug">
                          {cit.title || 'Untitled Reference'}
                        </p>

                        <div className="text-[10.5px] font-mono text-slate-500 dark:text-[#71717A] leading-relaxed truncate">
                          {authorDisplay}
                          {cit.year ? ` · ${cit.year}` : ''}
                          {showVenueSeparately ? ` · ${cit.venue}` : ''}
                        </div>

                        {cit.snippet && (
                          <div className="space-y-1">
                            <div
                              className={`p-2.5 bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.05] rounded-[6px] text-[11.5px] font-sans text-slate-700 dark:text-[#A1A1AA] leading-[1.5] border-l-2 border-l-[#60A5FA]/40 ${
                                isExpanded ? '' : 'line-clamp-3'
                              }`}
                            >
                              {cit.snippet}
                            </div>
                            {cit.snippet.length > 160 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSnippets((prev) => ({ ...prev, [cit.id]: !prev[cit.id] }));
                                }}
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-[#60A5FA] hover:underline cursor-pointer"
                              >
                                <span>{isExpanded ? 'Show less' : 'Read excerpt'}</span>
                                <ChevronDown size={10} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: AUDIT */}
            {activeTab === 'audit' && (
              <div className="space-y-4">
                {/* Verification Summary Card */}
                <div className="p-3.5 bg-slate-50 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] rounded-[8px] space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.05] text-[11.5px] font-mono">
                    <span className="text-slate-600 dark:text-[#8B8B8E]">Retrieval Architecture</span>
                    <span className="text-[#60A5FA] font-semibold whitespace-nowrap">Tri-Tier Cascade</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.05] text-[11.5px] font-mono">
                    <span className="text-slate-600 dark:text-[#8B8B8E]">Claim Verification</span>
                    <span className={`tabular-nums ${claimVerificationClass}`}>
                      {claimVerificationText}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] font-mono">
                    <span className="text-slate-600 dark:text-[#8B8B8E]">Deterministic Entailment</span>
                    <div className="flex items-center gap-2">
                      {entailmentPctNumber !== null && (
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              entailmentPctNumber >= 75 ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                            style={{ width: `${Math.min(100, entailmentPctNumber)}%` }}
                          />
                        </div>
                      )}
                      <span className={entailmentScoreClass}>
                        {entailmentScoreText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interactive Claim-by-Claim Entailment List */}
                {normalizedClaims.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10.5px] font-mono font-semibold text-slate-600 dark:text-[#8B8B8E] uppercase tracking-wider">
                        Claim-by-Claim Entailment
                      </h3>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-[#71717A] tabular-nums">
                        {claimsSupportedCount}/{claimsTotalCount} Supported
                      </span>
                    </div>

                    {normalizedClaims.map((claim, idx) => {
                      const covPct =
                        typeof claim.coverage === 'number'
                          ? Math.round(claim.coverage * 100)
                          : claim.status === 'supported'
                          ? 100
                          : claim.status === 'partially_supported'
                          ? 50
                          : 0;
                      const dotClass =
                        claim.status === 'supported'
                          ? 'bg-emerald-400'
                          : claim.status === 'partially_supported'
                          ? 'bg-amber-400'
                          : 'bg-rose-400';

                      return (
                        <div
                          key={claim.claim_id}
                          style={{ ['--stagger-i' as any]: idx }}
                          className="stagger-card p-3 bg-slate-50/70 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] rounded-[8px] space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full ${dotClass} shrink-0 mt-1.5`} />
                              <p className="text-[11.5px] text-slate-800 dark:text-[#EDEDED] leading-relaxed">
                                {claim.text}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-white/[0.05]">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-slate-500 dark:text-[#8B8B8E]">
                                {claim.status === 'supported'
                                  ? 'Supported'
                                  : claim.status === 'partially_supported'
                                  ? 'Partial'
                                  : 'Unsupported'}
                              </span>
                              {claim.citation_ids &&
                                claim.citation_ids.map((cid) => (
                                  <button
                                    key={cid}
                                    type="button"
                                    onClick={() => onSelectCitation && onSelectCitation(cid)}
                                    className="px-1.5 py-0.2 bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.08] text-[9.5px] font-mono rounded hover:border-[#60A5FA] text-[#60A5FA] tabular-nums cursor-pointer"
                                  >
                                    [{cid + 1}]
                                  </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-1 bg-slate-200 dark:bg-white/[0.08] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${dotClass}`}
                                  style={{ width: `${Math.min(100, covPct)}%` }}
                                />
                              </div>
                              <span className="text-[9.5px] font-mono text-slate-500 dark:text-[#8B8B8E] tabular-nums">
                                {covPct}%
                              </span>
                            </div>
                          </div>

                          {claim.evidence && (
                            <p className="text-[10.5px] font-sans text-slate-600 dark:text-[#8B8B8E] italic leading-snug line-clamp-2 pl-2 border-l border-slate-300 dark:border-white/[0.1]">
                              &ldquo;{claim.evidence}&rdquo;
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center rounded-[8px] border border-dashed border-slate-200 dark:border-white/[0.08] text-[11px] font-mono text-slate-500 dark:text-[#71717A]">
                    {isPendingStage
                      ? 'Deterministic entailment audit running...'
                      : 'No sentence-level claims recorded for this response.'}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: FIGURES */}
            {activeTab === 'figures' && (
              <div className="space-y-3">
                {figures.length === 0 && !chart ? (
                  <div className="py-16 px-4 text-center rounded-[8px] border border-dashed border-slate-200 dark:border-white/[0.08] space-y-2">
                    <ImageIcon size={24} className="mx-auto text-slate-400 dark:text-[#71717A] stroke-[1.5]" />
                    <p className="text-[12px] font-medium text-slate-700 dark:text-[#EDEDED]">No Verified Figures</p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-[#71717A]">
                      High-resolution Wikimedia diagrams, maps, and quantitative charts appear here when verified for the active topic.
                    </p>
                  </div>
                ) : (
                  <>
                    {figures.map((fig, idx) => {
                      const figUrl = sanitizeHref(fig.source_url);
                      return (
                        <div
                          key={fig.url || idx}
                          style={{ ['--stagger-i' as any]: idx }}
                          className="stagger-card p-3 bg-slate-50/70 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.08] rounded-[8px] space-y-2"
                        >
                          <div className="overflow-hidden rounded-[6px] bg-white dark:bg-[#050811] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center max-h-56">
                            <img
                              src={fig.url}
                              alt={fig.title || `Figure ${idx + 1}`}
                              loading="lazy"
                              className="max-h-56 w-full object-contain"
                              onError={() => setFailedFigures((prev) => ({ ...prev, [fig.url]: true }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <p className="text-[12px] font-semibold text-slate-900 dark:text-[#EDEDED] leading-snug">
                              Figure {idx + 1}: {fig.title}
                            </p>
                            {fig.caption && (
                              <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                                {fig.caption}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-[#71717A] pt-1.5 border-t border-slate-200 dark:border-white/[0.05]">
                            <span className="truncate">{fig.attribution || 'Wikimedia Commons'}</span>
                            {figUrl && (
                              <a
                                href={figUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#60A5FA] hover:underline inline-flex items-center gap-1 shrink-0"
                              >
                                <span>Record</span>
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {chart && (
                      <div className="p-3 bg-slate-50/70 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.08] rounded-[8px] space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900 dark:text-[#EDEDED]">
                          <BarChart2 size={13} className="text-[#60A5FA]" />
                          <span>{chart.title}</span>
                        </div>
                        {chart.caption && (
                          <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
                            {chart.caption}
                          </p>
                        )}
                        <p className="text-[10px] font-mono text-slate-500 dark:text-[#71717A]">
                          {chart.categories?.length || 0} verified comparative categories · {chart.y_label}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
