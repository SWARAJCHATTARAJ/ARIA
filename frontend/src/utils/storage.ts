import { CollectionEntry, HistoryEntry } from '../types';

const HISTORY_KEY = 'aria-history-v1';
const COLLECTION_KEY = 'aria-collections-v1';
const COMPARE_DEFAULT_KEY = 'aria-compare-default';

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
