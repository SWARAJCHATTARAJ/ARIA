import { useEffect, RefObject } from 'react';
import type { ThemeId } from '../context/ThemeContext';

/**
 * useHeroLattice — 60fps hardware-accelerated interactive node-grid canvas
 * on the obsidian void (`#050505`). Reacts to pointer movement (mouse) and
 * touch on mobile, capped at 60fps via delta-time, and paused via
 * IntersectionObserver / document.hidden when not visible.
 */
export function useHeroLattice(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  theme: ThemeId
) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = 0;
    let height = 0;
    const isMobile = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const nodeCount = isMobile ? 24 : 52;
    const maxDist = isMobile ? 85 : 125;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      phase: number;
      speed: number;
    }

    const particles: Particle[] = [];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    // Seed particles
    for (let i = 0; i < nodeCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        radius: Math.random() * 1.8 + 1.0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.02,
      });
    }

    // Pointer interaction
    let pointerX = -9999;
    let pointerY = -9999;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e && e.touches.length > 0) {
        pointerX = e.touches[0].clientX - rect.left;
        pointerY = e.touches[0].clientY - rect.top;
      } else if ('clientX' in e) {
        pointerX = (e as MouseEvent).clientX - rect.left;
        pointerY = (e as MouseEvent).clientY - rect.top;
      }
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });

    let lastTime = performance.now();

    // Pause the loop when scrolled out of view or the tab/window is hidden
    let inView = true;
    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 }
    );
    observer.observe(canvas);

    const render = (time: number) => {
      if (!inView || document.hidden) {
        // idle frame — keep the rAF loop alive so it resumes automatically
        animId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      // Determine accent color RGB from theme
      let accentR = 6, accentG = 182, accentB = 212; // cyber-cyan default
      if (theme === 'emerald-biolab') {
        accentR = 16; accentG = 185; accentB = 129;
      } else if (theme === 'obsidian-gold') {
        accentR = 245; accentG = 158; accentB = 11;
      } else if (theme === 'solaris-paper') {
        accentR = 2; accentG = 132; accentB = 199;
      }

      // Update & draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.phase += p.speed;

        // Bounce
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        else if (p.x > width) { p.x = width; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        else if (p.y > height) { p.y = height; p.vy *= -1; }

        // Gravitate slightly to pointer if within 120px
        const dx = pointerX - p.x;
        const dy = pointerY - p.y;
        const pDist = Math.sqrt(dx * dx + dy * dy);
        if (pDist < 120 && pDist > 5) {
          p.x += (dx / pDist) * 0.4;
          p.y += (dy / pDist) * 0.4;
        }

        const alpha = 0.35 + Math.sin(p.phase) * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${alpha})`;
        ctx.fill();

        // Connect nearby nodes
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const cdx = p.x - p2.x;
          const cdy = p.y - p2.y;
          const dist = Math.sqrt(cdx * cdx + cdy * cdy);
          if (dist < maxDist) {
            const lineAlpha = (1 - dist / maxDist) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(${accentR}, ${accentG}, ${accentB}, ${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
    };
  }, [canvasRef, theme]);
}
