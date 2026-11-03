import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase'; // Adjust import path if needed

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('aria_guest_session') === 'true';
  });
  const [isEntering, setIsEntering] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const lensRef = useRef<HTMLDivElement>(null);
  const gridRevealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check existing Supabase session without blocking Guest Mode
    if (supabase?.auth) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) setIsAuthenticated(true);
      }).catch(() => {});

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          triggerSmoothEntry(() => setIsAuthenticated(true));
        }
      });
      return () => subscription.unsubscribe();
    }
  }, []);

  // 60fps Zero-Lag Cursor Tracking for the Optical HUD Lens
  useEffect(() => {
    if (isAuthenticated) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (lensRef.current) {
        lensRef.current.style.transform = `translate3d(${e.clientX - 110}px, ${e.clientY - 110}px, 0)`;
      }
      if (gridRevealRef.current) {
        gridRevealRef.current.style.maskImage = `radial-gradient(180px circle at ${e.clientX}px ${e.clientY}px, black 0%, transparent 100%)`;
        gridRevealRef.current.style.webkitMaskImage = `radial-gradient(180px circle at ${e.clientX}px ${e.clientY}px, black 0%, transparent 100%)`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isAuthenticated]);

  const triggerSmoothEntry = (callback: () => void) => {
    setIsEntering(true);
    setTimeout(() => {
      callback();
      setIsEntering(false);
    }, 450);
  };

  const handleGuestEnter = () => {
    localStorage.setItem('aria_guest_session', 'true');
    triggerSmoothEntry(() => {
      setIsAuthenticated(true);
    });
  };

  const handleGitHubLogin = async () => {
    setAuthError(null);
    setIsLoadingAuth(true);
    try {
      if (!supabase || !import.meta.env.VITE_SUPABASE_URL) {
        // If Supabase env vars are missing on Vercel/local, fallback cleanly or show exact cause
        throw new Error('Supabase URL/Key missing in environment. Entering Workspace via Local Session...');
      }
      const isNative = Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__ || (window as any).Capacitor?.isNativePlatform?.());
      const redirectTo = isNative ? '[https://aria.swarajchattaraj.tech](https://aria.swarajchattaraj.tech)' : window.location.origin;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo }
      });
      if (error) throw error;
    } catch (err: any) {
      setAuthError(err.message || 'OAuth handshake failed');
      setIsLoadingAuth(false);
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className={`fixed inset-0 z-50 bg-[#050505] text-[#F3F4F6] flex flex-col items-center justify-center select-none overflow-hidden transition-all duration-500 ${isEntering ? 'opacity-0 scale-105' : 'opacity-100 scale-100'}`}>
      
      {/* Subtle Base Architectural Grid */}
      <div 
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />

      {/* Interactive High-Contrast Telemetry Layer Revealed ONLY Inside the Optical Lens */}
      <div 
        ref={gridRevealRef}
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          backgroundImage: 'linear-gradient(to right, #38BDF8 1px, transparent 1px), linear-gradient(to bottom, #38BDF8 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          maskImage: 'radial-gradient(180px circle at -500px -500px, black 0%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(180px circle at -500px -500px, black 0%, transparent 100%)'
        } as React.CSSProperties}
      />

      {/* Precision Optical Scanner Ring (Zero Scaling Distortion) */}
      <div
        ref={lensRef}
        className={`fixed top-0 left-0 w-[220px] h-[220px] rounded-full pointer-events-none z-20 hidden md:flex items-center justify-center transition-opacity duration-300 ${isEntering ? 'opacity-0 scale-150' : 'opacity-100'}`}
        style={{
          border: '1px solid rgba(56, 189, 248, 0.35)',
          boxShadow: 'inset 0 0 30px rgba(56, 189, 248, 0.08), 0 0 20px rgba(0, 0, 0, 0.8)',
          transform: 'translate3d(-500px, -500px, 0)'
        } as React.CSSProperties}
      >
        <div className="w-2 h-2 border border-[#38BDF8]/60 rounded-full" />
        <span className="absolute -bottom-5 font-mono text-[9px] tracking-[0.25em] text-[#38BDF8]/80 uppercase">
          OPTICAL // SCAN
        </span>
      </div>

      {/* Center Command Card */}
      <div className="relative z-30 w-full max-w-md mx-4 p-8 bg-[#0A0B0E] border border-white/[0.08] aria-reticle shadow-2xl">
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
            <span className="font-mono text-[11px] tracking-[0.2em] text-[#8A8F9E] uppercase">
              SYS // ARIA-OBSIDIAN
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#8A8F9E]/60">v2.4</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-[#F3F4F6] mb-2">
          ARIA Workspace
        </h1>
        <p className="text-sm text-[#8A8F9E] mb-8 leading-relaxed">
          High-frequency academic & engineering intelligence environment. Authenticate or initialize a local session to enter.
        </p>

        {authError && (
          <div className="mb-5 p-3 bg-red-950/30 border border-red-500/30 text-xs text-red-300 font-mono">
            {authError}
          </div>
        )}

        <div className="space-y-3">
          {/* Primary Instant Action: Enter Workspace */}
          <button
            onClick={handleGuestEnter}
            className="w-full py-3 px-4 bg-[#F3F4F6] hover:bg-white text-[#050505] font-medium text-sm tracking-wide transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>INITIALIZE WORKSPACE (GUEST)</span>
            <span className="font-mono text-xs">→</span>
          </button>

          {/* Secondary Action: GitHub OAuth */}
          <button
            onClick={handleGitHubLogin}
            disabled={isLoadingAuth}
            className="w-full py-3 px-4 bg-[#101217] hover:bg-[#161920] text-[#F3F4F6] border border-white/[0.08] hover:border-white/[0.2] font-medium text-sm transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>{isLoadingAuth ? 'CONNECTING TO GITHUB...' : 'AUTHENTICATE WITH GITHUB'}</span>
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.05] flex items-center justify-between text-[11px] font-mono text-[#8A8F9E]/60">
          <span>STATUS: READY</span>
          <span>ENCRYPTION: PKCE-SHA256</span>
        </div>
      </div>
    </div>
  );
};
