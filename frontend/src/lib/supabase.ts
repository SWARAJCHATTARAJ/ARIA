import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Single hardened Supabase client for the whole app (AuthModal, AuthGate,
 * AuthContext all share this instance). Import-safe: a malformed or missing
 * configuration degrades to `null` instead of throwing at module load —
 * the UI falls back to the local guest session, never a black screen.
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
