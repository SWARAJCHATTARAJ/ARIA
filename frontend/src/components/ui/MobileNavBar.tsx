import React from 'react';
import { Home, PlusCircle, Clock, FolderGit2, Settings, BookOpen, Command, User, Github } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

interface MobileNavBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
}

export function MobileTopBar({ activeTab, onTabChange, onOpenCommandPalette }: MobileNavBarProps) {
  const { theme, cycleNextTheme, themes } = useTheme();
  const { user, openAuthModal } = useAuth();
  const currentThemeObj = themes.find((t) => t.id === theme) || themes[0];

  return (
    <header className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-ink-base border-b border-ink-surface shrink-0 z-30 safe-pt select-none">
      {/* Brand logo */}
      <div className="flex items-center gap-2" onClick={() => onTabChange('home')}>
        <img src="/aria-logo.svg" alt="ARIA" className="h-7 w-auto object-contain cursor-pointer" />
      </div>

      {/* Right controls: OKF Space + Theme Toggle + Auth/Spotlight */}
      <div className="flex items-center gap-1.5">
        {/* OKF Space Quick Pill */}
        <button
          onClick={() => onTabChange('okf')}
          className={`px-2.5 py-1 text-[11px] font-mono border flex items-center gap-1 transition-all touch-spring ${
            activeTab === 'okf'
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
              : 'bg-ink-surface/70 border-ink-surface text-ink-muted hover:text-white'
          }`}
          title="OKF Space Ontology"
        >
          <BookOpen size={12} className={activeTab === 'okf' ? 'text-cyan-400' : ''} />
          <span>OKF</span>
        </button>

        {/* Theme Cycle Button */}
        <button
          onClick={cycleNextTheme}
          className="p-1.5 bg-ink-surface/70 border border-ink-surface hover:border-cyan-500/40 text-ink-muted hover:text-white transition-colors touch-spring"
          title={`Cycle theme (Current: ${currentThemeObj.name})`}
          aria-label="Cycle theme"
        >
          <span
            className="block w-3 h-3 rounded-full border border-white/40"
            style={{ backgroundColor: currentThemeObj.accentHex }}
          />
        </button>

        {/* Command Palette */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="p-1.5 bg-ink-surface/70 border border-ink-surface text-ink-muted hover:text-white touch-spring"
            title="Spotlight Search (Ctrl+K)"
            aria-label="Search"
          >
            <Command size={14} />
          </button>
        )}

        {/* Auth Avatar / Sign In */}
        {user ? (
          <button
            onClick={() => onTabChange('settings')}
            className="p-0.5 border border-cyan-500/40 rounded-full touch-spring"
            title={`Signed in as @${user.username}`}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-5 h-5 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px]">
                <User size={11} />
              </div>
            )}
          </button>
        ) : (
          <button
            onClick={() => openAuthModal()}
            className="px-2 py-1 bg-cyan-500/15 border border-cyan-400/40 text-[10px] font-mono font-semibold text-cyan-300 touch-spring"
            title="Sign In"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileNavBarProps) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'query', label: 'Ask', icon: PlusCircle },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'collections', label: 'Collections', icon: FolderGit2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-ink-base/95 border-t border-ink-surface z-40 safe-pb select-none">
      <div className="grid grid-cols-5 h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`relative flex flex-col items-center justify-center py-1 transition-all touch-spring ${
                isActive ? 'text-white font-semibold' : 'text-ink-muted hover:text-gray-300'
              }`}
              style={{ minHeight: '56px' }}
            >
              {/* Active Neon Top Bar Indicator */}
              {isActive && (
                <span className="absolute top-0 inset-x-3 h-[2px] bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              )}
              <Icon
                size={19}
                className={`transition-transform duration-200 ${
                  isActive ? 'text-cyan-400 scale-110' : ''
                }`}
              />
              <span className={`text-[10px] font-mono mt-1 ${isActive ? 'text-cyan-300 font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
