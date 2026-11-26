import { API_BASE_URL } from './config';
import { supabase } from '../lib/supabase';

export interface QueryRequestPayload {
  query: string;
  compare_mode?: boolean;
  thread_id?: string;
}

export interface QueryApiOptions {
  query: string;
  compareMode?: boolean;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Execute search/query request against the backend endpoint (/api/query).
 * Automatically fetches the active Supabase session token and attaches Bearer authorization.
 */
export async function queryApi({
  query,
  compareMode = false,
  signal,
  headers: customHeaders,
}: QueryApiOptions): Promise<Response> {
  const url = `${API_BASE_URL}/api/query`;

  let token: string | undefined;
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token;
    } catch (err) {
      console.warn('Failed to retrieve Supabase session token:', err);
    }
  }

  if (!token && customHeaders?.Authorization) {
    token = customHeaders.Authorization.replace(/^Bearer\s+/i, '');
  } else if (!token && customHeaders?.authorization) {
    token = customHeaders.authorization.replace(/^Bearer\s+/i, '');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  if (!token && !headers['Authorization'] && !headers['authorization']) {
    headers['X-Anonymous-User'] = 'true';
  }

  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      compare_mode: compareMode,
    }),
    signal,
  });
}

export interface ExportPdfPayload {
  query: string;
  answer_final: string;
  confidence?: number;
  tiers?: string[];
  claims?: any[];
  sources?: any[];
  figures?: any[];
  chart?: any;
  canonical_topic?: string;
  full_ledger?: boolean;
  clickable_urls?: boolean;
}

/**
 * Compact a source/citation object before transmission to prevent oversized payloads.
 */
function compactSource(src: any) {
  if (!src || typeof src !== 'object') return src;
  return {
    id: src.id,
    url: typeof src.url === 'string' ? src.url.slice(0, 500) : '',
    title: typeof src.title === 'string' ? src.title.slice(0, 300) : '',
    snippet: typeof src.snippet === 'string' ? src.snippet.slice(0, 1500) : '',
    authors: Array.isArray(src.authors)
      ? src.authors.slice(0, 10).map((a: any) => String(a).slice(0, 100))
      : (src.authors ? String(src.authors).slice(0, 200) : undefined),
    year: src.year,
    venue: typeof src.venue === 'string' ? src.venue.slice(0, 200) : undefined,
    doi: typeof src.doi === 'string' ? src.doi.slice(0, 100) : undefined,
    arxiv_id: typeof src.arxiv_id === 'string' ? src.arxiv_id.slice(0, 100) : undefined,
    source_type: typeof src.source_type === 'string' ? src.source_type.slice(0, 60) : undefined,
    review_status: typeof src.review_status === 'string' ? src.review_status.slice(0, 60) : undefined,
    source: typeof src.source === 'string' ? src.source.slice(0, 300) : undefined,
    published: typeof src.published === 'string' ? src.published.slice(0, 60) : undefined,
    path: typeof src.path === 'string' ? src.path.slice(0, 200) : undefined,
    score: typeof src.score === 'number' ? src.score : undefined,
    tier: src.tier,
    citation_id: src.citation_id,
  };
}

function compactFigure(fig: any) {
  if (!fig || typeof fig !== 'object') return fig;
  return {
    url: typeof fig.url === 'string' ? fig.url.slice(0, 500) : '',
    title: typeof fig.title === 'string' ? fig.title.slice(0, 300) : '',
    caption: typeof fig.caption === 'string' ? fig.caption.slice(0, 500) : '',
    source: typeof fig.source === 'string' ? fig.source.slice(0, 200) : '',
    attribution: typeof fig.attribution === 'string' ? fig.attribution.slice(0, 300) : '',
    score: typeof fig.score === 'number' ? fig.score : undefined,
  };
}

function compactClaim(claim: any) {
  if (!claim || typeof claim !== 'object') return claim;
  const rawText = typeof claim.text === 'string' ? claim.text : (typeof claim.claim === 'string' ? claim.claim : '');
  return {
    claim_id: claim.claim_id ?? claim.id,
    text: rawText.slice(0, 600),
    claim: rawText.slice(0, 600),
    status: claim.status,
    supported: typeof claim.supported === 'boolean' ? claim.supported : undefined,
    coverage: typeof claim.coverage === 'number' ? claim.coverage : undefined,
    citation_ids: Array.isArray(claim.citation_ids) ? claim.citation_ids.slice(0, 10) : undefined,
    note: typeof claim.note === 'string' ? claim.note.slice(0, 300) : undefined,
    source: typeof claim.source === 'string' ? claim.source.slice(0, 300) : undefined,
    evidence: typeof claim.evidence === 'string' ? claim.evidence.slice(0, 500) : undefined,
  };
}

/**
 * Execute PDF export request against the backend endpoint (/api/export/pdf).
 * - Enforces an AbortController timeout (default 90s).
 * - Pre-compacts sources, figures, and claims to stay under limits and avoid large payloads.
 * - Attaches Supabase session bearer token.
 * - Parses structured error responses and returns clear, actionable error diagnostics.
 */
export async function exportPdfApi(
  payload: ExportPdfPayload,
  timeoutMs: number = 90000,
  customToken?: string
): Promise<Blob> {
  const url = `${API_BASE_URL}/api/export/pdf`;

  let token = customToken;
  if (!token && supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token;
    } catch (err) {
      console.warn('Failed to retrieve Supabase session token for PDF export:', err);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  const compactPayload = {
    query: payload.query || 'Research Overview',
    answer_final: payload.answer_final || '',
    confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.85,
    tiers: payload.tiers || ['OKF'],
    claims: Array.isArray(payload.claims) ? payload.claims.slice(0, 40).map(compactClaim) : [],
    sources: Array.isArray(payload.sources) ? payload.sources.slice(0, 30).map(compactSource) : [],
    figures: Array.isArray(payload.figures) ? payload.figures.slice(0, 10).map(compactFigure) : [],
    chart: payload.chart || null,
    canonical_topic: payload.canonical_topic,
    full_ledger: payload.full_ledger ?? true,
    clickable_urls: payload.clickable_urls ?? true,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(compactPayload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      let detailMsg = '';
      try {
        const errJson = await res.json();
        if (errJson?.detail) {
          detailMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        try {
          detailMsg = (await res.text()).slice(0, 200);
        } catch {}
      }

      if (res.status === 401) {
        throw new Error('Authentication required. Please sign in to export PDF reports.');
      } else if (res.status === 413) {
        throw new Error('Payload too large for PDF export (HTTP 413). Please reduce content size.');
      } else if (res.status === 504) {
        throw new Error('PDF generation gateway timed out (HTTP 504). Please try again.');
      } else if (detailMsg) {
        throw new Error(`${detailMsg} (HTTP ${res.status})`);
      } else {
        throw new Error(`PDF export failed with HTTP ${res.status}`);
      }
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      throw new Error('Received empty PDF blob from server.');
    }
    return blob;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new Error(`PDF generation timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`);
    }
    if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('NetworkError') || err.message.includes('Failed to fetch'))) {
      throw new Error(`Network/CORS error reaching backend at ${API_BASE_URL}. Ensure the server is online and reachable.`);
    }
    throw err;
  }
}
