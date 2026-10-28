import { API_BASE_URL } from '../config';

export interface SSEClientOptions {
  query: string;
  compareMode?: boolean;
  signal?: AbortSignal;
  onEvent: (event: any) => void;
  onError: (error: Error) => void;
  onDone: () => void;
  mockFixtureKey?: string | null;
  onMockState?: (isMock: boolean) => void;
}

export async function streamQuery({
  query,
  compareMode = false,
  signal,
  onEvent,
  onError,
  onDone,
  mockFixtureKey,
  onMockState,
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

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        compare_mode: compareMode,
      }),
      signal,
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
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

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        const lines = trimmed.split('\n');
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const dataStr = line.replace(/^data:\s*/, '').trim();
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.event === 'done') {
                receivedDone = true;
              }
              onEvent(parsed);
            } catch {
              // Gracefully skip corrupted frames
            }
          }
        }
      }
    }

    // Process leftover buffer content
    if (buffer.trim()) {
      const lines = buffer.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const dataStr = line.replace(/^data:\s*/, '').trim();
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.event === 'done') receivedDone = true;
            onEvent(parsed);
          } catch {}
        }
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
