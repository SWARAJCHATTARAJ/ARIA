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
