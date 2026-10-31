import React from 'react';
import { X, Github, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, signInWithGitHub, signInInstantResearcher, hasSupabaseConfig } = useAuth();

  if (!isAuthModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-ink-base border border-ink-surface shadow-2xl rounded-none p-6 md:p-8 text-gray-200 overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-tier-okf/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-ink-muted hover:text-white transition-colors p-1"
          aria-label="Close auth dialog"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-2 mb-6">
          <div className="w-12 h-12 flex items-center justify-center border border-tier-okf/40 bg-tier-okf/10 text-tier-okf mb-1 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
            <Github size={24} />
          </div>
          <h2 className="text-xl font-bold font-sans text-white tracking-tight">
            Authenticate Research Session
          </h2>
          <p className="text-xs font-mono text-ink-muted max-w-xs">
            Sign in to unlock deterministic cross-tier retrieval, saved research collections, and full paper exports.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => signInWithGitHub()}
            className="w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-950 font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-3 transition-all duration-200 shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-[1.01]"
          >
            <Github size={16} />
            <span>Continue with GitHub</span>
          </button>

          <button
            onClick={() => signInInstantResearcher()}
            className="w-full py-2.5 px-4 bg-ink-surface/80 hover:bg-ink-surface border border-ink-surface hover:border-tier-okf/50 text-tier-okf font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all duration-200"
          >
            <Zap size={14} className="text-tier-live" />
            <span>Continue in Instant Researcher Mode</span>
          </button>
        </div>

        {/* Security / Notice footnote */}
        <div className="mt-6 pt-4 border-t border-ink-surface/80 text-center">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono text-ink-muted">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span>
              {hasSupabaseConfig ? 'Secured by Supabase OAuth & PKCE' : 'Instant local session · Zero external credentials required'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
