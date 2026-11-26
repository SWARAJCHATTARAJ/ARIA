import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
  provider: 'github' | 'email' | 'guest';
}

interface AuthContextType {
  user: AuthUserProfile | null;
  session: Session | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signInInstantResearcher: () => void;
  signInWithGitHub: () => Promise<{ error: Error | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signInWithEmail: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AUTH_GUEST_KEY = 'aria-guest-session-v1';

export const GUEST_PROFILE: AuthUserProfile = {
  id: 'guest',
  name: 'Guest Researcher',
  username: 'guest',
  email: 'guest@aria.local',
  avatarUrl: '',
  provider: 'guest',
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUser(sbUser: User): AuthUserProfile {
  const meta = sbUser.user_metadata || {};
  const isGitHub = sbUser.app_metadata?.provider === 'github' || Boolean(meta.user_name);
  
  return {
    id: sbUser.id,
    name: meta.full_name || meta.name || meta.user_name || (sbUser.email ? sbUser.email.split('@')[0] : 'Researcher'),
    username: meta.user_name || meta.preferred_username || (sbUser.email ? sbUser.email.split('@')[0] : 'researcher'),
    email: sbUser.email,
    avatarUrl: meta.avatar_url || '',
    provider: isGitHub ? 'github' : 'email',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const signInInstantResearcher = () => {
    try {
      localStorage.setItem(AUTH_GUEST_KEY, 'true');
    } catch {
      // ignore
    }
    setUser(GUEST_PROFILE);
    setSession(null);
    setAccessToken(null);
    setIsAuthModalOpen(false);
  };

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!supabase) {
        if (mounted) {
          const isGuest = localStorage.getItem(AUTH_GUEST_KEY) === 'true';
          if (isGuest) setUser(GUEST_PROFILE);
          setIsLoading(false);
        }
        return;
      }

      try {
        // If redirect URL contains tokens in the hash fragment (magic link / OAuth callback)
        if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (!error && data?.session?.user && mounted) {
              setSession(data.session);
              setAccessToken(data.session.access_token);
              setUser(mapSupabaseUser(data.session.user));
              setIsAuthModalOpen(false);
              setIsLoading(false);
              try {
                window.history.replaceState(null, '', window.location.pathname);
              } catch {
                // ignore
              }
              return;
            }
          }
        }

        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (mounted) {
          if (existingSession?.user) {
            setSession(existingSession);
            setAccessToken(existingSession.access_token);
            setUser(mapSupabaseUser(existingSession.user));
          } else {
            setSession(null);
            setAccessToken(null);
            const isGuest = localStorage.getItem(AUTH_GUEST_KEY) === 'true';
            setUser(isGuest ? GUEST_PROFILE : null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to resolve Supabase session:', err);
        if (mounted) {
          setSession(null);
          setAccessToken(null);
          const isGuest = localStorage.getItem(AUTH_GUEST_KEY) === 'true';
          setUser(isGuest ? GUEST_PROFILE : null);
          setIsLoading(false);
        }
      }
    }

    initAuth();

    const handleHashChange = () => {
      initAuth();
    };
    window.addEventListener('hashchange', handleHashChange);

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
        if (!mounted) return;
        if (currentSession?.user) {
          setSession(currentSession);
          setAccessToken(currentSession.access_token);
          setUser(mapSupabaseUser(currentSession.user));
          setIsAuthModalOpen(false);
        } else {
          setSession(null);
          setAccessToken(null);
          const isGuest = localStorage.getItem(AUTH_GUEST_KEY) === 'true';
          setUser(isGuest ? GUEST_PROFILE : null);
        }
        setIsLoading(false);
      });

      return () => {
        mounted = false;
        window.removeEventListener('hashchange', handleHashChange);
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const signInWithGitHub = async (): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }

    try {
      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signInWithPassword = async (
    email: string,
    password: string
  ): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }

    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw new Error('Please enter a valid email address.');
      }
      if (!password) {
        throw new Error('Please enter your password.');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        let msg = error.message;
        const lower = msg.toLowerCase();
        if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
          msg = 'Invalid email or password. Please verify and try again.';
        } else if (lower.includes('email not confirmed')) {
          msg = 'Email address has not been confirmed yet.';
        }
        throw new Error(msg);
      }

      if (data?.session?.user) {
        setSession(data.session);
        setAccessToken(data.session.access_token);
        setUser(mapSupabaseUser(data.session.user));
        setIsAuthModalOpen(false);
      }

      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signUpWithPassword = async (
    email: string,
    password: string
  ): Promise<{ error: Error | null; needsEmailConfirmation?: boolean }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }

    try {
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw new Error('Please enter a valid email address.');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }

      const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        let msg = error.message;
        const lower = msg.toLowerCase();
        if (lower.includes('already registered') || lower.includes('already exists')) {
          msg = 'An account with this email already exists. Please sign in instead.';
        } else if (lower.includes('weak password') || lower.includes('least 6 characters')) {
          msg = 'Password is too weak. Please use at least 6 characters.';
        }
        throw new Error(msg);
      }

      if (data?.user?.identities && data.user.identities.length === 0) {
        throw new Error('An account with this email already exists. Please sign in instead.');
      }

      if (data?.session?.user) {
        setSession(data.session);
        setAccessToken(data.session.access_token);
        setUser(mapSupabaseUser(data.session.user));
        setIsAuthModalOpen(false);
        return { error: null, needsEmailConfirmation: false };
      }

      return { error: null, needsEmailConfirmation: true };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signInWithEmail = async (email: string): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }

    try {
      const trimmed = email.trim();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new Error('Please enter a valid email address.');
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Error during signOut:', err);
    } finally {
      // Unconditionally wipe session state
      setSession(null);
      setAccessToken(null);
      setUser(null);
      try {
        localStorage.removeItem('aria-guest-session-v1');
        localStorage.removeItem('aria_guest');
      } catch {
        // ignore
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessToken,
        isAuthenticated: Boolean(user),
        isLoading,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        signInInstantResearcher,
        signInWithGitHub,
        signInWithPassword,
        signUpWithPassword,
        signInWithEmail,
        signOut,
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
