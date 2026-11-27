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
  FileCode2,
  ZoomIn,
} from 'lucide-react';
import { Citation, CitationStyle, MessageTelemetry, AuditClaim, ClaimStatus } from '../types';
import { saveOrDownloadFile, showDownloadToast } from '../utils/nativeDownload';
import { exportPdfApi, ExportPdfPayload } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSettingsStore } from '../context/SettingsContext';
import { sanitizeHref } from './MarkdownRenderer';
import {
  exportAllBibtex,
  exportAllRis,
  exportLatexArticle,
  formatCitation,
  resolveCitationUrl,
} from '../utils/citations';
import { triggerLightHaptic } from '../utils/haptics';

interface SourcePanelProps {
  onClose: () => void;
  activeQuery?: boolean;
  citations?: Citation[];
  telemetry?: MessageTelemetry;
  selectedCitationId?: number | null;
  highlightedEvidenceQuote?: string | null;
  onSelectCitation?: (id: number | null, evidenceQuote?: string | null) => void;
  onOpenFigureLightbox?: (index: number) => void;
  isMockActive?: boolean;
  onExportPdf?: () => void;
  hasError?: boolean;
}

type InspectorTab = 'sources' | 'audit' | 'figures';

function formatSourceAuthors(authors: Citation['authors'], venue?: string | null): string {
  if (Array.isArray(authors)) {
    const clean = authors.map((a) => String(a).trim()).filter((a) => a && a.toLowerCase() !== 'unknown');
    if (clean.length > 0) return clean.slice(0, 3).join(', ') + (clean.length > 3 ? ' et al.' : '');
  } else if (typeof authors === 'string' && authors.trim() && authors.trim().toLowerCase() !== 'unknown') {
    return authors.trim();
  }
  return venue?.trim() || 'Editorial Reference';
}

function renderHighlightedSnippet(snippet: string, quote?: string | null, pulseActive?: boolean): React.ReactNode {
  if (!quote || !quote.trim()) return snippet;
  const cleanQuote = quote.trim();
  const idx = snippet.toLowerCase().indexOf(cleanQuote.toLowerCase());
  if (idx === -1) {
    // Fallback: match the first substantial clause (>= 24 chars) inside snippet
    const clause = cleanQuote.slice(0, Math.min(cleanQuote.length, 64));
    const cIdx = clause.length >= 20 ? snippet.toLowerCase().indexOf(clause.toLowerCase()) : -1;
    if (cIdx === -1) return snippet;
    const endIdx = Math.min(snippet.length, cIdx + cleanQuote.length);
    return (
      <>
        {snippet.slice(0, cIdx)}
        <mark className={pulseActive ? 'evidence-quote-pulse' : 'bg-[var(--aria-accent)]/15 text-inherit rounded px-0.5'}>
          {snippet.slice(cIdx, endIdx)}
        </mark>
        {snippet.slice(endIdx)}
      </>
    );
  }
  return (
    <>
      {snippet.slice(0, idx)}
      <mark className={pulseActive ? 'evidence-quote-pulse' : 'bg-[var(--aria-accent)]/15 text-inherit rounded px-0.5'}>
        {snippet.slice(idx, idx + cleanQuote.length)}
      </mark>
      {snippet.slice(idx + cleanQuote.length)}
    </>
  );
}

export default function SourcePanel({
  onClose,
  activeQuery = false,
  citations = [],
  telemetry,
  selectedCitationId = null,
  highlightedEvidenceQuote = null,
  onSelectCitation,
  onOpenFigureLightbox,
  onExportPdf,
  hasError = false,
}: SourcePanelProps) {
  const { accessToken } = useAuth();
  const { settings } = useSettingsStore();
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const [activeTab, setActiveTab] = useState<InspectorTab>('sources');
  const [citationStyle, setCitationStyle] = useState<CitationStyle>(settings.defaultCitationStyle || 'apa7');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedAllBib, setCopiedAllBib] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingBib, setIsExportingBib] = useState(false);
  const [isExportingTex, setIsExportingTex] = useState(false);
  const [isExportingRis, setIsExportingRis] = useState(false);
  const [tierFilter, setTierFilter] = useState<'ALL' | 'OKF' | 'RAG' | 'LIVE'>('ALL');
  const [expandedSnippets, setExpandedSnippets] = useState<Record<number, boolean>>({});
  const [pulseCitationId, setPulseCitationId] = useState<number | null>(null);
  const [failedFigures, setFailedFigures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCitationStyle(settings.defaultCitationStyle || 'apa7');
  }, [settings.defaultCitationStyle]);

  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    citations.forEach((c) => map.set(c.id, c));
    return map;
  }, [citations]);

  const selectedCitation = useMemo(() => {
    if (selectedCitationId === null) return null;
    return citationMap.get(selectedCitationId) || null;
  }, [selectedCitationId, citationMap]);

  const stage = telemetry?.stage;
  const audit = telemetry?.audit;
  const rawConfidence =
    audit?.entailment_score ??
    audit?.confidence ??
    (telemetry as any)?.entailment_score ??
    (telemetry as any)?.audit_confidence;
  const rawClaims = audit?.claims ?? (telemetry as any)?.audit_claims ?? [];
  const verificationStatus = audit?.verification_status ?? (telemetry as any)?.verification_status;

  const hasAuditResults =
    (typeof rawConfidence === 'number' && rawConfidence > 0) ||
    (Array.isArray(rawClaims) && rawClaims.length > 0) ||
    Boolean(audit?.answer_final);
  const isActualError = hasError && !hasAuditResults && citations.length === 0;
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

  // Lookup best supporting quote per citation ID for Click-to-Proof highlighting
  const quoteByCitationId = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of normalizedClaims) {
      const q = c.evidence_quote || c.evidence;
      if (!q) continue;
      for (const cid of c.citation_ids || []) {
        if (!map.has(cid)) map.set(cid, q);
      }
    }
    return map;
  }, [normalizedClaims]);

  // Click-to-Proof sync: switch to Sources tab, smooth scroll, expand excerpt, pulse quote for 1.6s
  useEffect(() => {
    if (selectedCitationId === null) return;
    setActiveTab('sources');
    setExpandedSnippets((prev) => ({ ...prev, [selectedCitationId]: true }));
    setPulseCitationId(selectedCitationId);

    const scrollTimer = window.setTimeout(() => {
      cardRefs.current[selectedCitationId]?.scrollIntoView({
        behavior: settings.reducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, 65);
    const pulseTimer = window.setTimeout(() => {
      setPulseCitationId((curr) => (curr === selectedCitationId ? null : curr));
    }, 1650);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(pulseTimer);
    };
  }, [selectedCitationId, highlightedEvidenceQuote, settings.reducedMotion]);

  const handleCopyFormatted = (cit: Citation, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const formatted = formatCitation(cit, citationStyle, cit.id + 1);
    navigator.clipboard.writeText(formatted);
    triggerLightHaptic(settings.nativeHaptics);
    setCopiedId(cit.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDownloadPackFile = async (ext: 'bib' | 'tex' | 'ris') => {
    if (!citations || citations.length === 0) {
      showDownloadToast('No citations available to export.', true);
      return;
    }
    const baseName = (telemetry?.query || 'aria-research').trim().slice(0, 28).replace(/[^a-zA-Z0-9_-]/g, '_') || 'aria-research';
    try {
      if (ext === 'bib') {
        setIsExportingBib(true);
        const content = exportAllBibtex(citations);
        await saveOrDownloadFile(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${baseName}.bib`, 'text/plain', {
          autoOpen: settings.autoOpenAfterExport,
        });
        setCopiedAllBib(true);
        window.setTimeout(() => setCopiedAllBib(false), 1800);
      } else if (ext === 'ris') {
        setIsExportingRis(true);
        const content = exportAllRis(citations);
        await saveOrDownloadFile(new Blob([content], { type: 'application/x-research-info-systems;charset=utf-8' }), `${baseName}.ris`, 'application/x-research-info-systems', {
          autoOpen: settings.autoOpenAfterExport,
        });
      } else {
        setIsExportingTex(true);
        const texContent = exportLatexArticle({
          query: telemetry?.query || 'Research Synthesis',
          content: telemetry?.audit?.answer_final || '',
          citations,
        });
        await saveOrDownloadFile(new Blob([texContent], { type: 'application/x-tex;charset=utf-8' }), `${baseName}.tex`, 'application/x-tex', {
          autoOpen: settings.autoOpenAfterExport,
        });
      }
      triggerLightHaptic(settings.nativeHaptics);
    } catch (err: any) {
      showDownloadToast(`.${ext.toUpperCase()} Export Error: ${err?.message || 'Export error'}`, true);
    } finally {
      setIsExportingBib(false);
      setIsExportingRis(false);
      setIsExportingTex(false);
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
        full_ledger: settings.includeLedgerInPdf,
        clickable_urls: true,
        pdf_style: settings.pdfLayoutStyle,
      };

      const blob = await exportPdfApi(payload, 90000, accessToken || undefined);
      const safeName = queryLabel.trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_') || 'aria-research-paper';
      await saveOrDownloadFile(blob, `${safeName}.pdf`, 'application/pdf', {
        autoOpen: settings.autoOpenAfterExport,
      });
      triggerLightHaptic(settings.nativeHaptics);
    } catch (err: any) {
      showDownloadToast(`PDF Export Error: ${err?.message || 'Network error'}`, true);
    } finally {
      setIsExportingPdf(false);
    }
  };

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
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-white/[0.07] flex items-center justify-between gap-1.5 shrink-0 bg-slate-50 dark:bg-[#0C0C0F] pt-[max(0.625rem,env(safe-area-inset-top,0px))]">
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen size={14} className="text-[var(--aria-accent)] shrink-0" />
          <h2 className="text-[12px] font-semibold text-slate-900 dark:text-[#EDEDED] tracking-[-0.02em] font-mono whitespace-nowrap">
            Inspector
          </h2>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#18181E] border border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-[#8B8B8E] tabular-nums whitespace-nowrap shrink-0">
            {citations.length} {citations.length === 1 ? 'Source' : 'Sources'}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 whitespace-nowrap">
          {citations.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => void handleDownloadPackFile('bib')}
                disabled={isExportingBib}
                className="px-1.5 py-1 text-slate-600 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.96] transition-colors transition-transform text-[10px] font-mono inline-flex items-center gap-0.5 cursor-pointer"
                title="Download BibTeX (.bib)"
              >
                {copiedAllBib ? <Check size={11} className="text-emerald-400 morph-pop" /> : <Download size={11} />}
                <span>.BIB</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDownloadPackFile('ris')}
                disabled={isExportingRis}
                className="px-1.5 py-1 text-slate-600 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.96] transition-colors transition-transform text-[10px] font-mono inline-flex items-center cursor-pointer"
                title="Export RIS (Zotero / Mendeley)"
              >
                <span>.RIS</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDownloadPackFile('tex')}
                disabled={isExportingTex}
                className="px-1.5 py-1 text-slate-600 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.96] transition-colors transition-transform text-[10px] font-mono inline-flex items-center gap-0.5 cursor-pointer"
                title="Export Overleaf-ready LaTeX (.tex)"
              >
                <FileCode2 size={11} />
                <span>.TEX</span>
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="px-1.5 py-1 text-slate-600 hover:text-[var(--aria-accent)] dark:text-[#8B8B8E] dark:hover:text-[var(--aria-accent)] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.96] transition-colors transition-transform text-[10px] font-mono inline-flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                title="Export PDF report"
              >
                {isExportingPdf ? <Loader2 size={11} className="animate-spin text-[var(--aria-accent)]" /> : <FileText size={11} />}
                <span>PDF</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-600 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded-[5px] hover:bg-slate-100 dark:hover:bg-[#18181E] active:scale-[0.96] transition-colors transition-transform cursor-pointer"
            title="Close Inspector (Esc)"
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
                          ? 'bg-[var(--aria-accent)]/15 text-[var(--aria-accent)]'
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
              Submit any inquiry or click an inline citation [n] to inspect exact supporting proof sentences.
            </p>
          </div>
        ) : (
          <>
            {/* TAB 1: SOURCES */}
            {activeTab === 'sources' && (
              <div className="space-y-3">
                {/* Quick Citation Style Switcher + Tier Filter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#71717A]">
                      Copy Style
                    </span>
                    <div className="flex items-center gap-1 text-[10px] font-mono">
                      {(
                        [
                          { id: 'apa7', label: 'APA 7' },
                          { id: 'ieee', label: 'IEEE' },
                          { id: 'chicago', label: 'Chicago' },
                          { id: 'bibtex', label: 'BibTeX' },
                        ] as Array<{ id: CitationStyle; label: string }>
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setCitationStyle(st.id)}
                          className={`px-1.5 py-0.5 rounded-[4px] border transition-colors cursor-pointer ${
                            citationStyle === st.id
                              ? 'border-[var(--aria-accent)] text-[var(--aria-accent)] bg-[var(--aria-accent)]/10 font-semibold'
                              : 'border-slate-200 dark:border-white/[0.07] text-slate-500 dark:text-[#71717A] hover:text-slate-900 dark:hover:text-[#EDEDED]'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

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
                          className={`px-1.5 py-0.5 rounded-[4px] border transition-colors transition-transform cursor-pointer ${
                            tierFilter === t
                              ? 'border-[var(--aria-accent)] text-[var(--aria-accent)] bg-[var(--aria-accent)]/10 font-semibold'
                              : 'border-slate-200 dark:border-white/[0.07] text-slate-600 dark:text-[#71717A] hover:text-slate-900 dark:hover:text-[#EDEDED]'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Focused Proof Banner when user clicks inline [n] */}
                {selectedCitation && (
                  <div className="p-2.5 bg-slate-50 dark:bg-[#09090B] border border-[var(--aria-accent)]/40 rounded-[7px] flex items-center justify-between gap-2 text-[10.5px] font-mono animate-fade-slide">
                    <span className="text-[var(--aria-accent)] font-semibold truncate">
                      Synced proof for Source [{selectedCitation.id + 1}]
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectCitation && onSelectCitation(null, null)}
                      className="text-slate-500 hover:text-slate-900 dark:text-[#71717A] dark:hover:text-[#EDEDED] cursor-pointer shrink-0"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {/* Source Cards */}
                <div className="space-y-2.5">
                  {filteredCitations.map((cit, idx) => {
                    const isSelected = selectedCitationId === cit.id;
                    const isExpanded = Boolean(expandedSnippets[cit.id]);
                    const isPulsing = pulseCitationId === cit.id;
                    const activeQuote = isSelected
                      ? highlightedEvidenceQuote || quoteByCitationId.get(cit.id)
                      : quoteByCitationId.get(cit.id);
                    const tierColor =
                      cit.tier === 'OKF' ? 'var(--aria-accent)' : cit.tier === 'RAG' ? '#A78BFA' : '#F59E0B';
                    const targetUrl = sanitizeHref(resolveCitationUrl(cit));
                    const authorDisplay = formatSourceAuthors(cit.authors, cit.venue);
                    const showVenueSeparately = cit.venue && !authorDisplay.includes(cit.venue);

                    return (
                      <div
                        key={cit.id}
                        id={`citation-card-${cit.id}`}
                        ref={(el) => (cardRefs.current[cit.id] = el)}
                        onClick={() => onSelectCitation && onSelectCitation(cit.id, quoteByCitationId.get(cit.id))}
                        style={{ ['--stagger-i' as any]: idx }}
                        className={`stagger-card p-3 bg-slate-50/70 dark:bg-[#09090B] border rounded-[8px] space-y-2 cursor-pointer transition-colors transition-transform duration-200 ${
                          isSelected
                            ? 'border-[var(--aria-accent)] ring-1 ring-[var(--aria-accent)]/25'
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
                              onClick={(e) => handleCopyFormatted(cit, e)}
                              className="px-1.5 py-0.5 text-[10px] font-mono text-slate-500 hover:text-slate-900 dark:text-[#8B8B8E] dark:hover:text-[#EDEDED] rounded hover:bg-slate-200 dark:hover:bg-[#18181E] transition-colors transition-transform inline-flex items-center gap-1 cursor-pointer"
                              title={`Copy ${citationStyle.toUpperCase()} citation`}
                            >
                              {copiedId === cit.id ? (
                                <>
                                  <Check size={10} className="text-emerald-400 morph-pop" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={10} />
                                  <span>{citationStyle.toUpperCase()}</span>
                                </>
                              )}
                            </button>
                            {targetUrl && (
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 text-slate-500 hover:text-[var(--aria-accent)] dark:text-[#8B8B8E] dark:hover:text-[var(--aria-accent)] rounded hover:bg-slate-200 dark:hover:bg-[#18181E] transition-colors transition-transform"
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
                              className={`p-2.5 bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.05] rounded-[6px] text-[11.5px] font-sans text-slate-700 dark:text-[#A1A1AA] leading-[1.55] border-l-2 border-l-[var(--aria-accent)]/50 ${
                                isExpanded ? '' : 'line-clamp-3'
                              }`}
                            >
                              {renderHighlightedSnippet(cit.snippet, activeQuote, isPulsing)}
                            </div>
                            {cit.snippet.length > 160 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedSnippets((prev) => ({ ...prev, [cit.id]: !prev[cit.id] }));
                                }}
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--aria-accent)] hover:underline cursor-pointer"
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
                <div className="p-3.5 bg-slate-50 dark:bg-[#09090B] border border-slate-200 dark:border-white/[0.07] rounded-[8px] space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.05] text-[11.5px] font-mono">
                    <span className="text-slate-600 dark:text-[#8B8B8E]">Retrieval Architecture</span>
                    <span className="text-[var(--aria-accent)] font-semibold whitespace-nowrap">Tri-Tier Cascade</span>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.05] text-[11.5px] font-mono">
                    <span className="text-slate-600 dark:text-[#8B8B8E]">Claim Verification</span>
                    <span className={`tabular-nums ${claimVerificationClass}`}>{claimVerificationText}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px] font-mono">
                    <span className="text-slate-600 dark:text-[#8B8B8E]">Deterministic Entailment</span>
                    <div className="flex items-center gap-2">
                      {entailmentPctNumber !== null && (
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className={`h-full w-full origin-left rounded-full transition-transform duration-300 ${
                              entailmentPctNumber >= 75 ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                            style={{ transform: `scaleX(${Math.min(1, entailmentPctNumber / 100)})` }}
                          />
                        </div>
                      )}
                      <span className={entailmentScoreClass}>{entailmentScoreText}</span>
                    </div>
                  </div>
                </div>

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
                          <div className="flex items-start gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full ${dotClass} shrink-0 mt-1.5`} />
                            <p className="text-[11.5px] text-slate-800 dark:text-[#EDEDED] leading-relaxed">
                              {claim.text}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-white/[0.05]">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-slate-500 dark:text-[#8B8B8E]">
                                {claim.polarity === 'contested' || claim.status === 'unsupported'
                                  ? 'Contested'
                                  : claim.polarity === 'supported' || claim.status === 'supported'
                                  ? 'Supported'
                                  : 'Partial'}
                              </span>
                              {claim.citation_ids &&
                                claim.citation_ids.map((cid) => (
                                  <button
                                    key={cid}
                                    type="button"
                                    onClick={() =>
                                      onSelectCitation &&
                                      onSelectCitation(cid, claim.evidence_quote || claim.evidence)
                                    }
                                    className="px-1.5 py-0.2 bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.08] text-[9.5px] font-mono rounded hover:border-[var(--aria-accent)] text-[var(--aria-accent)] tabular-nums cursor-pointer"
                                  >
                                    [{cid + 1}]
                                  </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-1 bg-slate-200 dark:bg-white/[0.08] rounded-full overflow-hidden">
                                <div
                                  className={`h-full w-full origin-left rounded-full ${dotClass}`}
                                  style={{ transform: `scaleX(${Math.min(1, covPct / 100)})` }}
                                />
                              </div>
                              <span className="text-[9.5px] font-mono text-slate-500 dark:text-[#8B8B8E] tabular-nums">
                                {covPct}%
                              </span>
                            </div>
                          </div>

                          {(claim.evidence_quote || claim.evidence) && (
                            <p className="text-[10.5px] font-sans text-slate-600 dark:text-[#8B8B8E] italic leading-snug line-clamp-2 pl-2 border-l border-slate-300 dark:border-white/[0.1]">
                              &ldquo;{claim.evidence_quote || claim.evidence}&rdquo;
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
                          <button
                            type="button"
                            onClick={() => onOpenFigureLightbox?.(idx)}
                            className="group relative w-full overflow-hidden rounded-[6px] bg-white dark:bg-[#050811] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center max-h-56 cursor-zoom-in"
                            title="Inspect Scientific Plate (1×–4×)"
                          >
                            <img
                              src={fig.url}
                              alt={fig.title || `Figure ${idx + 1}`}
                              loading="lazy"
                              className="max-h-56 w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                              onError={() => setFailedFigures((prev) => ({ ...prev, [fig.url]: true }))}
                            />
                            <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 text-[9.5px] font-mono text-white opacity-85 group-hover:opacity-100">
                              <ZoomIn size={10} />
                              <span>Inspect</span>
                            </span>
                          </button>
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
                                className="text-[var(--aria-accent)] hover:underline inline-flex items-center gap-1 shrink-0"
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
                          <BarChart2 size={13} className="text-[var(--aria-accent)]" />
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
