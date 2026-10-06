import React from 'react';
import { Search, FolderGit2, BookOpen, Clock, Settings } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  return (
    <nav className="w-64 h-full bg-ink-base border-r border-ink-surface p-4 flex flex-col">
      <div className="flex items-center mb-8 px-2 mt-2">
        <img src="/aria-logo.svg" alt="ARIA Logo" className="h-6" />
      </div>
      
      <div className="flex-1 space-y-1">
        <NavItem icon={<Search size={18} />} label="Home" active={activeTab === 'home'} onClick={() => onTabChange('home')} />
        <NavItem icon={<Search size={18} />} label="New Query" active={activeTab === 'query'} onClick={() => onTabChange('query')} />
        <NavItem icon={<Clock size={18} />} label="History" active={activeTab === 'history'} onClick={() => onTabChange('history')} />
        <NavItem icon={<FolderGit2 size={18} />} label="Collections" active={activeTab === 'collections'} onClick={() => onTabChange('collections')} />
        <NavItem icon={<BookOpen size={18} />} label="OKF Space" active={activeTab === 'okf'} onClick={() => onTabChange('okf')} />
      </div>

      <div className="mt-auto pt-4 border-t border-ink-surface">
        <NavItem icon={<Settings size={18} />} label="Settings" active={activeTab === 'settings'} onClick={() => onTabChange('settings')} />
      </div>
    </nav>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? 'bg-ink-surface text-white' : 'text-ink-muted hover:bg-ink-surface/50 hover:text-gray-300'}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
