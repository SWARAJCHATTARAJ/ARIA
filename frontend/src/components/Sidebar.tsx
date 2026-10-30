import React from 'react';
import { Home, PlusCircle, FolderGit2, BookOpen, Clock, Settings } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <nav className="w-64 h-full bg-ink-base border-r border-ink-surface p-4 flex flex-col select-none relative">
      {/* Readable Logo Wordmark */}
      <div className="flex items-center mb-8 px-2 mt-2">
        <img src="/aria-logo.svg" alt="ARIA" className="h-9 w-auto max-w-[150px] object-contain" />
      </div>

      {/* Navigation Links: all destinations fully active */}
      <div className="flex-1 space-y-1">
        <NavItem
          icon={<Home size={18} />}
          label="Home"
          active={activeTab === 'home'}
          onClick={() => onTabChange('home')}
        />
        <NavItem
          icon={<PlusCircle size={18} />}
          label="New question"
          active={activeTab === 'query'}
          onClick={() => onTabChange('query')}
        />
        <NavItem
          icon={<Clock size={18} />}
          label="History"
          active={activeTab === 'history'}
          onClick={() => onTabChange('history')}
        />
        <NavItem
          icon={<FolderGit2 size={18} />}
          label="Collections"
          active={activeTab === 'collections'}
          onClick={() => onTabChange('collections')}
        />
        <NavItem
          icon={<BookOpen size={18} />}
          label="OKF Space"
          active={activeTab === 'okf'}
          onClick={() => onTabChange('okf')}
        />
        <div className="my-2 border-t border-ink-surface/70" />
        <NavItem
          icon={<Settings size={18} />}
          label="Settings"
          active={activeTab === 'settings'}
          onClick={() => onTabChange('settings')}
        />
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
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs font-mono transition-colors text-left ${
        active
          ? 'bg-ink-surface text-white border-l-2 border-tier-okf pl-[10px] cursor-pointer'
          : 'text-ink-muted hover:bg-ink-surface/50 hover:text-gray-200 cursor-pointer'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate flex-1 min-w-0">{label}</span>
    </button>
  );
}
