import React, { useState } from 'react';
import { Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { signInWithGitHub, signInWithEmail, signInInstantResearcher } = useAuth();

  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [gitHubError, setGitHubError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleGitHub = async () => {
    setGitHubError(null);
    setIsGitHubLoading(true);
    try {
      const { error } = await signInWithGitHub();
      if (error) {
        setGitHubError(error.message || 'GitHub authentication failed. Please try again.');
        setIsGitHubLoading(false);
      }
    } catch (err: any) {
      setGitHubError(err?.message || 'Failed to initiate GitHub authentication.');
      setIsGitHubLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError('Please enter your email address.');
      return;
    }

    setIsEmailLoading(true);
    try {
      const { error } = await signInWithEmail(trimmed);
      if (error) {
        setEmailError(error.message || 'Failed to send magic link. Please check the address.');
      } else {
        setEmailSuccess(`Magic link sent to ${trimmed}. Check your inbox to sign in.`);
      }
    } catch (err: any) {
      setEmailError(err?.message || 'An error occurred while sending the magic link.');
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#09090B] text-[#EDEDED] flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md p-6 sm:p-8 bg-[#111115] border border-white/[0.07] rounded-[10px] space-y-6 shadow-2xl">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.07]">
          <span className="text-[13px] font-mono font-semibold tracking-[-0.02em] text-[#EDEDED]">
            ARIA RESEARCH ENGINE
          </span>
          <span className="text-[11px] font-mono text-[#71717A] tabular-nums">
            v2.0
          </span>
        </div>

        <div>
          <h1 className="text-[22px] font-semibold text-[#EDEDED] tracking-[-0.02em]">
            Sign in to ARIA
          </h1>
          <p className="text-[13px] text-[#8B8B8E] leading-relaxed mt-1">
            Autonomous research workspace with deterministic verification and primary source citations.
          </p>
        </div>

        {gitHubError && (
          <div className="p-3 bg-[#09090B] border border-red-500/40 text-[12px] text-red-400 rounded-[6px] flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{gitHubError}</span>
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGitHub}
            disabled={isGitHubLoading}
            className="w-full py-2.5 px-4 bg-[#09090B] hover:bg-[#18181E] border border-white/[0.07] hover:border-white/[0.14] text-[#EDEDED] text-[13px] font-medium rounded-[6px] flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {isGitHubLoading ? (
              <>
                <Loader2 size={15} className="animate-spin text-[#EDEDED]" />
                <span>Connecting to GitHub...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>Continue with GitHub</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-[1px] bg-white/[0.07]" />
            <span className="text-[11px] font-mono text-[#71717A] uppercase tracking-wider">
              or continue with email
            </span>
            <div className="flex-1 h-[1px] bg-white/[0.07]" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-3 text-[#71717A]" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="name@university.edu"
                disabled={isEmailLoading}
                className="w-full bg-[#09090B] pl-9 pr-3 py-2 text-[13px] text-[#EDEDED] placeholder-[#71717A] border border-white/[0.07] focus:border-white/[0.2] focus:outline-none rounded-[6px] transition-colors"
                aria-label="Email address"
              />
            </div>

            <button
              type="submit"
              disabled={isEmailLoading || !email.trim()}
              className="w-full btn-primary text-[13px] py-2"
            >
              {isEmailLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin text-[#09090B]" />
                  <span>Sending Magic Link...</span>
                </>
              ) : (
                <span>Send Magic Link</span>
              )}
            </button>
          </form>

          {emailSuccess && (
            <div className="p-3 bg-[#09090B] border border-[#60A5FA]/40 text-[12px] text-[#60A5FA] rounded-[6px] flex items-start gap-2">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              <span>{emailSuccess}</span>
            </div>
          )}

          {emailError && (
            <div className="p-3 bg-[#09090B] border border-red-500/40 text-[12px] text-red-400 rounded-[6px] flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{emailError}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={signInInstantResearcher}
              className="w-full py-2 text-[12px] text-[#8B8B8E] hover:text-[#EDEDED] font-mono transition-colors flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <span>Continue as Guest</span>
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-white/[0.07] flex items-center justify-between text-[11px] font-mono text-[#71717A]">
          <span>PKCE SHA-256</span>
          <span>SUPABASE AUTH</span>
        </div>
      </div>
    </div>
  );
}
