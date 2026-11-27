import { useState } from 'react';
import { ListTree, X, ChevronUp } from 'lucide-react';

export interface OutlineHeading {
  id: string;
  label: string;
  level: number;
}

interface SectionOutlineRailProps {
  headings: OutlineHeading[];
  onJump: (id: string) => void;
}

export default function SectionOutlineRail({ headings, onJump }: SectionOutlineRailProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!headings || headings.length === 0) return null;

  return (
    <>
      {/* Desktop Sticky Outline Rail */}
      <aside
        className="hidden lg:flex flex-col fixed right-5 top-20 z-20 w-52 max-h-[68vh] p-2.5 rounded-[8px] border border-slate-200 dark:border-white/[0.08] bg-white/90 dark:bg-[#0E1320]/90 manuscript-backdrop-blur shadow-lg animate-fade-slide"
        aria-label="Section Outline"
      >
        <div className="flex items-center gap-1.5 pb-2 mb-1.5 border-b border-slate-200 dark:border-white/[0.07] text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-[#94A3B8]">
          <ListTree size={11} className="text-[var(--aria-accent)]" />
          <span>Outline</span>
          <span className="ml-auto tabular-nums">{headings.length}</span>
        </div>
        <nav className="overflow-y-auto hud-scroll space-y-0.5 pr-0.5">
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onJump(h.id)}
              className={`w-full text-left px-2 py-1 rounded-[5px] text-[11px] leading-snug text-slate-700 dark:text-slate-300 hover:text-[var(--aria-accent)] hover:bg-slate-100/80 dark:hover:bg-white/[0.05] transition-colors truncate cursor-pointer ${
                h.level >= 3 ? 'pl-4 text-[10.5px] opacity-85' : 'font-medium'
              }`}
              title={h.label}
            >
              {h.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile / Android Floating Bottom Outline Pill + Sheet */}
      <div className="lg:hidden fixed right-3 bottom-[max(1rem,env(safe-area-inset-bottom,0px))] z-30">
        <button
          type="button"
          onClick={() => setSheetOpen((o) => !o)}
          className="px-3 py-2 rounded-full border border-slate-300 dark:border-white/[0.14] bg-white/95 dark:bg-[#0E1320]/95 shadow-xl text-[11px] font-mono font-medium text-slate-900 dark:text-[#EDEDED] inline-flex items-center gap-1.5 cursor-pointer"
        >
          <ListTree size={12} className="text-[var(--aria-accent)]" />
          <span>Outline</span>
          <ChevronUp size={12} className={`transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {sheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 flex items-end"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-h-[62vh] rounded-t-[14px] border-t border-slate-200 dark:border-white/[0.1] bg-white dark:bg-[#0E1320] p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] flex flex-col gap-2 animate-view-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-white/[0.08]">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5">
                <ListTree size={12} className="text-[var(--aria-accent)]" />
                <span>Manuscript Outline</span>
              </span>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-1 rounded text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                aria-label="Close outline"
              >
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto hud-scroll space-y-1">
              {headings.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    setSheetOpen(false);
                    onJump(h.id);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-[6px] text-[12.5px] text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer ${
                    h.level >= 3 ? 'pl-6 text-[11.5px] text-slate-600 dark:text-slate-400' : 'font-medium'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
