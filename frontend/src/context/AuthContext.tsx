import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../services/config';

export const isTauriRuntime =
  typeof window !== 'undefined' &&
  Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
export const isCapacitorRuntime =
  typeof window !== 'undefined' &&
  (Capacitor.isNativePlatform() || Boolean((window as any).Capacitor?.isNativePlatform?.()));
export const isNativeRuntime = isTauriRuntime || isCapacitorRuntime;

export const SIGNUP_CONFIRM_REDIRECT_URL = 'https://aria.swarajchattaraj.tech';
export const PASSWORD_RESET_REDIRECT_URL = 'https://aria.swarajchattaraj.tech/reset-password';
export const WEB_OAUTH_REDIRECT_URL = 'https://aria.swarajchattaraj.tech';
export const TAURI_OAUTH_REDIRECT_URL = 'http://tauri.localhost/';
export const ANDROID_OAUTH_REDIRECT_URL = 'aria://auth/callback';

export interface AuthUserProfile {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl: string;
  provider: 'github' | 'email';
}

interface DeleteAccountResult {
  error: Error | null;
  statusCode?: number;
}

interface AuthContextType {
  user: AuthUserProfile | null;
  session: Session | null;
  accessToken: string | null;
  authIssuedAtSeconds: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPasswordRecovery: boolean;
  accountNotice: string | null;
  clearAccountNotice: () => void;
  clearPasswordRecovery: () => void;
  signInWithGitHub: () => Promise<{ error: Error | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  resendConfirmationEmail: (email: string) => Promise<{ error: Error | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  deleteAccount: (params: { confirmText: string; password?: string }) => Promise<DeleteAccountResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUser(sbUser: User): AuthUserProfile {
  const meta = sbUser.user_metadata || {};
  const providerRaw = String(sbUser.app_metadata?.provider || '').toLowerCase();
  const isGitHub = providerRaw === 'github' || (providerRaw !== 'email' && Boolean(meta.user_name));

  return {
    id: sbUser.id,
    name: meta.full_name || meta.name || meta.user_name || (sbUser.email ? sbUser.email.split('@')[0] : 'Researcher'),
    username: meta.user_name || meta.preferred_username || (sbUser.email ? sbUser.email.split('@')[0] : 'researcher'),
    email: sbUser.email,
    avatarUrl: meta.avatar_url || '',
    provider: isGitHub ? 'github' : 'email',
  };
}

function decodeJwtIssuedAt(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const decoded = JSON.parse(atob(padded));
    return typeof decoded?.iat === 'number' ? decoded.iat : null;
  } catch {
    return null;
  }
}

function clearLegacyGuestStorage(): void {
  try {
    localStorage.removeItem('aria-guest-session-v1');
    localStorage.removeItem('aria_guest');
  } catch {
    // ignore storage errors
  }
}

async function purgeAllAriaClientData(): Promise<void> {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('aria') || key.startsWith('sb-'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }

  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }

  try {
    if (typeof indexedDB !== 'undefined' && typeof (indexedDB as any).databases === 'function') {
      const dbs = await (indexedDB as any).databases();
      if (Array.isArray(dbs)) {
        await Promise.all(
          dbs
            .filter((db: any) => db?.name && String(db.name).toLowerCase().includes('aria'))
            .map(
              (db: any) =>
                new Promise<void>((resolve) => {
                  try {
                    const req = indexedDB.deleteDatabase(db.name);
                    req.onsuccess = () => resolve();
                    req.onerror = () => resolve();
                    req.onblocked = () => resolve();
                  } catch {
                    resolve();
                  }
                })
            )
        );
      }
    }
  } catch {
    // ignore
  }

  try {
    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch {
    // ignore
  }
}

function urlIndicatesPasswordRecovery(): boolean {
  if (typeof window === 'undefined') return false;
  const pathnameMatches = window.location.pathname === '/reset-password';
  const hashLower = window.location.hash.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  return (
    pathnameMatches ||
    hashLower.includes('type=recovery') ||
    searchParams.get('type') === 'recovery'
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() =>
    urlIndicatesPasswordRecovery()
  );
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  const clearAccountNotice = () => setAccountNotice(null);
  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false);
    if (typeof window !== 'undefined' && window.location.pathname === '/reset-password') {
      try {
        window.history.replaceState(null, '', '/');
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    clearLegacyGuestStorage();

    async function initAuth() {
      if (!supabase) {
        if (mounted) {
          setSession(null);
          setAccessToken(null);
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      try {
        const isRecoveryUrl = urlIndicatesPasswordRecovery();
        if (isRecoveryUrl && mounted) {
          setIsPasswordRecovery(true);
        }
        const rawSearch = typeof window !== 'undefined' ? window.location.search : '';
        const rawHash = typeof window !== 'undefined' ? window.location.hash : '';
        const isSignupConfirmUrl =
          rawSearch.includes('type=signup') ||
          rawHash.includes('type=signup') ||
          rawSearch.includes('confirmation_sent=');

        // Handle hash fragment tokens (e.g., OAuth implicit redirect, signup confirmation, or password recovery)
        if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
          const params = new URLSearchParams(window.location.hash.substring(1));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          const hashType = params.get('type');
          if (hashType === 'recovery' && mounted) {
            setIsPasswordRecovery(true);
          }
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (!error && data?.session?.user && mounted) {
              setSession(data.session);
              setAccessToken(data.session.access_token);
              setUser(mapSupabaseUser(data.session.user));
              if (hashType === 'signup' || isSignupConfirmUrl) {
                setAccountNotice('Email confirmed. Welcome to ARIA.');
              }
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

        // Handle PKCE ?code= query parameter cleanly (including /reset-password?code=... & email confirmation)
        if (typeof window !== 'undefined') {
          const searchParams = new URLSearchParams(window.location.search);
          const pkceCode = searchParams.get('code');
          if (pkceCode) {
            try {
              const { data: exchangeData } = await supabase.auth.exchangeCodeForSession(pkceCode);
              if (exchangeData?.session?.user && mounted) {
                setSession(exchangeData.session);
                setAccessToken(exchangeData.session.access_token);
                setUser(mapSupabaseUser(exchangeData.session.user));
                if (isRecoveryUrl) {
                  setIsPasswordRecovery(true);
                } else if (isSignupConfirmUrl) {
                  setAccountNotice('Email confirmed. Welcome to ARIA.');
                }
                setIsLoading(false);
                try {
                  window.history.replaceState(null, '', window.location.pathname);
                } catch {
                  // ignore
                }
                return;
              }
            } catch {
              // Code may have already been exchanged automatically by detectSessionInUrl
            }
          } else if (isSignupConfirmUrl && mounted) {
            setAccountNotice('Email confirmed. You can now sign in to your ARIA workspace.');
            try {
              window.history.replaceState(null, '', window.location.pathname);
            } catch {
              // ignore
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

    let nativeAppListener: { remove: () => Promise<void> } | null = null;
    if (Capacitor.isNativePlatform()) {
      App.addListener('appUrlOpen', async ({ url }) => {
        if (!url || !url.startsWith(ANDROID_OAUTH_REDIRECT_URL)) return;
        try {
          const parsed = new URL(url.replace(ANDROID_OAUTH_REDIRECT_URL, 'https://aria.local/auth/callback'));
          const code = parsed.searchParams.get('code');
          const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : '');
          if (code && supabase) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (!error && data?.session?.user && mounted) {
              setSession(data.session);
              setAccessToken(data.session.access_token);
              setUser(mapSupabaseUser(data.session.user));
              setIsPasswordRecovery(false);
              setIsLoading(false);
            }
          } else {
            const access_token = hashParams.get('access_token');
            const refresh_token = hashParams.get('refresh_token');
            if (access_token && refresh_token && supabase) {
              const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
              if (!error && data?.session?.user && mounted) {
                setSession(data.session);
                setAccessToken(data.session.access_token);
                setUser(mapSupabaseUser(data.session.user));
                setIsPasswordRecovery(false);
                setIsLoading(false);
              }
            }
          }
        } catch (cbErr) {
          console.error('Native OAuth deep link error:', cbErr);
        } finally {
          try {
            await Browser.close();
          } catch {
            // ignore if already closed
          }
        }
      })
        .then((handle) => {
          nativeAppListener = handle;
        })
        .catch(() => {
          // ignore
        });
    }

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
        if (!mounted) return;
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }
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
        nativeAppListener?.remove().catch(() => {});
        subscription.unsubscribe();
      };
    }

    return () => {
      mounted = false;
      window.removeEventListener('hashchange', handleHashChange);
      nativeAppListener?.remove().catch(() => {});
    };
  }, []);

  const signInWithGitHub = async (): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }

    try {
      if (Capacitor.isNativePlatform()) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: ANDROID_OAUTH_REDIRECT_URL,
            skipBrowserRedirect: true,
          },
        });
        if (error) throw error;
        if (data?.url) {
          await Browser.open({ url: data.url, presentationStyle: 'popover' });
        }
        return { error: null };
      }

      const redirectUrl = isTauriRuntime
        ? TAURI_OAUTH_REDIRECT_URL
        : WEB_OAUTH_REDIRECT_URL;
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
        setIsPasswordRecovery(false);
        setAccountNotice(null);
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
      if (!password || password.length < 8) {
        throw new Error('Password must be at least 8 characters long.');
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: SIGNUP_CONFIRM_REDIRECT_URL,
        },
      });

      if (error) {
        let msg = error.message;
        const lower = msg.toLowerCase();
        if (lower.includes('already registered') || lower.includes('already exists')) {
          msg = 'An account with this email already exists. Please sign in instead.';
        } else if (lower.includes('weak password') || lower.includes('least')) {
          msg = 'Password is too weak. Please use at least 8 characters.';
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
        return { error: null, needsEmailConfirmation: false };
      }

      return { error: null, needsEmailConfirmation: true };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const resendConfirmationEmail = async (email: string): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return { error: new Error('Please enter your account email address first.') };
    }
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail,
        options: {
          emailRedirectTo: SIGNUP_CONFIRM_REDIRECT_URL,
        },
      });
      if (error) throw error;
      return { error: null };
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const requestPasswordReset = async (email: string): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return { error: new Error('Please enter a valid email address.') };
    }

    try {
      await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: PASSWORD_RESET_REDIRECT_URL,
      });
      // Always treat server response uniformly to prevent account enumeration
      return { error: null };
    } catch {
      return { error: null };
    }
  };

  const updatePassword = async (newPassword: string): Promise<{ error: Error | null }> => {
    if (!supabase) {
      return { error: new Error('Supabase client is not configured.') };
    }
    if (!newPassword || newPassword.length < 8) {
      return { error: new Error('Password must be at least 8 characters long.') };
    }

    try {
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      if (data?.user) {
        setUser(mapSupabaseUser(data.user));
      }
      const { data: refreshed } = await supabase.auth.getSession();
      if (refreshed?.session) {
        setSession(refreshed.session);
        setAccessToken(refreshed.session.access_token);
      }
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
      setSession(null);
      setAccessToken(null);
      setUser(null);
      setIsPasswordRecovery(false);
      clearLegacyGuestStorage();
    }
  };

  const deleteAccount = async ({
    confirmText,
    password,
  }: {
    confirmText: string;
    password?: string;
  }): Promise<DeleteAccountResult> => {
    let token = accessToken;
    if (!token && supabase) {
      try {
        const { data: { session: fresh } } = await supabase.auth.getSession();
        token = fresh?.access_token ?? null;
      } catch {
        token = null;
      }
    }

    if (!token) {
      return { error: new Error('Authentication required. Please sign in again.'), statusCode: 401 };
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          confirm_text: confirmText.trim(),
          ...(password ? { password } : {}),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          error: new Error(body?.detail || `Account deletion failed (HTTP ${res.status}).`),
          statusCode: res.status,
        };
      }

      await signOut();
      await purgeAllAriaClientData();
      setAccountNotice('Your ARIA account and all associated data have been permanently deleted.');
      return { error: null, statusCode: 200 };
    } catch (err: any) {
      return {
        error: err instanceof Error ? err : new Error('Failed to reach server for account deletion.'),
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        accessToken,
        authIssuedAtSeconds: decodeJwtIssuedAt(accessToken),
        isAuthenticated: Boolean(user),
        isLoading,
        isPasswordRecovery,
        accountNotice,
        clearAccountNotice,
        clearPasswordRecovery,
        signInWithGitHub,
        signInWithPassword,
        signUpWithPassword,
        resendConfirmationEmail,
        requestPasswordReset,
        updatePassword,
        deleteAccount,
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
