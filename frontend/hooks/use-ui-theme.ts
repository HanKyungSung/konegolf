import { useCallback, useSyncExternalStore } from 'react';

export type UiTheme = 'classic' | 'mission-control';

const STORAGE_KEY = 'kgolf-ui-theme';
const UI_THEME_EVENT = 'kgolf-ui-theme-change';
const listeners = new Set<() => void>();

let currentUiTheme: UiTheme = 'classic';
let browserListenersAttached = false;
let storageInitialized = false;

function isUiTheme(value: string | null): value is UiTheme {
  return value === 'classic' || value === 'mission-control';
}

export function getStoredUiTheme(): UiTheme {
  if (typeof window === 'undefined') return currentUiTheme;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isUiTheme(stored) ? stored : 'classic';
}

function applyUiTheme(theme: UiTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.uiTheme = theme;
}

export function initializeUiTheme() {
  currentUiTheme = getStoredUiTheme();
  storageInitialized = true;
  applyUiTheme(currentUiTheme);
}

function notifyUiThemeListeners() {
  listeners.forEach((listener) => listener());
}

function syncUiTheme(theme: UiTheme) {
  currentUiTheme = theme;
  applyUiTheme(theme);
  notifyUiThemeListeners();
}

function attachBrowserListeners() {
  if (browserListenersAttached || typeof window === 'undefined') return;

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    syncUiTheme(isUiTheme(event.newValue) ? event.newValue : 'classic');
  });

  browserListenersAttached = true;
}

function subscribeToUiTheme(listener: () => void) {
  attachBrowserListeners();
  listeners.add(listener);

  if (!storageInitialized) {
    const previousTheme = currentUiTheme;
    initializeUiTheme();
    if (previousTheme !== currentUiTheme) notifyUiThemeListeners();
  }

  return () => {
    listeners.delete(listener);
  };
}

export function setStoredUiTheme(theme: UiTheme) {
  currentUiTheme = theme;
  applyUiTheme(theme);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent<UiTheme>(UI_THEME_EVENT, { detail: theme }));
  }

  notifyUiThemeListeners();
}

function getUiThemeSnapshot() {
  return currentUiTheme;
}

export function useUiTheme() {
  const uiTheme = useSyncExternalStore(
    subscribeToUiTheme,
    getUiThemeSnapshot,
    getUiThemeSnapshot,
  );

  const setUiTheme = useCallback((theme: UiTheme) => {
    setStoredUiTheme(theme);
  }, []);

  const toggleUiTheme = useCallback(() => {
    setStoredUiTheme(currentUiTheme === 'mission-control' ? 'classic' : 'mission-control');
  }, []);

  return {
    uiTheme,
    isMissionControlTheme: uiTheme === 'mission-control',
    setUiTheme,
    toggleUiTheme,
  };
}
