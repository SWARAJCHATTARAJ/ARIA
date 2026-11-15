import React, { useState, useCallback, useEffect } from 'react';
import {
  Eraser,
  Check,
  LogOut,
} from 'lucide-react';
import { useSettingsContext } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/config';
import { clearHistory, getHistory } from '../services/storage';

export default function SettingsView() {
  const { settings, onUpdateSettings } = useSettingsContext();
  const { user, signOut } = useAuth();

  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState(() => getHistory().length);
  const [cleared, setCleared] = useState(false);

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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0B] overflow-y-auto hud-scroll select-text text-[#EDEDED]">
      {/* Top Header */}
      <div className="px-8 py-4 border-b border-[#262629] bg-[#141416] shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-semibold text-[#EDEDED]">
            Settings
          </h1>
          <p className="text-[12px] font-mono text-[#8B8B8E] mt-0.5">
            Workspace preferences, authentication state, and local cache.
          </p>
        </div>
      </div>

      <div className="p-8 max-w-3xl mx-auto w-full space-y-6 pb-24">
        {/* CARD 0: AUTHENTICATED ACCOUNT */}
        {user && (
          <section className="p-6 bg-[#141416] border border-[#262629] rounded-[8px] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#262629]">
              <h2 className="text-[16px] font-semibold text-[#EDEDED]">
                Authenticated Researcher
              </h2>
              <button
                type="button"
                onClick={() => signOut()}
                className="btn-secondary text-[12px] py-1 px-3 text-[#EF4444] border-[#EF4444]/40 hover:border-[#EF4444]"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="p-4 bg-[#0A0A0B] border border-[#262629] rounded-[6px] font-mono text-[12px] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[#8B8B8E]">Name</span>
                <span className="text-[#EDEDED] font-medium">{user.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8B8B8E]">Identity</span>
                <span className="text-[#EDEDED]">{user.email || `@${user.username}`}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8B8B8E]">Provider</span>
                <span className="text-[#5E8BFF] uppercase">{user.provider}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8B8B8E]">User ID</span>
                <span className="text-[#8B8B8E] text-[12px] font-mono truncate max-w-[280px]">{user.id}</span>
              </div>
            </div>
          </section>
        )}

        {/* CARD 1: INTERFACE & MOTION */}
        <section className="p-6 bg-[#141416] border border-[#262629] rounded-[8px] space-y-4">
          <div className="pb-3 border-b border-[#262629]">
            <h2 className="text-[16px] font-semibold text-[#EDEDED]">
              Interface &amp; Motion
            </h2>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 p-4 bg-[#0A0A0B] border border-[#262629] rounded-[6px] cursor-pointer hover:border-[#38383C] transition-colors">
              <div>
                <p className="text-[14px] font-medium text-[#EDEDED]">Compact Reading Density</p>
                <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                  Tighter line-height in rendered answer threads.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.compactDensity}
                onClick={() => onUpdateSettings({ compactDensity: !settings.compactDensity })}
                className={`w-10 h-6 p-1 rounded-[6px] transition-colors ${
                  settings.compactDensity ? 'bg-[#5E8BFF]' : 'bg-[#262629]'
                }`}
              >
                <span
                  className={`block w-4 h-4 bg-white rounded-[4px] transition-transform ${
                    settings.compactDensity ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between gap-4 p-4 bg-[#0A0A0B] border border-[#262629] rounded-[6px] cursor-pointer hover:border-[#38383C] transition-colors">
              <div>
                <p className="text-[14px] font-medium text-[#EDEDED]">Reduced Motion</p>
                <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                  Collapses transitions to instant durations. Persisted locally.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.reducedMotion}
                onClick={() => onUpdateSettings({ reducedMotion: !settings.reducedMotion })}
                className={`w-10 h-6 p-1 rounded-[6px] transition-colors ${
                  settings.reducedMotion ? 'bg-[#5E8BFF]' : 'bg-[#262629]'
                }`}
              >
                <span
                  className={`block w-4 h-4 bg-white rounded-[4px] transition-transform ${
                    settings.reducedMotion ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>
        </section>

        {/* CARD 2: SYSTEM & LOCAL CACHE */}
        <section className="p-6 bg-[#141416] border border-[#262629] rounded-[8px] space-y-4">
          <div className="pb-3 border-b border-[#262629]">
            <h2 className="text-[16px] font-semibold text-[#EDEDED]">
              System &amp; Local Cache
            </h2>
          </div>

          <div className="p-4 bg-[#0A0A0B] border border-[#262629] rounded-[6px] font-mono text-[12px] space-y-2 mb-4">
            <div className="flex justify-between items-center">
              <span className="text-[#8B8B8E]">Backend API</span>
              <span className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    apiStatus === 'online' ? 'bg-[#34D399]' : 'bg-[#EF4444]'
                  }`}
                />
                <span className={apiStatus === 'online' ? 'text-[#34D399]' : 'text-[#EF4444]'}>
                  {apiStatus === 'online' ? 'ONLINE' : 'OFFLINE'}
                </span>
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#8B8B8E]">Endpoint</span>
              <span className="text-[#EDEDED] truncate max-w-[60%]">{API_BASE_URL}</span>
            </div>
            {apiStatus === 'online' && apiLatencyMs !== null && (
              <div className="flex justify-between items-center">
                <span className="text-[#8B8B8E]">Latency</span>
                <span className="text-[#5E8BFF]">{apiLatencyMs} ms</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-[12px] font-mono text-[#8B8B8E]">
              {historyCount} completed queries stored locally
            </span>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={historyCount === 0}
              className="btn-secondary text-[12px] py-1.5 px-3"
            >
              {cleared ? (
                <>
                  <Check size={14} className="text-[#34D399]" />
                  <span>Cleared</span>
                </>
              ) : (
                <>
                  <Eraser size={14} />
                  <span>Clear History</span>
                </>
              )}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
