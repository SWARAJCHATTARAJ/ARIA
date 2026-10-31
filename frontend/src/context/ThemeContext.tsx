import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeId = 'cyber-cyan' | 'emerald-biolab' | 'obsidian-gold' | 'solaris-paper';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  tagline: string;
  accentHex: string;
  bgHex: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'cyber-cyan',
    name: 'Cyber Cyan',
    tagline: 'Deep space #04070f with electric cyan #06b6d4',
    accentHex: '#06b6d4',
    bgHex: '#04070f',
  },
  {
    id: 'emerald-biolab',
    name: 'Emerald Biolab',
    tagline: 'Obsidian #030906 with bioluminescent emerald #10b981',
    accentHex: '#10b981',
    bgHex: '#030906',
  },
  {
    id: 'obsidian-gold',
    name: 'Obsidian Gold',
    tagline: 'Carbon #080705 with quantum amber/gold #f59e0b',
    accentHex: '#f59e0b',
    bgHex: '#080705',
  },
  {
    id: 'solaris-paper',
    name: 'Solaris Paper',
    tagline: 'Clean daylight academic mode #f8fafc with #0284c7',
    accentHex: '#0284c7',
    bgHex: '#f8fafc',
  },
];

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themes: ThemeOption[];
  cycleNextTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'aria-theme-preset';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (
        stored === 'cyber-cyan' ||
        stored === 'emerald-biolab' ||
        stored === 'obsidian-gold' ||
        stored === 'solaris-paper'
      ) {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'cyber-cyan';
  });

  const setTheme = (nextTheme: ThemeId) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // ignore
    }
  };

  const cycleNextTheme = () => {
    const idx = THEME_OPTIONS.findIndex((t) => t.id === theme);
    const nextIdx = (idx + 1) % THEME_OPTIONS.length;
    setTheme(THEME_OPTIONS[nextIdx].id);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'solaris-paper') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
    } else {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEME_OPTIONS, cycleNextTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
