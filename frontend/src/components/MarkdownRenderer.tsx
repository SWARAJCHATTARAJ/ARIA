import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Citation, TierType, AuditClaim } from '../types';

interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation) => void;
  isStreaming?: boolean;
  auditClaims?: AuditClaim[];
  answerFinal?: string;
}

// Glyph mapping per tier: color is never the only signal
export function getTierGlyph(tier?: string | TierType): string {
  switch (tier) {
    case 'OKF':
      return '§'; // Section / knowledge graph
    case 'RAG':
      return '▲'; // Vector similarity / delta
    case 'LIVE':
      return '●'; // Live radar / web snapshot
    default:
      return '■';
  }
}

export function getTierColorClass(tier?: string | TierType): string {
  switch (tier) {
    case 'OKF':
      return 'text-tier-okf bg-tier-okf/15 border-tier-okf/50 hover:bg-tier-okf/25';
    case 'RAG':
      return 'text-tier-rag bg-tier-rag/15 border-tier-rag/50 hover:bg-tier-rag/25';
    case 'LIVE':
      return 'text-tier-live bg-tier-live/15 border-tier-live/50 hover:bg-tier-live/25';
    default:
      return 'text-gray-300 bg-gray-700/20 border-gray-600 hover:bg-gray-700/40';
  }
}

interface LineSpan {
  text: string;
  start: number;
  end: number;
}

export default function MarkdownRenderer({
  content,
  citations = [],
  onCitationClick,
  isStreaming = false,
  auditClaims = [],
  answerFinal,
}: MarkdownRendererProps) {
  // Use answerFinal if audit completed and available
  const rawText = (!isStreaming && answerFinal) ? answerFinal : content;

  // Filter out in-flight split marker "[[" at the very end during streaming
  const displayContent = React.useMemo(() => {
    if (!isStreaming) return rawText;
    const lastOpen = rawText.lastIndexOf('[[');
    const lastClose = rawText.lastIndexOf(']]');
    if (lastOpen !== -1 && lastOpen > lastClose && rawText.length - lastOpen < 15) {
      return rawText.slice(0, lastOpen);
    }
    return rawText;
  }, [rawText, isStreaming]);

  // Map citation ID -> Citation object
  const citationMap = React.useMemo(() => {
    const map = new Map<number, Citation>();
    citations.forEach((c) => {
      map.set(c.id, c);
    });
    return map;
  }, [citations]);

  // Valid claims with start and end offsets into displayContent
  const validClaims = React.useMemo(() => {
    if (isStreaming || !auditClaims || auditClaims.length === 0) return [];
    return auditClaims
      .filter((c) => typeof c.start === 'number' && typeof c.end === 'number' && (c.end as number) > (c.start as number))
      .sort((a, b) => (a.start as number) - (b.start as number));
  }, [isStreaming, auditClaims]);

  // Global index lookup for animation delay
  const claimIndexMap = React.useMemo(() => {
    const map = new Map<AuditClaim, number>();
    validClaims.forEach((c, idx) => map.set(c, idx));
    return map;
  }, [validClaims]);

  // Parse inline text: bold, italic, code, links, citations [[c:ID]]
  const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const tokenRegex = /(\[\[c:(\d+)\]\])|(`([^`]+)`)|\*\*([^*]+)\*\*|\*([^*]+)\*|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      const matchKey = `${keyPrefix}-m-${i++}`;

      if (match[1]) {
        // [[c:ID]]
        const citId = parseInt(match[2], 10);
        const cit = citationMap.get(citId);
        if (cit) {
          nodes.push(
            <InlineCitationPill
              key={matchKey}
              cit={cit}
              citId={citId}
              onCitationClick={onCitationClick}
            />
          );
        }
      } else if (match[3]) {
        // `code`
        nodes.push(
          <code key={matchKey} className="font-mono text-xs bg-ink-surface px-1 py-0.5 rounded-none text-tier-okf border border-ink-surface/80">
            {match[4]}
          </code>
        );
      } else if (match[5]) {
        // **bold**
        nodes.push(<strong key={matchKey} className="font-semibold text-gray-100">{match[5]}</strong>);
      } else if (match[6]) {
        // *italic*
        nodes.push(<em key={matchKey} className="italic text-gray-300">{match[6]}</em>);
      } else if (match[7]) {
        // [text](url)
        const linkText = match[8];
        const linkUrl = match[9];
        nodes.push(
          <a
            key={matchKey}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-tier-okf hover:underline underline-offset-2 break-all"
          >
            {linkText}
          </a>
        );
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes;
  };

  // Helper to render mark/stamp for an audited claim
  const renderClaimStamp = (claim: AuditClaim) => {
    switch (claim.status) {
      case 'supported':
        return (
          <span
            className="audit-stamp-supported"
            title={claim.evidence ? `Verified by source: "${claim.evidence}"` : 'Verified claim'}
          >
            [VERIFIED]
          </span>
        );
      case 'partially_supported':
        return (
          <span
            className="inline-flex items-center gap-1 border-b border-dashed border-gray-400 font-mono text-[10px] text-gray-300 ml-1.5 px-1 bg-ink-surface/40 select-none"
            title={claim.note || 'Partially supported claim'}
          >
            <span className="font-bold text-gray-200">!</span>
            <span>partial</span>
          </span>
        );
      case 'unsupported':
        return (
          <span
            className="inline-flex items-center gap-1 border-b border-gray-400 font-mono text-[10px] text-gray-300 ml-1.5 px-1 bg-ink-surface/40 select-none"
            title={claim.note || 'Unsupported claim'}
          >
            <span className="font-bold text-gray-200">×</span>
            <span>unsupported</span>
          </span>
        );
      case 'uncited':
        return (
          <span
            className="inline-flex items-center gap-1 border-b border-dotted border-gray-400 font-mono text-[10px] text-gray-300 ml-1.5 px-1 bg-ink-surface/40 select-none"
            title={claim.note || 'Uncited factual assertion'}
          >
            <span className="font-bold text-gray-200">?</span>
            <span>uncited</span>
          </span>
        );
      case 'audit_incomplete':
        return (
          <span
            className="inline-flex items-center gap-1 border-b border-dotted border-amber-400/60 font-mono text-[10px] text-amber-300 ml-1.5 px-1 bg-ink-surface/40 select-none"
            title={claim.note || 'Could not be checked'}
          >
            <span className="font-bold text-amber-400">?</span>
            <span>could not be checked</span>
          </span>
        );
      default:
        return null;
    }
  };

  // Core mapping: renders a chunk of text with exact claim sentence highlights
  const renderAuditedText = (
    text: string,
    startOffset: number,
    endOffset: number,
    keyPrefix: string
  ): React.ReactNode => {
    if (validClaims.length === 0 || !answerFinal) {
      return renderInline(text, keyPrefix);
    }

    // Find claims overlapping [startOffset, endOffset]
    const overlapping = validClaims.filter(
      (c) => (c.start as number) < endOffset && (c.end as number) > startOffset
    );

    if (overlapping.length === 0) {
      return renderInline(text, keyPrefix);
    }

    // Check if all overlapping claims are strictly contained within [startOffset, endOffset]
    const strictlyContained = overlapping.every(
      (c) => (c.start as number) >= startOffset && (c.end as number) <= endOffset
    );

    if (strictlyContained) {
      const nodes: React.ReactNode[] = [];
      let cursor = startOffset;

      overlapping.forEach((claim, idx) => {
        const cStart = claim.start as number;
        const cEnd = claim.end as number;
        const globalIdx = claimIndexMap.get(claim) ?? idx;

        // Text preceding the claim inside this container
        if (cStart > cursor) {
          const preText = answerFinal.slice(cursor, cStart);
          nodes.push(
            <React.Fragment key={`${keyPrefix}-pre-${idx}`}>
              {renderInline(preText, `${keyPrefix}-pre-${idx}`)}
            </React.Fragment>
          );
        }

        // Highlighted claim text
        const claimText = answerFinal.slice(cStart, cEnd);
        nodes.push(
          <span
            key={`${keyPrefix}-claim-${claim.claim_id ?? idx}`}
            className="audit-claim-highlight inline px-0.5 rounded-none transition-colors"
            style={{
              animation: 'sweepHighlight calc(350ms * var(--motion-scale, 1)) cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
              animationDelay: `calc(${globalIdx} * 250ms * var(--motion-scale, 1))`,
            }}
          >
            {renderInline(claimText, `${keyPrefix}-c-${idx}`)}
            {renderClaimStamp(claim)}
          </span>
        );

        cursor = cEnd;
      });

      // Remaining text after all claims in this container
      if (cursor < endOffset) {
        const postText = answerFinal.slice(cursor, endOffset);
        nodes.push(
          <React.Fragment key={`${keyPrefix}-post`}>
            {renderInline(postText, `${keyPrefix}-post`)}
          </React.Fragment>
        );
      }

      return nodes;
    }

    // Fallback: mapping cannot be exact without crossing block boundaries.
    // "If the mapping can't be exact, highlight the whole block, never a wrong range."
    return (
      <span className="audit-claim-highlight inline px-0.5 rounded-none transition-colors">
        {renderInline(text, `${keyPrefix}-blkhl`)}
        {overlapping.map((c, idx) => (
          <React.Fragment key={`${keyPrefix}-stmp-${c.claim_id ?? idx}`}>
            {renderClaimStamp(c)}
          </React.Fragment>
        ))}
      </span>
    );
  };

  // Structured Block Parsing: Headings, Code blocks, Tables, Lists, Paragraphs
  const blocks = React.useMemo(() => {
    // 1. Break displayContent into line spans with absolute offsets
    const lineSpans: LineSpan[] = [];
    const lineRegex = /(.*?)(\r?\n|$)/g;
    let match: RegExpExecArray | null;
    while ((match = lineRegex.exec(displayContent)) !== null) {
      if (match.index === displayContent.length) break;
      const lineText = match[1];
      const sep = match[2];
      lineSpans.push({
        text: lineText,
        start: match.index,
        end: match.index + lineText.length,
      });
      if (!sep) break;
    }

    const result: React.ReactNode[] = [];
    let lIdx = 0;
    let blockId = 0;

    while (lIdx < lineSpans.length) {
      const line = lineSpans[lIdx];
      const trimmed = line.text.trim();

      // Empty line
      if (!trimmed) {
        lIdx++;
        continue;
      }

      // Fenced Code Block
      if (trimmed.startsWith('```')) {
        const codeStart = line.start;
        const codeLines: string[] = [];
        lIdx++;
        while (lIdx < lineSpans.length && !lineSpans[lIdx].text.trim().startsWith('```')) {
          codeLines.push(lineSpans[lIdx].text);
          lIdx++;
        }
        if (lIdx < lineSpans.length) {
          lIdx++; // skip closing ```
        }
        result.push(
          <pre
            key={`blk-${blockId++}`}
            className="bg-ink-surface p-3 my-3 overflow-x-auto rounded-none border border-ink-surface text-xs font-mono text-gray-200"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        continue;
      }

      // GFM Table: lines starting with '|'
      if (trimmed.startsWith('|')) {
        const tableLines: LineSpan[] = [];
        while (lIdx < lineSpans.length && lineSpans[lIdx].text.trim().startsWith('|')) {
          tableLines.push(lineSpans[lIdx]);
          lIdx++;
        }

        if (tableLines.length >= 2) {
          const parseRowCells = (rowSpan: LineSpan) => {
            const text = rowSpan.text;
            const pipeIndices: number[] = [];
            for (let i = 0; i < text.length; i++) {
              if (text[i] === '|') pipeIndices.push(i);
            }
            const cells: { text: string; start: number; end: number }[] = [];
            for (let i = 0; i < pipeIndices.length - 1; i++) {
              const p1 = pipeIndices[i];
              const p2 = pipeIndices[i + 1];
              const raw = text.slice(p1 + 1, p2);
              const trimmedCell = raw.trim();
              const leadingWs = raw.length - raw.trimStart().length;
              const trailingWs = raw.length - raw.trimEnd().length;
              const cellStart = rowSpan.start + p1 + 1 + leadingWs;
              const cellEnd = rowSpan.start + p2 - trailingWs;
              cells.push({
                text: trimmedCell,
                start: cellStart,
                end: cellEnd,
              });
            }
            return cells;
          };

          const headerCells = parseRowCells(tableLines[0]);
          // tableLines[1] is delimiter row (|---|---|)
          const dataRows = tableLines.slice(2).map(parseRowCells);

          result.push(
            <div key={`blk-${blockId++}`} className="overflow-x-auto my-3 border border-ink-surface rounded-none">
              <table className="min-w-full divide-y divide-ink-surface text-xs font-mono">
                <thead className="bg-ink-surface/80 text-gray-300 font-semibold">
                  <tr>
                    {headerCells.map((cell, cIdx) => (
                      <th
                        key={`th-${cIdx}`}
                        className="px-3 py-2 text-left uppercase tracking-wider text-[11px] border-r border-ink-surface last:border-r-0"
                      >
                        {renderAuditedText(cell.text, cell.start, cell.end, `th-${cIdx}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-surface/60 bg-ink-base">
                  {dataRows.map((row, rIdx) => (
                    <tr key={`tr-${rIdx}`} className="hover:bg-ink-surface/30 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td
                          key={`td-${rIdx}-${cIdx}`}
                          className="px-3 py-2 text-gray-200 border-r border-ink-surface/40 last:border-r-0"
                        >
                          {renderAuditedText(cell.text, cell.start, cell.end, `td-${rIdx}-${cIdx}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // Headings
      if (trimmed.startsWith('# ')) {
        const leadWs = line.text.length - line.text.trimStart().length;
        const headingStart = line.start + leadWs + 2;
        const headingEnd = line.end;
        result.push(
          <h1 key={`blk-${blockId++}`} className="text-[27px] font-sans font-bold text-white mt-4 mb-2 leading-[1.25]">
            {renderAuditedText(trimmed.slice(2), headingStart, headingEnd, `h1-${blockId}`)}
          </h1>
        );
        lIdx++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        const leadWs = line.text.length - line.text.trimStart().length;
        const headingStart = line.start + leadWs + 3;
        const headingEnd = line.end;
        result.push(
          <h2 key={`blk-${blockId++}`} className="text-[19px] font-sans font-semibold text-gray-100 mt-3 mb-1.5 leading-[1.35]">
            {renderAuditedText(trimmed.slice(3), headingStart, headingEnd, `h2-${blockId}`)}
          </h2>
        );
        lIdx++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        const leadWs = line.text.length - line.text.trimStart().length;
        const headingStart = line.start + leadWs + 4;
        const headingEnd = line.end;
        result.push(
          <h3 key={`blk-${blockId++}`} className="text-[15px] font-sans font-semibold text-gray-200 mt-2.5 mb-1 leading-[1.4]">
            {renderAuditedText(trimmed.slice(4), headingStart, headingEnd, `h3-${blockId}`)}
          </h3>
        );
        lIdx++;
        continue;
      }

      // Horizontal Rules
      if (trimmed === '---' || trimmed === '***') {
        result.push(<hr key={`blk-${blockId++}`} className="border-ink-surface my-4" />);
        lIdx++;
        continue;
      }

      // List Items (Unordered)
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const leadWs = line.text.length - line.text.trimStart().length;
        const itemStart = line.start + leadWs + 2;
        const itemEnd = line.end;
        result.push(
          <li key={`blk-${blockId++}`} className="text-[15px] text-gray-200 ml-4 list-disc my-1 leading-[1.65]">
            {renderAuditedText(trimmed.slice(2), itemStart, itemEnd, `li-${blockId}`)}
          </li>
        );
        lIdx++;
        continue;
      }

      // List Items (Ordered)
      const numMatch = trimmed.match(/^(\d+\.)\s+(.*)/);
      if (numMatch) {
        const leadWs = line.text.length - line.text.trimStart().length;
        const markerLen = numMatch[1].length + 1; // e.g. "1. "
        const itemStart = line.start + leadWs + markerLen;
        const itemEnd = line.end;
        result.push(
          <li key={`blk-${blockId++}`} className="text-[15px] text-gray-200 ml-4 list-decimal my-1 leading-[1.65]">
            {renderAuditedText(numMatch[2], itemStart, itemEnd, `oli-${blockId}`)}
          </li>
        );
        lIdx++;
        continue;
      }

      // Paragraph: group contiguous non-empty lines until blank line or next special block
      const paraLines: LineSpan[] = [];
      while (
        lIdx < lineSpans.length &&
        lineSpans[lIdx].text.trim() &&
        !lineSpans[lIdx].text.trim().startsWith('#') &&
        !lineSpans[lIdx].text.trim().startsWith('|') &&
        !lineSpans[lIdx].text.trim().startsWith('```') &&
        !lineSpans[lIdx].text.trim().startsWith('- ') &&
        !lineSpans[lIdx].text.trim().startsWith('* ') &&
        !/^\d+\.\s/.test(lineSpans[lIdx].text.trim()) &&
        lineSpans[lIdx].text.trim() !== '---' &&
        lineSpans[lIdx].text.trim() !== '***'
      ) {
        paraLines.push(lineSpans[lIdx]);
        lIdx++;
      }

      if (paraLines.length > 0) {
        const paraStart = paraLines[0].start;
        const paraEnd = paraLines[paraLines.length - 1].end;
        const paraText = displayContent.slice(paraStart, paraEnd);

        result.push(
          <p key={`blk-${blockId++}`} className="text-[15px] text-gray-200 my-2 leading-[1.65]">
            {renderAuditedText(paraText, paraStart, paraEnd, `p-${blockId}`)}
          </p>
        );
      }
    }

    return result;
  }, [displayContent, answerFinal, validClaims, claimIndexMap, citationMap]);

  return (
    <div className="space-y-1 select-text max-w-[68ch] leading-[1.65]">
      {blocks}
      {/* Stream Caret: blinking block removed on audit */}
      {isStreaming && <span className="animate-caret" aria-hidden="true" />}
    </div>
  );
}

function InlineCitationPill({
  cit,
  citId,
  onCitationClick,
}: {
  cit: Citation;
  citId: number;
  onCitationClick?: (citation: Citation) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const glyph = getTierGlyph(cit.tier);
  const colorClass = getTierColorClass(cit.tier);
  const authorsStr = Array.isArray(cit.authors) ? cit.authors.join(', ') : String(cit.authors || '');
  const targetUrl = cit.doi
    ? cit.doi.startsWith('http')
      ? cit.doi
      : `https://doi.org/${cit.doi}`
    : cit.url || (cit.arxiv_id ? `https://arxiv.org/abs/${cit.arxiv_id}` : '');

  return (
    <span
      className="relative inline-block align-baseline group"
      onMouseEnter={() => setShowPreview(true)}
      onMouseLeave={() => setShowPreview(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onCitationClick) onCitationClick(cit);
          const card = document.getElementById(`citation-card-${citId}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const ev = card.querySelector('.evidence-snippet');
            if (ev) {
              ev.classList.remove('flash-evidence');
              void (ev as HTMLElement).offsetWidth;
              ev.classList.add('flash-evidence');
            }
          }
        }}
        className={`inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-1.5 py-0.2 mx-0.5 rounded-none border transition-all select-none cursor-pointer align-baseline animate-[citationFadeIn_calc(120ms*var(--motion-scale,1))_cubic-bezier(.2,.8,.2,1)] touch-spring ${colorClass}`}
        aria-label={`Citation ${citId + 1}: ${cit.title || 'Source'}`}
      >
        <span className="opacity-80 text-[9px] select-none">{glyph}</span>
        <span>{citId + 1}</span>
      </button>

      {/* Spring-animated floating citation card preview on hover / focus */}
      {showPreview && (
        <span
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-ink-base border border-cyan-500/50 shadow-2xl z-50 rounded-none pointer-events-auto text-left block animate-view-in"
          style={{ filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.85))' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center justify-between text-[10px] font-mono mb-1.5 border-b border-ink-surface pb-1 text-ink-muted">
            <span className="flex items-center gap-1 font-bold text-cyan-400">
              <span>{glyph}</span>
              <span>{cit.tier || 'PRIMARY SOURCE'} #{citId + 1}</span>
            </span>
            {cit.year && <span>{cit.year}</span>}
          </span>
          <span className="block font-sans font-semibold text-xs text-white leading-snug line-clamp-2 mb-1">
            {cit.title || cit.path || 'Academic Citation'}
          </span>
          {authorsStr && (
            <span className="block font-sans text-[11px] text-gray-300 line-clamp-1 mb-1.5">
              {authorsStr}
            </span>
          )}
          {cit.venue && (
            <span className="block font-mono text-[10px] text-ink-muted line-clamp-1 mb-1">
              Venue: {cit.venue}
            </span>
          )}
          {targetUrl && (
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:underline mt-1"
            >
              <span>View Source / DOI</span>
              <ExternalLink size={10} />
            </a>
          )}
        </span>
      )}
    </span>
  );
}
