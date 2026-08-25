export const STORAGE_KEY = 'barcoder-theme';
const VALID = ['light', 'dark'];

export function readStored() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function resolveTheme(stored, prefersDark) {
  if (VALID.includes(stored)) return stored;
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode: the choice simply does not persist */
  }
}

export function nextTheme(current) {
  return current === 'dark' ? 'light' : 'dark';
}

export function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = resolveTheme(readStored(), prefersDark);
  document.documentElement.dataset.theme = theme;
  return theme;
}
