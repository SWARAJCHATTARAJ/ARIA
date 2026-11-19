import React, { useState, useCallback, useEffect } from 'react';
import {
  Eraser,
  Check,
  LogOut,
  Sun,
  Moon,
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import { useSettingsContext } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/config';
import { clearHistory, getHistory } from '../services/storage';

const RESEARCH_DOMAINS = [
  { id: 'auto', label: 'Auto (All Domains)', desc: 'Dynamic multi-source academic retrieval across all repositories' },
  { id: 'cs', label: 'Computer Science & AI', desc: 'Prioritizes arXiv cs.*, OpenAlex computer science, and systems papers' },
  { id: 'chem', label: 'Chemistry & Materials', desc: 'Focuses on materials science, chemical physics, and polymer engineering' },
  { id: 'bio', label: 'Biology & Medicine', desc: 'Prioritizes q-bio, PubMed/OpenAlex life sciences, and genomics' },
  { id: 'physics', label: 'Physics & Astronomy', desc: 'Focuses on astrophysics, quantum physics, and cosmology' },
  { id: 'eng', label: 'Engineering', desc: 'Prioritizes electrical engineering, systems theory, and applied robotics' },
  { id: 'math', label: 'Mathematics', desc: 'Grounds proofs, combinatorics, and pure/applied mathematical literature' },
  { id: 'econ', label: 'Economics & Finance', desc: 'Focuses on quantitative finance, macroeconomics, and game theory' },
  { id: 'law', label: 'Law & Policy', desc: 'Prioritizes legal theory, regulatory literature, and technology policy' },
] as const;

export default function SettingsView() {
  const {
    settings,
    onUpdateSettings,
    toggleTheme,
    addApiKey,
    removeApiKey,
    toggleApiKey,
    updateApiKeyStatus,
  } = useSettingsContext();
  const { user, signOut } = useAuth();

  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState(() => getHistory().length);
  const [cleared, setCleared] = useState(false);

  // New API Key Input state
  const [newKey, setNewKey] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [keyTestResults, setKeyTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

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

  const handleAddKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    addApiKey(newKey.trim(), newKeyLabel.trim() || undefined);
    setNewKey('');
    setNewKeyLabel('');
  };

  const handleTestKey = async (id: string, keyVal: string) => {
    setTestingKeyId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/keys/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: keyVal }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'valid') {
        updateApiKeyStatus(id, 'active');
        setKeyTestResults((prev) => ({
          ...prev,
          [id]: { ok: true, msg: `Verified active (${data.latency_ms || 120}ms)` },
        }));
      } else {
        updateApiKeyStatus(id, 'invalid');
        setKeyTestResults((prev) => ({
          ...prev,
          [id]: { ok: false, msg: data.detail || 'Key rejected by Groq API' },
        }));
      }
    } catch (err: any) {
      updateApiKeyStatus(id, 'invalid');
      setKeyTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, msg: 'Verification failed to reach backend' },
      }));
    } finally {
      setTestingKeyId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090B] overflow-y-auto hud-scroll select-text text-[#EDEDED]">
      {/* Top Header */}
      <div className="px-8 py-4 border-b border-white/[0.07] bg-[#09090B] shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#EDEDED] tracking-[-0.025em]">
            Settings &amp; Workspace
          </h1>
          <p className="text-[12px] font-mono text-[#8B8B8E] mt-0.5">
            Visual presentation, domain scoping, BYOK multi-key failover pool, and cache.
          </p>
        </div>
      </div>

      <div className="p-6 sm:p-8 max-w-3xl mx-auto w-full space-y-6 pb-24">
        {/* CARD 0: AUTHENTICATED ACCOUNT */}
        {user && (
          <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.05]">
              <h2 className="text-[15px] font-semibold text-[#EDEDED] tracking-[-0.01em]">
                Authenticated Researcher
              </h2>
              <button
                type="button"
                onClick={() => signOut()}
                className="btn-secondary text-[11px] py-1 px-2.5 text-red-400 border-red-500/30 hover:border-red-500/60"
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] font-mono text-[11px] space-y-2">
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
                <span className="text-[#60A5FA] uppercase">{user.provider}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#8B8B8E]">User ID</span>
                <span className="text-[#71717A] text-[11px] font-mono truncate max-w-[280px]">{user.id}</span>
              </div>
            </div>
          </section>
        )}

        {/* CARD 1: VISUAL THEME & PRESENTATION */}
        <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-4">
          <div className="pb-3 border-b border-white/[0.05]">
            <h2 className="text-[15px] font-semibold text-[#EDEDED] tracking-[-0.01em]">
              Theme &amp; Typography
            </h2>
            <p className="text-[12px] text-[#8B8B8E] mt-0.5">
              Choose your working visual aesthetic. Both styles maintain strict contrast and typographic restraint.
            </p>
          </div>

          {/* Theme Option Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onUpdateSettings({ theme: 'dark' })}
              className={`p-4 rounded-[8px] text-left border transition-all cursor-pointer ${
                settings.theme === 'dark'
                  ? 'border-[#60A5FA] bg-[#18181E] ring-1 ring-[#60A5FA]/20'
                  : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Moon size={16} className={settings.theme === 'dark' ? 'text-[#60A5FA]' : 'text-[#8B8B8E]'} />
                  <span className="text-[13px] font-semibold text-[#EDEDED]">Obsidian Dark</span>
                </div>
                {settings.theme === 'dark' && <Check size={14} className="text-[#60A5FA]" />}
              </div>
              <p className="text-[11px] text-[#8B8B8E] leading-relaxed">
                Deep matte #09090B canvas, #0C0C0F sidebar, and hairline borders engineered for nocturnal focus.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ theme: 'light' })}
              className={`p-4 rounded-[8px] text-left border transition-all cursor-pointer ${
                settings.theme === 'light'
                  ? 'border-[#2563EB] bg-[#F3F2EE] ring-1 ring-[#2563EB]/20 text-[#141413]'
                  : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sun size={16} className={settings.theme === 'light' ? 'text-[#2563EB]' : 'text-[#8B8B8E]'} />
                  <span className={`text-[13px] font-semibold ${settings.theme === 'light' ? 'text-[#141413]' : 'text-[#EDEDED]'}`}>Editorial Light</span>
                </div>
                {settings.theme === 'light' && <Check size={14} className="text-[#2563EB]" />}
              </div>
              <p className={`text-[11px] leading-relaxed ${settings.theme === 'light' ? 'text-[#575653]' : 'text-[#8B8B8E]'}`}>
                Archival #FAF9F6 monograph alabaster with carbon ink text for bright daytime environments.
              </p>
            </button>
          </div>

          <div className="space-y-2.5 pt-2">
            <label className="flex items-center justify-between gap-4 p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] cursor-pointer hover:border-white/[0.14] transition-colors">
              <div>
                <p className="text-[13px] font-medium text-[#EDEDED]">Compact Reading Density</p>
                <p className="text-[11px] text-[#8B8B8E] mt-0.5">
                  Tighter line-height in rendered academic synthesis threads.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.compactDensity}
                onClick={() => onUpdateSettings({ compactDensity: !settings.compactDensity })}
                className={`w-9 h-5 p-0.5 rounded-[4px] transition-colors ${
                  settings.compactDensity ? 'bg-[#60A5FA]' : 'bg-[#18181E] border border-white/[0.1]'
                }`}
              >
                <span
                  className={`block w-4 h-4 bg-white rounded-[3px] transition-transform ${
                    settings.compactDensity ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>

            <label className="flex items-center justify-between gap-4 p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] cursor-pointer hover:border-white/[0.14] transition-colors">
              <div>
                <p className="text-[13px] font-medium text-[#EDEDED]">Reduced Motion</p>
                <p className="text-[11px] text-[#8B8B8E] mt-0.5">
                  Collapses transitions to instant durations. Persisted locally.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.reducedMotion}
                onClick={() => onUpdateSettings({ reducedMotion: !settings.reducedMotion })}
                className={`w-9 h-5 p-0.5 rounded-[4px] transition-colors ${
                  settings.reducedMotion ? 'bg-[#60A5FA]' : 'bg-[#18181E] border border-white/[0.1]'
                }`}
              >
                <span
                  className={`block w-4 h-4 bg-white rounded-[3px] transition-transform ${
                    settings.reducedMotion ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>
        </section>

        {/* CARD 2: DEFAULT TOPIC DOMAIN */}
        <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-3.5">
          <div className="pb-3 border-b border-white/[0.05]">
            <h2 className="text-[15px] font-semibold text-[#EDEDED] tracking-[-0.01em]">
              Default Research Domain Scope
            </h2>
            <p className="text-[12px] text-[#8B8B8E] mt-0.5">
              Scopes arXiv category queries, OpenAlex taxonomy, and domain synthesis prompts. Can be overridden per question.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {RESEARCH_DOMAINS.map((dom) => {
              const isSelected = (settings.defaultDomain || 'auto') === dom.id;
              return (
                <button
                  key={dom.id}
                  type="button"
                  onClick={() => onUpdateSettings({ defaultDomain: dom.id })}
                  className={`p-3 rounded-[6px] text-left border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#60A5FA] bg-[#18181E] ring-1 ring-[#60A5FA]/20'
                      : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-medium text-[#EDEDED]">{dom.label}</span>
                    {isSelected && <Check size={12} className="text-[#60A5FA]" />}
                  </div>
                  <p className="text-[10px] text-[#8B8B8E] line-clamp-2 leading-snug">{dom.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* CARD 3: BYOK & MULTI-API KEY FAILOVER POOL */}
        <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-4">
          <div className="pb-3 border-b border-white/[0.05] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Key size={15} className="text-[#60A5FA]" />
                <h2 className="text-[15px] font-semibold text-[#EDEDED] tracking-[-0.01em]">
                  BYOK &amp; Multi-Key Failover Pool
                </h2>
              </div>
              <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                Add your own Groq API keys. ARIA automatically fails over on rate limits (HTTP 429) or token quotas.
              </p>
            </div>
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-[#60A5FA] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>Get Free Key</span>
              <ExternalLink size={11} />
            </a>
          </div>

          {/* Add Key Form */}
          <form onSubmit={handleAddKeySubmit} className="space-y-2 p-3 bg-[#09090B] border border-white/[0.07] rounded-[6px]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Groq API Key (gsk_...)"
                className="sm:col-span-2 px-3 py-1.5 bg-[#111115] border border-white/[0.07] focus:border-[#60A5FA] focus:outline-none rounded-[5px] text-[12px] font-mono text-[#EDEDED] placeholder-[#71717A]"
              />
              <input
                type="text"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder="Label (e.g. Backup Key)"
                className="px-3 py-1.5 bg-[#111115] border border-white/[0.07] focus:border-[#60A5FA] focus:outline-none rounded-[5px] text-[12px] text-[#EDEDED] placeholder-[#71717A]"
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={!newKey.trim()}
                className="btn-primary text-[12px] py-1 px-3 rounded-[5px] flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>Add Key to Pool</span>
              </button>
            </div>
          </form>

          {/* Key Pool List */}
          <div className="space-y-2">
            {settings.apiKeys.length === 0 ? (
              <div className="p-4 bg-[#09090B] border border-dashed border-white/[0.07] rounded-[6px] text-center text-[#8B8B8E] text-[12px]">
                No custom keys configured. ARIA is currently utilizing server environment keys.
              </div>
            ) : (
              settings.apiKeys.map((k) => {
                const masked = k.key.length > 8 ? `${k.key.slice(0, 4)}...${k.key.slice(-4)}` : '••••••••';
                const isTesting = testingKeyId === k.id;
                const testResult = keyTestResults[k.id];

                return (
                  <div
                    key={k.id}
                    className="p-3 bg-[#09090B] border border-white/[0.07] rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#EDEDED] truncate">{k.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#18181E] border border-white/[0.07] text-[#8B8B8E]">
                          {masked}
                        </span>
                        {k.status === 'active' && (
                          <span className="text-[10px] font-mono text-[#60A5FA] flex items-center gap-1">
                            <CheckCircle2 size={11} />
                            <span>Active</span>
                          </span>
                        )}
                        {k.status === 'rate_limited' && (
                          <span className="text-[10px] font-mono text-[#F59E0B] flex items-center gap-1">
                            <AlertTriangle size={11} />
                            <span>Rate Limited</span>
                          </span>
                        )}
                        {k.status === 'invalid' && (
                          <span className="text-[10px] font-mono text-red-400 flex items-center gap-1">
                            <XCircle size={11} />
                            <span>Invalid</span>
                          </span>
                        )}
                      </div>
                      {testResult && (
                        <p className={`text-[11px] font-mono ${testResult.ok ? 'text-[#60A5FA]' : 'text-red-400'}`}>
                          {testResult.msg}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTestKey(k.id, k.key)}
                        disabled={isTesting}
                        className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[5px] hover:bg-[#18181E] active:scale-[0.98] transition-all text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                        title="Test key latency and validity"
                      >
                        <RefreshCw size={12} className={isTesting ? 'animate-spin text-[#60A5FA]' : ''} />
                        <span>Test</span>
                      </button>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={k.enabled}
                        onClick={() => toggleApiKey(k.id)}
                        className={`w-8 h-4.5 p-0.5 rounded-[4px] transition-colors cursor-pointer ${
                          k.enabled ? 'bg-[#60A5FA]' : 'bg-[#18181E] border border-white/[0.1]'
                        }`}
                        title={k.enabled ? 'Enabled' : 'Disabled'}
                      >
                        <span
                          className={`block w-3.5 h-3.5 bg-white rounded-[2px] transition-transform ${
                            k.enabled ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => removeApiKey(k.id)}
                        className="p-1.5 text-[#71717A] hover:text-red-400 rounded-[5px] hover:bg-red-500/10 active:scale-[0.98] transition-all cursor-pointer"
                        title="Remove key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* CARD 4: SYSTEM & LOCAL CACHE */}
        <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-3.5">
          <div className="pb-3 border-b border-white/[0.05]">
            <h2 className="text-[15px] font-semibold text-[#EDEDED] tracking-[-0.01em]">
              System &amp; Local Cache
            </h2>
          </div>

          <div className="p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] font-mono text-[11px] space-y-2 mb-3">
            <div className="flex justify-between items-center">
              <span className="text-[#8B8B8E]">Backend API</span>
              <span className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    apiStatus === 'online' ? 'bg-[#60A5FA]' : 'bg-red-400'
                  }`}
                />
                <span className={apiStatus === 'online' ? 'text-[#60A5FA] font-semibold' : 'text-red-400 font-semibold'}>
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
                <span className="text-[#60A5FA] tabular-nums">{apiLatencyMs} ms</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-white/[0.04]">
              <span className="text-[#8B8B8E]">Client Version</span>
              <span className="text-[#EDEDED] font-mono text-[11px]">
                ARIA v2.0 · {typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : '2.0.0'} ({typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'latest'})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-[11px] font-mono text-[#8B8B8E] tabular-nums">
              {historyCount} completed queries stored locally
            </span>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={historyCount === 0}
              className="btn-secondary text-[11px] py-1.5 px-3"
            >
              {cleared ? (
                <>
                  <Check size={13} className="text-[#60A5FA]" />
                  <span>Cleared</span>
                </>
              ) : (
                <>
                  <Eraser size={13} />
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
