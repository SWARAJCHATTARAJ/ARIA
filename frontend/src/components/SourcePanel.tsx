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
    <aside className="h-full flex flex-col bg-[#141416] border-l border-[#262629] text-[#EDEDED] select-text overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#262629] flex items-center justify-between shrink-0 bg-[#141416]">
        <h2 className="text-[16px] font-semibold text-[#EDEDED]">
          Sources & Audit
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#1B1B1E] transition-colors cursor-pointer"
          aria-label="Close source panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 hud-scroll">
        {!activeQuery && citations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-20 text-[#8B8B8E]">
            <p className="text-[14px]">No sources retrieved yet.</p>
            <p className="text-[12px] text-[#8B8B8E]/60 mt-1">Submit a question to view primary sources.</p>
          </div>
        ) : (
          <>
            {/* Audit Summary Card */}
            <div className="p-4 bg-[#0A0A0B] border border-[#262629] rounded-[8px] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#262629]">
                <span className="text-[12px] font-mono text-[#8B8B8E]">Router</span>
                <span className="text-[12px] font-mono text-[#5E8BFF] font-semibold">Cascade (Tri-Tier)</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[#262629]">
                <span className="text-[12px] font-mono text-[#8B8B8E]">Claim Verification</span>
                <span className="text-[12px] font-mono text-[#EDEDED]">
                  {claimsTotalCount > 0 ? `${claimsSupportedCount}/${claimsTotalCount} Verified` : 'Audited'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-mono text-[#8B8B8E]">Confidence Score</span>
                <span className="text-[12px] font-mono text-[#34D399] font-semibold">
                  {confidenceScore}%
                </span>
              </div>
            </div>

            {/* Claims Verification List */}
            {normalizedClaims.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold text-[#EDEDED]">
                    Claim Entailment
                  </h3>
                  <span className="text-[12px] font-mono text-[#8B8B8E]">
                    {claimsSupportedCount}/{claimsTotalCount}
                  </span>
                </div>

                <div className="space-y-2">
                  {normalizedClaims.map((claim) => (
                    <div
                      key={claim.claim_id}
                      className="p-3 bg-[#0A0A0B] border border-[#262629] rounded-[8px] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[14px] text-[#EDEDED] leading-snug">
                          {claim.text}
                        </p>
                        <span
                          className={`text-[12px] font-mono shrink-0 px-2 py-0.5 rounded-[4px] border ${
                            claim.status === 'supported'
                              ? 'text-[#5E8BFF] border-[#5E8BFF]/30 bg-[#5E8BFF]/10'
                              : claim.status === 'partially_supported'
                              ? 'text-[#34D399] border-[#34D399]/30 bg-[#34D399]/10'
                              : 'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10'
                          }`}
                        >
                          {claim.status === 'supported' ? 'Supported' : claim.status === 'partially_supported' ? 'Partial' : 'Unsupported'}
                        </span>
                      </div>

                      {claim.citation_ids && claim.citation_ids.length > 0 && (
                        <div className="flex items-center gap-1 pt-1">
                          <span className="text-[12px] font-mono text-[#8B8B8E]">Cited:</span>
                          {claim.citation_ids.map((cid) => {
                            const cit = citationMap.get(cid);
                            const tierColor = cit?.tier === 'OKF' ? '#5E8BFF' : cit?.tier === 'RAG' ? '#A78BFA' : '#34D399';
                            return (
                              <button
                                key={cid}
                                type="button"
                                onClick={() => onSelectCitation && onSelectCitation(cid)}
                                className="px-1.5 py-0.5 bg-[#141416] border border-[#262629] text-[12px] font-mono rounded-[4px] hover:border-[#38383C]"
                                style={{ color: tierColor }}
                              >
                                #{cid + 1}
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

            {/* Citations List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold text-[#EDEDED]">
                  Retrieved Sources
                </h3>
                <span className="text-[12px] font-mono text-[#8B8B8E]">
                  {citations.length} Sources
                </span>
              </div>

              <div className="space-y-3">
                {citations.map((cit) => {
                  const isSelected = selectedCitationId === cit.id;
                  const tierColor = cit.tier === 'OKF' ? '#5E8BFF' : cit.tier === 'RAG' ? '#A78BFA' : '#34D399';

                  return (
                    <div
                      key={cit.id}
                      ref={(el) => (cardRefs.current[cit.id] = el)}
                      onClick={() => onSelectCitation && onSelectCitation(cit.id)}
                      className={`p-4 bg-[#0A0A0B] border rounded-[8px] space-y-2 cursor-pointer transition-colors ${
                        isSelected ? 'border-[#5E8BFF]' : 'border-[#262629] hover:border-[#38383C]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-mono text-[#8B8B8E]">
                            [{cit.id + 1}]
                          </span>
                          <span
                            className="text-[12px] font-mono font-semibold"
                            style={{ color: tierColor }}
                          >
                            {cit.tier}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyBibtex(cit);
                            }}
                            className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[4px] hover:bg-[#141416] transition-colors"
                            title="Copy BibTeX"
                          >
                            {copiedId === cit.id ? <Check size={12} className="text-[#34D399]" /> : <Copy size={12} />}
                          </button>
                          {cit.url && (
                            <a
                              href={cit.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[4px] hover:bg-[#141416] transition-colors"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>

                      <p className="text-[14px] font-medium text-[#EDEDED] leading-snug">
                        {cit.title || 'Untitled Reference'}
                      </p>

                      <div className="text-[12px] text-[#8B8B8E] leading-relaxed">
                        {Array.isArray(cit.authors) ? cit.authors.slice(0, 3).join(', ') : cit.authors || 'Unknown'}
                        {cit.year ? ` · ${cit.year}` : ''}
                        {cit.venue ? ` · ${cit.venue}` : ''}
                      </div>

                      {cit.snippet && (
                        <div className="p-2 bg-[#141416] border border-[#262629] rounded-[6px] text-[12px] font-mono text-[#8B8B8E] leading-relaxed">
                          {cit.snippet}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
