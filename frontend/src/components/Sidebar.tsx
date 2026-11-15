import React from 'react';
import {
  Home,
  PlusCircle,
  FolderGit2,
  BookOpen,
  Clock,
  Settings,
  Menu,
  Command,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
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
  const isRail = collapsed;
  const { user, signOut } = useAuth();

  return (
    <nav
      className={`h-full bg-[#141416] border-r border-[#262629] p-4 flex flex-col justify-between select-none transition-all duration-200 overflow-hidden ${
        isRail ? 'w-16' : 'w-64'
      }`}
    >
      {/* Top Header & Navigation Links */}
      <div className="space-y-4">
        {/* Top Header */}
        <div className={`flex items-center ${isRail ? 'justify-center' : 'justify-between'}`}>
          {!isRail ? (
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[#EDEDED] tracking-wider font-mono">
                ARIA
              </span>
              <span className="text-[12px] text-[#8B8B8E] font-mono">
                v2.0
              </span>
            </div>
          ) : (
            <span className="text-[12px] font-mono font-semibold text-[#5E8BFF]">
              A
            </span>
          )}

          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              className="p-1 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#1B1B1E] transition-colors"
              title={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isRail ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isRail ? <Menu size={16} /> : <PanelLeftOpen size={16} />}
            </button>
          )}
        </div>

        {/* Command Palette Trigger */}
        {onOpenCommandPalette && !isRail && (
          <button
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-3 py-2 bg-[#0A0A0B] border border-[#262629] rounded-[6px] text-[12px] text-[#8B8B8E] hover:text-[#EDEDED] hover:border-[#38383C] transition-colors"
          >
            <span className="flex items-center gap-2">
              <Command size={14} />
              <span>Search</span>
            </span>
            <kbd className="px-1.5 py-0.5 bg-[#141416] border border-[#262629] text-[12px] font-mono rounded-[4px]">
              ⌘K
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
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[14px] transition-colors ${
                  isActive
                    ? 'bg-[#1B1B1E] text-[#EDEDED] font-medium border border-[#262629]'
                    : 'text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-[#1B1B1E] border border-transparent'
                } ${isRail ? 'justify-center px-0' : ''}`}
              >
                <Icon size={16} className={isActive ? 'text-[#5E8BFF]' : ''} />
                {!isRail && <span>{label}</span>}
              </button>
            );
          })}

          <div className="my-2 border-t border-[#262629]" />

          <button
            onClick={() => onTabChange('settings')}
            title={isRail ? 'Settings' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[14px] transition-colors ${
              activeTab === 'settings'
                ? 'bg-[#1B1B1E] text-[#EDEDED] font-medium border border-[#262629]'
                : 'text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-[#1B1B1E] border border-transparent'
            } ${isRail ? 'justify-center px-0' : ''}`}
          >
            <Settings size={16} className={activeTab === 'settings' ? 'text-[#5E8BFF]' : ''} />
            {!isRail && <span>Settings</span>}
          </button>
        </div>
      </div>

      {/* User Session Footer */}
      <div className="pt-4 border-t border-[#262629]">
        {user && (
          <div className={`flex items-center ${isRail ? 'justify-center' : 'justify-between'} gap-2`}>
            {!isRail && (
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[#EDEDED] truncate">
                  {user.name}
                </p>
                <p className="text-[12px] font-mono text-[#8B8B8E] truncate">
                  {user.provider === 'github' ? `@${user.username}` : user.email}
                </p>
              </div>
            )}
            <button
              onClick={() => signOut()}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-[#1B1B1E] rounded-[6px] transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
