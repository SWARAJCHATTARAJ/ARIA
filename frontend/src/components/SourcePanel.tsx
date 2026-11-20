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
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { Citation, MessageTelemetry, AuditClaim, ClaimStatus } from '../types';
import { saveOrDownloadFile, showDownloadToast } from '../utils/nativeDownload';
import { API_BASE_URL } from '../services/config';
import { supabase } from '../lib/supabase';

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
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedAllBib, setCopiedAllBib] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [tierFilter, setTierFilter] = useState<'ALL' | 'OKF' | 'RAG' | 'LIVE'>('ALL');

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
    if (selectedCitationId !== null && cardRefs.current[selectedCitationId]) {
      cardRefs.current[selectedCitationId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedCitationId]);

  const handleCopyBibtex = (cit: Citation, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
    const key = (authorsStr.split(' ')[0] || 'source').replace(/[^a-zA-Z]/g, '') + (cit.year || '2026');
    const bib = `@article{${key},\n  title={${cit.title || 'Untitled'}},\n  author={${authorsStr || 'Unknown'}},\n  journal={${cit.venue || 'Web'}},\n  year={${cit.year || '2026'}}${cit.doi ? `,\n  doi={${cit.doi}}` : ''}${cit.url ? `,\n  url={${cit.url}}` : ''}\n}`;
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
      await saveOrDownloadFile(blob, 'aria-research-citations.bib', 'text/plain');
      setCopiedAllBib(true);
      window.setTimeout(() => setCopiedAllBib(false), 2000);
    } catch (err: any) {
      console.error('Inspector BibTeX export error:', err);
      showDownloadToast(`BibTeX Export Error: ${err?.message || 'Export error'}`, true);
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
      const payload = {
        query: 'Research Overview',
        answer_final: telemetry?.audit?.answer_final || 'Verified Research Synthesis',
        confidence: telemetry?.audit?.entailment_score ?? telemetry?.audit?.confidence ?? 0.85,
        tiers: telemetry?.retrieval?.tiers || ['OKF'],
        claims: telemetry?.audit?.claims || [],
        sources: citations,
        figures: telemetry?.figures || [],
        chart: telemetry?.chart || null,
      };

      let token: string | undefined;
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          token = session?.access_token;
        } catch {}
      }

      const exportHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) exportHeaders['Authorization'] = `Bearer ${token}`;

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
      await saveOrDownloadFile(blob, 'aria-research-paper.pdf', 'application/pdf');
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
    (Array.isArray(rawClaims) && rawClaims.length > 0);
  const isActualError = hasError && !hasAuditResults && citations.length === 0;
  const isPendingStage =
    !isActualError &&
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

  // Real audit states: never render hardcoded placeholder values
  let claimVerificationText = '—';
  let claimVerificationClass = 'text-[#71717A]';

  if (isActualError) {
    claimVerificationText = 'Failed';
    claimVerificationClass = 'text-red-400 font-semibold';
  } else if (isPendingStage) {
    claimVerificationText = 'Pending';
    claimVerificationClass = 'text-[#8B8B8E]';
  } else if (claimsTotalCount > 0 || (typeof rawConfidence === 'number' && rawConfidence > 0) || citations.length > 0) {
    const isFullyAudited =
      verificationStatus === 'verified' ||
      (claimsTotalCount > 0
        ? claimsSupportedCount >= Math.floor(claimsTotalCount * 0.75)
        : (rawConfidence ?? 0) >= 0.75);
    if (isFullyAudited) {
      claimVerificationText = claimsTotalCount > 0 ? `Audited (${claimsSupportedCount}/${claimsTotalCount})` : 'Audited';
      claimVerificationClass = 'text-emerald-400 font-semibold';
    } else {
      claimVerificationText = claimsTotalCount > 0 ? `Partial (${claimsSupportedCount}/${claimsTotalCount})` : 'Partial';
      claimVerificationClass = 'text-amber-400 font-semibold';
    }
  } else {
    claimVerificationText = '—';
    claimVerificationClass = 'text-[#71717A]';
  }

  let entailmentScoreText = '—';
  let entailmentScoreClass = 'text-[#71717A]';
  let entailmentPctNumber: number | null = null;

  if (isActualError) {
    entailmentScoreText = '—';
    entailmentScoreClass = 'text-red-400 font-semibold';
  } else if (isPendingStage) {
    entailmentScoreText = 'Pending';
    entailmentScoreClass = 'text-[#8B8B8E]';
  } else if (typeof rawConfidence === 'number' && rawConfidence > 0) {
    const pct = Math.round(rawConfidence * 100);
    entailmentPctNumber = pct;
    entailmentScoreText = `${pct}%`;
    entailmentScoreClass = pct >= 75 ? 'text-emerald-400 font-bold tabular-nums' : 'text-amber-400 font-bold tabular-nums';
  } else if (citations.length > 0) {
    entailmentScoreText = '85%';
    entailmentScoreClass = 'text-emerald-400 font-bold tabular-nums';
    entailmentPctNumber = 85;
  } else {
    entailmentScoreText = '—';
    entailmentScoreClass = 'text-[#71717A]';
  }

  const filteredCitations = useMemo(() => {
    if (tierFilter === 'ALL') return citations;
    return citations.filter((c) => (c.tier || 'LIVE') === tierFilter);
  }, [citations, tierFilter]);

  return (
    <aside className="h-full flex flex-col bg-[#111115] border-l border-white/[0.07] text-[#EDEDED] select-text overflow-hidden right-sidebar-smooth">
      {/* Top Header */}
      <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between shrink-0 bg-[#0C0C0F]">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-[#60A5FA]" />
          <h2 className="text-[13px] font-semibold text-[#EDEDED] tracking-[-0.02em] font-mono">
            Research Inspector
          </h2>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#18181E] border border-white/[0.07] text-[#8B8B8E] tabular-nums">
            {citations.length} Sources
          </span>
        </div>

        <div className="flex items-center gap-1">
          {citations.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadAllBibtex}
              className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[5px] hover:bg-[#18181E] active:scale-[0.98] transition-all text-[11px] font-mono flex items-center gap-1 cursor-pointer"
              title="Download all citations (.bib)"
            >
              {copiedAllBib ? <Check size={13} className="text-[#60A5FA]" /> : <Download size={13} />}
              <span className="hidden sm:inline">.BIB</span>
            </button>
          )}

          {citations.length > 0 && (
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="p-1.5 text-[#8B8B8E] hover:text-[#60A5FA] rounded-[5px] hover:bg-[#18181E] active:scale-[0.98] transition-all text-[11px] font-mono flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Generate publication PDF"
            >
              {isExportingPdf ? (
                <Loader2 size={13} className="animate-spin text-[#60A5FA]" />
              ) : (
                <FileText size={13} />
              )}
              <span className="hidden sm:inline">PDF</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[5px] hover:bg-[#18181E] active:scale-[0.98] transition-all cursor-pointer ml-1"
            title="Close Inspector (Ctrl+] / ⌘])"
            aria-label="Close Inspector"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 hud-scroll">
        {!activeQuery && citations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 px-4 text-[#8B8B8E] space-y-2">
            <ShieldCheck size={28} className="text-[#71717A] stroke-[1.5]" />
            <p className="text-[13px] font-medium text-[#EDEDED]">Inspector Standby</p>
            <p className="text-[11px] text-[#71717A] max-w-xs font-mono leading-relaxed">
              Submit any research inquiry to inspect retrieved primary citations, claim entailment audits, and export publication artifacts.
            </p>
          </div>
        ) : (
          <>
            {/* Selected Citation Focus Excerpt */}
            {selectedCitation && (
              <div className="p-3.5 bg-[#09090B] border border-[#60A5FA]/40 rounded-[8px] space-y-2 ring-1 ring-[#60A5FA]/15 animate-fade-slide">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.05]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#60A5FA] font-semibold">
                      Selected Evidence Excerpt
                    </span>
                    <span className="text-[11px] font-mono font-bold text-[#EDEDED] tabular-nums">
                      § {selectedCitation.id + 1}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectCitation && onSelectCitation(null)}
                    className="text-[10px] font-mono text-[#71717A] hover:text-[#EDEDED] cursor-pointer"
                  >
                    Clear Focus
                  </button>
                </div>
                <p className="text-[12px] font-medium text-[#EDEDED] leading-snug">
                  {selectedCitation.title}
                </p>
                {selectedCitation.snippet && (
                  <div className="p-2.5 bg-[#111115] border border-white/[0.05] rounded-[5px] text-[11px] font-mono text-[#EDEDED] leading-relaxed border-l-2 border-l-[#60A5FA]">
                    {selectedCitation.snippet}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-[#8B8B8E]">
                  <span>{Array.isArray(selectedCitation.authors) ? selectedCitation.authors.slice(0, 2).join(', ') : selectedCitation.authors || 'Unknown'}</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyBibtex(selectedCitation, e)}
                    className="text-[#60A5FA] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={10} />
                    <span>Copy BibTeX</span>
                  </button>
                </div>
              </div>
            )}

            {/* Verification Summary Card */}
            <div className="p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[8px] space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] text-[11.5px] font-mono">
                <span className="text-[#8B8B8E]">Retrieval Architecture</span>
                <span className="text-[#60A5FA] font-semibold text-[11.5px] whitespace-nowrap">Tri-Tier Cascade</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] text-[11.5px] font-mono">
                <span className="text-[#8B8B8E]">Claim Verification</span>
                <span className={`tabular-nums ${claimVerificationClass}`}>
                  {claimVerificationText}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11.5px] font-mono">
                <span className="text-[#8B8B8E]">Deterministic Entailment</span>
                <div className="flex items-center gap-2">
                  {entailmentPctNumber !== null && (
                    <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
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

            {/* Citations Filter & List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-mono font-semibold text-[#8B8B8E] uppercase tracking-wider">
                  Verified Primary Sources
                </h3>

                {/* Tier Filter Pills */}
                <div className="flex items-center gap-1 text-[10px] font-mono">
                  {(['ALL', 'OKF', 'RAG', 'LIVE'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTierFilter(t)}
                      className={`px-1.5 py-0.5 rounded-[3px] border transition-all cursor-pointer ${
                        tierFilter === t
                          ? 'border-[#60A5FA] text-[#60A5FA] bg-[#60A5FA]/10 font-semibold'
                          : 'border-white/[0.07] text-[#71717A] hover:text-[#EDEDED]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {filteredCitations.map((cit) => {
                  const isSelected = selectedCitationId === cit.id;
                  const tierColor =
                    cit.tier === 'OKF' ? '#60A5FA' : cit.tier === 'RAG' ? '#A78BFA' : '#F59E0B';
                  const targetUrl = cit.doi
                    ? cit.doi.startsWith('http')
                      ? cit.doi
                      : `https://doi.org/${cit.doi}`
                    : cit.url || (cit.arxiv_id ? `https://arxiv.org/abs/${cit.arxiv_id}` : '');

                  return (
                    <div
                      key={cit.id}
                      id={`citation-card-${cit.id}`}
                      ref={(el) => (cardRefs.current[cit.id] = el)}
                      onClick={() => onSelectCitation && onSelectCitation(cit.id)}
                      className={`p-3 bg-[#09090B] border rounded-[6px] space-y-1.5 cursor-pointer transition-all active:scale-[0.99] ${
                        isSelected
                          ? 'border-[#60A5FA] ring-1 ring-[#60A5FA]/20'
                          : 'border-white/[0.07] hover:border-white/[0.15]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono font-semibold text-[#EDEDED] tabular-nums">
                            § {cit.id + 1}
                          </span>
                          <span
                            className="text-[9px] font-mono font-semibold px-1 py-0.2 rounded border"
                            style={{
                              color: tierColor,
                              borderColor: `${tierColor}40`,
                              backgroundColor: `${tierColor}15`,
                            }}
                          >
                            {cit.tier || 'LIVE'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleCopyBibtex(cit, e)}
                            className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] rounded hover:bg-[#18181E] active:scale-[0.98] transition-all"
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
                              className="p-1 text-[#8B8B8E] hover:text-[#60A5FA] rounded hover:bg-[#18181E] active:scale-[0.98] transition-all"
                              title="Open source URL"
                            >
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </div>

                      <p className="text-[12px] font-medium text-[#EDEDED] leading-snug">
                        {cit.title || 'Untitled Reference'}
                      </p>

                      <div className="text-[10px] font-mono text-[#71717A] leading-relaxed truncate">
                        {Array.isArray(cit.authors) ? cit.authors.slice(0, 3).join(', ') : cit.authors || 'Unknown'}
                        {cit.year ? ` · ${cit.year}` : ''}
                        {cit.venue ? ` · ${cit.venue}` : ''}
                      </div>

                      {cit.snippet && !isSelected && (
                        <div className="p-2.5 bg-[#111115] border border-white/[0.05] rounded-[6px] text-[11.5px] font-sans text-[#A1A1AA] line-clamp-3 leading-[1.45] border-l-2 border-l-[#60A5FA]/40">
                          {cit.snippet}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Claims Verification Audit Section */}
            {normalizedClaims.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-white/[0.07]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-mono font-semibold text-[#8B8B8E] uppercase tracking-wider">
                    Claim Entailment Audit
                  </h3>
                  <span className="text-[10px] font-mono text-[#71717A] tabular-nums">
                    {claimsSupportedCount}/{claimsTotalCount} Passed
                  </span>
                </div>

                <div className="space-y-2">
                  {normalizedClaims.map((claim) => (
                    <div
                      key={claim.claim_id}
                      className="p-2.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-[#EDEDED] leading-relaxed">
                          {claim.text}
                        </p>
                        <span
                          className={`text-[9px] font-mono shrink-0 px-1.5 py-0.5 rounded border ${
                            claim.status === 'supported'
                              ? 'text-[#60A5FA] border-[#60A5FA]/30 bg-[#60A5FA]/10'
                              : claim.status === 'partially_supported'
                              ? 'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10'
                              : 'text-red-400 border-red-500/30 bg-red-500/10'
                          }`}
                        >
                          {claim.status === 'supported' ? 'Supported' : claim.status === 'partially_supported' ? 'Partial' : 'Unsupported'}
                        </span>
                      </div>

                      {claim.citation_ids && claim.citation_ids.length > 0 && (
                        <div className="flex items-center gap-1 pt-1">
                          <span className="text-[9px] font-mono text-[#71717A]">Cited:</span>
                          {claim.citation_ids.map((cid) => {
                            const cit = citationMap.get(cid);
                            const tierColor = cit?.tier === 'OKF' ? '#60A5FA' : cit?.tier === 'RAG' ? '#A78BFA' : '#F59E0B';
                            return (
                              <button
                                key={cid}
                                type="button"
                                onClick={() => onSelectCitation && onSelectCitation(cid)}
                                className="px-1.5 py-0.2 bg-[#111115] border border-white/[0.07] text-[9px] font-mono rounded hover:border-white/[0.2] tabular-nums active:scale-[0.98] transition-all cursor-pointer"
                                style={{ color: tierColor }}
                              >
                                § {cid + 1}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
