import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type AuthScreenMode = 'signin' | 'signup' | 'forgot';

export default function LoginScreen() {
  const {
    signInWithGitHub,
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    updatePassword,
    isPasswordRecovery,
    clearPasswordRecovery,
    accountNotice,
    clearAccountNotice,
    user,
  } = useAuth();

  const [mode, setMode] = useState<AuthScreenMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot-password cooldown (60s anti-enumeration throttle)
  const [resetCooldownSeconds, setResetCooldownSeconds] = useState(0);

  // Set New Password state (for /reset-password and PASSWORD_RECOVERY)
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [recoveryUpdated, setRecoveryUpdated] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [gitHubError, setGitHubError] = useState<string | null>(null);

  const gitHubTimerRef = useRef<any>(null);

  // Auto-reset GitHub loading spinner on visibilitychange, pageshow, or window focus
  useEffect(() => {
    const resetGitHubState = () => {
      setIsGitHubLoading(false);
      if (gitHubTimerRef.current) {
        clearTimeout(gitHubTimerRef.current);
        gitHubTimerRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetGitHubState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', resetGitHubState);
    window.addEventListener('focus', resetGitHubState);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', resetGitHubState);
      window.removeEventListener('focus', resetGitHubState);
      if (gitHubTimerRef.current) {
        clearTimeout(gitHubTimerRef.current);
      }
    };
  }, []);

  // 60-second countdown timer for password reset submissions
  useEffect(() => {
    if (resetCooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResetCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetCooldownSeconds]);

  const handleGitHub = async () => {
    setGitHubError(null);
    setAuthError(null);
    setAuthSuccess(null);
    clearAccountNotice();
    setIsGitHubLoading(true);

    if (gitHubTimerRef.current) clearTimeout(gitHubTimerRef.current);
    gitHubTimerRef.current = setTimeout(() => {
      setIsGitHubLoading(false);
    }, 10000);

    try {
      const { error } = await signInWithGitHub();
      if (error) {
        setGitHubError(error.message || 'GitHub authentication could not be completed.');
        setIsGitHubLoading(false);
      }
    } catch (err: any) {
      setGitHubError(err?.message || 'Failed to initiate GitHub authentication.');
      setIsGitHubLoading(false);
    }
  };

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setGitHubError(null);
    clearAccountNotice();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError('Please enter your email address.');
      return;
    }

    if (mode === 'forgot') {
      if (resetCooldownSeconds > 0) return;
      setIsSubmitting(true);
      try {
        const { error } = await requestPasswordReset(trimmedEmail);
        if (error) {
          setAuthError(error.message);
        } else {
          setAuthSuccess('If an account exists for that email, a password reset link has been sent.');
          setResetCooldownSeconds(60);
        }
      } catch (err: any) {
        setAuthError(err?.message || 'Unable to process password reset request.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!password) {
      setAuthError('Please enter your password.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await signInWithPassword(trimmedEmail, password);
        if (error) {
          setAuthError(error.message || 'Invalid email or password.');
        }
      } else {
        const { error, needsEmailConfirmation } = await signUpWithPassword(trimmedEmail, password);
        if (error) {
          setAuthError(error.message || 'Failed to create account.');
        } else if (needsEmailConfirmation) {
          setAuthSuccess('Account created! A confirmation link has been sent to your email.');
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'An unexpected authentication error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    if (!newPassword || newPassword.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setAuthError('Passwords do not match. Please verify both fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await updatePassword(newPassword);
      if (error) {
        setAuthError(error.message || 'Failed to update password. Please request a fresh recovery link.');
        return;
      }
      setRecoveryUpdated(true);
      setAuthSuccess('Password updated successfully. Redirecting to your workspace...');
      window.setTimeout(() => {
        clearPasswordRecovery();
      }, 1500);
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to update password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRecoveryRoute =
    isPasswordRecovery ||
    (typeof window !== 'undefined' && window.location.pathname === '/reset-password');

  // Password strength heuristic for Set New Password feedback
  const passwordStrengthChecks = [
    { label: 'At least 8 characters', ok: newPassword.length >= 8 },
    { label: 'Uppercase & lowercase letters', ok: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) },
    { label: 'Number or symbol', ok: /[\d\W_]/.test(newPassword) },
  ];

  if (isRecoveryRoute) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050811] text-[#EDEDED] flex items-center justify-center p-4 select-none">
        <div className="w-full max-w-md p-6 sm:p-8 bg-[#09090B] border border-white/[0.08] rounded-[10px] space-y-5 shadow-2xl">
          <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.07]">
            <span className="text-[12px] font-mono font-semibold tracking-[-0.02em] text-[#EDEDED]">
              ARIA RESEARCH ENGINE
            </span>
            <span className="text-[11px] font-mono text-[#71717A] tabular-nums">
              RECOVERY
            </span>
          </div>

          <div className="flex items-start gap-2.5">
            <KeyRound size={18} className="text-[#60A5FA] shrink-0 mt-1" />
            <div>
              <h1 className="text-[20px] font-semibold text-[#EDEDED] tracking-[-0.02em]">
                Set New Password
              </h1>
              <p className="text-[12.5px] text-[#8B8B8E] leading-relaxed mt-1">
                Choose a strong password for your ARIA researcher account.
              </p>
            </div>
          </div>

          {authError && (
            <div className="p-3 bg-[#0D090B] border border-red-500/40 text-[12px] text-red-400 rounded-[6px] flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
              <span className="leading-snug">{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div className="p-3 bg-[#090D11] border border-emerald-500/40 text-[12px] text-emerald-400 rounded-[6px] flex items-start gap-2">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-400" />
              <span className="leading-snug">{authSuccess}</span>
            </div>
          )}

          {!recoveryUpdated ? (
            <form onSubmit={handleSetNewPasswordSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-mono text-[#8B8B8E] uppercase tracking-wider">
                  New Password
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-3 text-[#71717A]" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="Minimum 8 characters"
                    disabled={isSubmitting}
                    autoComplete="new-password"
                    className="w-full bg-[#111115] pl-9 pr-10 py-2 text-[13px] text-[#EDEDED] placeholder-[#71717A] border border-white/[0.08] focus:border-[#60A5FA]/50 focus:outline-none rounded-[6px] transition-colors font-mono"
                    aria-label="New password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-2.5 text-[#71717A] hover:text-[#EDEDED] p-0.5 rounded cursor-pointer"
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-mono text-[#8B8B8E] uppercase tracking-wider">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-3 text-[#71717A]" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => {
                      setConfirmNewPassword(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="Re-enter password"
                    disabled={isSubmitting}
                    autoComplete="new-password"
                    className="w-full bg-[#111115] pl-9 pr-3 py-2 text-[13px] text-[#EDEDED] placeholder-[#71717A] border border-white/[0.08] focus:border-[#60A5FA]/50 focus:outline-none rounded-[6px] transition-colors font-mono"
                    aria-label="Confirm new password"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-[6px] bg-[#111115] border border-white/[0.06] space-y-1">
                {passwordStrengthChecks.map((rule) => (
                  <div key={rule.label} className="flex items-center gap-2 text-[11px] font-mono">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        rule.ok ? 'bg-emerald-400' : 'bg-[#52525B]'
                      }`}
                    />
                    <span className={rule.ok ? 'text-emerald-400' : 'text-[#8B8B8E]'}>{rule.label}</span>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || newPassword.length < 8 || newPassword !== confirmNewPassword}
                className="w-full py-2.5 px-4 bg-[#EDEDED] hover:bg-white text-[#09090B] font-medium text-[13px] rounded-[6px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-[#09090B]" />
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => clearPasswordRecovery()}
              className="w-full py-2.5 px-4 bg-[#EDEDED] hover:bg-white text-[#09090B] font-medium text-[13px] rounded-[6px] flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>{user ? 'Enter Workspace' : 'Continue to Sign In'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setAuthError(null);
              setAuthSuccess(null);
              clearPasswordRecovery();
            }}
            className="w-full py-1.5 text-[12px] text-[#8B8B8E] hover:text-[#EDEDED] font-mono flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={12} />
            <span>Back to Sign In</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050811] text-[#EDEDED] flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md p-6 sm:p-8 bg-[#09090B] border border-white/[0.08] rounded-[10px] space-y-5 shadow-2xl">
        {/* Brand Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.07]">
          <span className="text-[12px] font-mono font-semibold tracking-[-0.02em] text-[#EDEDED]">
            ARIA RESEARCH ENGINE
          </span>
          <span className="text-[11px] font-mono text-[#71717A] tabular-nums">
            v2.0
          </span>
        </div>

        <div>
          <h1 className="text-[20px] font-semibold text-[#EDEDED] tracking-[-0.02em]">
            {mode === 'signin'
              ? 'Sign in to ARIA'
              : mode === 'signup'
              ? 'Create an Account'
              : 'Reset your password'}
          </h1>
          <p className="text-[12.5px] text-[#8B8B8E] leading-relaxed mt-1">
            {mode === 'forgot'
              ? 'Enter your email address and we will send a password recovery link.'
              : 'Autonomous scientific synthesis with deterministic verification and primary source grounding.'}
          </p>
        </div>

        {accountNotice && (
          <div className="p-3 bg-[#09120E] border border-emerald-500/40 text-[12px] text-emerald-300 rounded-[6px] flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-400" />
              <span className="leading-snug">{accountNotice}</span>
            </div>
            <button
              type="button"
              onClick={clearAccountNotice}
              className="text-emerald-400/70 hover:text-emerald-300 cursor-pointer"
              aria-label="Dismiss notice"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Mode Toggle: Sign In / Create Account */}
        {mode !== 'forgot' && (
          <div className="grid grid-cols-2 p-1 bg-[#111115] border border-white/[0.06] rounded-[7px]">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className={`py-1.5 text-[12px] font-mono font-medium rounded-[5px] transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-[#18181E] text-[#EDEDED] shadow-sm border border-white/[0.08]'
                  : 'text-[#8B8B8E] hover:text-[#EDEDED]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className={`py-1.5 text-[12px] font-mono font-medium rounded-[5px] transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-[#18181E] text-[#EDEDED] shadow-sm border border-white/[0.08]'
                  : 'text-[#8B8B8E] hover:text-[#EDEDED]'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Inline Alerts */}
        {authError && (
          <div className="p-3 bg-[#0D090B] border border-red-500/40 text-[12px] text-red-400 rounded-[6px] flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
            <span className="leading-snug">{authError}</span>
          </div>
        )}

        {authSuccess && (
          <div className="p-3 bg-[#090D11] border border-[#60A5FA]/40 text-[12px] text-[#60A5FA] rounded-[6px] flex items-start gap-2">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-[#60A5FA]" />
            <span className="leading-snug">{authSuccess}</span>
          </div>
        )}

        {gitHubError && (
          <div className="p-3 bg-[#0D090B] border border-red-500/40 text-[12px] text-red-400 rounded-[6px] flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-red-400" />
            <span className="leading-snug">{gitHubError}</span>
          </div>
        )}

        {/* Primary Email + Password / Forgot Form */}
        <form onSubmit={handleEmailPasswordSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-[#8B8B8E] uppercase tracking-wider">
              Email
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-3 text-[#71717A]" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authError) setAuthError(null);
                }}
                placeholder="name@university.edu"
                disabled={isSubmitting}
                autoComplete="email"
                className="w-full bg-[#111115] pl-9 pr-3 py-2 text-[13px] text-[#EDEDED] placeholder-[#71717A] border border-white/[0.08] focus:border-[#60A5FA]/50 focus:outline-none rounded-[6px] transition-colors"
                aria-label="Email address"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono text-[#8B8B8E] uppercase tracking-wider">
                  Password
                </label>
                {mode === 'signup' ? (
                  <span className="text-[10px] font-mono text-[#71717A]">
                    min 8 chars
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setAuthError(null);
                      setAuthSuccess(null);
                      setGitHubError(null);
                    }}
                    className="text-[11px] font-mono text-[#60A5FA] hover:text-[#93C5FD] transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-3 text-[#71717A]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (authError) setAuthError(null);
                  }}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full bg-[#111115] pl-9 pr-10 py-2 text-[13px] text-[#EDEDED] placeholder-[#71717A] border border-white/[0.08] focus:border-[#60A5FA]/50 focus:outline-none rounded-[6px] transition-colors font-mono"
                  aria-label="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-2.5 top-2.5 text-[#71717A] hover:text-[#EDEDED] p-0.5 rounded cursor-pointer transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !email.trim() ||
              (mode !== 'forgot' && !password) ||
              (mode === 'forgot' && resetCooldownSeconds > 0)
            }
            className="w-full py-2.5 px-4 bg-[#EDEDED] hover:bg-white text-[#09090B] font-medium text-[13px] rounded-[6px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin text-[#09090B]" />
                <span>
                  {mode === 'signin'
                    ? 'Signing In...'
                    : mode === 'signup'
                    ? 'Creating Account...'
                    : 'Sending Reset Link...'}
                </span>
              </>
            ) : mode === 'forgot' ? (
              <span>
                {resetCooldownSeconds > 0
                  ? `Resend available in ${resetCooldownSeconds}s`
                  : 'Send Reset Link'}
              </span>
            ) : (
              <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
            )}
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className="w-full py-1.5 text-[12px] text-[#8B8B8E] hover:text-[#EDEDED] font-mono flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={12} />
              <span>Back to Sign In</span>
            </button>
          )}
        </form>

        {mode !== 'forgot' && (
          <>
            {/* Divider */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 h-[1px] bg-white/[0.07]" />
              <span className="text-[10.5px] font-mono text-[#71717A] uppercase tracking-wider">
                or continue with
              </span>
              <div className="flex-1 h-[1px] bg-white/[0.07]" />
            </div>

            {/* Continue with GitHub Button */}
            <button
              type="button"
              onClick={handleGitHub}
              disabled={isGitHubLoading}
              className="w-full py-2.5 px-4 bg-[#111115] hover:bg-[#18181E] border border-white/[0.08] hover:border-white/[0.16] text-[#EDEDED] text-[13px] font-medium rounded-[6px] flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
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
          </>
        )}

        {/* Security Footer */}
        <div className="pt-3 border-t border-white/[0.07] flex items-center justify-between text-[10.5px] font-mono text-[#71717A]">
          <span>PKCE SHA-256</span>
          <span>SUPABASE AUTH</span>
        </div>
      </div>
    </div>
  );
}
