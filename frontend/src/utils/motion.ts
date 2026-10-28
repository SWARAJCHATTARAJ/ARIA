/**
 * Motion utilities for ARIA UI Pass 2.
 * Supports ?slow=1 multiplier (--motion-scale: 5) and prefers-reduced-motion.
 */

export function getMotionScale(): number {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slow') === '1' || params.get('slow') === 'true') {
      return 5;
    }
  }
  return 1;
}

export function isReducedMotion(): boolean {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

export const MOTION_EASE = 'cubic-bezier(.2,.8,.2,1)';
