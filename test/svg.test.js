import { describe, it, expect } from 'vitest';
import { viewBoxOf, normalize, fillPathsOf, strokeToFill } from '../src/svg.js';
import { encode } from '../src/encoder.js';
import { defaultsOf } from '../src/symbologies.js';
import { SAMPLES, filledArea } from './helpers.js';

const qr = () => encode({ s: 'qrcode', t: 'hello', ...defaultsOf('qrcode') });

describe('viewBoxOf', () => {
  it('parses the viewBox', () => {
    expect(viewBoxOf('<svg viewBox="0 0 168 42">')).toEqual({ x: 0, y: 0, w: 168, h: 42 });
  });

  it('throws when there is no viewBox', () => {
    expect(() => viewBoxOf('<svg>')).toThrow(/viewBox/);
  });
});

describe('normalize', () => {
  it('injects width and height matching the viewBox', () => {
    const out = normalize(qr());
    const { w, h } = viewBoxOf(out);
    expect(out).toContain(`width="${w}"`);
    expect(out).toContain(`height="${h}"`);
  });

  it('prepends an opaque white background rect covering the viewBox', () => {
    const out = normalize(qr());
    const { w, h } = viewBoxOf(out);
    expect(out).toContain(`<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`);
    expect(out.indexOf('<rect')).toBeLessThan(out.indexOf('<path'));
  });

  it('preserves the viewBox and every path', () => {
    const before = qr();
    const after = normalize(before);
    expect(viewBoxOf(after)).toEqual(viewBoxOf(before));
    expect(fillPathsOf(after)).toEqual(fillPathsOf(before));
  });

  it('is idempotent enough to be safe if applied twice', () => {
    const once = normalize(qr());
    const twice = normalize(once);
    expect(viewBoxOf(twice)).toEqual(viewBoxOf(once));
  });
});

describe('strokeToFill', () => {
  it('widens a vertical segment into the rectangle the stroke covers', () => {
    expect(strokeToFill('M9 92L9 6', 6)).toBe('M6 6L12 6L12 92L6 92Z');
  });

  it('widens a horizontal segment the same way', () => {
    expect(strokeToFill('M4 10L20 10', 4)).toBe('M4 8L20 8L20 12L4 12Z');
  });

  it('emits one rectangle per segment of a multi-subpath polyline', () => {
    expect(strokeToFill('M0 0L0 10M6 0L6 10', 2))
      .toBe('M-1 0L1 0L1 10L-1 10ZM5 0L7 0L7 10L5 10Z');
  });

  it('gives up on a diagonal segment rather than mis-render it', () => {
    expect(strokeToFill('M0 0L10 10', 2)).toBe(null);
  });

  it('gives up on curves rather than mis-render them', () => {
    expect(strokeToFill('M0 0Q5 5 10 0', 2)).toBe(null);
  });
});

describe('fillPathsOf', () => {
  it('passes filled path data through unchanged', () => {
    expect(fillPathsOf('<svg><path d="M0 0Z"/><path fill="#000" d="M1 1Z"/></svg>'))
      .toEqual(['M0 0Z', 'M1 1Z']);
  });

  it('returns an empty array when there are no paths', () => {
    expect(fillPathsOf('<svg></svg>')).toEqual([]);
  });

  it('converts a stroked path into fillable rectangles', () => {
    expect(fillPathsOf('<svg><path stroke="#000000" stroke-width="6" d="M9 92L9 6" /></svg>'))
      .toEqual(['M6 6L12 6L12 92L6 92Z']);
  });

  it('keeps an uninterpretable stroked path rather than dropping it', () => {
    expect(fillPathsOf('<svg><path stroke="#000" stroke-width="2" d="M0 0L9 9"/></svg>'))
      .toEqual(['M0 0L9 9']);
  });

  it('encloses real area for every symbology', () => {
    for (const [id, text] of Object.entries(SAMPLES)) {
      const svg = encode({ s: id, t: text, ...defaultsOf(id) });
      const { w, h } = viewBoxOf(svg);
      const ink = fillPathsOf(svg).reduce((sum, d) => sum + filledArea(d), 0);
      expect(ink / (w * h), id).toBeGreaterThan(0.05);
    }
  });
});
