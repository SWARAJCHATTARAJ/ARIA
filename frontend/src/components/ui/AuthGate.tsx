import React, { useEffect, useRef, useState, ReactNode } from 'react';
import { Github, ShieldCheck, Zap } from 'lucide-react';
import { useAuth, ARIA_GUEST_FLAG_KEY } from '../../context/AuthContext';
import AriaCoreIndicator from '../AriaCoreIndicator';
import HeroMagnifier from './HeroMagnifier';

/** Minimalist session check — obsidian void, pulsing core, SYS // AUTH_CHECK. */
function AuthLoadingState() {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-[#050505] select-none"
      role="status"
      aria-label="Authenticating"
    >
      <AriaCoreIndicator state="THINKING" size={64} />
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-cyan-300 animate-pulse">
          SYS // AUTH_CHECK
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-gray-600">
          verifying session credentials · PKCE handshake
        </span>
      </div>
      <div className="w-48 h-px bg-white/[0.06] overflow-hidden">
        <div className="h-full w-1/3 bg-cyan-500/70 animate-auth-scan" />
      </div>
    </div>
  );
}

/** Strict Auth Gate — inner workspace mounts ONLY with a valid session/guest state. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading, signInWithGitHub, signInInstantResearcher, hasSupabaseConfig } = useAuth();
  const [enterAnim, setEnterAnim] = useState(false);
  const wasOpenRef = useRef(false);

  const open = Boolean(user) || (typeof window !== 'undefined' && localStorage.getItem(ARIA_GUEST_FLAG_KEY) === 'true');

  useEffect(() => {
    if (open) {
      if (!wasOpenRef.current) setEnterAnim(true);
      wasOpenRef.current = true;
    } else {
      wasOpenRef.current = false;
      setEnterAnim(false);
    }
  }, [open]);

  // Cinematic exit transition (~700ms): magnifier expands & fades, workspace fades in
  useEffect(() => {
    if (!enterAnim) return;
    const t = window.setTimeout(() => setEnterAnim(false), 780);
    return () => window.clearTimeout(t);
  }, [enterAnim]);

  if (isLoading) return <AuthLoadingState />;
  if (!open) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#050505] flex items-center justify-center p-4 overflow-y-auto select-none">
        {/* Tactical glowing magnifying glass reticle — follows cursor, HUD lens */}
        <div className="fixed inset-0 z-[90] flex items-center justify-center pointer-events-none">
          <HeroMagnifier />
        </div>
        <LoginView
          hasSupabaseConfig={hasSupabaseConfig}
          onGitHub={() => signInWithGitHub()}
          onGuest={signInInstantResearcher}
        />
      </div>
    );
  }

  // Cinematic transition into the inner workspace: magnifier expands/fades out
  // while the inner workspace fades in — no reload, GPU-only transforms.
  if (enterAnim) {
    return (
      <>
        <div
          className={`fixed inset-0 z-[95] flex items-center justify-center pointer-events-none ${
            enterAnim ? 'aria-magnify-exit' : ''
          }`}
        >
          <HeroMagnifier />
        </div>
        <div className="fixed inset-0 z-10 bg-[#050505] animate-fade-in">{children}</div>
      </>
    );
  }

  // Strict gate passed — mount the inner workspace
  return <>{children}</>;
}

/** Forced login view — rendered for unauthenticated users; contains the instant guest bypass. */
function LoginView({
  hasSupabaseConfig,
  onGitHub,
  onGuest,
}: {
  hasSupabaseConfig: boolean;
  onGitHub: () => void;
  onGuest: () => void;
}) {
  return (
    <div className="relative w-full max-w-md bg-ink-base border border-ink-surface shadow-2xl rounded-none p-6 md:p-8 text-gray-200 overflow-hidden aria-reticle">
      <div className="flex flex-col items-center text-center space-y-2 mb-6">
        <div className="w-12 h-12 flex items-center justify-center border border-tier-okf/40 bg-tier-okf/10 text-tier-okf mb-1">
          <Github size={24} />
        </div>
        <h1 className="text-xl font-bold font-sans text-white tracking-tight">
          Authenticate Research Session
        </h1>
        <p className="text-xs font-mono text-ink-muted max-w-xs">
          {hasSupabaseConfig
            ? 'Sign in to unlock deterministic cross-tier retrieval, saved research collections, and full paper exports.'
            : 'Instant local session · Zero external credentials required'}
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={onGitHub}
          className="press w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-950 font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-3 transition-all duration-200 hover:scale-[1.01]"
        >
          <Github size={16} />
          <span>Continue with GitHub</span>
        </button>

        <button
          onClick={onGuest}
          className="press aria-hover-glow w-full py-2.5 px-4 bg-[#101217] hover:bg-[#161922] border border-white/[0.07] hover:border-white/[0.18] text-gray-300 hover:text-white font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200"
        >
          <Zap size={14} className="text-tier-live" />
          <span>Continue as Guest — Skip Login</span>
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-white/[0.07] text-center">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-ink-muted">
          <ShieldCheck size={12} className="text-emerald-400" />
          <span>
            {hasSupabaseConfig
              ? 'Secured by Supabase OAuth & PKCE · Guest mode stored locally'
              : 'Instant local session · Zero external credentials required'}
          </span>
        </div>
      </div>
    </div>
  );
}
