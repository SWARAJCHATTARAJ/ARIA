import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock, FolderGit2, BookOpen, Settings as SettingsIcon, Trash2, X,
  Activity, RefreshCw, Database, Search, ChevronRight, FileText, CheckCircle2,
  AlertTriangle, ExternalLink, Gauge, Github,
} from 'lucide-react';
import { API_BASE_URL } from '../config';
import { OkfGraphData, RESEARCH_MODE_OPTIONS, DISCIPLINE_OPTIONS, AriaSettings, ThemePreset, AnimationIntensity, CitationFormat } from '../types';
import { getHistory, deleteHistoryEntry, clearHistory, getCollections, removeFromCollection, getCompareDefault, setCompareDefault, getSettings, saveSettings, exportResearchHistory } from '../utils/storage';

function HubShell({ icon, title, subtitle, toolbar, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto hud-scroll">
      <div className="max-w-4xl mx-auto w-full p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-ink-surface relative overflow-hidden">
          <div className="hud-scanline" />
          <div className="flex items-center gap-3 relative z-10">
            <div className="w-9 h-9 bg-ink-surface border border-ink-surface flex items-center justify-center text-tier-okf telemetry-glow">
              {icon}
            </div>
            <div>
              <h2 className="text-sm font-mono font-bold text-white tracking-wider uppercase">{title}</h2>
              <p className="text-[11px] font-mono text-ink-muted mt-0.5">{subtitle}</p>
            </div>
          </div>
          {toolbar && <div className="relative z-10">{toolbar}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3 opacity-70">
      <div className="w-10 h-10 border border-ink-surface flex items-center justify-center text-ink-muted">{icon}</div>
      <p className="font-mono text-xs text-ink-muted">{text}</p>
    </div>
  );
}

// =====================================================================
// HISTORY: saved local threads (localStorage)
// =====================================================================
export function HistoryView({ onOpenQuery }: { onOpenQuery?: (query: string) => void }) {
  const [entries, setEntries] = useState(() => getHistory());

  useEffect(() => {
    setEntries(getHistory());
  }, [getCollections().length]);

  return (
    <HubShell
      icon={<Clock size={18} />}
      title="History"
      subtitle={`${entries.length} saved local thread${entries.length === 1 ? '' : 's'} (stored in this browser)`}
      toolbar={
        entries.length > 0 ? (
          <button
            onClick={() => { clearHistory(); setEntries([]); }}
            className="text-[11px] font-mono flex items-center gap-1.5 px-2 py-1 border border-ink-surface text-ink-muted hover:text-warning hover:border-warning/50 transition-colors"
          >
            <Trash2 size={12} /> Clear all
          </button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <EmptyState icon={<Clock size={18} />} text="No research threads saved yet. Every completed query is stored here automatically." />
      ) : (
        <div className="space-y-2">
          {entries.map((h) => (
            <div
              key={h.id}
              className="group p-3 bg-ink-surface/40 border border-ink-surface hover:border-tier-okf/50 transition-colors flex items-start gap-3 telemetry-glow"
            >
              <FileText size={14} className="text-tier-okf shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-sans text-gray-200 truncate">{h.query}</p>
                <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-ink-muted">
                  <span>{new Date(h.timestamp).toLocaleString()}</span>
                  {typeof h.confidence === 'number' && h.confidence > 0 && (
                    <span className="text-emerald-400/80">{Math.round(h.confidence * 100)}% verified</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onOpenQuery && (
                  <button
                    onClick={() => onOpenQuery(h.query)}
                    className="text-[10px] font-mono flex items-center gap-1 px-2 py-1 bg-tier-okf/15 border border-tier-okf/40 text-tier-okf hover:text-emerald-300 hover:bg-tier-okf/25 transition-colors"
                    title="Re-run this query"
                  >
                    <ChevronRight size={11} /> Open
                  </button>
                )}
                <button
                  onClick={() => { deleteHistoryEntry(h.id); setEntries(getHistory()); }}
                  className="p-1.5 text-ink-muted hover:text-warning transition-colors"
                  title="Delete entry"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </HubShell>
  );
}

// =====================================================================
// COLLECTIONS: bookmarked reports (localStorage)
// =====================================================================
export function CollectionsView() {
  const [entries, setEntries] = useState(() => getCollections());
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <HubShell
      icon={<FolderGit2 size={18} />}
      title="Collections"
      subtitle={`${entries.length} bookmarked report${entries.length === 1 ? '' : 's'} (stored in this browser)`}
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 size={18} />}
          text="No bookmarked reports yet. Use the bookmark action under any completed answer to save it here."
        />
      ) : (
        <div className="space-y-2">
          {entries.map((c) => {
            const isOpen = preview === c.id;
            return (
              <div
                key={c.id}
                className="p-3 bg-ink-surface/40 border border-ink-surface hover:border-tier-okf/50 transition-colors telemetry-glow"
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => setPreview(isOpen ? null : c.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-xs font-sans text-gray-200 truncate">{c.query}</p>
                    <div className="flex items-center gap-2 mt-1 font-mono text-[10px] text-ink-muted">
                      <span>{new Date(c.timestamp).toLocaleString()}</span>
                      {typeof c.confidence === 'number' && (
                        <span className={c.confidence >= 0.75 ? 'text-emerald-400/80' : 'text-amber-400/80'}>
                          {Math.round(c.confidence * 100)}% verified
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => { removeFromCollection(c.id); setEntries(getCollections()); setPreview(null); }}
                    className="p-1.5 text-ink-muted hover:text-warning transition-colors shrink-0"
                    title="Remove from collection"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {isOpen && (
                  <div className="mt-2 pt-2 border-t border-ink-surface/70 text-xs font-sans text-gray-300 leading-relaxed max-h-72 overflow-y-auto hud-scroll pr-1">
                    {c.content.slice(0, 1200)}
                    {c.content.length > 1200 && <span className="text-ink-muted italic"> …</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </HubShell>
  );
}

// =====================================================================
// OKF SPACE: interactive /api/okf/graph explorer
// =====================================================================
export function OkfSpaceView() {
  const [graph, setGraph] = useState<OkfGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE_URL}/api/okf/graph`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: OkfGraphData) => { if (mounted) setGraph(json); })
      .catch((e) => { if (mounted) setError(e.message || 'Failed to load OKF graph'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [reloadKey]);

  const nodes = useMemo(() => {
    if (!graph) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return graph.nodes;
    return graph.nodes.filter(
      (n) =>
        n.title.toLowerCase().includes(f) ||
        n.snippet_preview.toLowerCase().includes(f) ||
        (n.topic || []).some((t) => String(t).toLowerCase().includes(f))
    );
  }, [graph, filter]);

  const connected = useMemo(() => {
    if (!graph?.edges.length) return new Map<string, string[]>();
    const m = new Map<string, string[]>();
    graph.edges.forEach((e) => {
      if (!m.has(e.source)) m.set(e.source, []);
      if (!m.has(e.target)) m.set(e.target, []);
      m.get(e.source)!.push(e.target);
      m.get(e.target)!.push(e.source);
    });
    return m;
  }, [graph]);

  const selected = graph?.nodes.find((n) => n.id === selectedId) || null;

  const confidenceBadge = (conf: string) => {
    const isVerified = conf === 'verified';
    return (
      <span
        className={`text-[9px] font-mono px-1.5 py-0.5 border flex items-center gap-1 ${
          isVerified
            ? 'text-tier-okf border-tier-okf/40 bg-tier-okf/10'
            : 'text-amber-400 border-amber-500/40 bg-amber-500/10'
        }`}
      >
        {isVerified ? <CheckCircle2 size={9} /> : <AlertTriangle size={9} />}
        {conf.toUpperCase()}
      </span>
    );
  };

  return (
    <HubShell
      icon={<BookOpen size={18} />}
      title="OKF Space"
      subtitle={
        graph
          ? `${graph.total_nodes} knowledge nodes · ${graph.total_edges} related-links`
          : 'Open Knowledge Framework graph'
      }
      toolbar={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-ink-surface bg-ink-surface/40 px-2 py-1">
            <Search size={11} className="text-ink-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter nodes..."
              className="bg-transparent outline-none text-[11px] font-mono text-gray-200 placeholder-ink-muted w-32"
            />
          </div>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="p-1.5 border border-ink-surface text-ink-muted hover:text-white hover:border-gray-500 transition-colors"
            title="Reload graph"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      }
    >
      {loading ? (
        <EmptyState icon={<RefreshCw size={18} />} text="Loading OKF knowledge graph..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={18} />} text={`OKF graph unavailable: ${error}`} />
      ) : !graph || graph.nodes.length === 0 ? (
        <EmptyState icon={<Database size={18} />} text="The OKF data directory is empty. Ingest notes to populate the graph." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-2">
            {nodes.map((n) => {
              const degrees = connected.get(n.id)?.length ?? 0;
              const isSelected = selectedId === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedId(isSelected ? null : n.id)}
                  className={`w-full text-left p-3 border transition-colors ${
                    isSelected
                      ? 'border-tier-okf/70 bg-tier-okf/10'
                      : 'border-ink-surface hover:border-gray-600 bg-ink-surface/40'
                  } telemetry-glow`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-sans font-semibold text-gray-100 truncate">{n.title}</span>
                    {confidenceBadge(n.confidence || 'verified')}
                  </div>
                  <p className="text-[11px] font-sans text-gray-400 line-clamp-2 leading-tight">
                    {n.snippet_preview}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 font-mono text-[9px] text-ink-muted">
                    <span className="flex items-center gap-1">
                      <BookOpen size={9} /> type: {n.type || 'note'}
                    </span>
                    <span>links: {degrees}</span>
                  </div>
                </button>
              );
            })}
            {nodes.length === 0 && <EmptyState icon={<Search size={18} />} text={`No nodes match "${filter}".`} />}
          </div>

          {/* Selected node detail panel */}
          <div className="lg:sticky lg:top-4 h-fit">
            {selected ? (
              <div className="p-3 bg-ink-surface/60 border border-tier-okf/40 telemetry-glow">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-mono font-bold text-gray-100 uppercase tracking-wide truncate">
                    {selected.title}
                  </h3>
                  <button onClick={() => setSelectedId(null)} className="text-ink-muted hover:text-white p-1">
                    <X size={13} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {confidenceBadge(selected.confidence || 'verified')}
                  <span className="font-mono text-[9px] text-ink-muted">updated {selected.updated || 'unknown'}</span>
                </div>
                {(selected.topic || []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selected.topic.map((t, i) => (
                      <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 bg-ink-base border border-ink-surface text-tier-okf">
                        {String(t)}
                      </span>
                    ))}
                  </div>
                )}
                {(connected.get(selected.id) || []).length > 0 && (
                  <div className="mb-2">
                    <p className="text-[9px] font-mono text-ink-muted uppercase tracking-wider mb-1">Related notes</p>
                    <div className="flex flex-wrap gap-1">
                      {connected.get(selected.id)!.map((rid) => {
                        const rn = graph!.nodes.find((n) => n.id === rid);
                        return (
                          <button
                            key={rid}
                            onClick={() => setSelectedId(rid)}
                            className="text-[9px] font-mono px-1.5 py-0.5 bg-ink-base border border-ink-surface text-gray-300 hover:text-white hover:border-tier-okf/50 transition-colors"
                          >
                            {rn?.title || rid}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="text-[11px] font-sans text-gray-300 leading-relaxed mt-2 pt-2 border-t border-ink-surface/70 max-h-80 overflow-y-auto hud-scroll pr-1 whitespace-pre-wrap">
                  {selected.content}
                </div>
              </div>
            ) : (
              <div className="p-6 bg-ink-surface/20 border border-dashed border-ink-surface text-center">
                <p className="font-mono text-[11px] text-ink-muted">
                  Select a knowledge node to inspect its content and related-links.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </HubShell>
  );
}

// =====================================================================
// SETTINGS: 4-tab Research Control Center (v3 Part 3)
// =====================================================================
interface HealthSample {
  latencyMs: number;
  status: 'ok' | 'unreachable';
  version?: string;
}

interface SettingsViewProps {
  settings?: AriaSettings;
  onUpdateSettings?: (patch: Partial<AriaSettings>) => void;
}

const TABS = [
  { id: 'engine', label: 'Engine & Routing' },
  { id: 'appearance', label: 'Appearance & Motion' },
  { id: 'verification', label: 'Verification & Export' },
  { id: 'api', label: 'API Keys & Diagnostics' },
] as const;

type SettingsTabId = (typeof TABS)[number]['id'];

export function SettingsView({ settings: settingsProp, onUpdateSettings }: SettingsViewProps = {}) {
  const [local, setLocal] = useState<AriaSettings>(() => settingsProp || getSettings());
  const settings = settingsProp || local;
  const [activeTab, setActiveTab] = useState<SettingsTabId>('engine');
  const [samples, setSamples] = useState<HealthSample[]>([]);
  const [pinging, setPinging] = useState(false);

  const update = (patch: Partial<AriaSettings>) => {
    const next = { ...settings, ...patch };
    setLocal(next);
    if (onUpdateSettings) onUpdateSettings(next);
  };

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
        setSamples((prev) => [...prev, {
          latencyMs,
          status: res.ok ? 'ok' : 'unreachable',
          version: json.version,
        }]);
      } catch {
        setSamples((prev) => [...prev, { latencyMs: Math.round(performance.now() - t0), status: 'unreachable' }]);
      }
      await new Promise((r) => setTimeout(r, 220));
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
      ['aria-history-v1', 'aria-collections-v1', 'aria-settings-v2', 'aria-byok-key', 'aria-byok-provider', 'aria-user-context'].forEach((k) => {
        try { window.localStorage.removeItem(k); } catch { /* ignore */ }
      });
    }
    window.location.reload();
  };

  const themePresets: Array<{ id: ThemePreset; label: string; hex: string }> = [
    { id: 'cyber_obsidian', label: 'Cyber Obsidian (Default)', hex: '#5B8DB8' },
    { id: 'quantum_indigo', label: 'Quantum Indigo', hex: '#7C6BD9' },
    { id: 'emerald_matrix', label: 'Emerald Matrix', hex: '#34D399' },
    { id: 'solar_amber', label: 'Solar Amber', hex: '#D9A441' },
    { id: 'high_contrast', label: 'High-Contrast Minimal', hex: '#5B8DB8' },
  ];

  const intensityOptions: Array<{ id: AnimationIntensity; label: string }> = [
    { id: 'full_kinetic', label: 'Full Kinetic HUD' },
    { id: 'subtle_smooth', label: 'Subtle Smooth' },
    { id: 'reduced_motion', label: 'Reduced Motion' },
  ];

  const citationFormats: Array<{ id: CitationFormat; label: string }> = [
    { id: 'ieee', label: 'IEEE [1]' },
    { id: 'apa', label: 'APA (Author, Year)' },
    { id: 'nature', label: 'Nature Superscript' },
  ];

  return (
    <HubShell
      icon={<SettingsIcon size={18} />}
      title="Settings"
      subtitle="Research Control Center"
    >
      {/* Tab switcher */}
      <div className="flex flex-wrap items-center gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`font-mono text-[10px] uppercase tracking-wider px-2.5 py-1.5 border transition-colors ${
              activeTab === t.id
                ? 'bg-tier-okf/15 border-tier-okf/50 text-tier-okf'
                : 'bg-ink-base border-ink-surface text-ink-muted hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'engine' && (
        <div className="space-y-3">
          {/* Default synthesis mode */}
          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> Default Synthesis Mode
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {RESEARCH_MODE_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => update({ researchMode: m.id })}
                  className={`text-left p-2.5 border transition-all hover:border-sky-500/50 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:-translate-y-0.5 ${
                    settings.researchMode === m.id
                      ? 'bg-tier-okf/10 border-tier-okf/60 text-gray-100'
                      : 'bg-ink-base border-ink-surface text-gray-300'
                  }`}
                >
                  <div className="font-mono text-[10px] uppercase tracking-wider text-gray-200">{m.glyph} {m.label}</div>
                  <div className="font-sans text-[11px] text-ink-muted mt-1">{m.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Discipline default */}
          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> Default Discipline Branch
            </div>
            <select
              value={settings.discipline}
              onChange={(e) => update({ discipline: e.target.value })}
              className="w-full bg-ink-base border border-ink-surface text-[11px] font-mono text-gray-200 px-2 py-1.5 outline-none focus:border-tier-okf/50"
            >
              {DISCIPLINE_OPTIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.glyph} {d.label}</option>
              ))}
            </select>
          </div>

          {/* Retrieval strictness + source count */}
          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> Retrieval Engine Preferences
            </div>
            <label className="flex items-center justify-between cursor-pointer py-1">
              <div>
                <p className="text-xs font-sans text-gray-200">Retrieval Strictness</p>
                <p className="text-[10px] font-mono text-ink-muted mt-0.5">
                  Strict Peer-Reviewed Only vs Include Verified Web / Wikipedia.
                </p>
              </div>
              <select
                value={settings.retrievalStrictness}
                onChange={(e) => update({ retrievalStrictness: e.target.value as AriaSettings['retrievalStrictness'] })}
                className="bg-ink-base border border-ink-surface text-[11px] font-mono text-gray-200 px-2 py-1 outline-none"
              >
                <option value="strict_peer">Strict Peer-Reviewed Only</option>
                <option value="include_web">Include Verified Web / Wikipedia</option>
              </select>
            </label>
            <div className="mt-3 pt-3 border-t border-ink-surface/70">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-sans text-gray-200">Max Primary Sources</p>
                  <p className="text-[10px] font-mono text-ink-muted mt-0.5">4 to 12 sources retained by the evidence gate.</p>
                </div>
                <input
                  type="range"
                  min={4}
                  max={12}
                  step={1}
                  value={settings.sourceCount}
                  onChange={(e) => update({ sourceCount: Number(e.target.value) })}
                  className="w-40 accent-tier-okf"
                />
                <span className="font-mono text-[11px] text-tier-okf">{settings.sourceCount}</span>
              </div>
              <label className="flex items-center justify-between cursor-pointer mt-3 pt-2 border-t border-ink-surface/70">
                <div>
                  <p className="text-xs font-sans text-gray-200">Compare Tiers by default</p>
                  <p className="text-[10px] font-mono text-ink-muted mt-0.5">Forces the OKF, RAG and LIVE retrieval tiers to fire on every new question.</p>
                </div>
                <button
                  type="button"
                  onClick={() => update({ compareDefault: !settings.compareDefault })}
                  className={`relative w-9 h-5 shrink-0 border transition-colors ${
                    settings.compareDefault ? 'bg-tier-okf/40 border-tier-okf' : 'bg-ink-base border-gray-600'
                  }`}
                  role="switch"
                  aria-checked={settings.compareDefault}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 transition-all ${
                      settings.compareDefault ? 'left-[18px] bg-tier-okf' : 'left-0.5 bg-gray-400'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="space-y-3">
          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> Visual Theme Preset
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {themePresets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => update({ themePreset: t.id })}
                  className={`p-2.5 border text-left transition-all hover:border-sky-500/50 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:-translate-y-0.5 ${
                    settings.themePreset === t.id
                      ? 'bg-tier-okf/10 border-tier-okf/60 text-gray-100'
                      : 'bg-ink-base border-ink-surface text-gray-300'
                  }`}
                >
                  <span className="block font-mono text-[10px] uppercase tracking-wider text-gray-200">{t.label}</span>
                  <span className="inline-block w-2 h-2 rounded-none mt-1.5" style={{ backgroundColor: t.hex }} />
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> Animation Intensity
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {intensityOptions.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => update({ animationIntensity: o.id })}
                  className={`text-left p-2.5 border transition-all hover:border-sky-500/50 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:-translate-y-0.5 ${
                    settings.animationIntensity === o.id
                      ? 'bg-tier-okf/10 border-tier-okf/60 text-gray-100'
                      : 'bg-ink-base border-ink-surface text-gray-300'
                  }`}
                >
                  <div className="font-mono text-[10px] uppercase tracking-wider text-gray-200">{o.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> Visual Appearance
            </div>
            <label className="flex items-center justify-between cursor-pointer py-1">
              <div>
                <p className="text-xs font-sans text-gray-200">Background Grid Overlay</p>
                <p className="text-[10px] font-mono text-ink-muted mt-0.5">Blueprint grid + ambient glow.</p>
              </div>
              <button
                type="button"
                onClick={() => update({ gridOverlay: !settings.gridOverlay })}
                className={`relative w-9 h-5 shrink-0 border transition-colors ${
                  settings.gridOverlay ? 'bg-tier-okf/40 border-tier-okf' : 'bg-ink-base border-gray-600'
                }`}
                role="switch"
                aria-checked={settings.gridOverlay}
              >
                <span
                  className={`absolute top-0.5 w-3.5 h-3.5 transition-all ${
                    settings.gridOverlay ? 'left-[18px] bg-tier-okf' : 'left-0.5 bg-gray-400'
                  }`}
                />
              </button>
            </label>
            <div className="mt-3 pt-2 border-t border-ink-surface/70">
              <div className="text-[10px] font-mono text-ink-muted uppercase tracking-wider mb-2">Font Density / Reading Size</div>
              <div className="grid grid-cols-3 gap-2">
                {(['compact', 'standard', 'comfortable'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update({ fontDensity: d })}
                    className={`font-mono text-[10px] px-2 py-1.5 border transition-colors ${
                      settings.fontDensity === d
                        ? 'bg-tier-okf/15 border-tier-okf/50 text-tier-okf'
                        : 'bg-ink-base border-ink-surface text-ink-muted hover:text-gray-200'
                    }`}
                  >
                    {d[0].toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'verification' && (
        <div className="space-y-3">
          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> Verification & Export
            </div>
            <div className="text-[10px] font-mono text-ink-muted uppercase tracking-wider mb-2">Citation Format</div>
            <div className="grid grid-cols-3 gap-2">
              {citationFormats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => update({ citationFormat: c.id })}
                  className={`text-left p-2.5 border transition-all hover:border-sky-500/50 hover:shadow-[0_0_20px_rgba(14,165,233,0.18)] hover:-translate-y-0.5 ${
                    settings.citationFormat === c.id
                      ? 'bg-tier-okf/10 border-tier-okf/60 text-gray-100'
                      : 'bg-ink-base border-ink-surface text-gray-300'
                  }`}
                >
                  <div className="font-mono text-[10px] uppercase tracking-wider text-gray-200">{c.label}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-ink-surface/70">
              <div className="flex items-center justify-between gap-3 py-1">
                <div>
                  <p className="text-xs font-sans text-gray-200">Claim Audit Strictness Threshold</p>
                  <p className="text-[10px] font-mono text-ink-muted mt-0.5">
                    Entailment cutoff for supported claims ({settings.auditThreshold * 100}%).
                  </p>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={0.9}
                  step={0.05}
                  value={settings.auditThreshold}
                  onChange={(e) => update({ auditThreshold: Number(e.target.value) })}
                  className="w-40 accent-tier-okf"
                />
              </div>
              <div className="flex items-center justify-between gap-3 py-1">
                <div>
                  <p className="text-xs font-sans text-gray-200">Auto-expand Claim Audit Drawer on completion</p>
                  <p className="text-[10px] font-mono text-ink-muted mt-0.5">Open the sources drawer automatically after each completed audit.</p>
                </div>
                <button
                  type="button"
                  onClick={() => update({ autoExpandAudit: !settings.autoExpandAudit })}
                  className={`relative w-9 h-5 shrink-0 border transition-colors ${
                    settings.autoExpandAudit ? 'bg-tier-okf/40 border-tier-okf' : 'bg-ink-base border-gray-600'
                  }`}
                  role="switch"
                  aria-checked={settings.autoExpandAudit}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 transition-all ${
                      settings.autoExpandAudit ? 'left-[18px] bg-tier-okf' : 'left-0.5 bg-gray-400'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 py-1">
                <div>
                  <p className="text-xs font-sans text-gray-200">Include Full Audit Ledger & Clickable URLs in PDF Export</p>
                  <p className="text-[10px] font-mono text-ink-muted mt-0.5">Export the complete ledger and linked reference URLs (default on).</p>
                </div>
                <button
                  type="button"
                  onClick={() => update({ pdfFullLedger: !settings.pdfFullLedger })}
                  className={`relative w-9 h-5 shrink-0 border transition-colors ${
                    settings.pdfFullLedger ? 'bg-tier-okf/40 border-tier-okf' : 'bg-ink-base border-gray-600'
                  }`}
                  role="switch"
                  aria-checked={settings.pdfFullLedger}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 transition-all ${
                      settings.pdfFullLedger ? 'left-[18px] bg-tier-okf' : 'left-0.5 bg-gray-400'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 py-1">
                <div>
                  <p className="text-xs font-sans text-gray-200">Include Clickable Source URLs / DOIs in PDF References</p>
                  <p className="text-[10px] font-mono text-ink-muted mt-0.5">Render each reference URL as a clickable PDF link.</p>
                </div>
                <button
                  type="button"
                  onClick={() => update({ clickableUrls: !settings.clickableUrls })}
                  className={`relative w-9 h-5 shrink-0 border transition-colors ${
                    settings.clickableUrls ? 'bg-tier-okf/40 border-tier-okf' : 'bg-ink-base border-gray-600'
                  }`}
                  role="switch"
                  aria-checked={settings.clickableUrls}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 transition-all ${
                      settings.clickableUrls ? 'left-[18px] bg-tier-okf' : 'left-0.5 bg-gray-400'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'api' && (
        <div className="space-y-3">
          {/* BYOK settings summary */}
          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200 mb-3">
              <SettingsIcon size={13} className="text-tier-okf" /> API Keys & Diagnostics
            </div>
            <div className="text-[11px] font-mono text-gray-300 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">Custom LLM Provider</span>
                <span className="text-gray-200">{settings.byokProvider ? settings.byokProvider.toUpperCase() : 'Default (server)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Custom API Key</span>
                <span className="text-gray-200">{settings.byokApiKey ? '••• stored (local only)' : 'none'}</span>
              </div>
            </div>
          </div>

          {/* Backend health */}
          <div className="p-4 bg-ink-surface/40 border border-ink-surface telemetry-glow">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-gray-200">
                <Activity size={13} className="text-tier-okf" /> Backend Engine Health
              </div>
              <button
                onClick={runLatencyTest}
                disabled={pinging}
                className="text-[10px] font-mono flex items-center gap-1.5 px-2 py-1 bg-tier-okf/15 border border-tier-okf/40 text-tier-okf hover:bg-tier-okf/25 hover:text-emerald-300 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} className={pinging ? 'animate-spin' : ''} />
                {pinging ? 'Testing...' : 'Run latency test'}
              </button>
            </div>

            <div className="font-mono text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-400">API base</span>
                <span className="text-gray-200 truncate max-w-[60%] pl-2">{API_BASE_URL || 'same-origin'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className={`flex items-center gap-1 ${backendOnline ? 'text-emerald-400' : samples.length ? 'text-warning' : 'text-ink-muted'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${backendOnline ? 'bg-emerald-400' : samples.length ? 'bg-warning' : 'bg-gray-500'}`} />
                  {samples.length === 0 ? 'not tested' : backendOnline ? `healthy${samples[samples.length - 1].version ? ` · v${samples[samples.length - 1].version}` : ''}` : 'unreachable'}
                </span>
              </div>
              {avg !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Average /health latency</span>
                  <span className={`flex items-center gap-1 ${avg < 80 ? 'text-emerald-400' : avg < 250 ? 'text-tier-live' : 'text-warning'}`}>
                    <Gauge size={11} /> {avg} ms
                  </span>
                </div>
              )}
            </div>

            {samples.length > 0 && (
              <div className="flex items-end gap-1.5 h-14 mt-3 pt-3 border-t border-ink-surface/70">
                {samples.map((s, i) => {
                  const maxLat = Math.max(...samples.map((x) => x.latencyMs), 1);
                  const h = Math.max(8, (s.latencyMs / maxLat) * 44);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${s.latencyMs} ms (${s.status})`}>
                      <div className={`w-full ${s.status === 'ok' ? 'bg-tier-okf/70' : 'bg-warning/70'}`} style={{ height: h }} />
                      <span className="text-[8px] font-mono text-ink-muted">{s.latencyMs}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportHistory}
              className="text-[10px] font-mono flex items-center gap-1.5 px-2.5 py-1.5 bg-ink-base border border-ink-surface text-ink-muted hover:text-white hover:border-gray-500 transition-colors"
            >
              <FileText size={11} /> Export All Research History (JSON)
            </button>
            <button
              type="button"
              onClick={handleClearStorage}
              className="text-[10px] font-mono flex items-center gap-1.5 px-2.5 py-1.5 bg-ink-base border border-ink-surface text-ink-muted hover:text-warning hover:border-warning/50 transition-colors"
            >
              <Trash2 size={11} /> Clear Local Storage
            </button>
          </div>
        </div>
      )}

      {/* About */}
      <div className="p-4 bg-ink-surface/40 border border-ink-surface flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-gray-200">ARIA v2</p>
          <p className="text-[10px] font-mono text-ink-muted mt-1">
            Autonomous Research & Intelligence Synthesis Engine
          </p>
        </div>
        <a
          href="https://github.com/SWARAJCHATTARAJ/ARIA"
          target="_blank"
          rel="noreferrer"
          className="text-ink-muted hover:text-white transition-colors p-1"
          title="View source on GitHub"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </HubShell>
  );
}
