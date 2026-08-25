import { describe, it, expect } from 'vitest';
import { parsePath, quadToCubic, pathToPdfOps, toPdf, toBlob } from '../src/export/pdf.js';
import { encode } from '../src/encoder.js';
import { defaultsOf } from '../src/symbologies.js';
import { viewBoxOf } from '../src/svg.js';
import { SAMPLES } from './helpers.js';

describe('parsePath', () => {
  it('parses a simple closed path', () => {
    expect(parsePath('M0 72L72 72L72 66Z'))
      .toEqual([['M', 0, 72], ['L', 72, 72], ['L', 72, 66], ['Z']]);
  });

  it('treats extra coordinate pairs after M as implicit linetos', () => {
    expect(parsePath('M1 2 3 4Z')).toEqual([['M', 1, 2], ['L', 3, 4], ['Z']]);
  });

  it('parses quadratic segments', () => {
    expect(parsePath('M0 0Q1 1 2 0Z')).toEqual([['M', 0, 0], ['Q', 1, 1, 2, 0], ['Z']]);
  });

  it('emits exactly one Z per close', () => {
    expect(parsePath('M0 0L1 1Z').filter((s) => s[0] === 'Z')).toHaveLength(1);
  });

  it('handles multiple subpaths', () => {
    expect(parsePath('M1 2L3 4Z M5 6L7 8Z'))
      .toEqual([['M', 1, 2], ['L', 3, 4], ['Z'], ['M', 5, 6], ['L', 7, 8], ['Z']]);
  });

  it('parses decimals and negatives', () => {
    expect(parsePath('M-1.5 2.25L0 0')).toEqual([['M', -1.5, 2.25], ['L', 0, 0]]);
  });
});

describe('quadToCubic', () => {
  it('lifts control points two thirds toward the quadratic control', () => {
    expect(quadToCubic(0, 0, 3, 3, 6, 0)).toEqual([2, 2, 4, 2, 6, 0]);
  });
});

describe('pathToPdfOps', () => {
  it('maps commands onto PDF operators', () => {
    expect(pathToPdfOps('M0 0L10 0Z').split('\n')).toEqual(['0 0 m', '10 0 l', 'h']);
  });

  it('emits a cubic operator for a quadratic segment', () => {
    expect(pathToPdfOps('M0 0Q3 3 6 0')).toContain(' c');
  });

  it('returns the current point to the subpath start after a close', () => {
    expect(pathToPdfOps('M5 5L9 9ZL1 1').split('\n')).toEqual(['5 5 m', '9 9 l', 'h', '1 1 l']);
  });
});

describe('toPdf', () => {
  const svg = () => encode({ s: 'qrcode', t: 'hello', ...defaultsOf('qrcode') });

  it('starts with a PDF header and ends with EOF', () => {
    const pdf = toPdf(svg());
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('sizes the MediaBox to the code plus twice the margin', () => {
    const { w, h } = viewBoxOf(svg());
    expect(toPdf(svg(), { margin: 20 })).toContain(`/MediaBox [0 0 ${w + 40} ${h + 40}]`);
  });

  it('writes xref offsets that match real byte positions', () => {
    const pdf = toPdf(svg());
    const xrefStart = Number(pdf.match(/startxref\n(\d+)/)[1]);
    expect(pdf.slice(xrefStart, xrefStart + 4)).toBe('xref');
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(4);
    offsets.forEach((offset, i) => {
      expect(pdf.slice(offset, offset + 7), `object ${i + 1}`).toBe(`${i + 1} 0 obj`);
    });
  });

  it('declares a stream Length matching the actual stream bytes', () => {
    const pdf = toPdf(svg());
    const declared = Number(pdf.match(/\/Length (\d+)/)[1]);
    const body = pdf.slice(pdf.indexOf('stream\n') + 7, pdf.indexOf('\nendstream'));
    expect(body.length).toBe(declared);
  });

  it('paints a white background before flipping to draw in black', () => {
    const pdf = toPdf(svg());
    expect(pdf.indexOf('1 1 1 rg')).toBeLessThan(pdf.indexOf('0 0 0 rg'));
    expect(pdf).toMatch(/1 0 0 -1 20 \d+(\.\d+)? cm/);
  });

  it('produces a valid document for every symbology', () => {
    for (const [id, text] of Object.entries(SAMPLES)) {
      const pdf = toPdf(encode({ s: id, t: text, ...defaultsOf(id) }));
      expect(pdf.startsWith('%PDF-1.4'), id).toBe(true);
      expect(pdf, id).toContain(' m\n');
      expect(pdf.trimEnd().endsWith('%%EOF'), id).toBe(true);
    }
  });

  it('draws closed subpaths, not zero-area lines, for every symbology', () => {
    for (const [id, text] of Object.entries(SAMPLES)) {
      const pdf = toPdf(encode({ s: id, t: text, ...defaultsOf(id) }));
      expect((pdf.match(/^h$/gm) || []).length, id).toBeGreaterThan(10);
    }
  });
});

describe('toBlob', () => {
  const svg = () => encode({ s: 'qrcode', t: 'hello', ...defaultsOf('qrcode') });

  it('writes the document byte for byte', async () => {
    const pdf = toPdf(svg());
    const blob = await toBlob(svg());
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(pdf.length);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const decoded = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    expect(decoded).toBe(pdf);
  });

  it('emits pure ASCII, the precondition the byte-wise blob conversion rests on', () => {
    // xref offsets are string indices. They stay honest only while one source
    // character is one byte, so nothing that embeds user text may reach the
    // document without switching the conversion away from charCodeAt & 0xff.
    for (const [id, text] of Object.entries({ ...SAMPLES, qrcode: 'héllo — ünïcode ✓' })) {
      const pdf = toPdf(encode({ s: id, t: text, ...defaultsOf(id) }));
      const offender = [...pdf].find((c) => c.charCodeAt(0) > 127);
      expect(offender, `${id} emitted a non-ASCII character`).toBeUndefined();
    }
  });
});
