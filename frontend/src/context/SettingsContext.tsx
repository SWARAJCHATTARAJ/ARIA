import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ResearchMode, AriaSettings, ThemePreset, AnimationIntensity, CitationFormat, FontDensity } from '../types';

export interface ExtendedAriaSettings {
  researchMode: ResearchMode;
  discipline: string;
  customContext: string;
  sourceCount: number;
  retrievalStrictness: 'strict_peer' | 'include_web';
  compareDefault: boolean;
  themePreset: 'cyber-cyan' | 'emerald-biolab' | 'obsidian-gold' | 'solaris-paper';
  animationIntensity: 'full_kinetic' | 'subtle_smooth' | 'reduced_motion';
  gridOverlay: boolean;
  fontDensity: 'compact' | 'standard' | 'comfortable';
  citationFormat: 'ieee' | 'apa' | 'nature';
  auditThreshold: number;
  autoExpandAudit: boolean;
  pdfFullLedger: boolean;
  clickableUrls: boolean;
  byokProvider: string;
  byokApiKey: string;
}

export interface ResearchModeItem {
  id: ResearchMode;
  label: string;
  glyph: string;
  hint: string;
}

export interface DisciplineItem {
  id: string;
  label: string;
  glyph: string;
}

export interface ThemePresetItem {
  id: ExtendedAriaSettings['themePreset'];
  label: string;
  hex: string;
}

export interface SettingsContextProps {
  settings: ExtendedAriaSettings;
  onUpdateSettings: (patch: Partial<ExtendedAriaSettings>) => void;
  researchModes: ResearchModeItem[];
  disciplines: DisciplineItem[];
  themePresets: ThemePresetItem[];
}

const STORAGE_KEY = 'aria-settings-v2';

export const RESEARCH_MODES: ResearchModeItem[] = [
  { id: 'fast_brief', label: 'Fast Executive Brief', glyph: '⚡', hint: 'Concise takeaways & rapid verification, lowest latency.' },
  { id: 'deep_academic', label: 'Deep Academic Paper', glyph: '🔬', hint: 'Comprehensive multi-section literature review (default).' },
  { id: 'critique', label: 'Literature Debate & Critique', glyph: '⚖️', hint: 'Contrasting methodologies & contradiction evaluation.' },
  { id: 'quantitative', label: 'Quantitative & Data Extraction', glyph: '🧮', hint: 'Equations, statistical benchmarks & parameter tables.' },
  { id: 'first_principles', label: 'First-Principles Explainer', glyph: '🌱', hint: 'Axioms-first breakdown up to graduate level.' },
];

export const DISCIPLINES: DisciplineItem[] = [
  { id: 'auto', label: 'All Disciplines (Auto)', glyph: '🌐' },
  { id: 'cs', label: 'Computer Science & AI', glyph: '🤖' },
  { id: 'physics', label: 'Physics & Engineering', glyph: '⚛️' },
  { id: 'chemistry', label: 'Chemistry & Materials', glyph: '⚗️' },
  { id: 'life', label: 'Botany & Life Sciences', glyph: '🧬' },
  { id: 'medicine', label: 'Medicine & Clinical', glyph: '🩺' },
  { id: 'humanities', label: 'Arts & Humanities', glyph: '📜' },
  { id: 'music', label: 'Music & Acoustics', glyph: '🎵' },
  { id: 'law', label: 'Law & Public Policy', glyph: '⚖️' },
  { id: 'economics', label: 'Economics & Finance', glyph: '📈' },
];

export const THEME_PRESETS: ThemePresetItem[] = [
  { id: 'cyber-cyan', label: 'Cyber Cyan (Default)', hex: '#06b6d4' },
  { id: 'emerald-biolab', label: 'Emerald Biolab', hex: '#10b981' },
  { id: 'obsidian-gold', label: 'Obsidian Gold', hex: '#f59e0b' },
  { id: 'solaris-paper', label: 'Solaris Paper', hex: '#0284c7' },
];

const DEFAULT_EXTENDED_SETTINGS: ExtendedAriaSettings = {
  researchMode: 'deep_academic',
  discipline: 'auto',
  customContext: '',
  sourceCount: 8,
  retrievalStrictness: 'strict_peer',
  compareDefault: false,
  themePreset: 'cyber-cyan',
  animationIntensity: 'full_kinetic',
  gridOverlay: true,
  fontDensity: 'standard',
  citationFormat: 'ieee',
  auditThreshold: 0.5,
  autoExpandAudit: true,
  pdfFullLedger: true,
  clickableUrls: true,
  byokProvider: '',
  byokApiKey: '',
};

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export function SettingsContextProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ExtendedAriaSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_EXTENDED_SETTINGS;
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_EXTENDED_SETTINGS,
        ...parsed,
      };
    } catch {
      return DEFAULT_EXTENDED_SETTINGS;
    }
  });

  // Save to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore storage errors
    }
  }, [settings]);

  const handleUpdateSettings = (patch: Partial<ExtendedAriaSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        onUpdateSettings: handleUpdateSettings,
        researchModes: RESEARCH_MODES,
        disciplines: DISCIPLINES,
        themePresets: THEME_PRESETS,
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
