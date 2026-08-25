import { describe, it, expect } from 'vitest';
import { defaultState, fromQuery, toQuery, setSymbology, groupOf } from '../src/state.js';
import { SYMBOLOGIES, defaultsOf } from '../src/symbologies.js';

describe('defaultState', () => {
  it('opens on QR with empty text and schema defaults', () => {
    expect(defaultState()).toEqual({ s: 'qrcode', t: '', scale: 3, margin: 2, eclevel: 'M' });
  });
});

describe('toQuery', () => {
  it('omits the symbology when it is the default', () => {
    expect(toQuery({ ...defaultState(), t: 'hello' })).toBe('t=hello');
  });

  it('omits every option left at its default', () => {
    expect(toQuery({ s: 'code128', t: 'AB', ...defaultsOf('code128') })).toBe('s=code128&t=AB');
  });

  it('includes options that differ from their default', () => {
    expect(toQuery({ ...defaultState(), t: 'x', eclevel: 'H' })).toBe('t=x&eclevel=H');
  });

  it('serializes booleans as 1 and 0', () => {
    expect(toQuery({ s: 'code128', t: 'x', ...defaultsOf('code128'), includetext: false }))
      .toContain('includetext=0');
  });

  it('never serializes the group', () => {
    expect(toQuery({ ...defaultState(), t: 'x' })).not.toContain('g=');
  });

  it('represents auto options by absence', () => {
    expect(toQuery({ s: 'pdf417', t: 'x', ...defaultsOf('pdf417') })).toBe('s=pdf417&t=x');
  });

  it('only ever serializes options the active symbology defines', () => {
    // A stray key from another symbology (eclevel belongs to QR, PDF417 and Aztec)
    // must not leak into a Code 128 URL.
    expect(toQuery({ s: 'code128', t: 'x', ...defaultsOf('code128'), eclevel: 'H' }))
      .toBe('s=code128&t=x');
  });
});

describe('fromQuery', () => {
  it('returns the default state for an empty query', () => {
    expect(fromQuery('')).toEqual(defaultState());
  });

  it('ignores unknown parameters', () => {
    expect(fromQuery('?t=hi&bogus=1&utm_source=x')).toEqual({ ...defaultState(), t: 'hi' });
  });

  it('falls back to the default for an unknown symbology', () => {
    expect(fromQuery('?s=nope').s).toBe('qrcode');
  });

  it('clamps out-of-range numbers to the schema bounds', () => {
    expect(fromQuery('?scale=999').scale).toBe(10);
    expect(fromQuery('?scale=-4').scale).toBe(1);
  });

  it('falls back to the default for a non-numeric number', () => {
    expect(fromQuery('?scale=abc').scale).toBe(3);
  });

  it('falls back to the default for an out-of-set enum value', () => {
    expect(fromQuery('?eclevel=Z').eclevel).toBe('M');
  });

  it('parses booleans from 1 and 0', () => {
    expect(fromQuery('?s=code128&includetext=0').includetext).toBe(false);
    expect(fromQuery('?s=code128&includetext=1').includetext).toBe(true);
  });

  it('drops options the selected symbology does not define', () => {
    expect(fromQuery('?s=code128&eclevel=H')).not.toHaveProperty('eclevel');
  });

  it('decodes percent-encoded text', () => {
    expect(fromQuery('?t=a%20b%26c').t).toBe('a b&c');
  });
});

describe('round trip', () => {
  it('survives toQuery -> fromQuery for every symbology at defaults', () => {
    for (const sym of SYMBOLOGIES) {
      const s = { s: sym.id, t: 'TEST123', ...defaultsOf(sym.id) };
      expect(fromQuery('?' + toQuery(s)), sym.id).toEqual(s);
    }
  });

  it('survives a round trip with non-default values', () => {
    const s = { s: 'code128', t: 'A B', scale: 7, margin: 0, height: 25, includetext: false };
    expect(fromQuery('?' + toQuery(s))).toEqual(s);
  });
});

describe('setSymbology', () => {
  it('keeps text and shared options, drops foreign options', () => {
    const before = { s: 'qrcode', t: 'hello', scale: 7, margin: 5, eclevel: 'H' };
    const after = setSymbology(before, 'code128');
    expect(after).toEqual({ s: 'code128', t: 'hello', scale: 7, margin: 5, height: 10, includetext: true });
  });

  it('starts newly available options at their defaults', () => {
    expect(setSymbology({ s: 'qrcode', t: '', scale: 3, margin: 2, eclevel: 'H' }, 'code39').includecheck).toBe(false);
  });

  it('ignores an unknown target symbology', () => {
    const s = defaultState();
    expect(setSymbology(s, 'nope')).toEqual(s);
  });

  it('drops an enum value the target defines as an auto number', () => {
    const after = setSymbology({ s: 'qrcode', t: 'x', scale: 3, margin: 2, eclevel: 'H' }, 'pdf417');
    expect(after).not.toHaveProperty('eclevel');
  });

  it('clamps a carried number into the target range', () => {
    const after = setSymbology({ s: 'pdf417', t: 'x', scale: 3, margin: 2, eclevel: 2 }, 'azteccode');
    expect(after.eclevel).toBe(5);
  });

  it('keeps a carried value the target schema accepts', () => {
    const after = setSymbology({ s: 'code128', t: 'x', scale: 3, margin: 2, height: 25, includetext: false }, 'code39');
    expect(after.height).toBe(25);
    expect(after.includetext).toBe(false);
  });

  it('still round-trips through the URL after switching', () => {
    const after = setSymbology({ s: 'qrcode', t: 'x', scale: 3, margin: 2, eclevel: 'H' }, 'azteccode');
    expect(fromQuery('?' + toQuery(after))).toEqual(after);
  });
});

describe('groupOf', () => {
  it('derives the group from the symbology', () => {
    expect(groupOf({ s: 'qrcode' })).toBe('2d');
    expect(groupOf({ s: 'code128' })).toBe('linear');
  });
});
