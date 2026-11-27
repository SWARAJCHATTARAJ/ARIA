import { useState } from 'react';
import { Copy, Check, Sparkles } from 'lucide-react';

interface SelectionPopoverProps {
  selectedText: string;
  position: { x: number; y: number };
  citationLabel?: string;
  onProbeDeeper: (excerpt: string) => void;
  onClose: () => void;
}

export default function SelectionPopover({
  selectedText,
  position,
  citationLabel,
  onProbeDeeper,
  onClose,
}: SelectionPopoverProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyWithCitation = async () => {
    const quote = selectedText.trim();
    const formatted = citationLabel ? `"${quote}" — ${citationLabel}` : `"${quote}"`;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
        onClose();
      }, 900);
    } catch {
      onClose();
    }
  };

  return (
    <div
      className="fixed z-40 animate-popover-reveal -translate-x-1/2 -translate-y-full pointer-events-auto"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="inline-flex items-center gap-1 p-1 rounded-[8px] border border-slate-200 dark:border-white/[0.14] bg-white/95 dark:bg-[#0E1320]/95 shadow-2xl">
        <button
          type="button"
          onClick={handleCopyWithCitation}
          className="px-2.5 py-1 rounded-[6px] text-[11px] font-mono text-slate-800 dark:text-[#EDEDED] hover:bg-slate-100 dark:hover:bg-white/[0.08] inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
        >
          {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy with Citation'}</span>
        </button>

        <div className="w-px h-3.5 bg-slate-200 dark:bg-white/[0.12]" />

        <button
          type="button"
          onClick={() => {
            onProbeDeeper(selectedText.trim());
            onClose();
          }}
          className="px-2.5 py-1 rounded-[6px] text-[11px] font-mono text-[var(--aria-accent)] hover:bg-slate-100 dark:hover:bg-white/[0.08] inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
        >
          <Sparkles size={11} />
          <span>Probe Deeper</span>
        </button>
      </div>
    </div>
  );
}
