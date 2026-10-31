import React from 'react';
import {
  Home,
  PlusCircle,
  FolderGit2,
  BookOpen,
  Clock,
  Settings,
  Github,
  LogOut,
  Palette,
  Command,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onOpenCommandPalette }: SidebarProps) {
  const { user, signOut, openAuthModal } = useAuth();
  const { theme, cycleNextTheme, themes } = useTheme();

  const currentThemeObj = themes.find((t) => t.id === theme) || themes[0];

  return (
    <nav className="w-64 h-full bg-ink-base border-r border-ink-surface p-4 flex flex-col justify-between select-none relative">
      {/* Top Section */}
      <div className="space-y-6">
        {/* Logo Wordmark & Command Palette Trigger */}
        <div className="flex items-center justify-between px-2 pt-2">
          <img src="/aria-logo.svg" alt="ARIA" className="h-8 w-auto max-w-[130px] object-contain" />
          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="px-2 py-1 bg-ink-surface/80 hover:bg-ink-surface border border-ink-surface text-[10px] font-mono text-ink-muted hover:text-white flex items-center gap-1 transition-colors touch-spring"
              title="Command Palette (Ctrl+K / Cmd+K)"
            >
              <Command size={10} />
              <span>⌘K</span>
            </button>
          )}
        </div>

        {/* Primary 6 Navigation Links */}
        <div className="space-y-1">
          <NavItem
            icon={<Home size={17} />}
            label="Home"
            active={activeTab === 'home'}
            onClick={() => onTabChange('home')}
          />
          <NavItem
            icon={<PlusCircle size={17} />}
            label="New Question"
            active={activeTab === 'query'}
            onClick={() => onTabChange('query')}
          />
          <NavItem
            icon={<Clock size={17} />}
            label="History"
            active={activeTab === 'history'}
            onClick={() => onTabChange('history')}
          />
          <NavItem
            icon={<FolderGit2 size={17} />}
            label="Collections"
            active={activeTab === 'collections'}
            onClick={() => onTabChange('collections')}
          />
          <NavItem
            icon={<BookOpen size={17} />}
            label="OKF Space"
            active={activeTab === 'okf'}
            onClick={() => onTabChange('okf')}
          />
          <div className="my-2 border-t border-ink-surface/70" />
          <NavItem
            icon={<Settings size={17} />}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => onTabChange('settings')}
          />
        </div>
      </div>

      {/* Bottom Section: Theme & Auth Profile */}
      <div className="space-y-3 pt-4 border-t border-ink-surface/80">
        {/* Quick Theme Cycle Button */}
        <button
          onClick={cycleNextTheme}
          className="w-full flex items-center justify-between px-3 py-2 bg-ink-surface/50 hover:bg-ink-surface border border-ink-surface text-xs font-mono text-ink-muted hover:text-white transition-colors touch-spring"
          title="Click to cycle theme preset"
        >
          <span className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/40"
              style={{ backgroundColor: currentThemeObj.accentHex }}
            />
            <span className="text-[11px] truncate">{currentThemeObj.name}</span>
          </span>
          <span className="text-[9px] uppercase tracking-wider text-cyan-400">CYCLE</span>
        </button>

        {/* User Auth Profile */}
        {user ? (
          <div className="p-2.5 bg-ink-surface/80 border border-ink-surface flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-7 h-7 rounded-full border border-cyan-500/40 object-cover shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                  <User size={14} />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-sans font-semibold text-white truncate">
                  {user.name || user.username}
                </div>
                <div className="text-[10px] font-mono text-ink-muted truncate">
                  @{user.username}
                </div>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              className="text-ink-muted hover:text-rose-400 transition-colors p-1.5 touch-spring shrink-0"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => openAuthModal()}
            className="w-full py-2.5 px-3 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 hover:text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all touch-spring shadow-[0_0_12px_rgba(6,182,212,0.15)]"
          >
            <Github size={14} />
            <span>Sign In / OAuth</span>
          </button>
        )}
      </div>
    </nav>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active = false, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs font-mono transition-colors text-left touch-spring ${
        active
          ? 'bg-ink-surface text-white border-l-2 border-cyan-400 pl-[10px] cursor-pointer font-bold'
          : 'text-ink-muted hover:bg-ink-surface/50 hover:text-gray-200 cursor-pointer'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-cyan-400' : ''}`}>{icon}</span>
      <span className="truncate flex-1 min-w-0">{label}</span>
    </button>
  );
}
