import React, { useState, useCallback } from 'react';
import {
  Settings as SettingsIcon,
  Cpu,
  Palette,
  FileCheck2,
  KeyRound,
  Activity,
  Trash2,
  FileText,
  ExternalLink,
  RefreshCw,
  Gauge,
  Sparkles,
  Layers,
  Eye,
  EyeOff,
  Check,
  Compass,
} from 'lucide-react';
import { useSettingsContext } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { API_BASE_URL } from '../config';
import { exportResearchHistory } from '../utils/storage';

interface HealthSample {
  latencyMs: number;
  status: 'ok' | 'unreachable';
  version?: string;
}

export default function SettingsView() {
  const { settings, onUpdateSettings, researchModes, disciplines } = useSettingsContext();
  const { theme, setTheme, themes } = useTheme();

  const [samples, setSamples] = useState<HealthSample[]>([]);
  const [pinging, setPinging] = useState(false);
  const [showByokKey, setShowByokKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const runLatencyTest = useCallback(async () => {
    setPinging(true);
    setSamples([]);
    for (let i = 0; i < 4; i++) {
      const t0 = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const latencyMs = Math.round(performance.now() - t0);
        const json = res.ok ? await res.json().catch(() => ({})) : {};
        setSamples((prev) => [
          ...prev,
          {
            latencyMs,
            status: res.ok ? 'ok' : 'unreachable',
            version: json.version,
          },
        ]);
      } catch {
        setSamples((prev) => [
          ...prev,
          { latencyMs: Math.round(performance.now() - t0), status: 'unreachable' },
        ]);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    setPinging(false);
  }, []);

  const okSamples = samples.filter((s) => s.status === 'ok');
  const avg = okSamples.length
    ? Math.round(okSamples.reduce((a, s) => a + s.latencyMs, 0) / okSamples.length)
    : null;
  const backendOnline = samples.length > 0 && samples[samples.length - 1].status === 'ok';

  const handleExportHistory = () => {
    const blob = new Blob([exportResearchHistory()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aria-research-history.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClearStorage = () => {
    if (typeof window !== 'undefined') {
      [
        'aria-history-v1',
        'aria-collections-v1',
        'aria-settings-v2',
        'aria-byok-key',
        'aria-byok-provider',
        'aria-user-context',
        'aria-theme-preset',
        'aria-guest-session-v1',
      ].forEach((k) => {
        try {
          window.localStorage.removeItem(k);
        } catch {
          /* ignore */
        }
      });
      window.location.reload();
    }
  };

  const handleSaveByok = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleClearByok = () => {
    onUpdateSettings({ byokApiKey: '', byokProvider: '' });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-ink-base overflow-y-auto select-text text-gray-200">
      {/* Top Header */}
      <div className="px-6 md:px-10 py-5 border-b border-ink-surface bg-ink-base/80 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-tier-okf animate-spin-slow" />
            <h1 className="text-base md:text-lg font-bold font-sans text-white tracking-tight">
              Settings & Research Controls
            </h1>
          </div>
          <p className="text-xs font-mono text-ink-muted mt-0.5">
            Centralized research routing, custom context, themes, and synthesis parameters.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-10 max-w-5xl mx-auto w-full space-y-6 pb-24">
        {/* CARD 1: RESEARCH MODE SELECTOR */}
        <div className="p-5 md:p-6 bg-ink-surface/40 border border-ink-surface rounded-none shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-tier-okf" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                Research Mode Selector
              </h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-tier-okf/10 text-tier-okf border border-tier-okf/30">
              Active: {researchModes.find((m) => m.id === settings.researchMode)?.label}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {researchModes.map((m) => {
              const isSelected = settings.researchMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdateSettings({ researchMode: m.id })}
                  className={`text-left p-3.5 border transition-all duration-200 text-xs flex flex-col justify-between ${
                    isSelected
                      ? 'bg-tier-okf/15 border-tier-okf text-white shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-tier-okf/50'
                      : 'bg-ink-base/60 border-ink-surface hover:border-gray-600 text-gray-300 hover:text-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 font-mono font-bold tracking-wide text-white mb-1">
                      <span className="text-sm">{m.glyph}</span>
                      <span>{m.label}</span>
                    </div>
                    <p className="text-[11px] font-sans text-ink-muted leading-relaxed">
                      {m.hint}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="mt-3 flex items-center gap-1 text-[10px] font-mono text-tier-okf">
                      <Check size={12} /> Selected Default
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* CARD 2: DISCIPLINE BRANCH SELECTOR */}
        <div className="p-5 md:p-6 bg-ink-surface/40 border border-ink-surface rounded-none shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-tier-live" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                Discipline Branch Selector
              </h2>
            </div>
            <span className="text-[10px] font-mono text-ink-muted">
              Auto-calibrates ontology and citation filters
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {disciplines.map((d) => {
              const isSelected = settings.discipline === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onUpdateSettings({ discipline: d.id })}
                  className={`p-2.5 border text-center transition-all duration-150 text-xs ${
                    isSelected
                      ? 'bg-tier-live/15 border-tier-live text-tier-live font-semibold shadow-sm'
                      : 'bg-ink-base/60 border-ink-surface hover:border-gray-600 text-gray-300'
                  }`}
                >
                  <div className="text-base mb-1">{d.glyph}</div>
                  <div className="text-[10px] font-mono leading-tight truncate">{d.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* CARD 3: CUSTOM CONTEXT & BYOK API KEY INJECTOR */}
        <div className="p-5 md:p-6 bg-ink-surface/40 border border-ink-surface rounded-none shadow-sm space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-tier-rag" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
              Custom Context, Notes & BYOK API Key Injector
            </h2>
          </div>

          {/* Context Textarea */}
          <div>
            <label className="block text-xs font-sans text-gray-200 mb-1.5 font-medium">
              Inject Custom Context / Background Notes / Reference Links:
            </label>
            <textarea
              value={settings.customContext || ''}
              onChange={(e) => onUpdateSettings({ customContext: e.target.value })}
              rows={3}
              placeholder="e.g. Focus specifically on recent 2024-2026 preprints. Exclude non-human trials. Frame findings around quantum decoherence limits..."
              className="w-full bg-ink-base border border-ink-surface p-3 text-xs font-mono text-gray-200 placeholder-ink-muted focus:outline-none focus:border-tier-okf/50 focus:ring-1 focus:ring-tier-okf/50 transition-all resize-y"
            />
            <p className="text-[10px] font-mono text-ink-muted mt-1">
              Automatically injected into every new synthesis prompt and research plan.
            </p>
          </div>

          {/* BYOK Section */}
          <div className="pt-4 border-t border-ink-surface/70">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-sans text-gray-200 font-medium">
                  Bring Your Own API Key (BYOK)
                </p>
                <p className="text-[10px] font-mono text-ink-muted">
                  Route synthesis requests directly through your own LLM provider API key (stored in local browser only).
                </p>
              </div>
              {settings.byokApiKey && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/50 border border-emerald-500/40 px-2 py-0.5">
                  Key Active
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <select
                  value={settings.byokProvider || ''}
                  onChange={(e) => onUpdateSettings({ byokProvider: e.target.value })}
                  className="w-full bg-ink-base border border-ink-surface text-xs font-mono text-gray-200 px-3 py-2 outline-none focus:border-tier-okf/50"
                >
                  <option value="">Server Default Engine</option>
                  <option value="groq">Groq (Llama 3.3 70B Versatile)</option>
                  <option value="openai">OpenAI (GPT-4o / o1)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                  <option value="gemini">Google Gemini 2.5 Flash / Pro</option>
                </select>
              </div>

              <div className="md:col-span-8 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showByokKey ? 'text' : 'password'}
                    value={settings.byokApiKey || ''}
                    onChange={(e) => onUpdateSettings({ byokApiKey: e.target.value })}
                    placeholder="Enter API Key (sk-...)"
                    className="w-full bg-ink-base border border-ink-surface text-xs font-mono text-gray-200 px-3 py-2 pr-10 outline-none focus:border-tier-okf/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowByokKey(!showByokKey)}
                    className="absolute right-2 top-2 text-ink-muted hover:text-white p-0.5"
                    aria-label="Toggle key visibility"
                  >
                    {showByokKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveByok}
                  disabled={!settings.byokApiKey}
                  className="px-3 py-2 bg-tier-okf/15 hover:bg-tier-okf/25 border border-tier-okf/50 text-tier-okf font-mono text-xs disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                >
                  {saveSuccess ? <Check size={14} className="text-emerald-400" /> : <KeyRound size={14} />}
                  <span>{saveSuccess ? 'Saved' : 'Save'}</span>
                </button>

                {settings.byokApiKey && (
                  <button
                    type="button"
                    onClick={handleClearByok}
                    className="px-3 py-2 bg-ink-base hover:bg-warning/20 border border-ink-surface hover:border-warning/50 text-ink-muted hover:text-warning font-mono text-xs transition-colors"
                    title="Remove API Key"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CARD 4: 4-THEME ENGINE */}
        <div className="p-5 md:p-6 bg-ink-surface/40 border border-ink-surface rounded-none shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Palette size={16} className="text-tier-okf" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                4-Theme Visual Engine
              </h2>
            </div>
            <span className="text-[10px] font-mono text-ink-muted">
              Live variable CSS themes with smooth transitions
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {themes.map((t) => {
              const isSelected = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTheme(t.id);
                    onUpdateSettings({ themePreset: t.id });
                  }}
                  className={`p-3.5 border text-left transition-all duration-200 flex flex-col justify-between ${
                    isSelected
                      ? 'border-tier-okf shadow-[0_0_20px_rgba(6,182,212,0.2)] ring-1 ring-tier-okf'
                      : 'border-ink-surface hover:border-gray-600'
                  }`}
                  style={{ backgroundColor: t.bgHex }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-white tracking-wide">
                        {t.name}
                      </span>
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm"
                        style={{ backgroundColor: t.accentHex }}
                      />
                    </div>
                    <p className="text-[10px] font-mono text-gray-400 leading-tight">
                      {t.tagline}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="mt-3 text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                      <Check size={12} /> Active Theme
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* CARD 5: RETRIEVAL & VERIFICATION PREFERENCES */}
        <div className="p-5 md:p-6 bg-ink-surface/40 border border-ink-surface rounded-none shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <FileCheck2 size={16} className="text-emerald-400" />
            <h2 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
              Retrieval & Verification Preferences
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3.5 bg-ink-base/60 border border-ink-surface">
              <label className="block text-xs font-sans text-gray-200 font-medium mb-1">
                Primary Sources Retained
              </label>
              <div className="flex items-center justify-between gap-3 mt-2">
                <input
                  type="range"
                  min={4}
                  max={12}
                  step={1}
                  value={settings.sourceCount}
                  onChange={(e) => onUpdateSettings({ sourceCount: Number(e.target.value) })}
                  className="flex-1 accent-tier-okf cursor-pointer"
                />
                <span className="font-mono text-xs text-tier-okf font-bold px-2 py-0.5 border border-tier-okf/40 bg-tier-okf/10">
                  {settings.sourceCount} sources
                </span>
              </div>
              <p className="text-[10px] font-mono text-ink-muted mt-2">
                Number of authoritative primary sources fed into final entropy audit.
              </p>
            </div>

            <div className="p-3.5 bg-ink-base/60 border border-ink-surface">
              <label className="block text-xs font-sans text-gray-200 font-medium mb-1">
                Citation Format
              </label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(['ieee', 'apa', 'nature'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => onUpdateSettings({ citationFormat: fmt })}
                    className={`text-center py-1.5 px-2 text-[10px] font-mono uppercase border transition-colors ${
                      settings.citationFormat === fmt
                        ? 'bg-tier-okf/20 border-tier-okf text-tier-okf font-bold'
                        : 'bg-ink-base border-ink-surface text-gray-400 hover:text-white'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-mono text-ink-muted mt-2">
                Render citation callouts and paper exports in standard academic styles.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="flex items-center justify-between p-3 bg-ink-base/60 border border-ink-surface cursor-pointer">
              <div>
                <p className="text-xs font-sans text-gray-200">Compare Tiers by Default</p>
                <p className="text-[10px] font-mono text-ink-muted">Force OKF, RAG & LIVE to compare.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.compareDefault}
                onChange={(e) => onUpdateSettings({ compareDefault: e.target.checked })}
                className="w-4 h-4 accent-tier-okf cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-ink-base/60 border border-ink-surface cursor-pointer">
              <div>
                <p className="text-xs font-sans text-gray-200">Full Audit Ledger in PDF</p>
                <p className="text-[10px] font-mono text-ink-muted">Embed sentence verification ledger.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.pdfFullLedger}
                onChange={(e) => onUpdateSettings({ pdfFullLedger: e.target.checked })}
                className="w-4 h-4 accent-tier-okf cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* CARD 6: DIAGNOSTICS & DATA MANAGEMENT */}
        <div className="p-5 md:p-6 bg-ink-surface/40 border border-ink-surface rounded-none shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-tier-live" />
              <h2 className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                Backend Engine Health & Storage Diagnostics
              </h2>
            </div>
            <button
              onClick={runLatencyTest}
              disabled={pinging}
              className="text-[10px] font-mono flex items-center gap-1.5 px-2.5 py-1.5 bg-tier-okf/15 border border-tier-okf/40 text-tier-okf hover:bg-tier-okf/25 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={11} className={pinging ? 'animate-spin' : ''} />
              <span>{pinging ? 'Pinging...' : 'Test Latency'}</span>
            </button>
          </div>

          <div className="p-3.5 bg-ink-base/60 border border-ink-surface font-mono text-xs space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-ink-muted">Endpoint Base:</span>
              <span className="text-gray-200">{API_BASE_URL || 'Direct Origin (/)'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ink-muted">Engine Status:</span>
              <span
                className={`flex items-center gap-1.5 font-bold ${
                  backendOnline
                    ? 'text-emerald-400'
                    : samples.length
                    ? 'text-amber-400'
                    : 'text-ink-muted'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    backendOnline ? 'bg-emerald-400' : samples.length ? 'bg-amber-400' : 'bg-gray-500'
                  }`}
                />
                {samples.length === 0
                  ? 'Ready to test'
                  : backendOnline
                  ? `Online (v${samples[samples.length - 1].version || '1.0'})`
                  : 'Unreachable'}
              </span>
            </div>
            {avg !== null && (
              <div className="flex justify-between items-center">
                <span className="text-ink-muted">Average /health roundtrip:</span>
                <span className="text-tier-okf font-bold flex items-center gap-1">
                  <Gauge size={12} /> {avg} ms
                </span>
              </div>
            )}

            {samples.length > 0 && (
              <div className="flex items-end gap-1.5 h-12 pt-3 border-t border-ink-surface/70">
                {samples.map((s, i) => {
                  const maxLat = Math.max(...samples.map((x) => x.latencyMs), 1);
                  const h = Math.max(10, (s.latencyMs / maxLat) * 36);
                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center gap-1"
                      title={`${s.latencyMs}ms`}
                    >
                      <div
                        className={`w-full ${s.status === 'ok' ? 'bg-tier-okf' : 'bg-warning'}`}
                        style={{ height: h }}
                      />
                      <span className="text-[8px] text-ink-muted">{s.latencyMs}ms</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleExportHistory}
              className="text-[11px] font-mono flex items-center gap-2 px-3 py-2 bg-ink-base border border-ink-surface hover:border-gray-500 text-gray-300 hover:text-white transition-colors"
            >
              <FileText size={13} />
              <span>Export Research History (JSON)</span>
            </button>

            <button
              type="button"
              onClick={handleClearStorage}
              className="text-[11px] font-mono flex items-center gap-2 px-3 py-2 bg-ink-base border border-ink-surface hover:border-warning/60 text-ink-muted hover:text-warning transition-colors"
            >
              <Trash2 size={13} />
              <span>Clear Local Storage Cache</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
