import React, { useState, useRef, useEffect } from 'react';
import { Home, PlusCircle, FolderGit2, BookOpen, Clock, Settings } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [notifyingItem, setNotifyingItem] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUnwiredClick = (label: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setNotifyingItem(label);
    timerRef.current = setTimeout(() => {
      setNotifyingItem(null);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <nav className="w-64 h-full bg-ink-base border-r border-ink-surface p-4 flex flex-col select-none relative">
      {/* Readable Logo Wordmark */}
      <div className="flex items-center mb-8 px-2 mt-2">
        <img src="/aria-logo.svg" alt="ARIA" className="h-9 w-auto max-w-[150px] object-contain" />
      </div>
      
      {/* Navigation Links: Home and New question are fully active; unwired items show 'Soon' and 'This is coming soon' message */}
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
          soon
          disabled
          onClick={() => handleUnwiredClick('History')} 
          isNotifying={notifyingItem === 'History'}
        />
        <NavItem 
          icon={<FolderGit2 size={18} />} 
          label="Collections" 
          soon
          disabled
          onClick={() => handleUnwiredClick('Collections')} 
          isNotifying={notifyingItem === 'Collections'}
        />
        <NavItem 
          icon={<BookOpen size={18} />} 
          label="OKF Space" 
          soon
          disabled
          onClick={() => handleUnwiredClick('OKF Space')} 
          isNotifying={notifyingItem === 'OKF Space'}
        />
      </div>

      <div className="mt-auto pt-4 border-t border-ink-surface">
        <NavItem 
          icon={<Settings size={18} />} 
          label="Settings" 
          soon
          disabled
          onClick={() => handleUnwiredClick('Settings')} 
          isNotifying={notifyingItem === 'Settings'}
        />
      </div>
    </nav>
  );
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  soon?: boolean;
  disabled?: boolean;
  onClick: () => void;
  isNotifying?: boolean;
}

function NavItem({ 
  icon, 
  label, 
  active = false, 
  soon = false, 
  disabled = false, 
  onClick,
  isNotifying = false,
}: NavItemProps) {
  return (
    <div className="relative">
      <button 
        type="button"
        onClick={onClick} 
        title={disabled ? 'This is coming soon' : undefined}
        aria-disabled={disabled}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-none text-xs font-mono transition-colors text-left ${
          disabled
            ? 'opacity-50 text-ink-muted/80 cursor-not-allowed hover:bg-ink-surface/30 hover:opacity-70'
            : active 
            ? 'bg-ink-surface text-white border-l-2 border-tier-okf pl-[10px] cursor-pointer' 
            : 'text-ink-muted hover:bg-ink-surface/50 hover:text-gray-200 cursor-pointer'
        }`}
      >
        <span className="shrink-0">{icon}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="truncate">{label}</span>
          {soon && (
            <span 
              className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border leading-none transition-colors shrink-0 ${
                isNotifying 
                  ? 'border-tier-live/60 text-tier-live bg-tier-live/10' 
                  : 'border-ink-surface bg-ink-surface/60 text-ink-muted/80'
              }`}
            >
              Soon
            </span>
          )}
        </div>
      </button>

      {/* Brief honest message popover when clicked */}
      {isNotifying && (
        <div 
          role="status"
          aria-live="polite"
          className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-ink-surface border border-ink-surface text-gray-200 text-xs font-mono rounded shadow-2xl whitespace-nowrap flex items-center gap-2 pointer-events-none"
        >
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-ink-surface" />
          <span className="w-1.5 h-1.5 rounded-full bg-tier-live animate-pulse" />
          <span>This is coming soon</span>
        </div>
      )}
    </div>
  );
}
