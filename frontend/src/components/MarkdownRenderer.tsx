import React, { useState, useRef, useEffect } from 'react';
import { ExternalLink, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';
import katex from 'katex';
import { Citation, TierType, AuditClaim } from '../types';
import { triggerLightHaptic } from '../utils/haptics';
import { useSettingsStore } from '../context/SettingsContext';

export function sanitizeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed, 'https://example.invalid');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      return trimmed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

interface MarkdownRendererProps {
  content: string;
  citations?: Citation[];
  onCitationClick?: (citation: Citation, claim?: AuditClaim) => void;
  isStreaming?: boolean;
  auditClaims?: AuditClaim[];
  answerFinal?: string;
}

export function cleanCompoundHyphens(text: string): string {
  if (!text || !text.includes('_')) return text;
  // Replace underscores that join compound words / technical terms with standard hyphens
  // e.g. fixed_bit -> fixed-bit, 8_bit -> 8-bit, sub_spaces -> sub-spaces, Graph_Based -> Graph-Based,
  // IVF_PQ -> IVF-PQ, fine_grained -> fine-grained, off_target -> off-target
  return text.replace(/\b([A-Za-z0-9]+)_([A-Za-z0-9]+)\b/g, (match, p1, p2) => {
    // Preserve single letter math subscripts like M_K, R_d, x_i, V_flat, c_0
    if (/^[A-Z]_[a-z0-9]$/.test(match) || /^[a-z]_[0-9a-z]$/.test(match)) {
      return match;
    }
    const lower = match.toLowerCase();
    if (
      lower.includes('bit') ||
      lower.includes('space') ||
      lower.includes('graph') ||
      lower.includes('based') ||
      lower.includes('grained') ||
      lower.includes('target') ||
      lower.includes('shot') ||
      lower.includes('scale') ||
      lower.includes('tier') ||
      lower.includes('step') ||
      lower.includes('level') ||
      lower.includes('fold') ||
      lower.includes('state') ||
      lower.includes('rate') ||
      lower.includes('ivf') ||
      lower.includes('pq') ||
      lower.includes('hnsw') ||
      lower.includes('rag') ||
      lower.includes('dim') ||
      lower.includes('order') ||
      lower.includes('bound') ||
      lower.includes('time') ||
      lower.includes('line')
    ) {
      return `${p1}-${p2}`;
    }
    return match;
  });
}

export function getTierColorClass(tier?: string | TierType): string {
  switch (tier) {
    case 'OKF':
      return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 dark:hover:bg-blue-500/25';
    case 'RAG':
      return 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30 dark:hover:bg-purple-500/25';
    case 'LIVE':
      return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/25';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 dark:bg-gray-700/20 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700/40';
  }
}

export function normalizeMathDelimiters(text: string): string {
  if (!text) return '';
  // Convert \[ ... \] -> $$ ... $$ and \( ... \) -> $ ... $
  // while safely skipping fenced code blocks (```...```) and inline code (`...`)
  return text.replace(
    /(```[\s\S]*?```|`[^`\n]*`)|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g,
    (match, code, displayMath, inlineMath) => {
      if (code) return code;
      if (displayMath !== undefined) {
        const trimmed = displayMath.trim();
        return trimmed ? `$$${trimmed}$$` : '';
      }
      if (inlineMath !== undefined) {
        const trimmed = inlineMath.trim();
        return trimmed ? `$${trimmed}$` : '';
      }
      return match;
    }
  );
}

export function stripOrphanHeadings(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  while (lines.length > 0 && (!lines[lines.length - 1].trim() || lines[lines.length - 1].trim().startsWith('#'))) {
    lines.pop();
  }

  const cleanedLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trim();
    const m = stripped.match(/^(#{1,6})\s+(.*)/);
    if (m) {
      const level = m[1].length;
      let j = i + 1;
      let hasContent = false;
      while (j < lines.length) {
        const nextStripped = lines[j].trim();
        if (!nextStripped) {
          j++;
          continue;
        }
        const nextM = nextStripped.match(/^(#{1,6})\s+/);
        if (nextM) {
          const nextLevel = nextM[1].length;
          if (nextLevel <= level) {
            break;
          } else {
            hasContent = true;
            break;
          }
        } else {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) {
        i++;
        continue;
      }
    }
    cleanedLines.push(line);
    i++;
  }

  let result = cleanedLines.join('\n');
  result = result.replace(/(?:^|\n)\s*#{1,6}[^\n]*\s*$/, '').trim();
  return result;
}

interface LineSpan {
  text: string;
  start: number;
  end: number;
}

function adjustToWordBoundary(text: string, pos: number, dir: 'left' | 'right'): number {
  if (pos <= 0 || pos >= text.length) return pos;
  const isAlphaNum = (ch: string) => /[\w]/.test(ch);
  if (isAlphaNum(text[pos - 1]) && isAlphaNum(text[pos])) {
    if (dir === 'left') {
      while (pos > 0 && isAlphaNum(text[pos - 1])) pos--;
    } else {
      while (pos < text.length && isAlphaNum(text[pos])) pos++;
    }
  }

  // Snap away from slicing inside **bold** markdown tokens
  let lineStart = text.lastIndexOf('\n', pos - 1);
  if (lineStart === -1) lineStart = 0; else lineStart++;
  let lineEnd = text.indexOf('\n', pos);
  if (lineEnd === -1) lineEnd = text.length;

  const lineSub = text.slice(lineStart, lineEnd);
  const relPos = pos - lineStart;
  const boldRegex = /\*\*([^*\n]+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = boldRegex.exec(lineSub)) !== null) {
    const boldStart = m.index;
    const boldEnd = m.index + m[0].length;
    if (relPos > boldStart && relPos < boldEnd) {
      // Snap to end of bold delimiter to avoid splitting markdown tokens
      return lineStart + (dir === 'left' ? boldEnd : boldStart);
    }
  }

  return pos;
}

function MarkdownRendererInner({
  content,
  citations = [],
  onCitationClick,
  isStreaming = false,
  auditClaims = [],
  answerFinal,
}: MarkdownRendererProps) {
  // Use answerFinal if audit completed and available
  const rawText = (!isStreaming && answerFinal) ? answerFinal : content;

  // Filter out in-flight split marker "[[" at the very end during streaming and clean raw [VERIFIED] tags
  const displayContent = React.useMemo(() => {
    let text = rawText;
    if (isStreaming) {
      const lastOpen = text.lastIndexOf('[[');
      const lastClose = text.lastIndexOf(']]');
      if (lastOpen !== -1 && lastOpen > lastClose && text.length - lastOpen < 15) {
        text = text.slice(0, lastOpen);
      }
    }
    // Strip any literal [VERIFIED] or \[VERIFIED\] text tags
    text = text.replace(/\\?\[\s*VERIFIED\s*\\?\]/gi, '');

    // Convert \[ ... \] to $$ ... $$ and \( ... \) to $ ... $ (skipping code blocks)
    text = normalizeMathDelimiters(text);

    // Strip empty math blocks
    text = text.replace(/\$\$\s*\$\$/g, '');

    // Strip orphan / empty headings (especially trailing ones when stream completes)
    if (!isStreaming) {
      text = stripOrphanHeadings(text);
    }

    // Clean compound word hyphens inside technical terms and table rows (e.g. fixed_bit -> fixed-bit, 8_bit -> 8-bit, Graph_Based -> Graph-Based)
    text = cleanCompoundHyphens(text);

    return text;
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

  // Map citation ID -> best matching AuditClaim (for popover status & supporting quote)
  const claimByCitationId = React.useMemo(() => {
    const map = new Map<number, AuditClaim>();
    if (!auditClaims) return map;
    for (const c of auditClaims) {
      if (typeof c !== 'object' || !c) continue;
      const cids = c.citation_ids || [];
      for (const cid of cids) {
        if (!map.has(cid) || (c.evidence && !map.get(cid)?.evidence)) {
          map.set(cid, c);
        }
      }
    }
    return map;
  }, [auditClaims]);

  // Parse inline text: bold, italic, code, links, citations [[c:ID]], and KaTeX math formulas
  const renderInline = (text: string, keyPrefix: string, activeClaim?: AuditClaim): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    const tokenRegex = /(\[\[c:(\d+)\]\])|(?:\$\$([\s\S]{1,2000}?)\$\$|\\\[([^\\\]]{1,2000}?)\\\])|(?:\$([^\$\n]{1,1000}?)\$|\\\(([\s\S]{1,1000}?)\\\))|(`([^`\n]+)`)|(?:\*\*([^*\n]+)\*\*)|(?:\*([^*\n]+)\*)|(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\))/g;
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
          const matchedClaim = activeClaim || claimByCitationId.get(citId);
          nodes.push(
            <InlineCitationPill
              key={matchKey}
              cit={cit}
              citId={citId}
              claim={matchedClaim}
              onCitationClick={onCitationClick}
            />
          );
        }
      } else if (match[3] || match[4]) {
        // Display math ($$...$$ or \[...\])
        const mathExpr = (match[3] || match[4] || '').trim();
        try {
          const html = katex.renderToString(mathExpr, { throwOnError: false, displayMode: true, trust: false });
          nodes.push(
            <div
              key={matchKey}
              className="my-3 overflow-x-auto text-center font-mono text-sm py-2 px-3 bg-[#F8FAFC] dark:bg-ink-surface/40 rounded-lg border border-slate-200 dark:border-white/[0.06] text-slate-900 dark:text-zinc-100"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          nodes.push(<code key={matchKey} className="font-mono text-xs">{mathExpr}</code>);
        }
      } else if (match[5] || match[6]) {
        // Inline math ($...$ or \(...\))
        const mathExpr = (match[5] || match[6] || '').trim();
        try {
          const html = katex.renderToString(mathExpr, { throwOnError: false, displayMode: false, trust: false });
          nodes.push(
            <span
              key={matchKey}
              className="inline-math px-0.5 text-slate-900 dark:text-zinc-100"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          nodes.push(<code key={matchKey} className="font-mono text-xs">{mathExpr}</code>);
        }
      } else if (match[7]) {
        // `code`
        nodes.push(
          <code key={matchKey} className="font-mono text-[12.5px] bg-slate-100 dark:bg-ink-surface px-1.5 py-0.5 rounded text-blue-700 dark:text-tier-okf border border-slate-200 dark:border-white/[0.07]">
            {match[8]}
          </code>
        );
      } else if (match[9]) {
        // **bold**
        nodes.push(<strong key={matchKey} className="font-semibold text-slate-900 dark:text-zinc-100">{match[9]}</strong>);
      } else if (match[10]) {
        // *italic*
        nodes.push(<em key={matchKey} className="italic text-slate-700 dark:text-zinc-300">{match[10]}</em>);
      } else if (match[11]) {
        // [text](url) — strictly sanitized protocol
        const linkText = match[12];
        const safeUrl = sanitizeHref(match[13]);
        if (safeUrl) {
          nodes.push(
            <a
              key={matchKey}
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-tier-okf hover:underline underline-offset-2 break-all"
            >
              {linkText}
            </a>
          );
        } else {
          nodes.push(linkText);
        }
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes;
  };

  // Core mapping: renders a chunk of text with subtle audited claim highlight spans (no intrusive inline badges)
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
        const rawStart = claim.start as number;
        const rawEnd = claim.end as number;
        const cStart = Math.max(startOffset, adjustToWordBoundary(answerFinal, rawStart, 'left'));
        const cEnd = Math.min(endOffset, adjustToWordBoundary(answerFinal, rawEnd, 'right'));
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

        // Clean editorial prose with subtle claim association for citation popovers
        const claimText = answerFinal.slice(cStart, cEnd);
        nodes.push(
          <span
            key={`${keyPrefix}-claim-${claim.claim_id ?? idx}`}
            className="audit-claim-highlight inline transition-colors"
            style={{
              animationDelay: `calc(${globalIdx} * 120ms * var(--motion-scale, 1))`,
            }}
          >
            {renderInline(claimText, `${keyPrefix}-c-${idx}`, claim)}
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

    return (
      <span className="audit-claim-highlight inline transition-colors">
        {renderInline(text, `${keyPrefix}-blkhl`, overlapping[0])}
      </span>
    );
  };

  // Structured Block Parsing: Headings, Code blocks, Tables, Lists, Paragraphs
  const blocks = React.useMemo(() => {
    // 1. Break displayContent into line spans with absolute offsets in linear O(n) time
    const lineSpans: LineSpan[] = [];
    const rawLines = displayContent.split('\n');
    let offset = 0;
    for (let i = 0; i < rawLines.length; i++) {
      let lText = rawLines[i];
      if (lText.endsWith('\r')) lText = lText.slice(0, -1);
      lineSpans.push({
        text: lText,
        start: offset,
        end: offset + lText.length,
      });
      offset += rawLines[i].length + 1;
    }

    const result: React.ReactNode[] = [];
    let lIdx = 0;
    let blockId = 0;
    let orderedSeq = 1;

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
        orderedSeq = 1;
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
            className="bg-[#F8FAFC] dark:bg-[#0B0F1A] p-3 my-3 overflow-x-auto rounded-none border border-slate-200 dark:border-white/[0.08] text-xs font-mono text-slate-800 dark:text-gray-200"
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        continue;
      }

      // GFM Table: lines starting with '|'
      if (trimmed.startsWith('|')) {
        orderedSeq = 1;
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
            <div key={`blk-${blockId++}`} className="my-4">
              <div className="sm:hidden flex justify-end text-[10px] font-mono text-slate-500 dark:text-zinc-500 mb-1 select-none">
                Scroll →
              </div>
              <div
                className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0B0F1A] overflow-x-auto shadow-sm"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <table className="w-max min-w-full text-[12px] leading-[1.45] font-sans border-collapse" style={{ tableLayout: 'auto' }}>
                  <thead className="bg-slate-50 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/[0.08]">
                    <tr>
                      {headerCells.map((cell, cIdx) => (
                        <th
                          key={`th-${cIdx}`}
                          className={`px-3 py-2 text-left font-medium text-slate-700 dark:text-zinc-300 whitespace-nowrap text-[11px] uppercase tracking-wider border-r border-slate-200 dark:border-white/[0.05] last:border-r-0 ${
                            cIdx === 0 ? 'min-w-[110px]' : 'min-w-[180px]'
                          }`}
                        >
                          {renderAuditedText(cleanCompoundHyphens(cell.text), cell.start, cell.end, `th-${cIdx}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                    {dataRows.map((row, rIdx) => (
                      <tr key={`tr-${rIdx}`} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors">
                        {row.map((cell, cIdx) => (
                          <td
                            key={`td-${rIdx}-${cIdx}`}
                            className={`px-3 py-2.5 align-top text-slate-800 dark:text-zinc-200 border-r border-slate-200 dark:border-white/[0.04] last:border-r-0 ${
                              cIdx === 0 ? 'min-w-[110px] font-medium text-slate-900 dark:text-zinc-300' : 'min-w-[180px]'
                            }`}
                          >
                            {renderAuditedText(cleanCompoundHyphens(cell.text), cell.start, cell.end, `td-${rIdx}-${cIdx}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
          continue;
        }
      }

      // Headings (refined editorial scale & tracking)
      if (trimmed.startsWith('# ')) {
        orderedSeq = 1;
        const leadWs = line.text.length - line.text.trimStart().length;
        const headingStart = line.start + leadWs + 2;
        const headingEnd = line.end;
        result.push(
          <h1 key={`blk-${blockId++}`} className="text-[19px] font-sans font-semibold text-slate-900 dark:text-zinc-100 tracking-[-0.02em] mt-6 mb-2.5 leading-snug">
            {renderAuditedText(trimmed.slice(2), headingStart, headingEnd, `h1-${blockId}`)}
          </h1>
        );
        lIdx++;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        orderedSeq = 1;
        const leadWs = line.text.length - line.text.trimStart().length;
        const headingStart = line.start + leadWs + 3;
        const headingEnd = line.end;
        result.push(
          <h2 key={`blk-${blockId++}`} className="text-[16px] font-sans font-semibold text-slate-900 dark:text-zinc-100 tracking-[-0.015em] mt-6 mb-2 pt-1 leading-snug">
            {renderAuditedText(trimmed.slice(3), headingStart, headingEnd, `h2-${blockId}`)}
          </h2>
        );
        lIdx++;
        continue;
      }
      if (trimmed.startsWith('### ')) {
        orderedSeq = 1;
        const leadWs = line.text.length - line.text.trimStart().length;
        const headingStart = line.start + leadWs + 4;
        const headingEnd = line.end;
        result.push(
          <h3 key={`blk-${blockId++}`} className="text-[14.5px] font-sans font-semibold text-slate-900 dark:text-zinc-200 tracking-[-0.01em] mt-4 mb-1.5 leading-snug">
            {renderAuditedText(trimmed.slice(4), headingStart, headingEnd, `h3-${blockId}`)}
          </h3>
        );
        lIdx++;
        continue;
      }

      // Editorial Callout / Blockquote (> ...)
      if (trimmed.startsWith('>')) {
        orderedSeq = 1;
        const quoteLines: string[] = [];
        const qStart = line.start;
        let qEnd = line.end;
        while (lIdx < lineSpans.length && lineSpans[lIdx].text.trim().startsWith('>')) {
          quoteLines.push(lineSpans[lIdx].text.trim().replace(/^>\s?/, ''));
          qEnd = lineSpans[lIdx].end;
          lIdx++;
        }
        result.push(
          <blockquote
            key={`blk-${blockId++}`}
            className="my-3.5 pl-3.5 pr-3 py-2.5 border-l-2 border-l-blue-500/70 dark:border-l-[#60A5FA]/70 bg-slate-50/80 dark:bg-white/[0.025] rounded-r-[6px] text-[14.5px] text-slate-700 dark:text-zinc-300 leading-[1.7] italic"
          >
            {renderAuditedText(quoteLines.join(' '), qStart, qEnd, `bq-${blockId}`)}
          </blockquote>
        );
        continue;
      }

      // Horizontal Rules
      if (trimmed === '---' || trimmed === '***') {
        orderedSeq = 1;
        result.push(<hr key={`blk-${blockId++}`} className="border-slate-200 dark:border-white/[0.07] my-5" />);
        lIdx++;
        continue;
      }

      // List Items (Unordered: -, *, •, ·)
      const bulletMatch = trimmed.match(/^([-*•·])\s+(.*)/);
      if (bulletMatch) {
        const leadWs = line.text.length - line.text.trimStart().length;
        const markerLen = bulletMatch[1].length + 1; // e.g. "- ", "• "
        const itemStart = line.start + leadWs + markerLen;
        const itemEnd = line.end;
        result.push(
          <li
            key={`blk-${blockId++}`}
            className={`text-[15px] text-slate-800 dark:text-zinc-200 list-disc my-1.5 leading-[1.7] ${leadWs >= 2 ? 'ml-9' : 'ml-5'}`}
            style={{ counterIncrement: 'none' }}
          >
            {renderAuditedText(bulletMatch[2], itemStart, itemEnd, `li-${blockId}`)}
          </li>
        );
        lIdx++;
        continue;
      }

      // List Items (Ordered: guaranteed sequential numbering 1., 2., 3., 4.)
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        const leadWs = line.text.length - line.text.trimStart().length;
        const markerLen = numMatch[1].length + 2; // e.g. "1. "
        const itemStart = line.start + leadWs + markerLen;
        const itemEnd = line.end;
        const rawNum = parseInt(numMatch[1], 10);
        if (rawNum === 1) {
          orderedSeq = 1;
        }
        const itemNum = orderedSeq++;
        result.push(
          <li
            key={`blk-${blockId++}`}
            value={itemNum}
            className={`text-[15px] text-slate-800 dark:text-zinc-200 list-decimal my-1.5 leading-[1.7] ${leadWs >= 2 ? 'ml-9' : 'ml-5'}`}
          >
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
        !lineSpans[lIdx].text.trim().startsWith('>') &&
        !lineSpans[lIdx].text.trim().startsWith('|') &&
        !lineSpans[lIdx].text.trim().startsWith('```') &&
        !lineSpans[lIdx].text.trim().startsWith('- ') &&
        !lineSpans[lIdx].text.trim().startsWith('* ') &&
        !lineSpans[lIdx].text.trim().startsWith('• ') &&
        !lineSpans[lIdx].text.trim().startsWith('· ') &&
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
          <p key={`blk-${blockId++}`} className="text-[15px] text-slate-800 dark:text-zinc-200 my-2.5 leading-[1.7]">
            {renderAuditedText(paraText, paraStart, paraEnd, `p-${blockId}`)}
          </p>
        );
      }
    }

    return result;
  }, [displayContent, answerFinal, validClaims, claimIndexMap, citationMap, claimByCitationId]);

  return (
    <div className="editorial-prose space-y-1 select-text max-w-[70ch] leading-[1.7]">
      {blocks}
      {/* Stream Caret: subtle vertical blinking caret at stream end */}
      {isStreaming && <span className="streaming-caret" aria-hidden="true" />}
    </div>
  );
}

function InlineCitationPill({
  cit,
  citId,
  claim,
  onCitationClick,
}: {
  cit: Citation;
  citId: number;
  claim?: AuditClaim;
  onCitationClick?: (citation: Citation, claim?: AuditClaim) => void;
}) {
  const { settings } = useSettingsStore();
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setShowPreview(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowPreview(false);
  };

  const colorClass = getTierColorClass(cit.tier);
  const rawUrl = cit.doi
    ? cit.doi.startsWith('http')
      ? cit.doi
      : `https://doi.org/${cit.doi}`
    : cit.url || (cit.arxiv_id ? `https://arxiv.org/abs/${cit.arxiv_id}` : '');
  const targetUrl = sanitizeHref(rawUrl);

  const supportingQuote = claim?.evidence_quote || claim?.evidence || cit.snippet || '';
  const claimVerdict =
    claim?.verdict ||
    (claim?.status === 'supported'
      ? 'supported'
      : claim?.status === 'partially_supported'
      ? 'partial'
      : claim?.status
      ? 'unverified'
      : undefined);

  const statusDotColor =
    claimVerdict === 'supported'
      ? 'bg-emerald-400'
      : claimVerdict === 'partial'
      ? 'bg-amber-400'
      : claimVerdict === 'unverified'
      ? 'bg-rose-400'
      : '';

  return (
    <span
      className="relative inline-block align-baseline group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          triggerLightHaptic(settings.nativeHaptics);
          setShowPreview(false);
          if (onCitationClick) onCitationClick(cit, claim);
        }}
        className={`inline-flex items-center gap-1 font-mono text-[10.5px] font-medium px-1.5 py-[1px] mx-0.5 rounded-[4px] border tabular-nums transition-all duration-150 select-none cursor-pointer align-baseline hover:brightness-110 active:scale-[0.95] ${colorClass}`}
        aria-label={`Citation [${citId + 1}]: ${cit.title || 'Source'}`}
        aria-expanded={showPreview}
      >
        {statusDotColor && <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} shrink-0`} />}
        <span>[{citId + 1}]</span>
      </button>

      {/* Lightweight Desktop Hover Intent Preview Card (120ms delay, non-blocking) */}
      {showPreview && (
        <span
          className="hidden sm:block animate-popover-reveal absolute bottom-full left-1/2 mb-2 w-72 max-w-[82vw] p-3 bg-white dark:bg-[#111115] border border-slate-200 dark:border-white/[0.14] shadow-2xl z-50 rounded-[8px] pointer-events-auto text-left"
          style={{ filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.32))' }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center justify-between gap-2 text-[10px] font-mono mb-1.5 text-slate-500 dark:text-[#8B8B8E]">
            <span className="inline-flex items-center gap-1.5 truncate">
              {statusDotColor && <span className={`w-1.5 h-1.5 rounded-full ${statusDotColor} shrink-0`} />}
              <span className="font-semibold text-slate-800 dark:text-[#EDEDED]">[{citId + 1}]</span>
              <span>{[cit.year, cit.venue].filter(Boolean).join(' · ') || cit.tier || 'LIVE'}</span>
            </span>

            {claimVerdict && (
              <span
                className={`inline-flex items-center gap-0.5 text-[9.5px] font-semibold shrink-0 ${
                  claimVerdict === 'supported'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : claimVerdict === 'partial'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {claimVerdict === 'supported' ? <CheckCircle2 size={9} /> : <AlertCircle size={9} />}
                <span>
                  {claimVerdict === 'supported'
                    ? 'Verified'
                    : claimVerdict === 'partial'
                    ? 'Partial'
                    : 'Flagged'}
                </span>
              </span>
            )}
          </span>

          <span className="block font-sans font-semibold text-[12px] text-slate-900 dark:text-[#EDEDED] leading-snug line-clamp-2 mb-1.5">
            {cit.title || cit.path || 'Academic Citation'}
          </span>

          {supportingQuote && (
            <span className="block text-[10.5px] font-sans text-slate-600 dark:text-zinc-300 leading-snug line-clamp-1 pl-2 border-l-2 border-l-[#60A5FA] mb-1.5">
              &ldquo;{supportingQuote}&rdquo;
            </span>
          )}

          <span className="flex items-center justify-between pt-1 border-t border-slate-200/70 dark:border-white/[0.06] text-[9.5px] font-mono">
            <span className="text-[#60A5FA] inline-flex items-center gap-1">
              <BookOpen size={9} />
              <span>Click to verify proof</span>
            </span>
            {targetUrl && (
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-[#60A5FA] inline-flex items-center gap-0.5"
              >
                <ExternalLink size={9} />
              </a>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

// Memoized: heavy render trees (markdown / graphs / SVG) only re-render
// when their props actually change during a streaming update.
const MarkdownRendererMemo = React.memo(MarkdownRendererInner);
MarkdownRendererMemo.displayName = 'MarkdownRenderer';
export default MarkdownRendererMemo;
