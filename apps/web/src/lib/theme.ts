import { useCallback, useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'anxiocare-theme';
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let current: ThemeChoice = read();

const COLOURS = { light: '#f6e9e3', dark: '#16163c' } as const;

/** Browser chrome follows the override, and goes dark for the always-night breathing screen. */
export function syncThemeColor(night = false): void {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const system = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = COLOURS[night ? 'dark' : current === 'system' ? system : current];
  });
}

export function setTheme(choice: ThemeChoice): void {
  current = choice;
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* applies for this visit only */
  }
  if (choice === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', choice);
  syncThemeColor();
  listeners.forEach((l) => l());
}

export function useTheme() {
  const choice = useSyncExternalStore(
    useCallback((l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    }, []),
    () => current,
  );
  return [choice, setTheme] as const;
}
