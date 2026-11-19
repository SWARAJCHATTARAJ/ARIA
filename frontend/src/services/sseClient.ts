import { API_BASE_URL } from './config';
import { supabase } from '../lib/supabase';

export interface SSEClientOptions {
  query: string;
  topic?: string;
  compareMode?: boolean;
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

  // 1. Safely retrieve the current session token via supabase.auth.getSession()
  let token: string | undefined;
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      token = session?.access_token;
    } catch (err) {
      console.warn('Failed to retrieve Supabase session token:', err);
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

  // If no session token is present, send anonymous fallback header
  if (!token && !requestHeaders['Authorization'] && !requestHeaders['authorization']) {
    requestHeaders['X-Anonymous-User'] = 'true';
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

    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on SSE frame delimiter "\n\n"
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || ''; // Preserve incomplete trailing chunk

      let pendingTokenDelta = '';
      const flushPendingToken = () => {
        if (pendingTokenDelta) {
          onEvent({ event: 'token', delta: pendingTokenDelta });
          pendingTokenDelta = '';
        }
      };

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const lines = trimmed.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataStr = line.replace(/^data:\s*/, '').trim();
            try {
              const parsed = JSON.parse(dataStr);
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
              // Gracefully skip corrupted frames
            }
          }
        }
      }
      flushPendingToken();
    }

    // Process leftover buffer content
    if (buffer.trim()) {
      let pendingTokenDelta = '';
      const lines = buffer.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const dataStr = line.replace(/^data:\s*/, '').trim();
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.event === 'token' && typeof parsed.delta === 'string') {
              pendingTokenDelta += parsed.delta;
            } else {
              if (pendingTokenDelta) {
                onEvent({ event: 'token', delta: pendingTokenDelta });
                pendingTokenDelta = '';
              }
              if (parsed.event === 'done') receivedDone = true;
              onEvent(parsed);
            }
          } catch {}
        }
      }
      if (pendingTokenDelta) {
        onEvent({ event: 'token', delta: pendingTokenDelta });
      }
    }

    // Handle stream ending prematurely without an explicit done event
    if (!receivedDone && !signal?.aborted) {
      onEvent({ event: 'done' });
    }

    onDone();
  } catch (err: any) {
    if (signal?.aborted) return;
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}
