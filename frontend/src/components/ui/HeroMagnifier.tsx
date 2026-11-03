import React, { useEffect, useRef, useState } from 'react';

/**
 * HeroMagnifier — interactive tactical magnifying reticle for the auth /
 * hero view. Follows the pointer with high-performance rAF + lerp transform
 * tracking (zero re-render storm, GPU-composited transform only) and applies
 * a HUD zoom / contrast filter inside the lens when active.
 */
export default function HeroMagnifier() {
  const reticleRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef({ x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0 });
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = reticleRef.current;
    if (!el) return;
    const pos = { ...posRef.current };
    let raf = 0;
    const tick = () => {
      const target = posRef.current;
      const k = 0.14; // lerp factor → smooth spring-ish tracking
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    posRef.current = { x: e.clientX, y: e.clientY };
  };

  return (
    <div
      ref={reticleRef}
      onPointerMove={handleMove}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      className={`aria-magnifier${active ? ' aria-magnifier-active' : ''}`}
    >
      {/* Tactical corner brackets */}
      <span className="aria-magnifier-c tl" />
      <span className="aria-magnifier-c tr" />
      <span className="aria-magnifier-c bl" />
      <span className="aria-magnifier-c br" />
      {/* HUD lens with zoom + high-contrast filter */}
      <div className="aria-magnifier-lens" />
    </div>
  );
}
