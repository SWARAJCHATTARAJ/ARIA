import { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Copy, Check, ExternalLink } from 'lucide-react';
import { FigureData } from '../types';
import { sanitizeHref } from './MarkdownRenderer';
import { triggerLightHaptic } from '../utils/haptics';

interface FigureLightboxProps {
  figures: FigureData[];
  initialIndex: number;
  queryTitle?: string;
  nativeHaptics?: boolean;
  onClose: () => void;
}

export default function FigureLightbox({
  figures,
  initialIndex,
  queryTitle,
  nativeHaptics = true,
  onClose,
}: FigureLightboxProps) {
  const [activeIdx, setActiveIdx] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, figures.length - 1))
  );
  const [zoom, setZoom] = useState(1);
  const [copiedCite, setCopiedCite] = useState(false);

  // Ref-driven pan & transform to keep pinch/drag 60fps with zero state thrashing
  const imgRef = useRef<HTMLImageElement | null>(null);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const fig = figures[activeIdx];

  const applyTransform = (scale: number, x: number, y: number) => {
    if (imgRef.current) {
      imgRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    }
  };

  useEffect(() => {
    panRef.current = { x: 0, y: 0 };
    setZoom(1);
    applyTransform(1, 0, 0);
  }, [activeIdx]);

  useEffect(() => {
    applyTransform(zoom, zoom <= 1 ? 0 : panRef.current.x, zoom <= 1 ? 0 : panRef.current.y);
    if (zoom <= 1) {
      panRef.current = { x: 0, y: 0 };
    }
  }, [zoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setZoom((z) => Math.min(4, +(z + 0.5).toFixed(2)));
      } else if (e.key === '-') {
        setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)));
      } else if (e.key === 'ArrowRight' && figures.length > 1) {
        setActiveIdx((i) => (i + 1) % figures.length);
      } else if (e.key === 'ArrowLeft' && figures.length > 1) {
        setActiveIdx((i) => (i - 1 + figures.length) % figures.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, figures.length]);

  if (!fig) return null;

  const safeRecordUrl = sanitizeHref(fig.source_url);

  const handleCopyFigureCitation = async () => {
    const citeText = `Figure ${activeIdx + 1}: ${fig.title}${
      queryTitle ? ` (${queryTitle})` : ''
    }. ${fig.attribution || 'Wikimedia Commons'}.${safeRecordUrl ? ` ${safeRecordUrl}` : ''}`;
    try {
      await navigator.clipboard.writeText(citeText);
      triggerLightHaptic(nativeHaptics);
      setCopiedCite(true);
      window.setTimeout(() => setCopiedCite(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 manuscript-backdrop-blur flex flex-col justify-between p-3 sm:p-5 animate-view-enter"
      role="dialog"
      aria-modal="true"
      aria-label={`Scientific Plate Lightbox: ${fig.title}`}
      onClick={onClose}
    >
      {/* Top Optical Control Bar */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 rounded-[8px] bg-[#0B0F1A]/90 border border-white/[0.1] text-[#EDEDED] shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-[var(--aria-accent)] tabular-nums shrink-0">
            PLATE {activeIdx + 1}/{figures.length}
          </span>
          <h3 className="text-[12.5px] font-semibold truncate">{fig.title}</h3>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)))}
            disabled={zoom <= 1}
            className="p-1.5 rounded-[5px] hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer transition-colors"
            title="Zoom out (-)"
            aria-label="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-[11px] font-mono px-1.5 tabular-nums text-slate-300">
            {zoom.toFixed(1)}×
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(2)))}
            disabled={zoom >= 4}
            className="p-1.5 rounded-[5px] hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer transition-colors"
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              panRef.current = { x: 0, y: 0 };
              setZoom(1);
            }}
            className="p-1.5 rounded-[5px] hover:bg-white/[0.08] cursor-pointer transition-colors"
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <RotateCcw size={13} />
          </button>
          <div className="w-px h-4 bg-white/[0.1] mx-1" />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[5px] hover:bg-white/[0.1] text-slate-300 hover:text-white cursor-pointer transition-colors"
            title="Close Lightbox (Esc)"
            aria-label="Close Lightbox"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Main Zoomable Stage */}
      <div
        className="flex-1 min-h-0 flex items-center justify-center overflow-hidden my-3 select-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.35 : -0.35;
          setZoom((z) => Math.min(4, Math.max(1, +(z + delta).toFixed(2))));
        }}
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          dragRef.current = {
            active: true,
            startX: e.clientX,
            startY: e.clientY,
            origX: panRef.current.x,
            origY: panRef.current.y,
          };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current.active) return;
          const nextX = dragRef.current.origX + (e.clientX - dragRef.current.startX);
          const nextY = dragRef.current.origY + (e.clientY - dragRef.current.startY);
          panRef.current = { x: nextX, y: nextY };
          applyTransform(zoom, nextX, nextY);
        }}
        onPointerUp={() => {
          dragRef.current.active = false;
        }}
      >
        <img
          ref={imgRef}
          src={fig.url}
          alt={fig.title}
          draggable={false}
          className={`max-h-[70vh] max-w-full object-contain rounded-[6px] border border-white/[0.08] bg-white/95 dark:bg-[#0B0F1A] transition-transform duration-150 ease-out will-change-transform ${
            zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'
          }`}
          onClick={() => {
            if (zoom === 1) setZoom(2);
          }}
        />
      </div>

      {/* Analytical Caption + Metadata Footer */}
      <div
        className="px-4 py-3 rounded-[8px] bg-[#0B0F1A]/92 border border-white/[0.1] text-[#EDEDED] space-y-2 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {fig.caption && (
          <p className="text-[12.5px] text-slate-200 leading-relaxed max-w-3xl">
            {fig.caption}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/[0.08] text-[10.5px] font-mono text-slate-400">
          <div className="flex items-center gap-3 min-w-0">
            <span className="truncate">{fig.attribution || 'Wikimedia Commons'}</span>
            {safeRecordUrl && (
              <a
                href={safeRecordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--aria-accent)] hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Source Record</span>
                <ExternalLink size={10} />
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {figures.length > 1 && (
              <div className="flex items-center gap-1">
                {figures.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveIdx(i)}
                    className={`w-5 h-5 rounded text-[10px] tabular-nums cursor-pointer transition-colors ${
                      i === activeIdx
                        ? 'bg-[var(--aria-accent)] text-[#09090B] font-semibold'
                        : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.12]'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={handleCopyFigureCitation}
              className="px-2.5 py-1 rounded-[5px] border border-white/[0.12] bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {copiedCite ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              <span>{copiedCite ? 'Copied Citation' : 'Copy Citation'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
