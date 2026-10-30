import React, { useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, Globe, Activity, ExternalLink, Copy, Check, ShieldAlert, HelpCircle } from 'lucide-react';
import ConfidenceDial from './ConfidenceDial';
import RetrievalVisuals from './RetrievalVisuals';
import { Citation, MessageTelemetry, AuditClaim, ClaimStatus } from '../types';
import { getTierGlyph, getTierColorClass } from './MarkdownRenderer';
import { getMotionScale } from '../utils/motion';

interface SourcePanelProps {
  onClose: () => void;
  activeQuery?: boolean;
  citations?: Citation[];
  telemetry?: MessageTelemetry;
  selectedCitationId?: number | null;
  onSelectCitation?: (id: number | null) => void;
  isMockActive?: boolean;
}

function cutAtSentence(text: string, maxLen = 220): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  const sub = text.slice(0, maxLen);
  const lastPunct = Math.max(sub.lastIndexOf('. '), sub.lastIndexOf('? '), sub.lastIndexOf('! '));
  if (lastPunct > 60) {
    return sub.slice(0, lastPunct + 1) + ' …';
  }
  return sub.trim() + ' …';
}

function getReviewBadge(status?: string) {
  switch (status) {
    case 'verified':
      return (
        <span className="text-[9px] font-mono text-tier-okf border border-tier-okf/40 px-1.5 py-0.5 bg-tier-okf/10 flex items-center gap-1">
          <CheckCircle2 size={10} /> VERIFIED
        </span>
      );
    case 'scholarly':
      return (
        <span className="text-[9px] font-mono text-sky-400 border border-sky-500/40 px-1.5 py-0.5 bg-sky-500/10">
          SCHOLARLY
        </span>
      );
    case 'preprint':
      return (
        <span className="text-[9px] font-mono text-purple-400 border border-purple-500/40 px-1.5 py-0.5 bg-purple-500/10">
          PREPRINT
        </span>
      );
    case 'draft':
      return (
        <span className="text-[9px] font-mono text-tier-rag border border-tier-rag/40 px-1.5 py-0.5 bg-tier-rag/10">
          DRAFT NOTE
        </span>
      );
    case 'unreviewed_web':
    default:
      return (
        <span className="text-[9px] font-mono text-tier-live border border-tier-live/40 px-1.5 py-0.5 bg-tier-live/10">
          UNREVIEWED WEB
        </span>
      );
  }
}

function getClaimStatusBadge(status: ClaimStatus) {
  switch (status) {
    case 'supported':
      return (
        <span className="text-[9px] font-mono text-tier-okf bg-tier-okf/10 border border-tier-okf/30 px-1.5 py-0.5 shrink-0 flex items-center gap-1">
          <CheckCircle2 size={10} /> Supported
        </span>
      );
    case 'partially_supported':
      return (
        <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/40 px-1.5 py-0.5 shrink-0 flex items-center gap-1">
          <AlertTriangle size={10} /> Partial
        </span>
      );
    case 'unsupported':
      return (
        <span className="text-[9px] font-mono text-warning bg-warning/15 border border-warning/50 px-1.5 py-0.5 shrink-0 flex items-center gap-1 font-bold">
          <ShieldAlert size={10} /> Unsupported
        </span>
      );
    case 'audit_incomplete':
      return (
        <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/40 px-1.5 py-0.5 shrink-0 flex items-center gap-1">
          <HelpCircle size={10} /> could not be checked
        </span>
      );
    case 'uncited':
    default:
      return (
        <span className="text-[9px] font-mono text-gray-400 bg-gray-500/10 border border-gray-500/30 px-1.5 py-0.5 shrink-0 flex items-center gap-1">
          <HelpCircle size={10} /> Uncited
        </span>
      );
  }
}

function getClaimNoteClass(status: ClaimStatus): string {
  switch (status) {
    case 'supported':
      return 'text-emerald-300/90 border-l border-emerald-500/40';
    case 'partially_supported':
    case 'audit_incomplete':
      return 'text-amber-300/90 border-l border-amber-500/40';
    case 'unsupported':
    case 'uncited':
    default:
      return 'text-rose-300/90 border-l border-rose-500/40';
  }
}

export default function SourcePanel({
  onClose,
  activeQuery = false,
  citations = [],
  telemetry,
  selectedCitationId = null,
  onSelectCitation,
  isMockActive = false,
}: SourcePanelProps) {
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [copiedId, setCopiedId] = React.useState<number | null>(null);

  // Citation map for quick lookup
  const citationMap = React.useMemo(() => {
    const map = new Map<number, Citation>();
    citations.forEach((c) => map.set(c.id, c));
    return map;
  }, [citations]);

  // Scroll to selected citation card and flash evidence passage
  useEffect(() => {
    if (selectedCitationId !== null && cardRefs.current[selectedCitationId]) {
      const card = cardRefs.current[selectedCitationId];
      card?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
      const ev = card?.querySelector('.evidence-snippet');
      if (ev) {
        ev.classList.remove('flash-evidence');
        void (ev as HTMLElement).offsetWidth;
        ev.classList.add('flash-evidence');
      }
    }
  }, [selectedCitationId]);

  const handleCopyBibtex = (cit: Citation) => {
    const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
    const key = (authorsStr.split(' ')[0] || 'source').replace(/[^a-zA-Z]/g, '') + (cit.year || '2026');
    const bib = `@article{${key},\n  title={${cit.title || 'Untitled'}},\n  author={${authorsStr || 'Unknown'}},\n  journal={${cit.venue || 'Web'}},\n  year={${cit.year || '2026'}}${cit.doi ? `,\n  doi={${cit.doi}}` : ''}${cit.url ? `,\n  url={${cit.url}}` : ''}\n}`;
    navigator.clipboard.writeText(bib);
    setCopiedId(cit.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const route = telemetry?.route;
  const audit = telemetry?.audit;

  // Normalized audit claims
  const normalizedClaims: AuditClaim[] = React.useMemo(() => {
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
  const unsupportedShare = claimsTotalCount > 0 ? (claimsTotalCount - claimsSupportedCount) / claimsTotalCount : 0;
  const confidenceScore = audit?.confidence ?? 0.85;

  return (
    <div className="h-full flex flex-col bg-ink-surface/95 backdrop-blur-md border-l border-ink-surface select-text overflow-hidden">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-ink-surface flex justify-between items-center bg-ink-surface shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-none bg-tier-okf" />
          <h3 className="font-mono text-xs uppercase tracking-wider text-ink-muted">Sources and audit</h3>
          {isMockActive && (
            <span className="font-mono text-[9px] px-1.5 py-0.2 uppercase tracking-wider bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold flex items-center gap-1">
              <AlertTriangle size={10} /> MOCK DATA
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-ink-muted hover:text-white transition-colors p-1 rounded-none hover:bg-ink-base/50"
          aria-label="Close sources panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 hud-scroll">
        {!activeQuery && citations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-2 opacity-60 py-20">
            <div className="font-mono text-xs text-ink-muted">No sources retrieved yet.</div>
          </div>
        ) : (
          <>
            {/* Retrieval Visuals (Compact, in Sources panel header) */}
            <RetrievalVisuals
              okfNodePaths={telemetry?.retrieval?.okf_node_paths}
              ragScores={telemetry?.retrieval?.rag_scores}
              sources={telemetry?.retrieval?.sources}
              citations={citations}
              onHighlightSource={(pathOrId) => {
                const cardEl = Object.values(cardRefs.current).find((el) => el?.textContent?.includes(String(pathOrId)));
                if (cardEl) {
                  cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  cardEl.animate([
                    { borderColor: '#5B8DB8', backgroundColor: 'rgba(91,141,184,0.25)' },
                    { borderColor: '', backgroundColor: '' }
                  ], { duration: 800 * getMotionScale(), easing: 'cubic-bezier(.2,.8,.2,1)' });
                }
              }}
            />

            {/* Route & Dial Trace */}
            <div className="space-y-2">
              <div className="text-[10px] font-mono text-ink-muted uppercase tracking-wider">
                Verification & Confidence
              </div>
              <div className="bg-ink-base rounded-none p-3 font-mono text-xs space-y-2.5 border border-ink-surface relative">
                {/* Corner Accents */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-tier-okf" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-tier-okf" />

                {/* Route display */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Router:</span>
                  <span className="px-1.5 py-0.5 bg-ink-surface text-tier-okf font-bold text-[10px]">
                    Cascade
                  </span>
                </div>

                {/* Confidence Dial with Overshoot & Claims Count (starts only after audit) */}
                <div className="flex justify-between items-center pt-2 border-t border-ink-surface/50">
                  <span className="text-gray-400">Confidence:</span>
                  <ConfidenceDial
                    confidence={confidenceScore}
                    tierAgreement={audit?.tier_agreement}
                    claimsSupported={claimsSupportedCount}
                    claimsTotal={claimsTotalCount}
                    unsupportedShare={unsupportedShare}
                    size="sm"
                    isAudited={Boolean(audit)}
                  />
                </div>
              </div>
            </div>

            {/* Audit Claims Section with Consistent Citation Numbering */}
            {normalizedClaims.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono text-ink-muted uppercase tracking-wider">
                    Claim Audit ({claimsSupportedCount}/{claimsTotalCount} Verified)
                  </div>
                </div>

                <div className="space-y-2">
                  {normalizedClaims.map((claim, idx) => (
                    <div
                      key={claim.claim_id}
                      className={`p-2.5 bg-ink-base border text-xs font-sans rounded-none transition-colors animate-stagger ${
                        claim.status === 'unsupported'
                          ? 'border-warning/50 bg-warning/5'
                          : claim.status === 'partially_supported' || claim.status === 'audit_incomplete'
                          ? 'border-amber-500/40 bg-amber-500/5'
                          : 'border-ink-surface/70'
                      }`}
                      style={{ animationDelay: `${Math.min(idx * 70, 350)}ms` }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="text-[11px] text-gray-200 leading-snug">
                          {claim.text}
                        </span>
                        {getClaimStatusBadge(claim.status)}
                      </div>

                      {/* Display Cited Sources with Consistent Numbering matching answer pills */}
                      {claim.citation_ids && claim.citation_ids.length > 0 && (
                        <div className="flex items-center gap-1 my-1.5">
                          <span className="text-[9px] font-mono text-ink-muted">Cited:</span>
                          {claim.citation_ids.map((cid) => {
                            const cit = citationMap.get(cid);
                            const glyph = getTierGlyph(cit?.tier);
                            const colorClass = getTierColorClass(cit?.tier);
                            return (
                              <button
                                key={cid}
                                type="button"
                                onClick={() => onSelectCitation && onSelectCitation(cid)}
                                className={`font-mono text-[9px] px-1 py-0.2 border rounded-none font-bold inline-flex items-center gap-0.5 ${colorClass}`}
                                title={cit?.title || `Citation #${cid + 1}`}
                              >
                                <span>{glyph}</span>
                                <span>{cid + 1}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {claim.evidence && (
                        <div className="text-[10px] font-mono text-ink-muted pl-2 border-l border-ink-surface mt-1.5 leading-tight">
                          Evidence: {claim.evidence}
                        </div>
                      )}
                      {claim.note && (
                        <div className={`text-[10px] font-mono pl-2 mt-1 transition-colors ${getClaimNoteClass(claim.status)}`}>
                          Note: {claim.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Citation Index: 12px clipped top-right corner, 1px border, mono metadata */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono text-ink-muted uppercase tracking-wider">
                  Citation Index ({citations.length})
                </div>
                {audit?.retractions && audit.retractions.length > 0 && (
                  <span className="text-[9px] font-mono text-warning flex items-center gap-1 font-bold">
                    <AlertTriangle size={10} /> {audit.retractions.length} Retracted
                  </span>
                )}
              </div>

              {citations.length === 0 ? (
                <div className="p-4 bg-ink-base border border-dashed border-ink-surface text-center text-xs font-mono text-ink-muted">
                  Retrieving verified sources...
                </div>
              ) : (
                citations.map((cit, idx) => {
                  const isSelected = selectedCitationId === cit.id;
                  const glyph = getTierGlyph(cit.tier);
                  const colorClass = getTierColorClass(cit.tier);
                  const snippetText = cutAtSentence(cit.snippet || '');

                  const cardBorder = cit.is_retracted
                    ? 'border-warning/80 bg-warning/5'
                    : isSelected
                    ? 'border-gray-300 ring-1 ring-gray-300 bg-ink-base'
                    : 'border-ink-surface hover:border-gray-600 bg-ink-base';

                  return (
                    <div
                      key={cit.id}
                      id={`citation-card-${cit.id}`}
                      ref={(el) => (cardRefs.current[cit.id] = el)}
                      onClick={() => onSelectCitation && onSelectCitation(cit.id)}
                      className={`p-3 border rounded-none relative transition-all cursor-pointer clipped-source-card animate-stagger ${cardBorder}`}
                      style={{ animationDelay: `${Math.min(idx * 70, 350)}ms` }}
                    >
                      {/* 1. Mono Metadata Line with 13px mono metadata type scale */}
                      <div className="font-mono text-[13px] text-ink-muted flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`px-1 py-0.2 border rounded-none font-bold inline-flex items-center gap-0.5 ${colorClass}`}>
                            <span>{glyph}</span>
                            <span>{cit.id + 1}</span>
                          </span>
                          <span className="text-gray-400 truncate">
                            {cit.venue || cit.path || cit.source_type || 'Academic Source'}
                          </span>
                          {cit.year && <span className="shrink-0">({cit.year})</span>}
                        </div>
                        <span className="text-[11px] text-ink-muted shrink-0 font-mono">
                          {cit.tier || 'LIVE'}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 className="text-xs font-sans font-medium text-gray-100 mb-1 leading-snug">
                        {cit.title || 'Untitled Document'}
                      </h4>

                      {/* Thin Rule */}
                      <hr className="border-ink-surface/70 my-2" />

                      {/* Retraction Alert Banner: one 600ms border pulse on first appearance */}
                      {cit.is_retracted && (
                        <div className="bg-warning/20 border border-warning/50 p-2 mb-2 rounded-none animate-border-pulse-once">
                          <p className="text-[10px] font-mono text-warning flex items-start gap-1.5 leading-tight font-semibold">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            FLAGGED IN RETRACTION WATCH DB
                          </p>
                        </div>
                      )}

                      {/* Snippet cut at sentence boundary (evidence passage flashed on selection) */}
                      {snippetText && (
                        <p className="evidence-snippet text-xs text-gray-300 leading-relaxed font-sans pl-2 border-l border-ink-surface/80 my-2 transition-colors">
                          "{snippetText}"
                        </p>
                      )}

                      {/* Bottom Details & Review Status Badge */}
                      <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-ink-surface/50">
                        {getReviewBadge(cit.review_status)}

                        <div className="flex items-center gap-2">
                          {/* Valid external link: strictly http:// or https:// */}
                          {cit.url && /^https?:\/\//i.test(cit.url) && (
                            <a
                              href={cit.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-ink-muted hover:text-white transition-colors p-1"
                              title="Open source URL"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                          {/* Copy BibTeX */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyBibtex(cit);
                            }}
                            className="text-[9px] font-mono text-ink-muted hover:text-white transition-colors flex items-center gap-1 p-0.5"
                            title="Copy BibTeX citation"
                          >
                            {copiedId === cit.id ? (
                              <>
                                <Check size={10} className="text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={10} />
                                <span>BibTeX</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
