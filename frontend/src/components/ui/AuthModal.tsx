import React, { useState } from 'react';
import { X, Github, Loader2, Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, signInInstantResearcher } = useAuth();

  const [isRedirecting, setIsRedirecting] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [otpStatus, setOtpStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [otpMessage, setOtpMessage] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleGitHubSignIn = async () => {
    setOauthError(null);
    setIsRedirecting(true);
    try {
      if (!supabase) {
        throw new Error(
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign-in.'
        );
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Successful OAuth redirects away from this page; keep the loading state.
    } catch (err) {
      setOauthError(
        err instanceof Error ? err.message : 'GitHub sign-in failed. Please try again.'
      );
      setIsRedirecting(false);
    }
  };

  const handleMagicLink = async () => {
    const trimmed = email.trim();
    setOtpStatus('sending');
    setOtpMessage(null);
    try {
      if (!supabase) {
        throw new Error(
          'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign-in.'
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        throw new Error('Enter a valid email address.');
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setOtpStatus('sent');
      setOtpMessage(`Magic link sent to ${trimmed}. Check your inbox to finish signing in.`);
    } catch (err) {
      setOtpStatus('error');
      setOtpMessage(err instanceof Error ? err.message : 'Could not send the magic link.');
    }
  };

  const handleGuest = () => {
    closeAuthModal();
    signInInstantResearcher();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to ARIA Workspace"
    >
      <div
        className="absolute inset-0"
        onClick={closeAuthModal}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-md p-6 md:p-8 animate-view-enter"
        style={{ background: '#111115', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '10px' }}
      >
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-[#52525B] hover:text-[#F4F4F6] transition-colors p-1"
          aria-label="Close sign-in dialog"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold tracking-tight text-[#F4F4F6]">
            Sign in to ARIA Workspace
          </h2>
          <p className="text-sm text-[#A1A1AA] leading-relaxed mt-2">
            Sync your research history, collections, and verified citations across web, desktop, and
            mobile.
          </p>
        </div>

        {/* Inline red error banner (OAuth) */}
        {oauthError && (
          <div className="mb-4 p-3 flex items-start gap-2 bg-red-950/40 border border-red-500/40 text-xs text-red-300 font-mono" role="alert">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{oauthError}</span>
          </div>
        )}

        <div className="space-y-3">
          {/* Primary: Continue with GitHub */}
          <button
            onClick={handleGitHubSignIn}
            disabled={isRedirecting}
            className="ui-btn w-full py-3 px-4 bg-[#F4F4F6] text-[#09090B] hover:bg-white font-medium text-sm flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:hover:bg-[#F4F4F6]"
          >
            {isRedirecting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Redirecting to GitHub...</span>
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

          {/* Secondary: Email Magic Link */}
          <div
            className="p-3 space-y-2"
            style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px' }}
          >
            <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#52525B]">
              <Mail size={11} /> Email Magic Link
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setOtpStatus('idle');
                  setOtpMessage(null);
                }}
                placeholder="you@university.edu"
                aria-label="Email address for magic link"
                className="flex-1 min-w-0 bg-[#0C0C0F] px-3 py-2 text-xs text-[#F4F4F6] placeholder-[#52525B] focus:outline-none transition-colors"
                style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: '6px' }}
              />
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={otpStatus === 'sending' || !email.trim()}
                className="ui-btn shrink-0 px-3 py-2 bg-[#16161C] hover:bg-[#1C1C24] border border-white/[0.07] hover:border-white/[0.16] text-[#F4F4F6] text-xs font-medium disabled:opacity-40 flex items-center gap-1.5"
                style={{ borderRadius: '6px' }}
              >
                {otpStatus === 'sending' ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> Sending
                  </>
                ) : (
                  'Send Link'
                )}
              </button>
            </div>
            {otpMessage && (
              <p
                className={`text-[11px] font-mono flex items-center gap-1.5 ${
                  otpStatus === 'sent' ? 'text-[#A1A1AA]' : 'text-red-300'
                }`}
                role="status"
              >
                {otpStatus === 'sent' && <CheckCircle2 size={11} className="text-[#10B981]" />}
                {otpMessage}
              </p>
            )}
          </div>
        </div>

        {/* Escape hatch footer */}
        <div className="mt-6 pt-4 border-t border-white/[0.07]">
          <button
            type="button"
            onClick={handleGuest}
            className="ui-btn w-full py-2 text-sm text-[#A1A1AA] hover:text-[#F4F4F6] font-medium flex items-center justify-center gap-1.5"
          >
            <span>Continue as Guest</span>
            <span aria-hidden="true">-&gt;</span>
          </button>
        </div>
      </div>
    </div>
  );
}
