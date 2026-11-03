import { CollectionEntry, HistoryEntry, AriaSettings, DEFAULT_SETTINGS } from '../types';

const HISTORY_KEY = 'aria-history-v1';
const COLLECTION_KEY = 'aria-collections-v1';
const COMPARE_DEFAULT_KEY = 'aria-compare-default';
const SETTINGS_KEY = 'aria-settings-v2';
const BYOK_KEY = 'aria-byok-key';
const BYOK_PROVIDER_KEY = 'aria-byok-provider';

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, 100)));
  } catch {
    // Storage may be full / disabled; quietly ignore
  }
}

// ------------------------------------------------------------- history
export function getHistory(): HistoryEntry[] {
  return readList<HistoryEntry>(HISTORY_KEY);
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): HistoryEntry {
  const newEntry: HistoryEntry = {
    ...entry,
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  const history = [newEntry, ...getHistory().filter((h) => h.query !== entry.query)];
  writeList(HISTORY_KEY, history);
  return newEntry;
}

export function deleteHistoryEntry(id: string): void {
  writeList(HISTORY_KEY, getHistory().filter((h) => h.id !== id));
}

export function clearHistory(): void {
  writeList(HISTORY_KEY, []);
}

// ---------------------------------------------------------- collections
export function getCollections(): CollectionEntry[] {
  return readList<CollectionEntry>(COLLECTION_KEY);
}

export function addToCollection(entry: Omit<CollectionEntry, 'id' | 'timestamp'>): boolean {
  const collections = getCollections();
  if (collections.some((c) => c.query === entry.query)) return false;
  const newEntry: CollectionEntry = {
    ...entry,
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  writeList(COLLECTION_KEY, [newEntry, ...collections]);
  return true;
}

export function removeFromCollection(id: string): void {
  writeList(COLLECTION_KEY, getCollections().filter((c) => c.id !== id));
}

export function isInCollection(query: string): boolean {
  return getCollections().some((c) => c.query === query);
}

// -------------------------------------------------------------- settings
export function getCompareDefault(): boolean {
  try {
    return localStorage.getItem(COMPARE_DEFAULT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCompareDefault(value: boolean): void {
  try {
    localStorage.setItem(COMPARE_DEFAULT_KEY, value ? '1' : '0');
  } catch {
    // ignore
  }
}

// --------------------------------------------------------------------------
// Research Control Center settings (v3 Part 3): persisted in localStorage
// --------------------------------------------------------------------------
export function getSettings(): AriaSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, compareDefault: parsed.compareDefault ?? getCompareDefault() };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<AriaSettings>): AriaSettings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function getByokKey(): string {
  try {
    return localStorage.getItem(BYOK_KEY) || '';
  } catch {
    return '';
  }
}

export function setByokKey(provider: string, apiKey: string): void {
  try {
    if (apiKey) localStorage.setItem(BYOK_KEY, apiKey);
    else localStorage.removeItem(BYOK_KEY);
    localStorage.setItem(BYOK_PROVIDER_KEY, provider);
  } catch {
    // ignore
  }
}

export function clearByok(): void {
  try {
    localStorage.removeItem(BYOK_KEY);
    localStorage.removeItem(BYOK_PROVIDER_KEY);
  } catch {
    // ignore
  }
}

export function getByokProvider(): string {
  try {
    return localStorage.getItem(BYOK_PROVIDER_KEY) || '';
  } catch {
    return '';
  }
}

const CUSTOM_CONTEXT_KEY = 'aria-user-context';

export function getCustomContext(): string {
  try {
    return localStorage.getItem(CUSTOM_CONTEXT_KEY) || '';
  } catch {
    return '';
  }
}

export function setCustomContext(value: string): void {
  try {
    if (value && value.trim()) localStorage.setItem(CUSTOM_CONTEXT_KEY, value.trim());
    else localStorage.removeItem(CUSTOM_CONTEXT_KEY);
  } catch {
    // ignore
  }
}

export function exportResearchHistory(): string {
  const payload = {
    exported_at: new Date().toISOString(),
    history: getHistory(),
    collections: getCollections(),
  };
  return JSON.stringify(payload, null, 2);
}
