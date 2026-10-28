import React from 'react';
import { Home, PlusCircle, FolderGit2, BookOpen, Clock, Settings } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const isDev = Boolean(import.meta.env.DEV);

  return (
    <nav className="w-64 h-full bg-ink-base border-r border-ink-surface p-4 flex flex-col select-none">
      {/* Readable Logo Wordmark */}
      <div className="flex items-center mb-8 px-2 mt-2">
        <img src="/aria-logo.svg" alt="ARIA" className="h-9 w-auto max-w-[150px] object-contain" />
      </div>
      
      {/* Navigation Links: Home and New question in production; dev-only items behind import.meta.env.DEV */}
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
        
        {isDev && (
          <>
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
          </>
        )}
      </div>

      {isDev && (
        <div className="mt-auto pt-4 border-t border-ink-surface">
          <NavItem 
            icon={<Settings size={18} />} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => onTabChange('settings')} 
          />
        </div>
      )}
    </nav>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs font-mono transition-colors ${
        active 
          ? 'bg-ink-surface text-white border-l-2 border-tier-okf pl-[10px]' 
          : 'text-ink-muted hover:bg-ink-surface/50 hover:text-gray-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
