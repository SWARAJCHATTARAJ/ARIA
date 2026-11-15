import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
  provider: 'github' | 'email';
}

interface AuthContextType {
  user: AuthUserProfile | null;
  session: Session | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signInWithGitHub: () => Promise<{ error: Error | null }>;
  signInWithEmail: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

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

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!supabase) {
        if (mounted) setIsLoading(false);
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
            setUser(null);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Failed to resolve Supabase session:', err);
        if (mounted) {
          setSession(null);
          setAccessToken(null);
          setUser(null);
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
        } else {
          setSession(null);
          setAccessToken(null);
          setUser(null);
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      return { error: null };
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
        signInWithGitHub,
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
