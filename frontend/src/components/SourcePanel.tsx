import React, { useEffect, useRef, useState, useMemo } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { Citation, MessageTelemetry, AuditClaim, ClaimStatus } from '../types';

interface SourcePanelProps {
  onClose: () => void;
  activeQuery?: boolean;
  citations?: Citation[];
  telemetry?: MessageTelemetry;
  selectedCitationId?: number | null;
  onSelectCitation?: (id: number | null) => void;
  isMockActive?: boolean;
}

export default function SourcePanel({
  onClose,
  activeQuery = false,
  citations = [],
  telemetry,
  selectedCitationId = null,
  onSelectCitation,
}: SourcePanelProps) {
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    citations.forEach((c) => map.set(c.id, c));
    return map;
  }, [citations]);

  useEffect(() => {
    if (selectedCitationId !== null && cardRefs.current[selectedCitationId]) {
      cardRefs.current[selectedCitationId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedCitationId]);

  const handleCopyBibtex = (cit: Citation) => {
    const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
    const key = (authorsStr.split(' ')[0] || 'source').replace(/[^a-zA-Z]/g, '') + (cit.year || '2026');
    const bib = `@article{${key},\n  title={${cit.title || 'Untitled'}},\n  author={${authorsStr || 'Unknown'}},\n  journal={${cit.venue || 'Web'}},\n  year={${cit.year || '2026'}}${cit.doi ? `,\n  doi={${cit.doi}}` : ''}${cit.url ? `,\n  url={${cit.url}}` : ''}\n}`;
    navigator.clipboard.writeText(bib);
    setCopiedId(cit.id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  const audit = telemetry?.audit;

  const normalizedClaims: AuditClaim[] = useMemo(() => {
    if (!audit?.claims) return [];
    return audit.claims.map((claim, idx) => {
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
  }, [audit?.claims]);

  const claimsSupportedCount = normalizedClaims.filter((c) => c.status === 'supported').length;
  const claimsTotalCount = normalizedClaims.length;
  const confidenceScore = audit?.confidence ? Math.round(audit.confidence * 100) : 88;

  return (
    <aside className="h-full flex flex-col bg-[#111115] border-l border-white/[0.07] text-[#EDEDED] select-text overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between shrink-0 bg-[#0C0C0F]">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#EDEDED] tracking-[-0.02em] font-mono">
            Sources & Verification
          </h2>
          <span className="text-[11px] font-mono text-[#71717A] tabular-nums">
            ({citations.length})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#18181E] active:scale-[0.98] transition-all cursor-pointer"
          aria-label="Close source panel"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 hud-scroll">
        {!activeQuery && citations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-[#8B8B8E]">
            <p className="text-[14px]">No sources retrieved yet.</p>
            <p className="text-[12px] text-[#71717A] mt-1 font-mono">Submit a query to inspect primary sources.</p>
          </div>
        ) : (
          <>
            {/* Verification Summary Card */}
            <div className="p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[8px] space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] text-[11px] font-mono">
                <span className="text-[#8B8B8E]">Routing Pipeline</span>
                <span className="text-[#60A5FA] font-semibold">Cascade (Tri-Tier Concurrent)</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.05] text-[11px] font-mono">
                <span className="text-[#8B8B8E]">Claim Verification</span>
                <span className="text-[#EDEDED] tabular-nums">
                  {claimsTotalCount > 0 ? `${claimsSupportedCount}/${claimsTotalCount} Verified` : 'Audited'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-[#8B8B8E]">Entailment Confidence</span>
                <span className="text-[#60A5FA] tabular-nums font-semibold">
                  {confidenceScore}%
                </span>
              </div>
            </div>

            {/* Citations List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-mono font-semibold text-[#8B8B8E] uppercase tracking-wider">
                  Retrieved Primary Sources
                </h3>
                <span className="text-[11px] font-mono text-[#71717A] tabular-nums">
                  {citations.length} Sources
                </span>
              </div>

              <div className="space-y-2.5">
                {citations.map((cit) => {
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
                      className={`p-3.5 bg-[#09090B] border rounded-[8px] space-y-2 cursor-pointer transition-all active:scale-[0.99] ${
                        isSelected
                          ? 'border-[#60A5FA] ring-1 ring-[#60A5FA]/20'
                          : 'border-white/[0.07] hover:border-white/[0.15]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-semibold text-[#EDEDED] tabular-nums">
                            § {cit.id + 1}
                          </span>
                          <span
                            className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-[3px] border"
                            style={{
                              color: tierColor,
                              borderColor: `${tierColor}40`,
                              backgroundColor: `${tierColor}15`,
                            }}
                          >
                            {cit.tier || 'LIVE'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyBibtex(cit);
                            }}
                            className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[4px] hover:bg-[#18181E] active:scale-[0.98] transition-all"
                            title="Copy BibTeX"
                          >
                            {copiedId === cit.id ? <Check size={12} className="text-[#60A5FA]" /> : <Copy size={12} />}
                          </button>
                          {targetUrl && (
                            <a
                              href={targetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 text-[#8B8B8E] hover:text-[#60A5FA] rounded-[4px] hover:bg-[#18181E] active:scale-[0.98] transition-all"
                              title="Open Source Link"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>

                      <p className="text-[13px] font-medium text-[#EDEDED] leading-snug">
                        {cit.title || 'Untitled Reference'}
                      </p>

                      <div className="text-[11px] font-mono text-[#71717A] leading-relaxed">
                        {Array.isArray(cit.authors) ? cit.authors.slice(0, 3).join(', ') : cit.authors || 'Unknown'}
                        {cit.year ? ` · ${cit.year}` : ''}
                        {cit.venue ? ` · ${cit.venue}` : ''}
                      </div>

                      {cit.snippet && (
                        <div className="p-2.5 bg-[#111115] border border-white/[0.05] rounded-[6px] text-[11px] font-mono text-[#A1A1AA] leading-relaxed evidence-snippet border-l-2 border-l-[#60A5FA]">
                          {cit.snippet}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Claims Verification List */}
            {normalizedClaims.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-white/[0.07]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[12px] font-mono font-semibold text-[#8B8B8E] uppercase tracking-wider">
                    Claim Entailment
                  </h3>
                  <span className="text-[11px] font-mono text-[#71717A] tabular-nums">
                    {claimsSupportedCount}/{claimsTotalCount}
                  </span>
                </div>

                <div className="space-y-2">
                  {normalizedClaims.map((claim) => (
                    <div
                      key={claim.claim_id}
                      className="p-3 bg-[#09090B] border border-white/[0.07] rounded-[8px] space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] text-[#EDEDED] leading-relaxed">
                          {claim.text}
                        </p>
                        <span
                          className={`text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-[3px] border ${
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
                          <span className="text-[10px] font-mono text-[#71717A]">Cited:</span>
                          {claim.citation_ids.map((cid) => {
                            const cit = citationMap.get(cid);
                            const tierColor = cit?.tier === 'OKF' ? '#60A5FA' : cit?.tier === 'RAG' ? '#A78BFA' : '#F59E0B';
                            return (
                              <button
                                key={cid}
                                type="button"
                                onClick={() => onSelectCitation && onSelectCitation(cid)}
                                className="px-1.5 py-0.2 bg-[#111115] border border-white/[0.07] text-[10px] font-mono rounded-[3px] hover:border-white/[0.18] tabular-nums active:scale-[0.98] transition-all"
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
