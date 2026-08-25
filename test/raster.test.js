import { describe, it, expect } from 'vitest';
import { rasterScale } from '../src/export/raster.js';

describe('rasterScale', () => {
  it('returns an integer factor', () => {
    expect(Number.isInteger(rasterScale({ w: 168, h: 168 }))).toBe(true);
  });

  it('scales the longest edge to at least the minimum', () => {
    expect(rasterScale({ w: 168, h: 168 }) * 168).toBeGreaterThanOrEqual(1024);
  });

  it('never returns less than 1', () => {
    expect(rasterScale({ w: 4000, h: 4000 })).toBe(1);
  });

  it('keeps the result under the maximum edge', () => {
    expect(rasterScale({ w: 3, h: 3 }) * 3).toBeLessThanOrEqual(4096);
  });

  it('drives the factor from the longest edge, not the shortest', () => {
    expect(rasterScale({ w: 1000, h: 10 })).toBe(rasterScale({ w: 1000, h: 1000 }));
  });
});
