import { describe, it, expect } from 'vitest';
import { FORMATS } from '../src/export/index.js';

describe('FORMATS', () => {
  it('registers the four offered formats in order', () => {
    expect(FORMATS.map((f) => f.id)).toEqual(['png', 'svg', 'xml', 'pdf']);
  });

  it('gives every format a label, an extension, and a loader', () => {
    for (const f of FORMATS) {
      expect(typeof f.label).toBe('string');
      expect(f.ext).toMatch(/^[a-z]+$/);
      expect(typeof f.load).toBe('function');
    }
  });

  it('loads a working exporter function for the non-raster formats', async () => {
    for (const id of ['svg', 'xml', 'pdf']) {
      const exporter = await FORMATS.find((f) => f.id === id).load();
      expect(typeof exporter, id).toBe('function');
    }
  });
});
