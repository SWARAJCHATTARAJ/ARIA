import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

/**
 * Interface & Motion settings — persisted user preferences.
 */
export interface WorkspaceSettings {
  /** Compact reading density for rendered answer threads. */
  compactDensity: boolean;
  /** Reduced Motion: collapses animations to near-instant durations. */
  reducedMotion: boolean;
}

export interface SettingsContextProps {
  settings: WorkspaceSettings;
  onUpdateSettings: (patch: Partial<WorkspaceSettings>) => void;
}

const STORAGE_KEY = 'aria-ui-settings-v1';

const DEFAULT_SETTINGS: WorkspaceSettings = {
  compactDensity: false,
  reducedMotion: false,
};

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export function SettingsContextProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  // Apply Reduced Motion globally through --motion-scale (all durations scale
  // through calc(...*var(--motion-scale,1)), so 0.01 collapses every animation)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--motion-scale', settings.reducedMotion ? '0.01' : '1');
    return () => {
      root.style.removeProperty('--motion-scale');
    };
  }, [settings.reducedMotion]);

  const handleUpdateSettings = (patch: Partial<WorkspaceSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        onUpdateSettings: handleUpdateSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export const SettingsProvider = SettingsContextProvider;

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettingsContext must be used within SettingsContextProvider');
  }
  return ctx;
}

export const useSettings = useSettingsContext;

export default SettingsContext;
