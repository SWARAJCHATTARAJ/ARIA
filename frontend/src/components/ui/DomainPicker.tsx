import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface DomainOption {
  id: string;
  label: string;
}

export const DOMAIN_OPTIONS: readonly DomainOption[] = [
  { id: 'auto', label: 'All Domains' },
  { id: 'cs', label: 'CS & AI' },
  { id: 'chem', label: 'Chemistry & Materials' },
  { id: 'bio', label: 'Bio & Medicine' },
  { id: 'physics', label: 'Physics & Astronomy' },
  { id: 'eng', label: 'Engineering' },
  { id: 'math', label: 'Mathematics' },
  { id: 'econ', label: 'Economics & Finance' },
  { id: 'law', label: 'Law & Policy' },
] as const;

interface DomainPickerProps {
  value: string;
  onChange: (value: string) => void;
  direction?: 'up' | 'down';
  className?: string;
}

export const DomainPicker: React.FC<DomainPickerProps> = ({
  value,
  onChange,
  direction = 'down',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = DOMAIN_OPTIONS.find((d) => d.id === value) || DOMAIN_OPTIONS[0];

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="text-[11px] font-medium text-zinc-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg px-2.5 py-1 flex items-center gap-1.5 transition-colors focus:outline-none"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Domain scope"
      >
        <span className="truncate max-w-[115px]">{selectedOption.label}</span>
        <ChevronDown
          size={11}
          className={`text-zinc-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } left-0 z-50 w-52 py-1 bg-[#0B0F1A] border border-white/[0.10] rounded-xl shadow-2xl backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-100`}
          role="listbox"
        >
          <div className="max-h-60 overflow-y-auto divide-y divide-white/[0.03]">
            {DOMAIN_OPTIONS.map((opt) => {
              const isSelected = opt.id === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between py-1.5 px-2.5 text-[12px] text-left transition-colors ${
                    isSelected
                      ? 'bg-white/[0.08] text-white font-medium'
                      : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={13} className="text-emerald-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
