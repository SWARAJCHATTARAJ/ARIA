import React from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Entry gate for the ARIA workspace.
 *
 * Always renders a real screen — never an empty/black frame:
 * - while the initial session check resolves, a minimal splash is shown;
 * - when no user is signed in, the sign-in entry card is shown;
 * - once a user (GitHub) or guest session exists, the workspace renders.
 *
 * Auth state lives exclusively in AuthContext (`aria_guest` flag +
 * `aria-guest-session-v1` profile) — this gate consumes it, it does not
 * duplicate session storage.
 */
export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const { user, isLoading, signInInstantResearcher, signInWithGitHub } = useAuth();

  // Resolving the persisted session — quiet splash, never a blank screen.
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#09090B] flex flex-col items-center justify-center gap-3 select-none">
        <Loader2 size={18} className="animate-spin text-[#52525B]" />
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#52525B]">
          Restoring session
        </span>
      </div>
    );
  }

  if (user) {
    return <>{children}</>;
  }

  const isSupabaseConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#09090B] text-[#F4F4F6] flex flex-col items-center justify-center select-none overflow-hidden p-4">
      <div className="relative z-10 w-full max-w-md mx-4 p-8 bg-[#0C0C0F] border border-white/[0.09] animate-view-enter">
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span className="font-mono text-[11px] tracking-[0.2em] text-[#A1A1AA] uppercase">
              ARIA RESEARCH ENGINE
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#52525B]">v2.4</span>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-[#F4F4F6] mb-2">
          ARIA Workspace
        </h1>
        <p className="text-sm text-[#A1A1AA] mb-8 leading-relaxed">
          Sign in to sync your research history and verified citations, or continue in anonymous
          mode.
        </p>

        <div className="space-y-3">
          <button
            onClick={signInInstantResearcher}
            className="ui-btn w-full py-3 px-4 bg-[#F4F4F6] hover:bg-white text-[#09090B] font-medium text-sm flex items-center justify-center gap-2"
          >
            <span>Continue as Guest</span>
            <span aria-hidden="true">-&gt;</span>
          </button>

          <button
            onClick={() => {
              signInWithGitHub();
            }}
            className="ui-btn w-full py-3 px-4 bg-[#111115] hover:bg-[#16161C] text-[#F4F4F6] border border-white/[0.09] hover:border-white/[0.16] font-medium text-sm flex items-center justify-center gap-2.5 disabled:opacity-50"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>Continue with GitHub</span>
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-white/[0.07] flex items-center justify-between text-[11px] font-mono text-[#52525B]">
          <span>{isSupabaseConfigured ? 'STATUS: READY' : 'STATUS: LOCAL SESSION'}</span>
          <span>ENCRYPTION: PKCE-SHA256</span>
        </div>
      </div>
    </div>
  );
};
