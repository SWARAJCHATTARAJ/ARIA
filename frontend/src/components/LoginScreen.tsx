import React, { useState } from 'react';
import { Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { signInWithGitHub, signInWithEmail } = useAuth();

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
    <div className="fixed inset-0 z-50 bg-[#0A0A0B] text-[#EDEDED] flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md p-8 bg-[#141416] border border-[#262629] rounded-[8px] space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262629]">
          <span className="text-[14px] font-mono font-semibold tracking-wider text-[#EDEDED]">
            ARIA RESEARCH ENGINE
          </span>
          <span className="text-[12px] font-mono text-[#8B8B8E]">
            v2.0
          </span>
        </div>

        <div>
          <h1 className="text-[24px] font-semibold text-[#EDEDED] tracking-tight">
            Sign in to ARIA
          </h1>
          <p className="text-[14px] text-[#8B8B8E] leading-relaxed mt-1">
            Autonomous research engine with multi-tier verification and citation integrity.
          </p>
        </div>

        {gitHubError && (
          <div className="p-3 bg-[#0A0A0B] border border-[#EF4444]/40 text-[12px] text-[#EF4444] rounded-[6px] flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{gitHubError}</span>
          </div>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGitHub}
            disabled={isGitHubLoading}
            className="w-full py-2.5 px-4 bg-[#0A0A0B] hover:bg-[#1B1B1E] border border-[#262629] hover:border-[#38383C] text-[#EDEDED] text-[14px] font-medium rounded-[6px] flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isGitHubLoading ? (
              <>
                <Loader2 size={16} className="animate-spin text-[#EDEDED]" />
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
            <div className="flex-1 h-[1px] bg-[#262629]" />
            <span className="text-[12px] font-mono text-[#8B8B8E] uppercase tracking-wider">
              or continue with email
            </span>
            <div className="flex-1 h-[1px] bg-[#262629]" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-3 text-[#8B8B8E]" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="name@university.edu"
                disabled={isEmailLoading}
                className="w-full bg-[#0A0A0B] pl-9 pr-3 py-2 text-[14px] text-[#EDEDED] placeholder-[#8B8B8E] border border-[#262629] focus:border-[#5E8BFF] focus:outline-none rounded-[6px] transition-colors"
                aria-label="Email address"
              />
            </div>

            <button
              type="submit"
              disabled={isEmailLoading || !email.trim()}
              className="w-full btn-primary"
            >
              {isEmailLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Sending Magic Link...</span>
                </>
              ) : (
                <span>Send Magic Link</span>
              )}
            </button>
          </form>

          {emailSuccess && (
            <div className="p-3 bg-[#0A0A0B] border border-[#34D399]/40 text-[12px] text-[#34D399] rounded-[6px] flex items-start gap-2">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-[#34D399]" />
              <span>{emailSuccess}</span>
            </div>
          )}

          {emailError && (
            <div className="p-3 bg-[#0A0A0B] border border-[#EF4444]/40 text-[12px] text-[#EF4444] rounded-[6px] flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{emailError}</span>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-[#262629] flex items-center justify-between text-[12px] font-mono text-[#8B8B8E]">
          <span>PKCE SHA-256</span>
          <span>SUPABASE AUTH</span>
        </div>
      </div>
    </div>
  );
}
