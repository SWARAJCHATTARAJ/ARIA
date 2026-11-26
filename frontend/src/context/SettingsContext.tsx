import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  CitationStyle,
  EntailmentStrictness,
  FontFamilyPref,
  FontScalePref,
  PdfLayoutStyle,
  RecencyFilter,
  ResearchModePref,
  SourceTierFilter,
  SurfaceMode,
  ThemePreset,
} from '../types';

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
  // 1. Research & Verification
  defaultCitationStyle: CitationStyle;
  defaultSourceTier: SourceTierFilter;
  defaultRecency: RecencyFilter;
  entailmentStrictness: EntailmentStrictness;
  defaultMode: ResearchModePref;
  defaultDomain: string;

  // 2. Reading & Experience
  themePreset: ThemePreset;
  surfaceMode: SurfaceMode;
  theme: AppTheme;
  readingTypography: FontFamilyPref;
  fontScale: FontScalePref;
  compactDensity: boolean;
  reducedMotion: boolean;
  showResearchPulse: boolean;
  nativeHaptics: boolean;

  // 3. Export & Native Files
  pdfLayoutStyle: PdfLayoutStyle;
  includeLedgerInPdf: boolean;
  autoOpenAfterExport: boolean;

  // BYOK failover pool
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
  defaultCitationStyle: 'apa7',
  defaultSourceTier: 'all',
  defaultRecency: 'all',
  entailmentStrictness: 'standard',
  defaultMode: 'synthesis',
  defaultDomain: 'auto',

  themePreset: 'cyber-cyan',
  surfaceMode: 'dark',
  theme: 'dark',
  readingTypography: 'sans',
  fontScale: 'default',
  compactDensity: false,
  reducedMotion: false,
  showResearchPulse: true,
  nativeHaptics: true,

  pdfLayoutStyle: 'academic',
  includeLedgerInPdf: true,
  autoOpenAfterExport: false,

  apiKeys: [],
};

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

function resolveEffectiveTheme(surfaceMode: SurfaceMode, fallbackTheme: AppTheme): AppTheme {
  if (surfaceMode === 'light') return 'light';
  if (surfaceMode === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return fallbackTheme;
}

export function SettingsContextProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw);
      const merged: WorkspaceSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
      if (!parsed.surfaceMode && (parsed.theme === 'light' || parsed.theme === 'dark')) {
        merged.surfaceMode = parsed.theme;
      }
      if (!parsed.fontScale && parsed.compactDensity) {
        merged.fontScale = 'compact';
      }
      merged.theme = resolveEffectiveTheme(merged.surfaceMode, merged.theme);
      return merged;
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

  // Apply resolved surface mode (System | Dark | Light) + preset + reading preferences to <html>
  useEffect(() => {
    const applyRootAttributes = () => {
      const root = document.documentElement;
      const effectiveTheme = resolveEffectiveTheme(settings.surfaceMode, settings.theme);
      root.setAttribute('data-theme', effectiveTheme);
      root.setAttribute('data-preset', settings.themePreset);
      root.setAttribute('data-typo', settings.readingTypography);
      root.setAttribute('data-scale', settings.fontScale);
      if (effectiveTheme === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
      }
      if (effectiveTheme !== settings.theme && settings.surfaceMode === 'system') {
        setSettings((prev) => ({ ...prev, theme: effectiveTheme }));
      }
    };

    applyRootAttributes();

    if (settings.surfaceMode === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener?.('change', applyRootAttributes);
      return () => mq.removeEventListener?.('change', applyRootAttributes);
    }
    return undefined;
  }, [settings.surfaceMode, settings.themePreset, settings.readingTypography, settings.fontScale, settings.theme]);

  // Apply Reduced Motion globally through --motion-scale
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--motion-scale', settings.reducedMotion ? '0.01' : '1');
    return () => {
      root.style.removeProperty('--motion-scale');
    };
  }, [settings.reducedMotion]);

  const handleUpdateSettings = useCallback((patch: Partial<WorkspaceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.surfaceMode) {
        next.theme = resolveEffectiveTheme(patch.surfaceMode, next.theme);
      } else if (patch.theme && !patch.surfaceMode) {
        next.surfaceMode = patch.theme;
      }
      if (patch.themePreset === 'solaris-paper' && !patch.surfaceMode && !patch.theme) {
        next.surfaceMode = 'light';
        next.theme = 'light';
      }
      if (patch.fontScale) {
        next.compactDensity = patch.fontScale === 'compact';
      }
      return next;
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => {
      const nextTheme: AppTheme = prev.theme === 'dark' ? 'light' : 'dark';
      return {
        ...prev,
        theme: nextTheme,
        surfaceMode: nextTheme,
      };
    });
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
export const useSettingsStore = useSettingsContext;

export default SettingsContext;
