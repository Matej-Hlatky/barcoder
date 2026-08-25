// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEY, readStored, resolveTheme, applyTheme, nextTheme } from '../src/theme.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('resolveTheme', () => {
  it('follows the OS when nothing is stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('lets a stored choice override the OS in both directions', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('ignores a corrupt stored value', () => {
    expect(resolveTheme('banana', true)).toBe('dark');
  });
});

describe('readStored', () => {
  it('returns null when nothing is stored', () => {
    expect(readStored()).toBeNull();
  });

  it('returns a valid stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(readStored()).toBe('dark');
  });

  it('returns null for a corrupt stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'banana');
    expect(readStored()).toBeNull();
  });
});

describe('applyTheme', () => {
  it('stamps the root element and persists the choice', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });
});

describe('nextTheme', () => {
  it('toggles between the two themes', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});
