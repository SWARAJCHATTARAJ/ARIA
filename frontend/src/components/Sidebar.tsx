import {
  PlusCircle,
  FolderGit2,
  BookOpen,
  Clock,
  Settings,
  Command,
  PanelLeftOpen,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSettingsContext } from '../context/SettingsContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const NAV_ITEMS = [
  { id: 'query', label: 'New Question', icon: PlusCircle },
  { id: 'history', label: 'History', icon: Clock },
  { id: 'collections', label: 'Collections', icon: FolderGit2 },
  { id: 'okf', label: 'OKF Space', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;

export default function Sidebar({
  activeTab,
  onTabChange,
  onOpenCommandPalette,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const isRail = collapsed;
  const { user, signOut } = useAuth();
  const { settings, toggleTheme } = useSettingsContext();

  return (
    <nav
      className={`h-full bg-[#0C0C0F] border-r border-white/[0.07] p-3.5 flex flex-col justify-between select-none sidebar-smooth overflow-hidden ${
        isRail ? 'w-16' : 'w-64'
      }`}
    >
      {/* Top Header & Navigation Links */}
      <div className="space-y-4">
        {/* Top Header */}
        <div className={`flex items-center ${isRail ? 'justify-center' : 'justify-between'}`}>
          {!isRail ? (
            <div
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-85 transition-opacity"
              onClick={() => onTabChange('query')}
              title="New Question (Research Workspace)"
            >
              <span className="text-[14px] font-medium text-[#EDEDED] tracking-[0.14em] font-sans">
                ARIA
              </span>
              <span className="text-[11px] text-[#71717A] font-sans tabular-nums">
                v2.0
              </span>
            </div>
          ) : (
            <span
              className="text-[13px] font-sans font-semibold text-[#60A5FA] cursor-pointer hover:opacity-85 transition-opacity"
              onClick={() => onTabChange('query')}
              title="New Question (Research Workspace)"
            >
              A
            </span>
          )}

          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#18181E] active:scale-[0.98] transition-all"
              title={isRail ? 'Expand sidebar (Ctrl+B / ⌘B)' : 'Collapse sidebar (Ctrl+B / ⌘B)'}
              aria-label={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isRail ? <PanelLeftOpen size={16} /> : <PanelLeftOpen size={16} className="rotate-180" />}
            </button>
          )}
        </div>

        {/* Command Palette Trigger */}
        {onOpenCommandPalette && !isRail && (
          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#09090B] border border-white/[0.07] rounded-[6px] text-[12px] text-[#8B8B8E] hover:text-[#EDEDED] hover:border-white/[0.15] active:scale-[0.98] transition-all cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Command size={13} className="text-[#71717A]" />
              <span>Search</span>
            </span>
            <kbd className="px-1.5 py-0.5 bg-[#111115] border border-white/[0.07] text-[10px] font-mono rounded-[4px] text-[#71717A]">
              ⌘P
            </kbd>
          </button>
        )}

        {/* Navigation Items */}
        <div className="space-y-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                title={isRail ? label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] tracking-[-0.01em] transition-all active:scale-[0.98] cursor-pointer ${
                  isActive
                    ? 'bg-[#18181E] text-[#EDEDED] font-medium border border-white/[0.07]'
                    : 'text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-[#111115] border border-transparent'
                } ${isRail ? 'justify-center px-0' : ''}`}
              >
                <Icon size={16} className={isActive ? 'text-[#60A5FA]' : 'text-[#8B8B8E]'} />
                {!isRail && <span>{label}</span>}
              </button>
            );
          })}

        </div>
      </div>

      {/* User Session & Theme Footer */}
      <div className="pt-3 border-t border-white/[0.07] space-y-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <div className={`flex items-center ${isRail ? 'justify-center' : 'justify-between'} gap-2`}>
          {!isRail && (
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-[12px] font-sans text-[#8B8B8E] hover:text-[#EDEDED] p-1.5 rounded-[6px] hover:bg-[#18181E] active:scale-[0.98] transition-all cursor-pointer"
              title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} theme`}
            >
              {settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              <span>{settings.theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          )}
          {isRail && (
            <button
              onClick={toggleTheme}
              className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-[#18181E] active:scale-[0.98] rounded-[6px] transition-all cursor-pointer"
              title={`Switch to ${settings.theme === 'dark' ? 'Light' : 'Dark'} theme`}
            >
              {settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          )}

          {user && !isRail && (
            <button
              onClick={() => signOut()}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-[#18181E] active:scale-[0.98] rounded-[6px] transition-all"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>

        {user && !isRail && (
          <div className="min-w-0 px-1.5 pt-1">
            <p className="text-[12px] font-medium text-[#EDEDED] truncate font-sans">
              {user.name}
            </p>
            <p className="text-[11px] text-[#71717A] truncate font-sans">
              {user.provider === 'github' ? `@${user.username}` : user.email}
            </p>
          </div>
        )}
      </div>
    </nav>
  );
}
