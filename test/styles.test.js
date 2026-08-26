import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/styles.css', 'utf8');

const LIGHT = ':root';
const DARK_MEDIA = ":root:not([data-theme='light'])";
const DARK_ATTR = ":root[data-theme='dark']";

function tokensOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no rule for ${selector}`);
  return Object.fromEntries(
    [...match[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()])
  );
}

const channel = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme cascade', () => {
  it('defines the same tokens in both dark blocks', () => {
    expect(tokensOf(DARK_MEDIA)).toEqual(tokensOf(DARK_ATTR));
  });

  it('defines no token only inside the media block', () => {
    const light = Object.keys(tokensOf(LIGHT));
    for (const key of Object.keys(tokensOf(DARK_MEDIA))) expect(light).toContain(key);
  });
});

describe('control border contrast', () => {
  for (const [name, selector] of [['light', LIGHT], ['dark', DARK_MEDIA]]) {
    it(`clears 3:1 against both backgrounds in ${name}`, () => {
      const t = tokensOf(selector);
      expect(contrast(t['--control-border'], t['--surface'])).toBeGreaterThanOrEqual(3);
      expect(contrast(t['--control-border'], t['--bg'])).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('accent tokens', () => {
  for (const [name, selector] of [['light', LIGHT], ['dark', DARK_MEDIA], ['dark attr', DARK_ATTR]]) {
    it(`keeps --focus usable as a focus indicator in ${name}`, () => {
      const t = tokensOf(selector);
      // WCAG 2.2 asks 3:1 of a focus indicator against what surrounds it.
      expect(contrast(t['--focus'], t['--bg'])).toBeGreaterThanOrEqual(3);
      expect(contrast(t['--focus'], t['--surface'])).toBeGreaterThanOrEqual(3);
    });

    it(`keeps --accent-ink readable on the --accent fill in ${name}`, () => {
      const t = tokensOf(selector);
      expect(contrast(t['--accent-ink'], t['--accent'])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('does not let the pastel fill masquerade as an indicator colour', () => {
    // The reason there are two tokens: --accent alone cannot clear 3:1, so any
    // outline or active border must reach for --focus instead.
    expect(contrast(tokensOf(LIGHT)['--accent'], tokensOf(LIGHT)['--bg'])).toBeLessThan(3);
  });
});

describe('layout stability', () => {
  it('reserves the scrollbar gutter', () => {
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/);
  });

  it('never forces a scrollbar the user cannot move', () => {
    expect(css).not.toMatch(/html\s*\{[^}]*overflow-y:\s*scroll/);
  });
});

describe('the caret data URI', () => {
  const carets = [...css.matchAll(/--caret:\s*url\("data:image\/svg\+xml,([^"]+)"\)/g)]
    .map(([, encoded]) => decodeURIComponent(encoded));

  it('is defined once per theme block', () => {
    expect(carets).toHaveLength(3);
  });

  // An SVG referenced as an image is parsed as XML, where the namespace is
  // mandatory — without it the caret silently draws nothing, and computed style
  // still reports the URI.
  it('declares the SVG namespace in every block', () => {
    for (const svg of carets) expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('carries a path to draw', () => {
    for (const svg of carets) expect(svg).toMatch(/<path d="M[\d.]/);
  });
});

describe('control border consumption', () => {
  it('the shared control rule actually uses the --control-border token', () => {
    expect(css).toMatch(/button, select, input \{[^}]*var\(--control-border\)/);
  });
});
