import { describe, it, expect } from 'vitest';
import { encode, stripBwipPrefix, toBwipOptions } from '../src/encoder.js';
import { defaultsOf } from '../src/symbologies.js';

describe('stripBwipPrefix', () => {
  it('strips the bwipp code prefix', () => {
    expect(stripBwipPrefix('bwipp.ean13badLength#6878: EAN-13 must be 12 or 13 digits'))
      .toBe('EAN-13 must be 12 or 13 digits');
    expect(stripBwipPrefix('bwipp.datamatrixTooMuchData#25674: The input data exceeds the symbol capacity'))
      .toBe('The input data exceeds the symbol capacity');
  });

  it('strips the bwip-js prefix', () => {
    expect(stripBwipPrefix('bwip-js: bar code text not specified.'))
      .toBe('bar code text not specified.');
  });

  it('leaves an unprefixed message alone', () => {
    expect(stripBwipPrefix('Something broke')).toBe('Something broke');
  });
});

describe('toBwipOptions', () => {
  it('expands margin into both padding options', () => {
    const o = toBwipOptions({ s: 'qrcode', t: 'x', ...defaultsOf('qrcode'), margin: 4 });
    expect(o.paddingwidth).toBe(4);
    expect(o.paddingheight).toBe(4);
    expect(o).not.toHaveProperty('margin');
  });

  it('passes the text through as text', () => {
    expect(toBwipOptions({ s: 'qrcode', t: 'hello', ...defaultsOf('qrcode') }).text).toBe('hello');
  });

  it('omits auto options entirely', () => {
    const o = toBwipOptions({ s: 'pdf417', t: 'x', ...defaultsOf('pdf417') });
    expect(o).not.toHaveProperty('columns');
    expect(o).not.toHaveProperty('eclevel');
  });

  it('never leaks the state keys s and t as options', () => {
    const o = toBwipOptions({ s: 'qrcode', t: 'x', ...defaultsOf('qrcode') });
    expect(o).not.toHaveProperty('s');
  });
});

describe('encode', () => {
  it('produces an SVG with a viewBox for every symbology', () => {
    const samples = {
      code128: 'ABC-123', code39: 'ABC123', ean13: '5901234123457', ean8: '96385074',
      upca: '012345678905', itf14: '0012345678901', qrcode: 'hello',
      datamatrix: 'hello', pdf417: 'hello', azteccode: 'hello',
    };
    for (const [id, text] of Object.entries(samples)) {
      const svg = encode({ s: id, t: text, ...defaultsOf(id) });
      expect(svg, id).toMatch(/^<svg viewBox="0 0 \d+ \d+"/);
      expect(svg, id).toContain('<path');
    }
  });

  it('throws a clean message for invalid input', () => {
    expect(() => encode({ s: 'ean13', t: '123', ...defaultsOf('ean13') }))
      .toThrow('EAN-13 must be 12 or 13 digits');
  });

  it('throws for an unknown symbology', () => {
    expect(() => encode({ s: 'nope', t: 'x' })).toThrow(/unknown symbology/i);
  });
});
