import React from 'react';
import {
  Home,
  PlusCircle,
  FolderGit2,
  BookOpen,
  Clock,
  Settings,
  Menu,
  LogIn,
  LogOut,
  Command,
  User,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
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
  const isRail = collapsed; // icon rail mode

  return (
    <nav
      className={`h-full bg-[#0C0C0F] border-r border-white/[0.08] p-3 py-4 flex flex-col justify-between select-none relative transition-all duration-200 ease-out overflow-hidden will-change-transform ${
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
              className="press tip h-9 w-9 shrink-0 flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F6] hover:bg-[#16161C] border border-transparent hover:border-white/[0.16] transition-colors"
              data-tip={isRail ? 'Expand rail' : 'Collapse rail'}
              aria-label={isRail ? 'Expand navigation rail' : 'Collapse navigation rail'}
            >
              {isRail ? <Menu size={17} /> : <PanelLeftOpen size={17} />}
            </button>
          )}

          {!isRail && (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <AriaCoreIndicator state="IDLE" size={20} className="text-tier-okf shrink-0" />
                <img src="/aria-logo.svg" alt="ARIA" className="h-6 w-auto max-w-[100px] object-contain" />
              </div>
              {onOpenCommandPalette && (
                <button
                  onClick={onOpenCommandPalette}
                  className="press tip px-2 py-1 bg-[#111115] hover:bg-[#16161C] border border-white/[0.07] hover:border-white/[0.16] text-[10px] font-mono text-[#A1A1AA] hover:text-[#F4F4F6] flex items-center gap-1 transition-colors"
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
              className="press tip w-9 h-9 flex items-center justify-center bg-[#111115] hover:bg-[#16161C] border border-white/[0.07] hover:border-white/[0.16] text-[#A1A1AA] hover:text-[#F4F4F6] transition-colors"
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

      {/* Bottom Section: Telemetry & Auth Profile */}
      <div className={`space-y-3 border-t border-white/[0.07] ${isRail ? 'pt-3' : 'pt-4'}`}>
        {!isRail && (
          <div className="aria-telemetry w-full justify-center" aria-label="System telemetry">
            <span className="text-[9px] text-[#A1A1AA]">SYS // ARIA-2.0</span>
            <span className="flex items-center gap-1 text-[9px] text-[#10B981]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#10B981]" />
              </span>
              ONLINE
            </span>
          </div>
        )}

        {/* Auth Profile / Sign-in entry */}
        {user ? (
          <div
            className={`bg-[#111115] border border-white/[0.07] ${
              isRail ? 'p-1 flex justify-center' : 'p-2.5 flex items-center justify-between'
            }`}
          >
            {isRail ? (
              user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-7 h-7 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#16161C] text-[#A1A1AA] flex items-center justify-center text-[11px] font-semibold">
                  {(user.name || user.username || '?').charAt(0).toUpperCase()}
                </div>
              )
            ) : (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="w-7 h-7 rounded-full border border-white/[0.16] object-cover shrink-0"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-[#16161C] text-[#A1A1AA] flex items-center justify-center shrink-0">
                      <User size={14} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-sans font-semibold text-[#F4F4F6] truncate">
                      {user.provider === 'guest'
                        ? 'Guest Researcher'
                        : user.name || user.username}
                    </div>
                    <div className="text-[10px] font-mono text-[#52525B] truncate">
                      {user.provider === 'guest'
                        ? 'Anonymous Session'
                        : user.email || `@${user.username}`}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => signOut()}
                  className="press tip text-[#A1A1AA] hover:text-[#F4F4F6] transition-colors p-2 shrink-0"
                  data-tip="Sign out"
                  aria-label="Sign Out"
                >
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className={`bg-[#111115] border border-white/[0.07] ${isRail ? 'p-1' : 'p-2.5'}`}>
            {isRail ? (
              <button
                onClick={() => openAuthModal()}
                className="press tip w-9 h-9 flex items-center justify-center text-[#A1A1AA] hover:text-[#F4F4F6] hover:bg-[#16161C] transition-colors"
                data-tip="Sign in"
                aria-label="Sign in"
              >
                <LogIn size={15} />
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-7 h-7 rounded-full bg-[#16161C] text-[#52525B] flex items-center justify-center shrink-0">
                    <User size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-sans font-semibold text-[#F4F4F6] truncate">
                      Public Workspace
                    </div>
                    <div className="text-[10px] font-mono text-[#52525B] truncate">
                      Anonymous Session
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => openAuthModal()}
                  className="press ui-btn w-full py-2 bg-[#F4F4F6] hover:bg-white text-[#09090B] text-xs font-medium flex items-center justify-center gap-2"
                >
                  <LogIn size={13} />
                  <span>Sign in</span>
                </button>
              </>
            )}
          </div>
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
            ? 'bg-[#16161C] text-[#F4F4F6] border border-white/[0.16]'
            : 'text-[#A1A1AA] hover:bg-[#16161C]/60 hover:text-[#F4F4F6] border border-transparent'
        }`}
        data-tip={label}
        aria-label={label}
      >
        <span className={active ? 'text-tier-okf' : ''}>{icon}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`press w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs font-mono transition-colors text-left ${
        active
          ? 'bg-[#16161C] text-[#F4F4F6] border-l-2 border-tier-okf pl-[10px] cursor-pointer font-bold'
          : 'text-[#A1A1AA] hover:bg-[#16161C]/60 hover:text-[#F4F4F6] cursor-pointer border-l-2 border-transparent pl-[10px]'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-tier-okf' : ''}`}>{icon}</span>
      <span className="truncate flex-1 min-w-0">{label}</span>
    </button>
  );
}
