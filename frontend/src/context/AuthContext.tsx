import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { API_BASE_URL } from '../services/config';

/**
 * Native runtime detection: Tauri (Windows WebView2) & Capacitor (Android WebView).
 * Used so OAuth redirects and session recovery resolve inside native WebViews
 * without hanging on a blank screen or redirecting to an unreachable localhost.
 */
export const isTauriRuntime =
  typeof window !== 'undefined' &&
  Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
export const isCapacitorRuntime =
  typeof window !== 'undefined' &&
  Boolean((window as any).Capacitor?.isNativePlatform?.());
export const isNativeRuntime = isTauriRuntime || isCapacitorRuntime;

export interface AuthUserProfile {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl: string;
  provider: 'github' | 'instant' | 'guest';
  /** Optional access role — 'guest' for local/offline sessions. */
  role?: 'user' | 'guest';
}

interface AuthContextType {
  user: AuthUserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  hasSupabaseConfig: boolean;
  openAuthModal: (onSuccessCallback?: () => void) => void;
  closeAuthModal: () => void;
  signInWithGitHub: () => Promise<void>;
  signInInstantResearcher: () => void;
  signOut: () => Promise<void>;
  requireAuth: (action: () => void) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_GUEST_KEY = 'aria-guest-session-v1';
/** Strict-gate flag: the inner workspace renders if this is exactly 'true'. */
export const ARIA_GUEST_FLAG_KEY = 'aria_guest_mode';

// Read Vite Supabase environment variables safely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    });
  } catch {
    // Supabase client init failed — the app falls back to the local guest session.
    supabase = null;
  }
}

/** Instant local guest identity — never blocks or requires network. */
export const GUEST_PROFILE: AuthUserProfile = {
  id: 'guest',
  name: 'Guest Researcher',
  username: 'guest',
  email: 'guest@aria.local',
  avatarUrl: '',
  provider: 'guest',
  role: 'guest',
};

/** One canonical Supabase user → profile mapper (used at init and on auth events). */
function buildGitHubProfile(sbUser: User): AuthUserProfile {
  const meta = sbUser.user_metadata || {};
  return {
    id: sbUser.id,
    name: meta.full_name || meta.name || meta.user_name || 'Researcher',
    username:
      meta.user_name || meta.preferred_username || sbUser.email?.split('@')[0] || 'researcher',
    email: sbUser.email,
    avatarUrl: meta.avatar_url || 'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
    provider: 'github',
  };
}

function writeGuestSession() {
  try {
    localStorage.setItem(AUTH_GUEST_KEY, JSON.stringify(GUEST_PROFILE));
    localStorage.setItem(ARIA_GUEST_FLAG_KEY, 'true');
  } catch {
    // ignore — storage unavailable means the gate re-evaluates on next load
  }
}

function clearGuestSession() {
  try {
    localStorage.removeItem(AUTH_GUEST_KEY);
    localStorage.removeItem(ARIA_GUEST_FLAG_KEY);
  } catch {
    // ignore
  }
}

/** Hydrate a persisted guest profile (if the strict gate flag or profile exists). */
function readGuestProfile(): AuthUserProfile | null {
  try {
    const raw = localStorage.getItem(AUTH_GUEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthUserProfile;
      if (parsed && typeof parsed.id === 'string') {
        // Legacy sessions (profile written before the flag existed) upgrade here
        localStorage.setItem(ARIA_GUEST_FLAG_KEY, 'true');
        return parsed;
      }
    }
    if (localStorage.getItem(ARIA_GUEST_FLAG_KEY) === 'true') return GUEST_PROFILE;
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      // 1. Check Supabase session if available
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && mounted) {
            setUser(buildGitHubProfile(session.user));
            setIsLoading(false);
            return;
          }
        } catch {
          // Supabase unreachable — fall through to local gate state so the
          // user is never stuck on a hanging auth check.
        }
      }

      // 2. Local gate state: persisted guest session (aria_guest_mode flag)
      if (mounted) {
        const guest = readGuestProfile();
        setUser(guest);
        setIsLoading(false);
      }
    }

    initAuth();

    // 3. Listen to Supabase auth state changes — login / logout transition the
    //    gate view instantly, never requiring a manual page refresh.
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          setUser(buildGitHubProfile(session.user));
          if (pendingAction) {
            pendingAction();
            setPendingAction(null);
          }
        } else {
          // No Supabase session: fall back to the persisted local guest state
          try {
            setUser(readGuestProfile());
          } catch {
            setUser(null);
          }
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
    };
  }, [pendingAction]);

  const openAuthModal = (onSuccess?: () => void) => {
    if (onSuccess) setPendingAction(() => onSuccess);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const signInWithGitHub = async () => {
    if (!supabase) {
      // If Supabase is not configured, fall back to Instant Researcher Mode
      signInInstantResearcher();
      return;
    }

    try {
      // Native WebViews (Tauri / Capacitor) must round-trip the OAuth callback
      // through the hosted production origin; window.location.origin there is
      // an unreachable scheme (tauri://localhost / https://localhost).
      const redirectTo = isNativeRuntime
        ? API_BASE_URL || window.location.origin
        : window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo,
        },
      });
      if (error) throw error;
    } catch {
      // Supabase OAuth failed / user aborted — fall back to the instant
      // guest session so the click handler never appears to hang.
      signInInstantResearcher();
    }
  };

  const signInInstantResearcher = () => {
    writeGuestSession();
    setUser(GUEST_PROFILE);
    setIsAuthModalOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const signOut = async () => {
    clearGuestSession();
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore — signOut failure should never block the UI
      }
    }
    setUser(null);
  };

  const requireAuth = (action: () => void) => {
    if (user) {
      action();
    } else if (!hasSupabaseConfig) {
      // No auth backend configured: enter instantly as a local guest
      // instead of stalling in a broken login flow.
      signInInstantResearcher();
      action();
    } else {
      openAuthModal(action);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        isAuthModalOpen,
        hasSupabaseConfig,
        openAuthModal,
        closeAuthModal,
        signInWithGitHub,
        signInInstantResearcher,
        signOut,
        requireAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
