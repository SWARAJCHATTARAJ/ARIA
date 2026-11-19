import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

export type AppTheme = 'dark' | 'light';

export interface ApiKeyItem {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
  status?: 'active' | 'rate_limited' | 'invalid' | 'unknown';
  lastTested?: number;
}

export interface WorkspaceSettings {
  /** Compact reading density for rendered answer threads. */
  compactDensity: boolean;
  /** Reduced Motion: collapses animations to near-instant durations. */
  reducedMotion: boolean;
  /** Active visual theme: Obsidian Dark or Editorial Light. */
  theme: AppTheme;
  /** Default research domain. */
  defaultDomain: string;
  /** User-provided BYOK Groq API keys pool for failover. */
  apiKeys: ApiKeyItem[];
}

export interface SettingsContextProps {
  settings: WorkspaceSettings;
  onUpdateSettings: (patch: Partial<WorkspaceSettings>) => void;
  toggleTheme: () => void;
  addApiKey: (key: string, label?: string) => void;
  removeApiKey: (id: string) => void;
  toggleApiKey: (id: string) => void;
  updateApiKeyStatus: (id: string, status: 'active' | 'rate_limited' | 'invalid') => void;
  getActiveKeyPool: () => string[];
}

const STORAGE_KEY = 'aria-ui-settings-v2';

const DEFAULT_SETTINGS: WorkspaceSettings = {
  compactDensity: false,
  reducedMotion: false,
  theme: 'dark',
  defaultDomain: 'auto',
  apiKeys: [],
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

  // Persist settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  // Apply theme to document element
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
    if (settings.theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Apply Reduced Motion globally through --motion-scale
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--motion-scale', settings.reducedMotion ? '0.01' : '1');
    return () => {
      root.style.removeProperty('--motion-scale');
    };
  }, [settings.reducedMotion]);

  const handleUpdateSettings = useCallback((patch: Partial<WorkspaceSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const addApiKey = useCallback((rawKey: string, customLabel?: string) => {
    const cleanKey = rawKey.trim();
    if (!cleanKey) return;
    const masked = cleanKey.length > 8 ? `${cleanKey.slice(0, 4)}...${cleanKey.slice(-4)}` : cleanKey;
    const label = customLabel?.trim() || `Key (${masked})`;
    const newItem: ApiKeyItem = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      key: cleanKey,
      label,
      enabled: true,
      status: 'unknown',
    };
    setSettings((prev) => ({
      ...prev,
      apiKeys: [...prev.apiKeys, newItem],
    }));
  }, []);

  const removeApiKey = useCallback((id: string) => {
    setSettings((prev) => ({
      ...prev,
      apiKeys: prev.apiKeys.filter((k) => k.id !== id),
    }));
  }, []);

  const toggleApiKey = useCallback((id: string) => {
    setSettings((prev) => ({
      ...prev,
      apiKeys: prev.apiKeys.map((k) => (k.id === id ? { ...k, enabled: !k.enabled } : k)),
    }));
  }, []);

  const updateApiKeyStatus = useCallback((id: string, status: 'active' | 'rate_limited' | 'invalid') => {
    setSettings((prev) => ({
      ...prev,
      apiKeys: prev.apiKeys.map((k) => (k.id === id ? { ...k, status, lastTested: Date.now() } : k)),
    }));
  }, []);

  const getActiveKeyPool = useCallback((): string[] => {
    return settings.apiKeys.filter((k) => k.enabled && k.key.trim().length > 0).map((k) => k.key.trim());
  }, [settings.apiKeys]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        onUpdateSettings: handleUpdateSettings,
        toggleTheme,
        addApiKey,
        removeApiKey,
        toggleApiKey,
        updateApiKeyStatus,
        getActiveKeyPool,
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
