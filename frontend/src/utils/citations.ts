import { Citation, CitationStyle } from '../types';

function cleanAuthorsArray(authors: Citation['authors'], fallbackVenue?: string | null): string[] {
  if (Array.isArray(authors)) {
    const clean = authors.map((a) => String(a).trim()).filter((a) => a && a.toLowerCase() !== 'unknown');
    if (clean.length > 0) return clean;
  } else if (typeof authors === 'string' && authors.trim() && authors.trim().toLowerCase() !== 'unknown') {
    return authors
      .split(/,\s*|;\s*|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [fallbackVenue?.trim() || 'ARIA Reference'];
}

export function resolveCitationUrl(cit: Citation): string {
  if (cit.doi) {
    return cit.doi.startsWith('http') ? cit.doi : `https://doi.org/${cit.doi}`;
  }
  if (cit.url) return cit.url;
  if (cit.arxiv_id) return `https://arxiv.org/abs/${cit.arxiv_id}`;
  return '';
}

function makeBibKey(cit: Citation, idx: number): string {
  const authors = cleanAuthorsArray(cit.authors, cit.venue);
  const firstToken = (authors[0].split(/\s+/).pop() || 'ref').replace(/[^a-zA-Z0-9]/g, '');
  const year = cit.year || '2026';
  return `${firstToken || 'source'}${year}_${idx + 1}`;
}

export function formatBibtexEntry(cit: Citation, idx: number = cit.id): string {
  const authorsStr = cleanAuthorsArray(cit.authors, cit.venue).join(' and ');
  const key = makeBibKey(cit, idx);
  const venue = cit.venue || 'Web Reference';
  const title = (cit.title || 'Untitled Research Source').replace(/[{}]/g, '');
  const url = resolveCitationUrl(cit);
  return (
    `@article{${key},\n` +
    `  title={${title}},\n` +
    `  author={${authorsStr}},\n` +
    `  journal={${venue}},\n` +
    `  year={${cit.year || '2026'}}` +
    (cit.doi ? `,\n  doi={${cit.doi}}` : '') +
    (url ? `,\n  url={${url}}` : '') +
    `\n}`
  );
}

export function formatCitation(cit: Citation, style: CitationStyle, index: number = cit.id + 1): string {
  const authors = cleanAuthorsArray(cit.authors, cit.venue);
  const year = cit.year ? String(cit.year) : 'n.d.';
  const title = cit.title || 'Untitled Source';
  const venue = cit.venue || 'Research Repository';
  const url = resolveCitationUrl(cit);

  if (style === 'bibtex') {
    return formatBibtexEntry(cit, Math.max(0, index - 1));
  }

  if (style === 'ieee') {
    const authDisplay =
      authors.length > 3 ? `${authors[0]} et al.` : authors.join(', ');
    return `[${index}] ${authDisplay}, "${title}," ${venue}, ${year}.${url ? ` Available: ${url}` : ''}`;
  }

  if (style === 'chicago') {
    const first = authors[0];
    const authDisplay =
      authors.length === 1
        ? first
        : authors.length <= 3
        ? `${authors.slice(0, -1).join(', ')}, and ${authors[authors.length - 1]}`
        : `${first} et al.`;
    return `${authDisplay}. "${title}." ${venue} (${year}).${url ? ` ${url}.` : ''}`;
  }

  // Default: APA 7
  const apaAuthors = authors
    .slice(0, 5)
    .map((name) => {
      const parts = name.trim().split(/\s+/);
      if (parts.length < 2) return name;
      const last = parts[parts.length - 1];
      const initials = parts
        .slice(0, -1)
        .map((p) => `${p[0].toUpperCase()}.`)
        .join(' ');
      return `${last}, ${initials}`;
    })
    .join(', ');
  const suffix = authors.length > 5 ? ', ...' : '';
  return `${apaAuthors}${suffix} (${year}). ${title}. ${venue}.${url ? ` ${url}` : ''}`;
}

export function exportAllBibtex(citations: Citation[]): string {
  return citations.map((c, idx) => formatBibtexEntry(c, idx)).join('\n\n');
}

export function exportAllRis(citations: Citation[]): string {
  return citations
    .map((cit) => {
      const authors = cleanAuthorsArray(cit.authors, cit.venue);
      const url = resolveCitationUrl(cit);
      const isJournal = ['openalex', 'crossref', 'pubmed', 'semantic_scholar', 'arxiv'].includes(
        cit.source_type || ''
      );
      const lines = [
        `TY  - ${isJournal ? 'JOUR' : 'ELEC'}`,
        `TI  - ${cit.title || 'Untitled Research Source'}`,
        ...authors.map((a) => `AU  - ${a}`),
        cit.year ? `PY  - ${cit.year}` : '',
        cit.venue ? `JO  - ${cit.venue}` : '',
        cit.doi ? `DO  - ${cit.doi}` : '',
        url ? `UR  - ${url}` : '',
        cit.tier ? `N1  - ARIA Tier: ${cit.tier}` : '',
        'ER  - ',
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n');
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function convertInlineLatex(line: string, citationKeyMap: Map<number, string>): string {
  let out = line;
  // Convert inline citations [[c:N]] to temporary tokens before escaping special LaTeX chars
  const placeholders: Array<{ token: string; tex: string }> = [];
  out = out.replace(/\[\[c:(\d+)\]\]/g, (_m, idStr) => {
    const id = parseInt(idStr, 10);
    const key = citationKeyMap.get(id);
    const token = `@@CITE${placeholders.length}@@`;
    placeholders.push({ token, tex: key ? `~\\cite{${key}}` : `[${id + 1}]` });
    return token;
  });

  // Preserve inline $...$ formulas untouched while escaping prose
  out = out.replace(/\$([^$\n]+)\$/g, (_m, expr) => {
    const token = `@@MATH${placeholders.length}@@`;
    placeholders.push({ token, tex: `$${expr}$` });
    return token;
  });

  // Bold **text** -> \textbf{text}
  out = out.replace(/\*\*([^*\n]+)\*\*/g, (_m, inner) => {
    const token = `@@BOLD${placeholders.length}@@`;
    placeholders.push({ token, tex: `\\textbf{${escapeLatex(inner)}}` });
    return token;
  });

  out = escapeLatex(out);
  for (const p of placeholders) {
    out = out.replace(p.token, p.tex);
  }
  return out;
}

export function exportLatexArticle({
  query,
  content,
  citations,
  canonicalTopic,
}: {
  query: string;
  content: string;
  citations: Citation[];
  canonicalTopic?: string;
}): string {
  const citationKeyMap = new Map<number, string>();
  citations.forEach((cit, idx) => {
    citationKeyMap.set(cit.id, makeBibKey(cit, idx));
  });

  const cleanTitle = escapeLatex(canonicalTopic || query || 'ARIA Research Synthesis');
  const lines = (content || '').split('\n');
  const bodyChunks: string[] = [];
  let inList = false;
  let tableRows: string[][] = [];

  const flushList = () => {
    if (inList) {
      bodyChunks.push('\\end{itemize}\n');
      inList = false;
    }
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const cols = Math.max(...tableRows.map((r) => r.length));
    const colSpec = Array(cols).fill('l').join('');
    bodyChunks.push('\\begin{table}[ht]\n\\centering\n\\small');
    bodyChunks.push(`\\begin{tabular}{${colSpec}}\n\\toprule`);
    tableRows.forEach((row, idx) => {
      const cells = row.map((cell) => convertInlineLatex(cell, citationKeyMap));
      bodyChunks.push(`${cells.join(' & ')} \\\\`);
      if (idx === 0) bodyChunks.push('\\midrule');
    });
    bodyChunks.push('\\bottomrule\n\\end{tabular}\n\\end{table}\n');
    tableRows = [];
  };

  for (const rawLine of lines) {
    const s = rawLine.trim();
    if (!s) {
      flushList();
      flushTable();
      continue;
    }

    if (s.startsWith('|') && s.endsWith('|')) {
      flushList();
      const cells = s
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) continue;
      tableRows.push(cells);
      continue;
    }
    flushTable();

    const hMatch = s.match(/^(#{1,4})\s+(.*)$/);
    if (hMatch) {
      flushList();
      const level = hMatch[1].length;
      const headingText = escapeLatex(hMatch[2].replace(/^(?:I|II|III|IV|V)\.\s+/, '').trim());
      bodyChunks.push(level <= 2 ? `\n\\section{${headingText}}` : `\n\\subsection{${headingText}}`);
      continue;
    }

    if (/^[-*•]\s+/.test(s)) {
      if (!inList) {
        bodyChunks.push('\\begin{itemize}');
        inList = true;
      }
      bodyChunks.push(`  \\item ${convertInlineLatex(s.replace(/^[-*•]\s+/, ''), citationKeyMap)}`);
      continue;
    }

    flushList();
    bodyChunks.push(`${convertInlineLatex(s, citationKeyMap)}\n`);
  }

  flushList();
  flushTable();

  const bibItems = citations
    .map((cit, idx) => {
      const key = citationKeyMap.get(cit.id) || `ref_${idx + 1}`;
      return `\\bibitem{${key}} ${escapeLatex(formatCitation(cit, 'ieee', idx + 1))}`;
    })
    .join('\n');

  return [
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[margin=1in]{geometry}',
    '\\usepackage{amsmath,amssymb,booktabs,hyperref}',
    `\\title{${cleanTitle}}`,
    '\\author{ARIA Autonomous Research Engine}',
    '\\date{\\today}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    bodyChunks.join('\n'),
    '',
    '\\begin{thebibliography}{99}',
    bibItems || '\\bibitem{aria} ARIA Research Synthesis Archive.',
    '\\end{thebibliography}',
    '\\end{document}',
    '',
  ].join('\n');
}
