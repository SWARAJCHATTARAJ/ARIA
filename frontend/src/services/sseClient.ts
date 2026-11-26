import { API_BASE_URL } from './config';
import { supabase } from '../lib/supabase';

export interface SSEClientOptions {
  query: string;
  topic?: string;
  compareMode?: boolean;
  sourceTier?: 'all' | 'peer_reviewed';
  recency?: 'all' | '5y' | '2y';
  strictAcademic?: boolean;
  signal?: AbortSignal;
  onEvent: (event: any) => void;
  onError: (error: Error) => void;
  onDone: () => void;
  mockFixtureKey?: string | null;
  onMockState?: (isMock: boolean) => void;
  customHeaders?: Record<string, string>;
}

export async function streamQuery({
  query,
  topic,
  compareMode = false,
  sourceTier = 'all',
  recency = 'all',
  strictAcademic = false,
  signal,
  onEvent,
  onError,
  onDone,
  mockFixtureKey,
  onMockState,
  customHeaders,
}: SSEClientOptions): Promise<void> {
  // Check if Mock Mode is requested via parameter or URL (?mock=1)
  const isMockUrl =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === '1';
  
  // Replay mock fixture only if mockKey provided or in ?mock=1 mode
  const isMockMode = Boolean(mockFixtureKey) || isMockUrl;

  if (isMockMode) {
    if (onMockState) onMockState(true);

    try {
      // Dynamic import: keeps fixtures completely out of standard production bundles
      const { MOCK_FIXTURES } = await import('../fixtures/mockData');

      const key =
        mockFixtureKey ||
        (query.toLowerCase().includes('hyperconductivity') || query.toLowerCase().includes('retract')
          ? 'retraction'
          : query.toLowerCase().includes('discontinuous') || query.toLowerCase().includes('conflict')
          ? 'conflict'
          : query.toLowerCase().includes('crispr')
          ? 'rag'
          : query.toLowerCase().includes('jwst') || query.toLowerCase().includes('webb')
          ? 'live'
          : 'okf');

      const fixture = MOCK_FIXTURES[key] || MOCK_FIXTURES.okf;

      for (const evt of fixture.events) {
        if (signal?.aborted) return;

        const delay = evt.event === 'token' ? 20 : evt.event === 'route' || evt.event === 'retrieve' ? 140 : 70;
        await new Promise((r) => setTimeout(r, delay));

        if (signal?.aborted) return;
        onEvent(evt);
      }

      onDone();
      return;
    } catch (err: any) {
      onError(err instanceof Error ? err : new Error(String(err)));
      return;
    }
  }

  if (onMockState) onMockState(false);

  // Read API base URL from shared config module
  const url = `${API_BASE_URL}/api/query`;

  // 1. Safely retrieve the current session token via supabase.auth.getSession() with 5s timeout guard
  let token: string | undefined;
  if (supabase) {
    try {
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
        setTimeout(() => resolve({ data: { session: null } }), 5000)
      );
      const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
      token = session?.access_token;
    } catch (err) {
      console.warn('Failed to retrieve Supabase session token (or timed out after 5s):', err);
    }
  }

  // Fallback to customHeaders if passed
  if (!token && customHeaders?.Authorization) {
    token = customHeaders.Authorization.replace(/^Bearer\s+/i, '');
  } else if (!token && customHeaders?.authorization) {
    token = customHeaders.authorization.replace(/^Bearer\s+/i, '');
  }

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };

  if (!requestHeaders['Authorization'] && !requestHeaders['authorization']) {
    throw new Error('Authentication required. Please sign in to run research queries.');
  }

  // Inject user BYOK Groq API Key Pool from settings if present
  try {
    const rawSettings = localStorage.getItem('aria-ui-settings-v2');
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings);
      if (Array.isArray(parsed.apiKeys)) {
        const activeKeys = parsed.apiKeys
          .filter((k: any) => k.enabled && typeof k.key === 'string' && k.key.trim().length > 0)
          .map((k: any) => k.key.trim());
        if (activeKeys.length > 0) {
          requestHeaders['X-API-Key-Pool'] = JSON.stringify(activeKeys);
        }
      }
    }
  } catch {
    // quiet fallback
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        query,
        topic: topic || undefined,
        compare_mode: compareMode,
        source_tier: sourceTier,
        recency,
        strict_academic: strictAcademic,
      }),
      signal,
    });

    if (!res.ok) {
      let detailMsg = `Server returned HTTP ${res.status}: ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson?.detail) {
          detailMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        // Non-JSON response body
      }

      const queryError = new Error(detailMsg);
      (queryError as any).status = res.status;
      // Do NOT sign out or clear storage on 401/500 — preserve active user session
      throw queryError;
    }

    if (!res.body) {
      throw new Error('ReadableStream not supported on this response.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let receivedDone = false;

    // Hard 25-Second Inactivity Watchdog:
    // Reset on every incoming byte (including ": keep-alive" comments).
    // If 25 seconds pass with zero bytes, abort cleanly and report timeout.
    const WATCHDOG_TIMEOUT_MS = 25000;
    const readWithWatchdog = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      let timeoutId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Connection timed out: No data or heartbeats received from server for 25 seconds. Please retry.'));
        }, WATCHDOG_TIMEOUT_MS);
      });

      try {
        const result = await Promise.race([reader.read(), timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
      } catch (err) {
        clearTimeout(timeoutId);
        try {
          await reader.cancel();
        } catch {}
        throw err;
      }
    };

    let pendingTokenDelta = '';
    const flushPendingToken = () => {
      if (pendingTokenDelta) {
        onEvent({ event: 'token', delta: pendingTokenDelta });
        pendingTokenDelta = '';
      }
    };

    const processFrame = (frame: string) => {
      const trimmed = frame.trim();
      if (!trimmed) return;

      const lines = trimmed.split(/\r?\n/);
      let eventData = '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        // Explicitly ignore SSE comment lines starting with ":" (e.g. ": keep-alive")
        if (line.startsWith(':')) {
          continue;
        }
        if (line.startsWith('data:')) {
          const chunkData = line.slice(5).trim();
          eventData = eventData ? `${eventData}\n${chunkData}` : chunkData;
        }
      }

      if (!eventData) return;

      try {
        const parsed = JSON.parse(eventData);
        if (parsed.event === 'token' && typeof parsed.delta === 'string') {
          pendingTokenDelta += parsed.delta;
        } else {
          flushPendingToken();
          if (parsed.event === 'done') {
            receivedDone = true;
          }
          onEvent(parsed);
        }
      } catch {
        // Skip malformed frames gracefully
      }
    };

    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {}
        return;
      }

      const { done, value } = await readWithWatchdog();
      if (done) {
        // Flush remaining multi-byte sequences from TextDecoder
        buffer += decoder.decode(new Uint8Array(), { stream: false });
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Scan for SSE message boundaries: handle both \r\n\r\n and \n\n
      let boundaryIndex: number;
      while ((boundaryIndex = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const match = buffer.match(/\r?\n\r?\n/);
        const delimiterLen = match ? match[0].length : 2;
        const frame = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + delimiterLen);
        processFrame(frame);
      }
      flushPendingToken();
    }

    // Process any remaining complete or incomplete frames in buffer after EOF
    if (buffer.trim()) {
      processFrame(buffer);
    }
    flushPendingToken();

    // Force clean termination on EOF: always emit 'done' if not received yet
    if (!receivedDone && !signal?.aborted) {
      onEvent({ event: 'done' });
    }

    onDone();
  } catch (err: any) {
    if (signal?.aborted) return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
