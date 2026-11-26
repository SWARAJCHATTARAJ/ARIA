import React, { useState, useCallback, useEffect } from 'react';
import {
  Eraser,
  Check,
  LogOut,
  Key,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ShieldCheck,
  BookOpen,
  FileText,
  UserCheck,
  Download,
  Github,
  Flame,
  Smartphone,
  Monitor,
  Sliders,
} from 'lucide-react';
import { useSettingsStore } from '../context/SettingsContext';
import { useAuth, isCapacitorRuntime, isTauriRuntime } from '../context/AuthContext';
import { API_BASE_URL } from '../services/config';
import { clearHistory, getCollections, getHistory, clearCollections } from '../services/storage';
import { saveOrDownloadFile, showDownloadToast } from '../utils/nativeDownload';
import { getResearchPulse, resetResearchPulse } from '../utils/researchPulse';
import {
  CitationStyle,
  FontFamilyPref,
  FontScalePref,
  PdfLayoutStyle,
  RecencyFilter,
  ResearchModePref,
  SourceTierFilter,
  SurfaceMode,
  ThemePreset,
} from '../types';

type SettingsSectionId = 'research' | 'reading' | 'export' | 'account';

const SECTIONS: Array<{ id: SettingsSectionId; label: string; shortLabel: string; icon: React.ComponentType<any> }> = [
  { id: 'research', label: 'Research & Verification', shortLabel: 'Research', icon: ShieldCheck },
  { id: 'reading', label: 'Reading & Experience', shortLabel: 'Reading', icon: BookOpen },
  { id: 'export', label: 'Export & Native Files', shortLabel: 'Export', icon: FileText },
  { id: 'account', label: 'Account, Privacy & Diagnostics', shortLabel: 'Account', icon: UserCheck },
];

const RESEARCH_DOMAINS = [
  { id: 'auto', label: 'Auto (All Domains)', desc: 'Dynamic multi-source retrieval across all repositories' },
  { id: 'cs', label: 'Computer Science & AI', desc: 'Prioritizes arXiv cs.*, OpenAlex CS, and systems literature' },
  { id: 'chem', label: 'Chemistry & Materials', desc: 'Materials science, chemical physics, and polymers' },
  { id: 'bio', label: 'Biology & Medicine', desc: 'PubMed, q-bio, and peer-reviewed clinical studies' },
  { id: 'physics', label: 'Physics & Astronomy', desc: 'Astrophysics, quantum mechanics, and cosmology' },
  { id: 'eng', label: 'Engineering', desc: 'Systems engineering, hardware, and robotics' },
  { id: 'math', label: 'Mathematics', desc: 'Pure, applied, and combinatorial proofs' },
  { id: 'econ', label: 'Economics & Finance', desc: 'Macroeconomics, econometrics, and policy' },
  { id: 'law', label: 'Law & Policy', desc: 'Legal theory, governance, and regulatory literature' },
] as const;

const THEME_PRESETS: Array<{ id: ThemePreset; label: string; accent: string; desc: string }> = [
  { id: 'cyber-cyan', label: 'Cyber Cyan', accent: '#60A5FA', desc: 'Precision obsidian dark + cobalt accent' },
  { id: 'emerald-biolab', label: 'Emerald Biolab', accent: '#34D399', desc: 'Life-science calm teal + emerald highlights' },
  { id: 'obsidian-gold', label: 'Obsidian Gold', accent: '#F59E0B', desc: 'Nocturnal amber contrast for deep review' },
  { id: 'solaris-paper', label: 'Solaris Paper', accent: '#B45309', desc: 'Archival warm monograph alabaster paper' },
];

function SettingToggle({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center justify-between gap-4 p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] cursor-pointer hover:border-white/[0.14] transition-colors"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[#EDEDED]">{label}</p>
        <p className="text-[11px] text-[#8B8B8E] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`w-9 h-5 p-0.5 rounded-[4px] transition-colors shrink-0 ${
          checked ? 'bg-[var(--aria-accent)]' : 'bg-[#18181E] border border-white/[0.1]'
        }`}
      >
        <span
          className={`block w-4 h-4 bg-white rounded-[3px] transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function SettingsView() {
  const {
    settings,
    onUpdateSettings,
    addApiKey,
    removeApiKey,
    toggleApiKey,
    updateApiKeyStatus,
  } = useSettingsStore();
  const { user, signOut, signInWithGitHub, openAuthModal } = useAuth();

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('research');
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState(() => getHistory().length);
  const [cleared, setCleared] = useState(false);
  const [pulse, setPulse] = useState(() => getResearchPulse());

  // BYOK Groq key state
  const [newKey, setNewKey] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null);
  const [keyTestResults, setKeyTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const pingHealth = useCallback(async () => {
    setApiStatus('checking');
    const t0 = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      setApiLatencyMs(Math.round(performance.now() - t0));
      setApiStatus(res.ok ? 'online' : 'offline');
    } catch {
      setApiLatencyMs(null);
      setApiStatus('offline');
    }
  }, []);

  useEffect(() => {
    pingHealth();
  }, [pingHealth]);

  const handleClearCache = useCallback(() => {
    clearHistory();
    clearCollections();
    resetResearchPulse();
    setHistoryCount(0);
    setPulse(getResearchPulse());
    setCleared(true);
    showDownloadToast('Local cache & thread history cleared.');
    window.setTimeout(() => setCleared(false), 2000);
  }, []);

  const handleExportBackup = async () => {
    try {
      const backup = {
        exportedAt: new Date().toISOString(),
        appVersion: '2.0.0',
        settings: { ...settings, apiKeys: settings.apiKeys.map((k) => ({ ...k, key: '[REDACTED]' })) },
        history: getHistory(),
        collections: getCollections(),
        pulse: getResearchPulse(),
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      await saveOrDownloadFile(blob, `aria-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', {
        autoOpen: settings.autoOpenAfterExport,
      });
    } catch (err: any) {
      showDownloadToast(`Backup export failed: ${err?.message || 'Error'}`, true);
    }
  };

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
    } catch {
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
    <div className="flex-1 flex flex-col h-full bg-[#09090B] overflow-hidden select-text text-[#EDEDED]">
      {/* Header */}
      <div className="px-5 sm:px-8 py-4 border-b border-white/[0.07] bg-[#09090B] shrink-0 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#EDEDED] tracking-[-0.025em] flex items-center gap-2">
            <Sliders size={18} className="text-[var(--aria-accent)]" />
            <span>Workspace Settings</span>
          </h1>
          <p className="text-[11.5px] font-mono text-[#8B8B8E] mt-0.5">
            Verification strictness, reading typography, academic export pack, and system diagnostics.
          </p>
        </div>
      </div>

      {/* Mobile / Android Segmented Tabs */}
      <div className="md:hidden px-4 py-2.5 border-b border-white/[0.07] bg-[#0C0C0F] shrink-0 overflow-x-auto">
        <div className="grid grid-cols-4 gap-1 p-0.5 rounded-[8px] bg-[#09090B] border border-white/[0.07] min-w-[320px]">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`py-1.5 px-2 rounded-[6px] text-[11px] font-mono flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active ? 'bg-[#18181E] text-[#EDEDED] font-semibold' : 'text-[#71717A] hover:text-[#EDEDED]'
                }`}
              >
                <Icon size={12} className={active ? 'text-[var(--aria-accent)]' : ''} />
                <span>{sec.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Responsive Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/[0.07] bg-[#0C0C0F] p-4 space-y-1.5">
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`w-full text-left px-3 py-2.5 rounded-[7px] text-[12.5px] font-medium flex items-center gap-2.5 transition-all cursor-pointer ${
                  active
                    ? 'bg-[#18181E] text-[#EDEDED] border border-white/[0.08]'
                    : 'text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-white/[0.03] border border-transparent'
                }`}
              >
                <Icon size={15} className={active ? 'text-[var(--aria-accent)] shrink-0' : 'text-[#71717A] shrink-0'} />
                <span className="truncate">{sec.label}</span>
              </button>
            );
          })}

          {/* Compact Research Pulse Summary in Settings Rail */}
          <div className="mt-auto pt-4 border-t border-white/[0.07]">
            <div className="p-3 rounded-[7px] bg-[#09090B] border border-white/[0.07] space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center gap-1.5 text-[var(--aria-accent)] font-semibold">
                <Flame size={12} />
                <span>Research Pulse</span>
              </div>
              <div className="flex justify-between text-[#8B8B8E]">
                <span>Day streak</span>
                <span className="text-[#EDEDED] tabular-nums">{pulse.currentDayStreak}d</span>
              </div>
              <div className="flex justify-between text-[#8B8B8E]">
                <span>Verified claims</span>
                <span className="text-[#EDEDED] tabular-nums">{pulse.verifiedClaimsRead}</span>
              </div>
              <div className="flex justify-between text-[#8B8B8E]">
                <span>Sources inspected</span>
                <span className="text-[#EDEDED] tabular-nums">{pulse.sourcesExplored}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Active Section Body */}
        <div className="flex-1 overflow-y-auto hud-scroll p-5 sm:p-8 pb-28">
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-slide">
            {/* =========================================================
                SECTION 1: RESEARCH & VERIFICATION
               ========================================================= */}
            {activeSection === 'research' && (
              <>
                <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-4">
                  <div className="pb-3 border-b border-white/[0.05]">
                    <h2 className="text-[15px] font-semibold text-[#EDEDED]">Citation &amp; Retrieval Defaults</h2>
                    <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                      Configure default citation copy style, peer-reviewed scoping, recency cutoff, and entailment strictness.
                    </p>
                  </div>

                  {/* Citation Style */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                      Default Citation Format
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          { id: 'apa7', label: 'APA 7' },
                          { id: 'ieee', label: 'IEEE' },
                          { id: 'chicago', label: 'Chicago' },
                          { id: 'bibtex', label: 'BibTeX' },
                        ] as Array<{ id: CitationStyle; label: string }>
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => onUpdateSettings({ defaultCitationStyle: st.id })}
                          className={`py-2 px-3 rounded-[6px] border text-[12px] font-mono transition-all cursor-pointer ${
                            settings.defaultCitationStyle === st.id
                              ? 'border-[var(--aria-accent)] bg-[#18181E] text-[var(--aria-accent)] font-semibold'
                              : 'border-white/[0.07] bg-[#09090B] text-[#8B8B8E] hover:text-[#EDEDED]'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Default Source Policy & Recency */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                        Default Source Policy
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'all', label: 'All Verified' },
                            { id: 'peer_reviewed', label: 'Peer-Reviewed' },
                          ] as Array<{ id: SourceTierFilter; label: string }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onUpdateSettings({ defaultSourceTier: opt.id })}
                            className={`py-2 px-2.5 rounded-[6px] border text-[11.5px] font-mono transition-all cursor-pointer ${
                              settings.defaultSourceTier === opt.id
                                ? 'border-[var(--aria-accent)] bg-[#18181E] text-[var(--aria-accent)] font-semibold'
                                : 'border-white/[0.07] bg-[#09090B] text-[#8B8B8E] hover:text-[#EDEDED]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                        Default Publication Recency
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            { id: 'all', label: 'All Time' },
                            { id: '5y', label: '5 Years' },
                            { id: '2y', label: '2 Years' },
                          ] as Array<{ id: RecencyFilter; label: string }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onUpdateSettings({ defaultRecency: opt.id })}
                            className={`py-2 px-2 rounded-[6px] border text-[11.5px] font-mono transition-all cursor-pointer ${
                              settings.defaultRecency === opt.id
                                ? 'border-[var(--aria-accent)] bg-[#18181E] text-[var(--aria-accent)] font-semibold'
                                : 'border-white/[0.07] bg-[#09090B] text-[#8B8B8E] hover:text-[#EDEDED]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Entailment Strictness & Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                        Entailment Strictness
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'standard', label: 'Standard', desc: 'Allows partial syntheses with badges' },
                            { id: 'strict', label: 'Strict Academic', desc: 'Withholds low-support claims & states gaps' },
                          ] as Array<{ id: 'standard' | 'strict'; label: string; desc: string }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onUpdateSettings({ entailmentStrictness: opt.id })}
                            className={`p-2.5 rounded-[6px] border text-left transition-all cursor-pointer ${
                              settings.entailmentStrictness === opt.id
                                ? 'border-[var(--aria-accent)] bg-[#18181E]'
                                : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
                            }`}
                          >
                            <div className="text-[12px] font-mono font-semibold text-[#EDEDED]">{opt.label}</div>
                            <div className="text-[10px] text-[#8B8B8E] mt-0.5 leading-snug">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                        Default Research Mode
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'synthesis', label: 'Synthesis', desc: 'Balanced scholarly overview' },
                            { id: 'deep_compare', label: 'Deep Compare', desc: 'Cross-source conflict checking' },
                          ] as Array<{ id: ResearchModePref; label: string; desc: string }>
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => onUpdateSettings({ defaultMode: opt.id })}
                            className={`p-2.5 rounded-[6px] border text-left transition-all cursor-pointer ${
                              settings.defaultMode === opt.id
                                ? 'border-[var(--aria-accent)] bg-[#18181E]'
                                : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
                            }`}
                          >
                            <div className="text-[12px] font-mono font-semibold text-[#EDEDED]">{opt.label}</div>
                            <div className="text-[10px] text-[#8B8B8E] mt-0.5 leading-snug">{opt.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Discipline Selector */}
                <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-3.5">
                  <div className="pb-3 border-b border-white/[0.05]">
                    <h2 className="text-[15px] font-semibold text-[#EDEDED]">Default Research Discipline</h2>
                    <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                      Scopes arXiv categories, OpenAlex taxonomy, and synthesis terminology. Overridable per question.
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
                              ? 'border-[var(--aria-accent)] bg-[#18181E]'
                              : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-medium text-[#EDEDED]">{dom.label}</span>
                            {isSelected && <Check size={12} className="text-[var(--aria-accent)]" />}
                          </div>
                          <p className="text-[10px] text-[#8B8B8E] line-clamp-2 leading-snug">{dom.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* =========================================================
                SECTION 2: READING & EXPERIENCE
               ========================================================= */}
            {activeSection === 'reading' && (
              <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-5">
                <div className="pb-3 border-b border-white/[0.05]">
                  <h2 className="text-[15px] font-semibold text-[#EDEDED]">Theme, Surface &amp; Reading Typography</h2>
                  <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                    Personalize accent palettes, reading measure font, scale, and sensory feedback.
                  </p>
                </div>

                {/* 4 Theme Presets */}
                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">Theme Palette</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {THEME_PRESETS.map((preset) => {
                      const active = settings.themePreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onUpdateSettings({ themePreset: preset.id })}
                          className={`p-3.5 rounded-[7px] text-left border transition-all cursor-pointer ${
                            active
                              ? 'border-[var(--aria-accent)] bg-[#18181E]'
                              : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: preset.accent }}
                              />
                              <span className="text-[12.5px] font-semibold text-[#EDEDED]">{preset.label}</span>
                            </div>
                            {active && <Check size={13} className="text-[var(--aria-accent)]" />}
                          </div>
                          <p className="text-[11px] text-[#8B8B8E]">{preset.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Surface Mode + Reading Typography + Scale */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                      Surface Mode
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['system', 'dark', 'light'] as SurfaceMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onUpdateSettings({ surfaceMode: mode })}
                          className={`py-2 px-2 rounded-[6px] border text-[11px] font-mono capitalize cursor-pointer transition-all ${
                            settings.surfaceMode === mode
                              ? 'border-[var(--aria-accent)] bg-[#18181E] text-[var(--aria-accent)] font-semibold'
                              : 'border-white/[0.07] bg-[#09090B] text-[#8B8B8E]'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                      Typography
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(
                        [
                          { id: 'serif', label: 'Editorial Serif' },
                          { id: 'sans', label: 'Technical Sans' },
                        ] as Array<{ id: FontFamilyPref; label: string }>
                      ).map((tp) => (
                        <button
                          key={tp.id}
                          type="button"
                          onClick={() => onUpdateSettings({ readingTypography: tp.id })}
                          className={`py-2 px-2 rounded-[6px] border text-[11px] font-mono cursor-pointer transition-all ${
                            settings.readingTypography === tp.id
                              ? 'border-[var(--aria-accent)] bg-[#18181E] text-[var(--aria-accent)] font-semibold'
                              : 'border-white/[0.07] bg-[#09090B] text-[#8B8B8E]'
                          }`}
                        >
                          {tp.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                      Font Scale
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'compact', label: 'Compact' },
                          { id: 'default', label: 'Default' },
                          { id: 'large', label: 'Large' },
                        ] as Array<{ id: FontScalePref; label: string }>
                      ).map((sc) => (
                        <button
                          key={sc.id}
                          type="button"
                          onClick={() => onUpdateSettings({ fontScale: sc.id })}
                          className={`py-2 px-1.5 rounded-[6px] border text-[11px] font-mono cursor-pointer transition-all ${
                            settings.fontScale === sc.id
                              ? 'border-[var(--aria-accent)] bg-[#18181E] text-[var(--aria-accent)] font-semibold'
                              : 'border-white/[0.07] bg-[#09090B] text-[#8B8B8E]'
                          }`}
                        >
                          {sc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Experience Toggles */}
                <div className="space-y-2.5 pt-1">
                  <SettingToggle
                    label="Reduced Motion"
                    description="Collapses transitions and animations to near-instant durations alongside OS prefers-reduced-motion."
                    checked={settings.reducedMotion}
                    onToggle={() => onUpdateSettings({ reducedMotion: !settings.reducedMotion })}
                  />
                  <SettingToggle
                    label="Show Research Pulse"
                    description="Displays your subtle local-only streak and verified-claims counter on the home screen."
                    checked={settings.showResearchPulse}
                    onToggle={() => onUpdateSettings({ showResearchPulse: !settings.showResearchPulse })}
                  />
                  {(isCapacitorRuntime || true) && (
                    <SettingToggle
                      label="Native Haptics (Android)"
                      description={
                        isCapacitorRuntime
                          ? 'Subtle light vibration feedback on citation clicks and export completion.'
                          : 'Enabled automatically on Android Capacitor builds (safely disabled on Desktop/Web).'
                      }
                      checked={settings.nativeHaptics}
                      onToggle={() => onUpdateSettings({ nativeHaptics: !settings.nativeHaptics })}
                    />
                  )}
                </div>
              </section>
            )}

            {/* =========================================================
                SECTION 3: EXPORT & NATIVE FILES
               ========================================================= */}
            {activeSection === 'export' && (
              <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-5">
                <div className="pb-3 border-b border-white/[0.05]">
                  <h2 className="text-[15px] font-semibold text-[#EDEDED]">Publication PDF &amp; Academic Files</h2>
                  <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                    Configure `.pdf` layout templates, verification ledger appendix inclusion, and native file saver behavior.
                  </p>
                </div>

                {/* PDF Layout Style */}
                <div className="space-y-2">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#8B8B8E]">
                    PDF Layout Style
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(
                      [
                        {
                          id: 'academic',
                          label: 'Academic Paper',
                          desc: 'Formal centered preprint masthead, Abstract, Index Terms, Roman sections, References & Audit Appendix.',
                        },
                        {
                          id: 'executive',
                          label: 'Executive Brief',
                          desc: 'Clean left-aligned intelligence brief header with highlighted summary callouts and concise formatting.',
                        },
                      ] as Array<{ id: PdfLayoutStyle; label: string; desc: string }>
                    ).map((layout) => (
                      <button
                        key={layout.id}
                        type="button"
                        onClick={() => onUpdateSettings({ pdfLayoutStyle: layout.id })}
                        className={`p-4 rounded-[8px] text-left border transition-all cursor-pointer ${
                          settings.pdfLayoutStyle === layout.id
                            ? 'border-[var(--aria-accent)] bg-[#18181E]'
                            : 'border-white/[0.07] bg-[#09090B] hover:border-white/[0.14]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] font-semibold text-[#EDEDED]">{layout.label}</span>
                          {settings.pdfLayoutStyle === layout.id && (
                            <Check size={14} className="text-[var(--aria-accent)]" />
                          )}
                        </div>
                        <p className="text-[11px] text-[#8B8B8E] leading-relaxed">{layout.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export Toggles */}
                <div className="space-y-2.5">
                  <SettingToggle
                    label="Include Claim Verification Ledger in PDF"
                    description="Appends the sentence-level Verification Audit Ledger Table as an appendix inside exported PDFs."
                    checked={settings.includeLedgerInPdf}
                    onToggle={() => onUpdateSettings({ includeLedgerInPdf: !settings.includeLedgerInPdf })}
                  />
                  <SettingToggle
                    label="Auto-open after export"
                    description="Automatically launches your device PDF/file viewer on Android after saving to Downloads/ARIA/."
                    checked={settings.autoOpenAfterExport}
                    onToggle={() => onUpdateSettings({ autoOpenAfterExport: !settings.autoOpenAfterExport })}
                  />
                </div>

                {/* Cross-Platform Native Save Location Card */}
                <div className="p-4 rounded-[7px] bg-[#09090B] border border-white/[0.07] space-y-2 text-[11.5px] font-mono">
                  <div className="flex items-center gap-2 text-[#EDEDED] font-semibold">
                    {isCapacitorRuntime ? <Smartphone size={14} className="text-[var(--aria-accent)]" /> : <Monitor size={14} className="text-[var(--aria-accent)]" />}
                    <span>Active Export Target ({isCapacitorRuntime ? 'Android Native' : isTauriRuntime ? 'Windows Desktop' : 'Web Browser'})</span>
                  </div>
                  <p className="text-[#8B8B8E] text-[11px] leading-relaxed font-sans">
                    {isCapacitorRuntime
                      ? 'Files (.pdf, .tex, .ris, .bib, .md) are saved directly via MediaStore into Downloads/ARIA/.'
                      : isTauriRuntime
                      ? 'Files save directly through the native Windows WebView file handler into your chosen or default Downloads folder.'
                      : 'Files stream cleanly as Blob attachments (.pdf, .tex, .ris, .bib, .md) to your browser Downloads directory.'}
                  </p>
                </div>
              </section>
            )}

            {/* =========================================================
                SECTION 4: ACCOUNT, PRIVACY & DIAGNOSTICS
               ========================================================= */}
            {activeSection === 'account' && (
              <>
                {/* Account & Guest-to-GitHub Upgrade */}
                <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/[0.05]">
                    <div>
                      <h2 className="text-[15px] font-semibold text-[#EDEDED]">Researcher Account &amp; Cloud Sync</h2>
                      <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                        Local threads and bookmarks stay preserved in this workspace when linking an account.
                      </p>
                    </div>
                    {user?.provider === 'guest' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void signInWithGitHub()}
                          className="btn-primary text-[11.5px] py-1.5 px-3"
                        >
                          <Github size={13} />
                          <span>Sign in with GitHub</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openAuthModal()}
                          className="btn-secondary text-[11.5px] py-1.5 px-3"
                        >
                          Email
                        </button>
                      </div>
                    ) : user ? (
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="btn-secondary text-[11px] py-1 px-2.5 text-red-400 border-red-500/30 hover:border-red-500/60"
                      >
                        <LogOut size={13} />
                        <span>Sign Out</span>
                      </button>
                    ) : null}
                  </div>

                  {user && (
                    <div className="p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] font-mono text-[11px] space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[#8B8B8E]">Researcher</span>
                        <span className="text-[#EDEDED] font-medium">{user.name}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#8B8B8E]">Identity</span>
                        <span className="text-[#EDEDED]">{user.email || `@${user.username}`}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#8B8B8E]">Provider</span>
                        <span className="text-[var(--aria-accent)] uppercase">{user.provider}</span>
                      </div>
                    </div>
                  )}

                  {/* Data Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-[11px] font-mono text-[#8B8B8E] tabular-nums">
                      {historyCount} local threads stored cleanly on device
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleExportBackup}
                        className="btn-secondary text-[11.5px] py-1.5 px-3"
                      >
                        <Download size={13} />
                        <span>Export Backup (.json)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearCache}
                        className="btn-secondary text-[11.5px] py-1.5 px-3 hover:border-red-500/40"
                      >
                        {cleared ? (
                          <>
                            <Check size={13} className="text-emerald-400" />
                            <span>Cleared</span>
                          </>
                        ) : (
                          <>
                            <Eraser size={13} />
                            <span>Clear Local Cache</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </section>

                {/* BYOK Multi-Key Pool */}
                <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-4">
                  <div className="pb-3 border-b border-white/[0.05] flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Key size={15} className="text-[var(--aria-accent)]" />
                        <h2 className="text-[15px] font-semibold text-[#EDEDED]">BYOK Groq Key Failover Pool</h2>
                      </div>
                      <p className="text-[12px] text-[#8B8B8E] mt-0.5">
                        Optional personal Groq keys for automatic failover during peak traffic.
                      </p>
                    </div>
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono text-[var(--aria-accent)] hover:underline flex items-center gap-1 shrink-0"
                    >
                      <span>Get Key</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>

                  <form onSubmit={handleAddKeySubmit} className="space-y-2 p-3 bg-[#09090B] border border-white/[0.07] rounded-[6px]">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="password"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        placeholder="Groq API Key (gsk_...)"
                        className="sm:col-span-2 px-3 py-1.5 bg-[#111115] border border-white/[0.07] focus:border-[var(--aria-accent)] focus:outline-none rounded-[5px] text-[12px] font-mono text-[#EDEDED] placeholder-[#71717A]"
                      />
                      <input
                        type="text"
                        value={newKeyLabel}
                        onChange={(e) => setNewKeyLabel(e.target.value)}
                        placeholder="Label"
                        className="px-3 py-1.5 bg-[#111115] border border-white/[0.07] focus:border-[var(--aria-accent)] focus:outline-none rounded-[5px] text-[12px] text-[#EDEDED] placeholder-[#71717A]"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button type="submit" disabled={!newKey.trim()} className="btn-primary text-[12px] py-1 px-3">
                        <Plus size={13} />
                        <span>Add Key</span>
                      </button>
                    </div>
                  </form>

                  {settings.apiKeys.length > 0 && (
                    <div className="space-y-2">
                      {settings.apiKeys.map((k) => {
                        const masked = k.key.length > 8 ? `${k.key.slice(0, 4)}...${k.key.slice(-4)}` : '••••••••';
                        const isTesting = testingKeyId === k.id;
                        const testResult = keyTestResults[k.id];
                        return (
                          <div
                            key={k.id}
                            className="p-3 bg-[#09090B] border border-white/[0.07] rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[12.5px] font-medium text-[#EDEDED] truncate">{k.label}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#18181E] border border-white/[0.07] text-[#8B8B8E]">
                                  {masked}
                                </span>
                                {k.status === 'active' && (
                                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 size={11} /> Active
                                  </span>
                                )}
                                {k.status === 'rate_limited' && (
                                  <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                                    <AlertTriangle size={11} /> Limited
                                  </span>
                                )}
                                {k.status === 'invalid' && (
                                  <span className="text-[10px] font-mono text-rose-400 flex items-center gap-1">
                                    <XCircle size={11} /> Invalid
                                  </span>
                                )}
                              </div>
                              {testResult && (
                                <p className={`text-[10.5px] font-mono ${testResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {testResult.msg}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleTestKey(k.id, k.key)}
                                disabled={isTesting}
                                className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded hover:bg-[#18181E] text-[11px] font-mono flex items-center gap-1 cursor-pointer"
                              >
                                <RefreshCw size={12} className={isTesting ? 'animate-spin text-[var(--aria-accent)]' : ''} />
                                <span>Test</span>
                              </button>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={k.enabled}
                                onClick={() => toggleApiKey(k.id)}
                                className={`w-8 h-4.5 p-0.5 rounded-[4px] transition-colors cursor-pointer ${
                                  k.enabled ? 'bg-[var(--aria-accent)]' : 'bg-[#18181E] border border-white/[0.1]'
                                }`}
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
                                className="p-1.5 text-[#71717A] hover:text-rose-400 rounded hover:bg-rose-500/10 cursor-pointer"
                                title="Remove key"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Live System Health & Diagnostics */}
                <section className="p-5 bg-[#111115] border border-white/[0.07] rounded-[8px] space-y-3.5">
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.05]">
                    <h2 className="text-[15px] font-semibold text-[#EDEDED]">Live System Diagnostics</h2>
                    <button
                      type="button"
                      onClick={pingHealth}
                      className="text-[11px] font-mono text-[#8B8B8E] hover:text-[#EDEDED] flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={11} className={apiStatus === 'checking' ? 'animate-spin' : ''} />
                      <span>Ping</span>
                    </button>
                  </div>

                  <div className="p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] font-mono text-[11px] space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[#8B8B8E]">Connection Status</span>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          apiStatus === 'online'
                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                            : apiStatus === 'checking'
                            ? 'text-[#8B8B8E] border-white/[0.1] bg-[#18181E]'
                            : 'text-rose-400 border-rose-500/30 bg-rose-500/10'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            apiStatus === 'online' ? 'bg-emerald-400' : apiStatus === 'checking' ? 'bg-[#8B8B8E] animate-pulse' : 'bg-rose-400'
                          }`}
                        />
                        {apiStatus === 'online' ? 'Connected' : apiStatus === 'checking' ? 'Checking...' : 'Offline'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#8B8B8E]">Active API Host</span>
                      <span className="text-[#EDEDED] truncate max-w-[60%]">{API_BASE_URL}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#8B8B8E]">Health Latency</span>
                      <span className="text-[var(--aria-accent)] tabular-nums">
                        {apiLatencyMs !== null ? `${apiLatencyMs} ms` : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-white/[0.04]">
                      <span className="text-[#8B8B8E]">App Build</span>
                      <span className="text-[#EDEDED] tabular-nums">
                        ARIA v2.0.0 · {typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'} ({typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'latest'})
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
