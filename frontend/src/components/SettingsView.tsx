import React, { useState, useCallback, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  User,
  Github,
  LogIn,
  LogOut,
  Gauge,
  Eraser,
  Check,
  Loader2,
  Monitor,
} from 'lucide-react';
import { useSettingsContext } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/config';
import { clearHistory, getHistory } from '../services/storage';

export default function SettingsView() {
  const { settings, onUpdateSettings } = useSettingsContext();
  const { user, signInInstantResearcher, signOut, openAuthModal } = useAuth();

  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState(() => getHistory().length);
  const [cleared, setCleared] = useState(false);

  // Probe backend health once on mount for the ONLINE status dot
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      const t0 = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (mounted) {
          setApiLatencyMs(Math.round(performance.now() - t0));
          setApiStatus(res.ok ? 'online' : 'offline');
        }
      } catch {
        if (mounted) setApiStatus('offline');
      }
    };
    checkHealth();
    return () => {
      mounted = false;
    };
  }, []);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setHistoryCount(0);
    setCleared(true);
    window.setTimeout(() => setCleared(false), 2000);
  }, []);

  const authLabel = user
    ? user.provider === 'guest'
      ? 'Anonymous Guest Session'
      : 'Authenticated via GitHub'
    : 'Public Workspace';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090B] overflow-y-auto hud-scroll select-text text-gray-200">
      {/* Top Header */}
      <div className="px-6 md:px-10 py-5 border-b border-white/[0.07] aria-matte sticky top-0 z-20 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-tier-okf" />
            <h1 className="text-base md:text-lg font-bold font-sans text-[#F4F4F6] tracking-tight">
              Settings
            </h1>
          </div>
          <p className="text-xs font-mono text-[#A1A1AA] mt-0.5">
            Workspace identity, interface motion, and local cache.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-3xl mx-auto w-full space-y-4 pb-24">
        {/* CARD 1: WORKSPACE IDENTITY & SESSION */}
        <section className="ui-card p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-tier-okf" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#F4F4F6] font-bold">
              Workspace Identity &amp; Session
            </h2>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-10 h-10 rounded-full border border-white/[0.16] object-cover shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#16161C] border border-white/[0.07] text-[#A1A1AA] flex items-center justify-center shrink-0">
                  <User size={18} />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#F4F4F6] truncate">
                  {user
                    ? user.provider === 'guest'
                      ? 'Guest Researcher'
                      : user.name || user.username
                    : 'Public Workspace'}
                </div>
                <div className="text-[11px] font-mono text-[#A1A1AA] truncate flex items-center gap-1.5">
                  {user?.provider === 'github' && <Github size={10} />}
                  {authLabel}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {user ? (
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="ui-btn px-3.5 py-2 bg-[#111115] hover:bg-[#16161C] border border-white/[0.09] hover:border-white/[0.16] text-[#F4F4F6] text-xs font-medium flex items-center gap-2"
                >
                  <LogOut size={13} />
                  <span>Sign out</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openAuthModal()}
                  className="ui-btn px-3.5 py-2 bg-[#F4F4F6] hover:bg-white text-[#09090B] text-xs font-medium flex items-center gap-2"
                >
                  <LogIn size={13} />
                  <span>Sign in</span>
                </button>
              )}
              {user && user.provider === 'guest' && (
                <button
                  type="button"
                  onClick={() => openAuthModal()}
                  className="ui-btn px-3.5 py-2 bg-[#111115] hover:bg-[#16161C] border border-white/[0.09] hover:border-white/[0.16] text-[#A1A1AA] hover:text-[#F4F4F6] text-xs font-medium"
                >
                  Upgrade session
                </button>
              )}
            </div>
          </div>

          <p className="text-[10px] font-mono text-[#52525B] mt-4">
            Guest sessions live in this browser only. GitHub sign-in syncs history, collections, and
            verified citations.
          </p>
        </section>

        {/* CARD 2: INTERFACE & MOTION */}
        <section className="ui-card p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Monitor size={16} className="text-tier-okf" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#F4F4F6] font-bold">
              Interface &amp; Motion
            </h2>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 p-3.5 bg-[#0C0C0F] border border-white/[0.07] cursor-pointer hover:border-white/[0.16] transition-colors">
              <div>
                <p className="text-xs font-sans text-[#F4F4F6] font-medium">Compact Reading Density</p>
                <p className="text-[10px] font-mono text-[#52525B] mt-0.5">
                  Tighter line-height and 13px type in answer threads.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.compactDensity}
                onClick={() => onUpdateSettings({ compactDensity: !settings.compactDensity })}
                className={`relative w-10 h-5.5 shrink-0 transition-colors duration-150 ${
                  settings.compactDensity ? 'bg-tier-okf' : 'bg-[#27272A]'
                }`}
                style={{ borderRadius: '9999px', height: '22px' }}
              >
                <span
                  className="absolute top-[3px] left-[3px] w-4 h-4 bg-[#F4F4F6] transition-transform duration-150"
                  style={{
                    borderRadius: '9999px',
                    transform: settings.compactDensity ? 'translateX(16px)' : 'translateX(0)',
                  }}
                />
              </button>
            </label>

            <label className="flex items-center justify-between gap-4 p-3.5 bg-[#0C0C0F] border border-white/[0.07] cursor-pointer hover:border-white/[0.16] transition-colors">
              <div>
                <p className="text-xs font-sans text-[#F4F4F6] font-medium">Reduced Motion</p>
                <p className="text-[10px] font-mono text-[#52525B] mt-0.5">
                  Collapse transitions and pulses to near-instant. Persisted locally.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.reducedMotion}
                onClick={() => onUpdateSettings({ reducedMotion: !settings.reducedMotion })}
                className={`relative shrink-0 transition-colors duration-150 ${
                  settings.reducedMotion ? 'bg-tier-okf' : 'bg-[#27272A]'
                }`}
                style={{ borderRadius: '9999px', width: '40px', height: '22px' }}
              >
                <span
                  className="absolute top-[3px] left-[3px] w-4 h-4 bg-[#F4F4F6] transition-transform duration-150"
                  style={{
                    borderRadius: '9999px',
                    transform: settings.reducedMotion ? 'translateX(16px)' : 'translateX(0)',
                  }}
                />
              </button>
            </label>
          </div>
        </section>

        {/* CARD 3: SYSTEM & LOCAL CACHE */}
        <section className="ui-card p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Gauge size={16} className="text-tier-okf" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#F4F4F6] font-bold">
              System &amp; Local Cache
            </h2>
          </div>

          <div className="p-3.5 bg-[#0C0C0F] border border-white/[0.07] font-mono text-xs space-y-2.5 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-[#52525B]">Backend API:</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    apiStatus === 'online'
                      ? 'bg-[#10B981]'
                      : apiStatus === 'checking'
                      ? 'bg-[#52525B] aria-dot-pulse'
                      : 'bg-warning'
                  }`}
                />
                <span
                  className={
                    apiStatus === 'online'
                      ? 'text-[#10B981] font-bold'
                      : apiStatus === 'checking'
                      ? 'text-[#A1A1AA]'
                      : 'text-warning font-bold'
                  }
                >
                  {apiStatus === 'checking' ? 'CHECKING' : apiStatus === 'online' ? 'ONLINE' : 'OFFLINE'}
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#52525B]">Endpoint:</span>
              <span className="text-[#A1A1AA] truncate max-w-[60%]">{API_BASE_URL}</span>
            </div>
            {apiStatus === 'online' && apiLatencyMs !== null && (
              <div className="flex justify-between items-center">
                <span className="text-[#52525B]">/health roundtrip:</span>
                <span className="text-tier-okf">{apiLatencyMs} ms</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-mono text-[#52525B]">
              {historyCount} completed quer{historyCount === 1 ? 'y' : 'ies'} stored in this browser
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={historyCount === 0}
              className="ui-btn text-[11px] font-mono flex items-center gap-2 px-3 py-2 bg-[#111115] border border-white/[0.09] hover:border-warning/60 text-[#A1A1AA] hover:text-warning transition-colors disabled:opacity-40"
            >
              {cleared ? (
                <>
                  <Check size={13} /> <span>History cleared</span>
                </>
              ) : (
                <>
                  <Eraser size={13} /> <span>Clear Local Query History</span>
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
