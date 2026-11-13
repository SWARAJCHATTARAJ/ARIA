import React from 'react';
import { Home, PlusCircle, Clock, FolderGit2, Settings, BookOpen, Command, User, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AriaCoreIndicator from '../AriaCoreIndicator';

interface MobileNavBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCommandPalette?: () => void;
  /** opens the < 768px slide-over navigation drawer */
  onOpenDrawer?: () => void;
}

export function MobileTopBar({ activeTab, onTabChange, onOpenCommandPalette, onOpenDrawer }: MobileNavBarProps) {
  const { user, openAuthModal } = useAuth();

  return (
    <header className="md:hidden flex items-center justify-between px-3.5 py-2.5 bg-[#09090B] border-b border-white/[0.07] shrink-0 z-30 safe-pt select-none">
      {/* Hamburger: opens slide-over drawer */}
      {onOpenDrawer && (
        <button
          onClick={onOpenDrawer}
          className="press tip p-2 text-[#A1A1AA] hover:text-[#F4F4F6] hover:bg-[#16161C] border border-transparent hover:border-white/[0.16] transition-colors"
          data-tip="Menu"
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Brand: ARIA Core emblem + wordmark */}
      <div className="flex items-center gap-2" onClick={() => onTabChange('home')}>
        <AriaCoreIndicator state="IDLE" size={20} className="text-tier-okf" />
        <img src="/aria-logo.svg" alt="ARIA" className="h-6 w-auto object-contain cursor-pointer" />
      </div>

      {/* Right controls: OKF Space + Command Palette + Auth avatar */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onTabChange('okf')}
          className={`press px-2.5 py-1 text-[11px] font-mono border flex items-center gap-1 transition-all ${
            activeTab === 'okf'
              ? 'bg-[#16161C] border-white/[0.16] text-[#F4F4F6] font-bold'
              : 'bg-[#111115] border-white/[0.07] text-[#A1A1AA] hover:text-[#F4F4F6]'
          }`}
          title="OKF Space Ontology"
        >
          <BookOpen size={12} className={activeTab === 'okf' ? 'text-tier-okf' : ''} />
          <span>OKF</span>
        </button>

        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="press p-1.5 bg-[#111115] border border-white/[0.07] hover:border-white/[0.16] text-[#A1A1AA] hover:text-[#F4F4F6]"
            title="Spotlight Search (Ctrl+K)"
            aria-label="Search"
          >
            <Command size={14} />
          </button>
        )}

        {/* Auth Avatar / Sign In */}
        {user ? (
          <button
            onClick={() => onTabChange('settings')}
            className="press p-0.5 border border-white/[0.07] hover:border-white/[0.16] rounded-full"
            title={`Signed in as ${user.provider === 'guest' ? 'Guest' : `@${user.username}`}`}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-5 h-5 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[#16161C] text-[#A1A1AA] flex items-center justify-center text-[10px]">
                <User size={11} />
              </div>
            )}
          </button>
        ) : (
          <button
            onClick={() => openAuthModal()}
            className="press min-h-[32px] px-2 py-1 bg-[#F4F4F6] text-[#09090B] hover:bg-white text-[10px] font-mono font-semibold"
            title="Sign in"
          >
            Sign in
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
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#09090B]/95 border-t border-white/[0.07] z-40 safe-pb select-none">
      <div className="grid grid-cols-5 h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`press relative flex flex-col items-center justify-center py-1 transition-all touch-spring ${
                isActive ? 'text-[#F4F4F6] font-semibold' : 'text-[#A1A1AA]'
              }`}
              style={{ minHeight: '56px' }}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-3 h-[2px] bg-[#F4F4F6]" />
              )}
              <Icon
                size={19}
                className={`transition-transform duration-200 ${
                  isActive ? 'text-tier-okf scale-110' : ''
                }`}
              />
              <span className={`text-[10px] font-mono mt-1 ${isActive ? 'text-[#F4F4F6] font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
