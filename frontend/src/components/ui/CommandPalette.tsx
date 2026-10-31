import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Home,
  PlusCircle,
  Clock,
  FolderGit2,
  BookOpen,
  Settings,
  Palette,
  Cpu,
  Sparkles,
  ArrowRight,
  X,
  FileDown,
} from 'lucide-react';
import { useTheme, ThemeId } from '../../context/ThemeContext';
import { useSettingsContext } from '../../context/SettingsContext';
import { ResearchMode } from '../../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onStartQuery?: (query: string) => void;
}

interface PaletteAction {
  id: string;
  category: 'Navigation' | 'Theme' | 'Research Mode' | 'Action';
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

export default function CommandPalette({ isOpen, onClose, onNavigate, onStartQuery }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const { theme, setTheme, themes } = useTheme();
  const { settings, onUpdateSettings, researchModes } = useSettingsContext();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Actions list
  const actions: PaletteAction[] = [
    // Navigation
    {
      id: 'nav-home',
      category: 'Navigation',
      label: 'Go to Home (Hero & Verification Overview)',
      icon: <Home size={15} />,
      onSelect: () => { onNavigate('home'); onClose(); },
    },
    {
      id: 'nav-query',
      category: 'Navigation',
      label: 'New Question (Research Workspace)',
      icon: <PlusCircle size={15} />,
      onSelect: () => { onNavigate('query'); onClose(); },
    },
    {
      id: 'nav-history',
      category: 'Navigation',
      label: 'Open Research History',
      icon: <Clock size={15} />,
      onSelect: () => { onNavigate('history'); onClose(); },
    },
    {
      id: 'nav-collections',
      category: 'Navigation',
      label: 'Open Saved Collections',
      icon: <FolderGit2 size={15} />,
      onSelect: () => { onNavigate('collections'); onClose(); },
    },
    {
      id: 'nav-okf',
      category: 'Navigation',
      label: 'Explore OKF Space (Graph Ontology)',
      icon: <BookOpen size={15} />,
      onSelect: () => { onNavigate('okf'); onClose(); },
    },
    {
      id: 'nav-settings',
      category: 'Navigation',
      label: 'Open Settings (Controls, BYOK, Appearance)',
      icon: <Settings size={15} />,
      onSelect: () => { onNavigate('settings'); onClose(); },
    },

    // Themes
    ...themes.map((t) => ({
      id: `theme-${t.id}`,
      category: 'Theme' as const,
      label: `Switch Theme: ${t.name}`,
      sublabel: t.tagline,
      icon: <Palette size={15} style={{ color: t.accentHex }} />,
      onSelect: () => { setTheme(t.id); onClose(); },
    })),

    // Research Modes
    ...researchModes.map((rm) => ({
      id: `mode-${rm.id}`,
      category: 'Research Mode' as const,
      label: `Research Mode: ${rm.label}`,
      sublabel: rm.hint,
      icon: <Cpu size={15} />,
      onSelect: () => {
        onUpdateSettings({ researchMode: rm.id });
        onClose();
      },
    })),
  ];

  // Filtering
  const filtered = query.trim()
    ? actions.filter(
        (a) =>
          a.label.toLowerCase().includes(query.toLowerCase()) ||
          a.category.toLowerCase().includes(query.toLowerCase()) ||
          (a.sublabel && a.sublabel.toLowerCase().includes(query.toLowerCase()))
      )
    : actions;

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
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].onSelect();
        } else if (query.trim() && onStartQuery) {
          onStartQuery(query.trim());
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, query, onClose, onStartQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-xl bg-ink-base border border-cyan-500/40 shadow-2xl rounded-none overflow-hidden z-10 neon-sheen">
        {/* Top Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ink-surface bg-ink-surface/80">
          <Search size={18} className="text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search commands, views, themes, or ask a question..."
            className="w-full bg-transparent text-sm md:text-base font-sans text-white placeholder-ink-muted focus:outline-none"
            style={{ fontSize: '16px' }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-ink-muted hover:text-white p-1"
            >
              <X size={15} />
            </button>
          )}
          <span className="text-[10px] font-mono text-ink-muted border border-ink-surface px-1.5 py-0.5 shrink-0 hidden sm:inline">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto hud-scroll p-2 divide-y divide-ink-surface/40"
        >
          {/* Quick Query item if text typed */}
          {query.trim() && (
            <div
              onClick={() => {
                if (onStartQuery) onStartQuery(query.trim());
                onClose();
              }}
              className="p-2.5 text-xs font-mono flex items-center justify-between cursor-pointer bg-cyan-500/10 border border-cyan-400/40 text-cyan-300 mb-1 hover:bg-cyan-500/20"
            >
              <span className="flex items-center gap-2">
                <Sparkles size={14} className="text-cyan-400 animate-pulse" />
                <span>Ask ARIA: &quot;{query.trim()}&quot;</span>
              </span>
              <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                Enter ↵
              </span>
            </div>
          )}

          {filtered.length === 0 && !query.trim() && (
            <div className="p-6 text-center text-xs font-mono text-ink-muted">
              Type to search actions, themes, or views.
            </div>
          )}

          {filtered.map((action, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div
                key={action.id}
                onClick={() => action.onSelect()}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-2.5 text-xs font-mono flex items-center justify-between cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-cyan-500/15 border-l-2 border-cyan-400 text-white pl-3'
                    : 'text-gray-300 hover:bg-ink-surface/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`${isSelected ? 'text-cyan-400' : 'text-ink-muted'}`}>
                    {action.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{action.label}</div>
                    {action.sublabel && (
                      <div className="truncate text-[10px] text-ink-muted">
                        {action.sublabel}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[9px] uppercase tracking-wider text-ink-muted bg-ink-base/80 px-1.5 py-0.5 border border-ink-surface">
                    {action.category}
                  </span>
                  {isSelected && <ArrowRight size={12} className="text-cyan-400" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-ink-surface/90 border-t border-ink-surface flex items-center justify-between text-[10px] font-mono text-ink-muted">
          <span>Navigate with ↑ ↓ · Select with ↵</span>
          <span>ARIA Spotlight v2</span>
        </div>
      </div>
    </div>
  );
}
