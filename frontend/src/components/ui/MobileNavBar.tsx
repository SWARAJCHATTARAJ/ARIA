import React from 'react';
import { Menu, Plus, PanelRightOpen } from 'lucide-react';

interface MobileTopBarProps {
  activeTab: string;
  hasQuery?: boolean;
  isInspectorOpen?: boolean;
  onTabChange: (tab: string) => void;
  onOpenDrawer: () => void;
  onNewQuestion?: () => void;
  onToggleInspector?: () => void;
}

export function MobileTopBar({
  activeTab: _activeTab,
  hasQuery: _hasQuery = false,
  isInspectorOpen = false,
  onTabChange,
  onOpenDrawer,
  onNewQuestion,
  onToggleInspector,
}: MobileTopBarProps) {
  const handleNewQuestion = () => {
    if (onNewQuestion) {
      onNewQuestion();
    } else {
      onTabChange('query');
    }
  };

  return (
    <header className="md:hidden flex items-center justify-between px-3 h-11 bg-[#09090B] border-b border-white/[0.06] shrink-0 z-30 pt-[env(safe-area-inset-top,0px)] select-none">
      {/* Left: Clean ≡ menu icon button */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-white/[0.04] active:scale-[0.98] transition-all cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu size={18} strokeWidth={1.8} />
        </button>
      </div>

      {/* Center: Subtle, refined ARIA wordmark (crisp sans-serif) */}
      <div
        className="flex items-center cursor-pointer select-none"
        onClick={handleNewQuestion}
        title="ARIA"
      >
        <span className="font-sans text-[13px] font-medium text-[#EDEDED] tracking-[0.14em]">
          ARIA
        </span>
      </div>

      {/* Right: Research Inspector toggle and + (New Question) permanently visible */}
      <div className="flex items-center gap-1">
        {onToggleInspector && (
          <button
            type="button"
            onClick={onToggleInspector}
            className={`p-1.5 rounded-[6px] transition-all active:scale-[0.98] cursor-pointer ${
              isInspectorOpen
                ? 'text-[#60A5FA] bg-white/[0.08]'
                : 'text-[#8B8B8E] hover:text-[#EDEDED] hover:bg-white/[0.04]'
            }`}
            title="Toggle Research Inspector"
            aria-label="Toggle Research Inspector"
          >
            <PanelRightOpen size={17} strokeWidth={1.8} />
          </button>
        )}

        <button
          type="button"
          onClick={handleNewQuestion}
          className="p-1.5 text-[#8B8B8E] hover:text-[#EDEDED] rounded-[6px] hover:bg-white/[0.04] active:scale-[0.98] transition-all cursor-pointer"
          title="New Question"
          aria-label="New Question"
        >
          <Plus size={18} strokeWidth={1.8} />
        </button>
      </div>
    </header>
  );
}
