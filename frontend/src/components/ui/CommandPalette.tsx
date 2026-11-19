import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  PlusCircle,
  Clock,
  FolderGit2,
  BookOpen,
  Settings,
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import { getHistory, getCollections } from '../../services/storage';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onStartQuery?: (query: string) => void;
}

interface PaletteAction {
  id: string;
  category: 'Actions' | 'Navigation' | 'History' | 'Collections' | 'OKF Space';
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

export default function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  onStartQuery,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const allActions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [
      {
        id: 'action-new',
        category: 'Actions',
        label: 'Start New Research Question',
        sublabel: 'Open a fresh editorial workspace',
        icon: <PlusCircle size={14} className="text-[#60A5FA]" />,
        onSelect: () => {
          onNavigate('query');
          onClose();
        },
      },
      {
        id: 'nav-history',
        category: 'Navigation',
        label: 'Research History',
        icon: <Clock size={14} />,
        onSelect: () => {
          onNavigate('history');
          onClose();
        },
      },
      {
        id: 'nav-collections',
        category: 'Navigation',
        label: 'Saved Collections',
        icon: <FolderGit2 size={14} />,
        onSelect: () => {
          onNavigate('collections');
          onClose();
        },
      },
      {
        id: 'nav-okf',
        category: 'Navigation',
        label: 'OKF Space (Knowledge Graph)',
        icon: <BookOpen size={14} />,
        onSelect: () => {
          onNavigate('okf');
          onClose();
        },
      },
      {
        id: 'nav-settings',
        category: 'Navigation',
        label: 'Settings',
        icon: <Settings size={14} />,
        onSelect: () => {
          onNavigate('settings');
          onClose();
        },
      },
    ];

    // Load past History threads
    try {
      const history = getHistory();
      history.slice(0, 8).forEach((h) => {
        list.push({
          id: `hist-${h.id}`,
          category: 'History',
          label: h.query,
          sublabel: h.snippet ? h.snippet.slice(0, 75) + '...' : undefined,
          icon: <Clock size={14} className="text-[#8B8B8E]" />,
          onSelect: () => {
            if (onStartQuery) onStartQuery(h.query);
            else onNavigate('query');
            onClose();
          },
        });
      });
    } catch {
      // storage quiet fallback
    }

    // Load saved Collections
    try {
      const collections = getCollections();
      collections.slice(0, 6).forEach((c) => {
        list.push({
          id: `coll-${c.id}`,
          category: 'Collections',
          label: c.query,
          sublabel: c.content ? c.content.slice(0, 75) + '...' : undefined,
          icon: <FolderGit2 size={14} className="text-[#60A5FA]" />,
          onSelect: () => {
            if (onStartQuery) onStartQuery(c.query);
            else onNavigate('collections');
            onClose();
          },
        });
      });
    } catch {
      // storage quiet fallback
    }

    // OKF Space Topics
    const okfTopics = [
      { label: 'Autonomous Systems Taxonomy', query: 'What is the definition and taxonomy of autonomous systems in artificial intelligence?' },
      { label: 'CRISPR Off-Target Mitigation', query: 'What are the off-target mitigation strategies for CRISPR gene editing?' },
      { label: 'JWST 2024 Redshift Spectra', query: 'What were the latest discoveries of the James Webb Space Telescope in 2024?' },
      { label: 'Byzantine Fault Tolerance Protocols', query: 'How do multi-agent consensus protocols handle Byzantine fault tolerance?' },
    ];
    okfTopics.forEach((t, idx) => {
      list.push({
        id: `okf-top-${idx}`,
        category: 'OKF Space',
        label: t.label,
        sublabel: t.query,
        icon: <BookOpen size={14} className="text-[#A78BFA]" />,
        onSelect: () => {
          if (onStartQuery) onStartQuery(t.query);
          else onNavigate('query');
          onClose();
        },
      });
    });

    return list;
  }, [isOpen, onNavigate, onClose, onStartQuery]);

  // Filtering
  const filtered = useMemo(() => {
    if (!query.trim()) return allActions;
    const qLower = query.toLowerCase();
    return allActions.filter(
      (a) =>
        a.label.toLowerCase().includes(qLower) ||
        a.category.toLowerCase().includes(qLower) ||
        (a.sublabel && a.sublabel.toLowerCase().includes(qLower))
    );
  }, [allActions, query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (query.trim() && selectedIndex === 0 && !filtered.some((f) => f.label.toLowerCase() === query.toLowerCase())) {
          if (onStartQuery) onStartQuery(query.trim());
          else onNavigate('query');
          onClose();
        } else if (filtered[selectedIndex]) {
          filtered[selectedIndex].onSelect();
        } else if (query.trim() && onStartQuery) {
          onStartQuery(query.trim());
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, query, onClose, onStartQuery, onNavigate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        className="relative w-full max-w-xl overflow-hidden z-10 animate-fade-slide bg-[#111115] border border-white/[0.09] rounded-[10px] shadow-2xl"
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.07] bg-[#0C0C0F]">
          <Search size={16} className="text-[#71717A] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search views, history, collections, or ask a question..."
            className="w-full bg-transparent text-[14px] font-sans text-[#EDEDED] placeholder-[#71717A] focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-[#71717A] hover:text-[#EDEDED] p-1 active:scale-[0.98]"
              aria-label="Clear query"
            >
              <X size={14} />
            </button>
          )}
          <span className="text-[10px] font-mono text-[#71717A] border border-white/[0.07] px-1.5 py-0.5 rounded-[3px] shrink-0 hidden sm:inline">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto hud-scroll p-2 divide-y divide-white/[0.04]"
        >
          {/* Quick Query action if text typed */}
          {query.trim() && (
            <div
              onClick={() => {
                if (onStartQuery) onStartQuery(query.trim());
                else onNavigate('query');
                onClose();
              }}
              className="p-2.5 rounded-[6px] text-[12px] font-mono flex items-center justify-between cursor-pointer bg-[#18181E] border border-white/[0.12] text-[#EDEDED] mb-1 active:scale-[0.98] transition-all"
            >
              <span className="flex items-center gap-2 truncate pr-2">
                <Sparkles size={14} className="text-[#60A5FA] shrink-0" />
                <span className="truncate">Synthesize &quot;{query.trim()}&quot;</span>
              </span>
              <span className="text-[10px] text-[#71717A] shrink-0 flex items-center gap-1 font-mono">
                Enter ↵
              </span>
            </div>
          )}

          {filtered.length === 0 && !query.trim() && (
            <div className="p-6 text-center text-[12px] font-mono text-[#71717A]">
              Type to search views, past research, or collections.
            </div>
          )}

          {filtered.map((action, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={action.id}
                onClick={() => action.onSelect()}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-2.5 rounded-[6px] text-[13px] font-sans flex items-center justify-between cursor-pointer transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'bg-[#18181E] text-[#EDEDED] pl-3'
                    : 'text-[#8B8B8E] hover:bg-[#18181E]/60 hover:text-[#EDEDED]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 pr-3">
                  <span className={isSelected ? 'text-[#60A5FA]' : 'text-[#71717A]'}>
                    {action.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{action.label}</div>
                    {action.sublabel && (
                      <div className="truncate text-[11px] font-mono text-[#71717A]">
                        {action.sublabel}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] font-mono uppercase tracking-wider text-[#71717A] bg-[#0C0C0F] px-1.5 py-0.5 rounded-[3px] border border-white/[0.07]">
                    {action.category}
                  </span>
                  {isSelected && <ArrowRight size={12} className="text-[#60A5FA]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#0C0C0F] border-t border-white/[0.07] flex items-center justify-between text-[10px] font-mono text-[#71717A]">
          <span>Navigate with ↑ ↓ · Select with ↵</span>
          <span>ARIA Command Palette</span>
        </div>
      </div>
    </div>
  );
}
