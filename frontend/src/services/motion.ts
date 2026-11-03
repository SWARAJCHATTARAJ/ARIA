/**
 * Motion utilities for ARIA UI.
 * Supports ?slow=1 multiplier (--motion-scale: 5), user Settings
 * animation intensity (--motion-scale via :root), and prefers-reduced-motion.
 */

export function getMotionScale(): number {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slow') === '1' || params.get('slow') === 'true') {
      return 5;
    }
    const root = document.documentElement;
    const viaVar = root?.style?.getPropertyValue ? root.style.getPropertyValue('--motion-scale') : '';
    const viaVarNum = viaVar ? parseFloat(viaVar) : NaN;
    if (!Number.isNaN(viaVarNum) && viaVarNum > 0) {
      return viaVarNum;
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

export const MOTION_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
