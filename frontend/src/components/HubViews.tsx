import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock, FolderGit2, BookOpen, Trash2, X,
  RefreshCw, Database, Search, CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import { OkfGraphData } from '../types';
import { getHistory, deleteHistoryEntry, clearHistory, getCollections, removeFromCollection } from '../services/storage';

function HubShell({ icon, title, subtitle, toolbar, children }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto hud-scroll bg-[#0A0A0B] text-[#EDEDED]">
      <div className="max-w-4xl mx-auto w-full p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-[#262629]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[6px] bg-[#141416] border border-[#262629] flex items-center justify-center text-[#5E8BFF]">
              {icon}
            </div>
            <div>
              <h1 className="text-[24px] font-semibold text-[#EDEDED]">{title}</h1>
              <p className="text-[12px] font-mono text-[#8B8B8E] mt-0.5">{subtitle}</p>
            </div>
          </div>
          {toolbar && <div>{toolbar}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3 text-[#8B8B8E]">
      <div className="w-10 h-10 rounded-[6px] border border-[#262629] bg-[#141416] flex items-center justify-center text-[#8B8B8E]">{icon}</div>
      <p className="text-[14px]">{text}</p>
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
        <div className="space-y-3">
          {entries.map((h) => (
            <div
              key={h.id}
              className="p-4 bg-[#141416] border border-[#262629] hover:border-[#38383C] rounded-[8px] transition-colors flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-[#EDEDED] font-medium truncate">{h.query}</p>
                <div className="flex items-center gap-3 mt-1.5 font-mono text-[12px] text-[#8B8B8E]">
                  <span>{new Date(h.timestamp).toLocaleString()}</span>
                  {typeof h.confidence === 'number' && h.confidence > 0 && (
                    <span className="text-[#34D399]">{Math.round(h.confidence * 100)}% verified</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onOpenQuery && (
                  <button
                    onClick={() => onOpenQuery(h.query)}
                    className="btn-secondary text-[12px] py-1 px-3"
                    title="Open query"
                  >
                    Open
                  </button>
                )}
                <button
                  onClick={() => { deleteHistoryEntry(h.id); setEntries(getHistory()); }}
                  className="p-1.5 text-[#8B8B8E] hover:text-[#EF4444] rounded-[6px] hover:bg-[#1B1B1E] transition-colors"
                  title="Delete entry"
                >
                  <Trash2 size={14} />
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
        <div className="space-y-3">
          {entries.map((c) => {
            const isOpen = preview === c.id;
            return (
              <div
                key={c.id}
                className="p-4 bg-[#141416] border border-[#262629] hover:border-[#38383C] rounded-[8px] transition-colors space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <button
                    onClick={() => setPreview(isOpen ? null : c.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-[14px] font-medium text-[#EDEDED] truncate">{c.query}</p>
                    <div className="flex items-center gap-3 mt-1.5 font-mono text-[12px] text-[#8B8B8E]">
                      <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                      {typeof c.confidence === 'number' && (
                        <span className="text-[#34D399]">{Math.round(c.confidence * 100)}% verified</span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => { removeFromCollection(c.id); setEntries(getCollections()); }}
                    className="p-1.5 text-[#8B8B8E] hover:text-[#EF4444] rounded-[6px] hover:bg-[#1B1B1E] transition-colors shrink-0"
                    title="Remove from collections"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {isOpen && (
                  <div className="p-4 bg-[#0A0A0B] border border-[#262629] rounded-[6px] text-[14px] text-[#EDEDED] leading-relaxed max-h-96 overflow-y-auto hud-scroll">
                    {c.content}
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
            : 'text-tier-live border-tier-live/40 bg-tier-live/10'
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
// SETTINGS: Re-exported from modular SettingsView component
// =====================================================================
export { default as SettingsView } from './SettingsView';

