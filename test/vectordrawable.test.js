import { describe, it, expect } from 'vitest';
import { toVectorDrawable } from '../src/export/vectordrawable.js';
import { encode } from '../src/encoder.js';
import { defaultsOf } from '../src/symbologies.js';
import { viewBoxOf, fillPathsOf } from '../src/svg.js';
import { SAMPLES } from './helpers.js';

const code = (id, t) => encode({ s: id, t, ...defaultsOf(id) });

describe('toVectorDrawable', () => {
  it('declares the android namespace and a vector root', () => {
    const xml = toVectorDrawable(code('qrcode', 'hello'));
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('xmlns:android="http://schemas.android.com/apk/res/android"');
    expect(xml.trimEnd().endsWith('</vector>')).toBe(true);
  });

  it('maps the viewBox onto viewport and dp dimensions', () => {
    const svg = code('code128', 'ABC-123');
    const { w, h } = viewBoxOf(svg);
    const xml = toVectorDrawable(svg);
    expect(xml).toContain(`android:width="${w}dp"`);
    expect(xml).toContain(`android:height="${h}dp"`);
    expect(xml).toContain(`android:viewportWidth="${w}"`);
    expect(xml).toContain(`android:viewportHeight="${h}"`);
  });

  it('emits one white background path plus one path per source path', () => {
    const svg = code('ean13', '5901234123457');
    const xml = toVectorDrawable(svg);
    expect((xml.match(/<path/g) || []).length).toBe(fillPathsOf(svg).length + 1);
    expect(xml).toContain('android:fillColor="#FFFFFFFF"');
    expect(xml).toContain('android:fillColor="#FF000000"');
  });

  it('puts the white background first so the code draws on top', () => {
    const xml = toVectorDrawable(code('qrcode', 'hello'));
    expect(xml.indexOf('#FFFFFFFF')).toBeLessThan(xml.indexOf('#FF000000'));
  });

  it('copies fillable path data verbatim', () => {
    const svg = code('datamatrix', 'hello');
    const xml = toVectorDrawable(svg);
    for (const d of fillPathsOf(svg)) expect(xml).toContain(`android:pathData="${d}"`);
  });

  it('gives linear bars closed, fillable outlines instead of stroked lines', () => {
    const xml = toVectorDrawable(code('code128', 'ABC-123'));
    expect(xml).not.toContain('stroke');
    const bars = [...xml.matchAll(/android:fillColor="#FF000000" android:pathData="([^"]+)"/g)];
    expect(bars.length).toBeGreaterThan(0);
    for (const [, d] of bars) expect(d).toContain('Z');
    const closed = bars.reduce((n, [, d]) => n + (d.match(/Z/g) || []).length, 0);
    expect(closed).toBeGreaterThan(30);
  });

  it('produces well-formed XML for every symbology', () => {
    for (const [id, text] of Object.entries(SAMPLES)) {
      const xml = toVectorDrawable(code(id, text));
      // Well-formedness proxy: tags balance and no attribute value contains a raw quote.
      expect((xml.match(/<path/g) || []).length, id).toBe((xml.match(/\/>/g) || []).length);
      expect(xml.match(/android:pathData="[^"]*"/g).length, id).toBe((xml.match(/<path/g) || []).length);
    }
  });
});
