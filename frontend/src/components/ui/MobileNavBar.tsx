import React from 'react';
import { Home, PlusCircle, Clock, FolderGit2, Settings, Command, Menu } from 'lucide-react';

interface MobileNavBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
  onOpenDrawer?: () => void;
}

export function MobileTopBar({ activeTab, onTabChange, onOpenCommandPalette, onOpenDrawer }: MobileNavBarProps) {
  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0C0C0F] border-b border-white/[0.07] shrink-0 z-30 safe-pt select-none">
      {onOpenDrawer && (
        <button
          onClick={onOpenDrawer}
          className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#18181E] active:scale-[0.98] transition-all"
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>
      )}

      <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange('home')}>
        <span className="font-mono text-[14px] font-semibold text-[#EDEDED] tracking-[-0.02em]">
          ARIA
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onTabChange('okf')}
          className={`px-2.5 py-1 text-[11px] font-mono rounded-[4px] border transition-all active:scale-[0.98] ${
            activeTab === 'okf'
              ? 'bg-[#18181E] border-white/[0.14] text-[#EDEDED] font-semibold'
              : 'bg-[#111115] border-white/[0.07] text-[#8B8B8E] hover:text-[#EDEDED]'
          }`}
          title="OKF Space"
        >
          OKF
        </button>

        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="p-1.5 bg-[#111115] border border-white/[0.07] rounded-[6px] text-[#8B8B8E] hover:text-[#EDEDED] active:scale-[0.98]"
            aria-label="Search"
          >
            <Command size={14} />
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
    { id: 'collections', label: 'Saved', icon: FolderGit2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#0C0C0F] border-t border-white/[0.07] z-40 safe-pb select-none">
      <div className="grid grid-cols-5 h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center py-1 transition-all active:scale-[0.98] ${
                isActive ? 'text-[#60A5FA]' : 'text-[#8B8B8E] hover:text-[#EDEDED]'
              }`}
            >
              <Icon size={17} />
              <span className={`text-[11px] font-mono mt-1 ${isActive ? 'font-medium text-[#EDEDED]' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
