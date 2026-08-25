import { describe, it, expect } from 'vitest';
import {
  SYMBOLOGIES, SHARED_OPTIONS, DEFAULT_SYMBOLOGY, GROUP_DEFAULTS,
  byId, optionsOf, defaultsOf, clamp,
} from '../src/symbologies.js';

describe('symbologies', () => {
  it('defines exactly the ten specified symbologies', () => {
    expect(SYMBOLOGIES.map((s) => s.id).sort()).toEqual([
      'azteccode', 'code128', 'code39', 'datamatrix', 'ean13', 'ean8',
      'itf14', 'pdf417', 'qrcode', 'upca',
    ]);
  });

  it('gives every symbology a group of linear or 2d', () => {
    for (const s of SYMBOLOGIES) expect(['linear', '2d']).toContain(s.group);
  });

  it('defaults to QR, and to Code 128 for the linear group', () => {
    expect(DEFAULT_SYMBOLOGY).toBe('qrcode');
    expect(GROUP_DEFAULTS).toEqual({ linear: 'code128', '2d': 'qrcode' });
  });

  it('keeps every numeric default inside its own min/max', () => {
    for (const s of SYMBOLOGIES) {
      for (const o of optionsOf(s.id)) {
        if (o.type === 'number' && o.def !== null) {
          expect(o.def, `${s.id}.${o.k}`).toBeGreaterThanOrEqual(o.min);
          expect(o.def, `${s.id}.${o.k}`).toBeLessThanOrEqual(o.max);
        }
      }
    }
  });

  it('keeps every enum default inside its own values', () => {
    for (const s of SYMBOLOGIES) {
      for (const o of optionsOf(s.id)) {
        if (o.type === 'enum' && o.def !== null) {
          expect(o.values.map((v) => v.value), `${s.id}.${o.k}`).toContain(o.def);
        }
      }
    }
  });

  it('gives every option a unique key per symbology', () => {
    for (const s of SYMBOLOGIES) {
      const keys = optionsOf(s.id).map((o) => o.k);
      expect(new Set(keys).size, s.id).toBe(keys.length);
    }
  });

  it('applies scale and margin to every symbology', () => {
    expect(SHARED_OPTIONS.map((o) => o.k).sort()).toEqual(['margin', 'scale']);
    for (const s of SYMBOLOGIES) {
      expect(optionsOf(s.id).map((o) => o.k)).toEqual(expect.arrayContaining(['scale', 'margin']));
    }
  });

  it('maps margin onto both bwip padding options', () => {
    const margin = SHARED_OPTIONS.find((o) => o.k === 'margin');
    expect(margin.bwip).toEqual(['paddingwidth', 'paddingheight']);
  });

  it('omits null (auto) defaults from defaultsOf', () => {
    expect(defaultsOf('pdf417')).not.toHaveProperty('columns');
    expect(defaultsOf('qrcode')).toEqual({ scale: 3, margin: 2, eclevel: 'M' });
  });

  it('returns undefined for an unknown id', () => {
    expect(byId('nope')).toBeUndefined();
  });
});

describe('clamp', () => {
  it('holds a value inside the option range', () => {
    expect(clamp({ min: 1, max: 10 }, 5)).toBe(5);
    expect(clamp({ min: 1, max: 10 }, 0)).toBe(1);
    expect(clamp({ min: 1, max: 10 }, 99)).toBe(10);
  });

  it('leaves an open end open instead of producing NaN', () => {
    expect(clamp({ max: 10 }, -50)).toBe(-50);
    expect(clamp({ min: 1 }, 99)).toBe(99);
    expect(clamp({}, 7)).toBe(7);
  });
});
