import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  FolderGit2,
  BookOpen,
  Trash2,
  X,
  RefreshCw,
  Database,
  Search,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { API_BASE_URL } from '../services/config';
import { OkfGraphData } from '../types';
import { getHistory, deleteHistoryEntry, clearHistory, getCollections, removeFromCollection } from '../services/storage';

function HubShell({
  icon,
  title,
  subtitle,
  toolbar,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 overflow-y-auto hud-scroll bg-[#09090B] text-[#EDEDED] select-text">
      <div className="max-w-4xl mx-auto w-full p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[6px] bg-[#111115] border border-white/[0.07] flex items-center justify-center text-[#60A5FA]">
              {icon}
            </div>
            <div>
              <h1 className="text-[22px] font-semibold text-[#EDEDED] tracking-[-0.02em]">{title}</h1>
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
      <div className="w-10 h-10 rounded-[6px] border border-white/[0.07] bg-[#111115] flex items-center justify-center text-[#8B8B8E]">
        {icon}
      </div>
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
            onClick={() => {
              clearHistory();
              setEntries([]);
            }}
            className="text-[11px] font-mono flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-white/[0.07] text-[#8B8B8E] hover:text-red-400 hover:border-red-500/30 active:scale-[0.98] transition-all"
          >
            <Trash2 size={12} /> Clear all
          </button>
        ) : undefined
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={<Clock size={18} />}
          text="No research threads saved yet. Every completed query is stored here automatically."
        />
      ) : (
        <div className="space-y-2.5">
          {entries.map((h) => (
            <div
              key={h.id}
              className="p-4 bg-[#111115] border border-white/[0.07] hover:border-white/[0.14] rounded-[8px] transition-all flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[14px] text-[#EDEDED] font-medium truncate">{h.query}</p>
                <div className="flex items-center gap-3 mt-1.5 font-mono text-[11px] text-[#71717A]">
                  <span className="tabular-nums">{new Date(h.timestamp).toLocaleString()}</span>
                  {typeof h.confidence === 'number' && h.confidence > 0 && (
                    <span className="text-[#60A5FA] tabular-nums font-semibold">
                      {Math.round(h.confidence * 100)}% verified
                    </span>
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
                  onClick={() => {
                    deleteHistoryEntry(h.id);
                    setEntries(getHistory());
                  }}
                  className="p-1.5 text-[#8B8B8E] hover:text-red-400 rounded-[6px] hover:bg-[#18181E] active:scale-[0.98] transition-all"
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
          text="No bookmarked reports yet. Use the Save action under any completed answer to bookmark it here."
        />
      ) : (
        <div className="space-y-2.5">
          {entries.map((c) => {
            const isOpen = preview === c.id;
            return (
              <div
                key={c.id}
                className="p-4 bg-[#111115] border border-white/[0.07] hover:border-white/[0.14] rounded-[8px] transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <button
                    onClick={() => setPreview(isOpen ? null : c.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-[14px] font-medium text-[#EDEDED] truncate">{c.query}</p>
                    <div className="flex items-center gap-3 mt-1.5 font-mono text-[11px] text-[#71717A]">
                      <span className="tabular-nums">{new Date(c.timestamp).toLocaleDateString()}</span>
                      {typeof c.confidence === 'number' && (
                        <span className="text-[#60A5FA] tabular-nums font-semibold">
                          {Math.round(c.confidence * 100)}% verified
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      removeFromCollection(c.id);
                      setEntries(getCollections());
                    }}
                    className="p-1.5 text-[#8B8B8E] hover:text-red-400 rounded-[6px] hover:bg-[#18181E] active:scale-[0.98] transition-all shrink-0"
                    title="Remove from collections"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {isOpen && (
                  <div className="p-3.5 bg-[#09090B] border border-white/[0.07] rounded-[6px] text-[13px] text-[#EDEDED] leading-relaxed max-h-96 overflow-y-auto hud-scroll">
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
      .then((json: OkfGraphData) => {
        if (mounted) setGraph(json);
      })
      .catch((e) => {
        if (mounted) setError(e.message || 'Failed to load OKF graph');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
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
        className={`text-[9px] font-mono px-1.5 py-0.5 rounded-[3px] border flex items-center gap-1 ${
          isVerified
            ? 'text-[#60A5FA] border-[#60A5FA]/40 bg-[#60A5FA]/10'
            : 'text-[#F59E0B] border-[#F59E0B]/40 bg-[#F59E0B]/10'
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
          ? `${graph.total_nodes} knowledge nodes · ${graph.total_edges} related links`
          : 'Open Knowledge Framework ontology'
      }
      toolbar={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 border border-white/[0.07] bg-[#111115] rounded-[6px] px-2.5 py-1">
            <Search size={12} className="text-[#71717A]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter nodes..."
              className="bg-transparent outline-none text-[12px] font-mono text-[#EDEDED] placeholder-[#71717A] w-32"
            />
          </div>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="p-1.5 border border-white/[0.07] bg-[#111115] hover:bg-[#18181E] rounded-[6px] text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98] transition-all cursor-pointer"
            title="Reload graph"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      }
    >
      {loading ? (
        <EmptyState icon={<RefreshCw size={18} />} text="Loading OKF knowledge graph..." />
      ) : error ? (
        <EmptyState icon={<AlertTriangle size={18} />} text={`OKF graph unavailable: ${error}`} />
      ) : !graph || graph.nodes.length === 0 ? (
        <EmptyState
          icon={<Database size={18} />}
          text="The OKF data directory is empty. Ingest notes to populate the graph."
        />
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
                  className={`w-full text-left p-3.5 border rounded-[8px] transition-all active:scale-[0.99] cursor-pointer ${
                    isSelected
                      ? 'border-[#60A5FA] bg-[#111115]'
                      : 'border-white/[0.07] hover:border-white/[0.14] bg-[#111115]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[13px] font-medium text-[#EDEDED] truncate">{n.title}</span>
                    {confidenceBadge(n.confidence || 'verified')}
                  </div>
                  <p className="text-[12px] text-[#8B8B8E] line-clamp-2 leading-relaxed">
                    {n.snippet_preview}
                  </p>
                  <div className="flex items-center gap-3 mt-2 font-mono text-[10px] text-[#71717A]">
                    <span className="flex items-center gap-1">
                      <BookOpen size={10} /> type: {n.type || 'note'}
                    </span>
                    <span className="tabular-nums">links: {degrees}</span>
                  </div>
                </button>
              );
            })}
            {nodes.length === 0 && (
              <EmptyState icon={<Search size={18} />} text={`No nodes match "${filter}".`} />
            )}
          </div>

          {/* Selected node detail panel */}
          <div className="lg:sticky lg:top-4 h-fit">
            {selected ? (
              <div className="p-4 bg-[#111115] border border-[#60A5FA]/40 rounded-[8px] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[13px] font-mono font-semibold text-[#EDEDED] uppercase tracking-wide truncate">
                    {selected.title}
                  </h3>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-[#8B8B8E] hover:text-[#EDEDED] p-1 active:scale-[0.98]"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {confidenceBadge(selected.confidence || 'verified')}
                  <span className="font-mono text-[10px] text-[#71717A]">
                    updated {selected.updated || '2026'}
                  </span>
                </div>
                {(selected.topic || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.topic.map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono px-1.5 py-0.5 bg-[#09090B] border border-white/[0.07] text-[#60A5FA] rounded-[3px]"
                      >
                        {String(t)}
                      </span>
                    ))}
                  </div>
                )}
                {(connected.get(selected.id) || []).length > 0 && (
                  <div className="pt-2 border-t border-white/[0.05]">
                    <p className="text-[10px] font-mono text-[#71717A] uppercase tracking-wider mb-1.5">
                      Related Notes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {connected.get(selected.id)!.map((rid) => {
                        const rn = graph!.nodes.find((n) => n.id === rid);
                        return (
                          <button
                            key={rid}
                            onClick={() => setSelectedId(rid)}
                            className="text-[10px] font-mono px-2 py-0.5 bg-[#09090B] border border-white/[0.07] text-[#EDEDED] hover:border-[#60A5FA]/50 active:scale-[0.98] transition-all rounded-[3px]"
                          >
                            {rn?.title || rid}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="text-[12px] font-mono text-[#EDEDED] leading-relaxed pt-2 border-t border-white/[0.05] max-h-80 overflow-y-auto hud-scroll whitespace-pre-wrap">
                  {selected.content}
                </div>
              </div>
            ) : (
              <div className="p-8 bg-[#111115] border border-dashed border-white/[0.07] rounded-[8px] text-center">
                <p className="font-mono text-[12px] text-[#71717A]">
                  Select a knowledge node to inspect its content and ontology connections.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </HubShell>
  );
}

export { default as SettingsView } from './SettingsView';
