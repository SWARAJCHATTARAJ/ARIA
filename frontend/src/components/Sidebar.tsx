import React from 'react';
import {
  Home,
  PlusCircle,
  FolderGit2,
  BookOpen,
  Clock,
  Settings,
  Menu,
  Github,
  LogOut,
  Command,
  User,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AriaCoreIndicator from './AriaCoreIndicator';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
  /** Desktop rail collapse state (md+). The mobile drawer is always expanded. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'query', label: 'New Question', icon: PlusCircle },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'collections', label: 'Collections', icon: FolderGit2 },
  { id: 'okf', label: 'OKF Space', icon: BookOpen },
] as const;

export default function Sidebar({
  activeTab,
  onTabChange,
  onOpenCommandPalette,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const { user, signOut, openAuthModal } = useAuth();
  const { theme, cycleNextTheme, themes } = useTheme();

  const currentThemeObj = themes.find((t) => t.id === theme) || themes[0];
  const isRail = collapsed; // icon rail mode

  return (
    <nav
      className={`h-full bg-[#0A0B0E] border-r border-white/[0.08] p-3 py-4 flex flex-col justify-between select-none relative transition-all duration-200 ease-out overflow-hidden will-change-transform ${
        isRail ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Top Section */}
      <div className="space-y-4">
        {/* Header: hamburger + wordmark + command palette trigger */}
        <div
          className={`flex items-center pt-1 ${isRail ? 'flex-col gap-2 px-0' : 'justify-between px-1'}`}
        >
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              className="press tip h-9 w-9 shrink-0 flex items-center justify-center text-ink-muted hover:text-white hover:bg-ink-hover/60 border border-transparent hover:border-white/[0.18] transition-colors"
              data-tip={isRail ? 'Expand rail' : 'Collapse rail'}
              aria-label={isRail ? 'Expand navigation rail' : 'Collapse navigation rail'}
            >
              {isRail ? <Menu size={17} /> : <PanelLeftOpen size={17} />}
            </button>
          )}

          {!isRail && (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <AriaCoreIndicator state="IDLE" size={20} className="text-cyan-300 shrink-0" />
                <img src="/aria-logo.svg" alt="ARIA" className="h-6 w-auto max-w-[100px] object-contain" />
              </div>
              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  className="press tip px-2 py-1 bg-[#101217] hover:bg-[#161922] border border-white/[0.07] hover:border-white/[0.18] text-[10px] font-mono text-ink-muted hover:text-white flex items-center gap-1 transition-colors"
                  data-tip="Command palette (Ctrl+K)"
                >
                  <Command size={10} />
                  <span>⌘K</span>
                </button>
              )}
            </>
          )}
        </div>

        {isRail && onOpenCommandPalette && (
          <div className="flex justify-center">
            <button
              onClick={onOpenCommandPalette}
              className="press tip w-9 h-9 flex items-center justify-center bg-[#101217] hover:bg-[#161922] border border-white/[0.07] hover:border-white/[0.18] text-ink-muted hover:text-white transition-colors"
              data-tip="Command palette (Ctrl+K)"
              aria-label="Command palette"
            >
              <Command size={14} />
            </button>
          </div>
        )}

        {/* Primary 6 Navigation Links */}
        <div className="space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <NavItem
              key={id}
              icon={<Icon size={17} />}
              label={label}
              active={activeTab === id}
              collapsed={isRail}
              onClick={() => onTabChange(id)}
            />
          ))}
          {!isRail && <div className="my-2 border-t border-white/[0.07]" />}
          <NavItem
            icon={<Settings size={17} />}
            label="Settings"
            active={activeTab === 'settings'}
            collapsed={isRail}
            onClick={() => onTabChange('settings')}
          />
        </div>
      </div>

      {/* Bottom Section: Telemetry, Theme & Auth Profile */}
      <div className={`space-y-3 border-t border-white/[0.07] ${isRail ? 'pt-3' : 'pt-4'}`}>
        {!isRail && (
          <>
            {/* System Telemetry Strip (persistent footer) */}
            <div className="aria-telemetry w-full justify-center" aria-label="System telemetry">
              <span className="text-[9px] text-gray-400">SYS // ARIA-2.0</span>
              <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                ONLINE
              </span>
            </div>
          </>
        )}

        {/* Quick Theme Cycle Button */}
        <button
          onClick={cycleNextTheme}
          className={`press tip w-full flex items-center bg-[#101217] hover:bg-[#161922] border border-white/[0.07] hover:border-white/[0.18] text-ink-muted hover:text-white transition-colors ${
            isRail ? 'h-9 justify-center' : 'justify-between px-3 py-2'
          }`}
          data-tip={`Theme: ${currentThemeObj.name}`}
          title="Click to cycle theme preset"
        >
          <span className={`flex items-center gap-2 ${isRail ? '' : 'min-w-0'}`}>
            <span
              className="w-2.5 h-2.5 rounded-full border border-white/40 shrink-0"
              style={{ backgroundColor: currentThemeObj.accentHex }}
            />
            {!isRail && <span className="text-[11px] truncate">{currentThemeObj.name}</span>}
          </span>
          {!isRail && <span className="text-[9px] uppercase tracking-wider text-cyan-400">CYCLE</span>}
        </button>

        {/* User Auth Profile */}
        {user ? (
          <div
            className={`bg-[#101217] border border-white/[0.07] ${
              isRail ? 'p-1 flex justify-center' : 'p-2.5 flex items-center justify-between'
            }`}
          >
            {isRail ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-7 h-7 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <>
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
                  className="press tip text-ink-muted hover:text-rose-400 transition-colors p-2 shrink-0"
                  data-tip="Sign out"
                  aria-label="Sign Out"
                >
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={() => openAuthModal()}
            className={`press w-full bg-cyan-500/15 hover:bg-cyan-500/25 border border-white/[0.07] hover:border-white/[0.18] text-cyan-300 hover:text-white text-xs font-mono font-semibold flex items-center justify-center gap-2 transition-all ${
              isRail ? 'h-9' : 'py-2.5 px-3'
            }`}
            title="Sign In / OAuth"
          >
            <Github size={14} />
            {!isRail && <span>Sign In / OAuth</span>}
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
  collapsed?: boolean;
  onClick: () => void;
}

function NavItem({ icon, label, active = false, collapsed = false, onClick }: NavItemProps) {
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`tip press mx-auto flex h-10 w-10 items-center justify-center transition-colors ${
          active
            ? 'bg-[#161922] text-white border border-white/[0.18]'
            : 'text-ink-muted hover:bg-[#161922]/60 hover:text-gray-200 border border-transparent'
        }`}
        data-tip={label}
        aria-label={label}
      >
        <span className={active ? 'text-cyan-400' : ''}>{icon}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`press w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs font-mono transition-colors text-left ${
        active
          ? 'bg-[#161922] text-white border-l-2 border-cyan-400 pl-[10px] cursor-pointer font-bold'
          : 'text-ink-muted hover:bg-[#161922]/60 hover:text-gray-200 cursor-pointer border-l-2 border-transparent pl-[10px]'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-cyan-400' : ''}`}>{icon}</span>
      <span className="truncate flex-1 min-w-0">{label}</span>
    </button>
  );
}
