import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Single hardened Supabase client for the whole app.
 * Configured with PKCE flow, persistent sessions, auto-refresh tokens,
 * and URL session detection for GitHub OAuth and Email magic links.
 */
export const supabase: SupabaseClient | null = (() => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!supabaseUrl.startsWith('http')) return null;
  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    });
  } catch {
    return null;
  }
})();

export const hasSupabaseConfig = Boolean(supabase);
