import { Capacitor } from '@capacitor/core';

/**
 * Lightweight haptic tap strictly guarded behind native Capacitor Android/iOS platform
 * detection so standard Web browsers and Windows Tauri desktop never log or throw errors.
 */
export function triggerLightHaptic(enabled: boolean = true): void {
  if (!enabled) return;
  try {
    if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
      return;
    }
    const hapticsPlugin = (window as any).Capacitor?.Plugins?.Haptics;
    if (hapticsPlugin && typeof hapticsPlugin.impact === 'function') {
      void hapticsPlugin.impact({ style: 'LIGHT' });
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  } catch {
    // Quiet no-op outside supported native runtimes
  }
}
