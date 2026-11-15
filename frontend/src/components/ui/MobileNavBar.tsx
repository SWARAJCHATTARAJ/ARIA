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
    <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#141416] border-b border-[#262629] shrink-0 z-30 safe-pt select-none">
      {onOpenDrawer && (
        <button
          onClick={onOpenDrawer}
          className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-[#1B1B1E] transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>
      )}

      <div className="flex items-center gap-2 cursor-pointer" onClick={() => onTabChange('home')}>
        <span className="font-mono text-[14px] font-semibold text-[#EDEDED] tracking-wider">
          ARIA
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onTabChange('okf')}
          className={`px-2.5 py-1 text-[12px] font-mono rounded-[6px] border transition-colors ${
            activeTab === 'okf'
              ? 'bg-[#1B1B1E] border-[#262629] text-[#EDEDED] font-semibold'
              : 'bg-[#0A0A0B] border-[#262629] text-[#8B8B8E] hover:text-[#EDEDED]'
          }`}
          title="OKF Space"
        >
          OKF
        </button>

        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="p-1.5 bg-[#0A0A0B] border border-[#262629] rounded-[6px] text-[#8B8B8E] hover:text-[#EDEDED]"
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
    { id: 'collections', label: 'Collections', icon: FolderGit2 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#141416] border-t border-[#262629] z-40 safe-pb select-none">
      <div className="grid grid-cols-5 h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center py-1 transition-colors ${
                isActive ? 'text-[#5E8BFF]' : 'text-[#8B8B8E] hover:text-[#EDEDED]'
              }`}
            >
              <Icon size={18} />
              <span className={`text-[12px] font-mono mt-1 ${isActive ? 'font-semibold text-[#EDEDED]' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
