import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

export interface AuthUserProfile {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl: string;
  provider: 'github' | 'instant';
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

// Read Vite Supabase environment variables safely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    console.warn('Failed to initialize Supabase client:', e);
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
            const sbUser = session.user;
            const meta = sbUser.user_metadata || {};
            setUser({
              id: sbUser.id,
              name: meta.full_name || meta.name || meta.user_name || 'Researcher',
              username: meta.user_name || meta.preferred_username || sbUser.email?.split('@')[0] || 'researcher',
              email: sbUser.email,
              avatarUrl: meta.avatar_url || 'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
              provider: 'github',
            });
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.warn('Supabase session lookup error:', err);
        }
      }

      // 2. Check local Instant Researcher session
      try {
        const localGuest = localStorage.getItem(AUTH_GUEST_KEY);
        if (localGuest && mounted) {
          const parsed = JSON.parse(localGuest);
          setUser(parsed);
          setIsLoading(false);
          return;
        }
      } catch {
        // ignore
      }

      if (mounted) {
        setUser(null);
        setIsLoading(false);
      }
    }

    initAuth();

    // 3. Listen to Supabase auth state changes
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          const sbUser = session.user;
          const meta = sbUser.user_metadata || {};
          const profile: AuthUserProfile = {
            id: sbUser.id,
            name: meta.full_name || meta.name || meta.user_name || 'Researcher',
            username: meta.user_name || meta.preferred_username || sbUser.email?.split('@')[0] || 'researcher',
            email: sbUser.email,
            avatarUrl: meta.avatar_url || 'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
            provider: 'github',
          };
          setUser(profile);
          if (pendingAction) {
            pendingAction();
            setPendingAction(null);
          }
        } else {
          // If no supabase session, keep guest if exists
          try {
            const localGuest = localStorage.getItem(AUTH_GUEST_KEY);
            if (localGuest) {
              setUser(JSON.parse(localGuest));
            } else {
              setUser(null);
            }
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('GitHub OAuth error:', err);
      // Fallback
      signInInstantResearcher();
    }
  };

  const signInInstantResearcher = () => {
    const instantProfile: AuthUserProfile = {
      id: 'instant-researcher-' + Math.random().toString(36).substring(2, 7),
      name: 'Instant Researcher',
      username: 'guest_researcher',
      avatarUrl: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
      provider: 'instant',
    };
    try {
      localStorage.setItem(AUTH_GUEST_KEY, JSON.stringify(instantProfile));
    } catch {
      // ignore
    }
    setUser(instantProfile);
    setIsAuthModalOpen(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem(AUTH_GUEST_KEY);
    } catch {
      // ignore
    }
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Supabase sign out error:', err);
      }
    }
    setUser(null);
  };

  const requireAuth = (action: () => void) => {
    if (user) {
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
