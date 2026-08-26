import { describe, it, expect } from 'vitest';
import { crc32, inflateSync } from 'node:zlib';
import { packBilevel, encodeBilevelPng, bilevelSupported } from '../src/export/png.js';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// One RGBA pixel per entry: 0 = black, 255 = white, null = fully transparent.
function rgba(pixels) {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((value, i) => {
    const opaque = value !== null;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = opaque ? value : 0;
    out[i * 4 + 3] = opaque ? 255 : 0;
  });
  return out;
}

const bits = (byte) => byte.toString(2).padStart(8, '0');

/** Walks the chunk list so a test can assert on one chunk without hand-counting offsets. */
function chunksOf(png) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out = [];
  let at = 8;
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({
      type,
      data: png.subarray(at + 8, at + 8 + length),
      declaredCrc: view.getUint32(at + 8 + length),
      // The CRC covers the type and the data, but not the length.
      actualCrc: crc32(Buffer.from(png.subarray(at + 4, at + 8 + length))),
    });
    at += 12 + length;
  }
  return out;
}

describe('packBilevel', () => {
  it('packs eight pixels into one byte, most significant bit first', () => {
    const packed = packBilevel(rgba([255, 0, 255, 0, 255, 0, 255, 0]), 8, 1);
    expect(packed).toHaveLength(2); // one filter byte + one data byte
    expect(bits(packed[1])).toBe('10101010');
  });

  it('writes a zero filter byte at the start of every scanline', () => {
    const packed = packBilevel(rgba([0, 0, 0, 0]), 2, 2);
    expect([...packed]).toEqual([0, 0, 0, 0]); // 2 rows x (filter + 1 byte)
  });

  it('pads a scanline to whole bytes without spilling into the next row', () => {
    // 12px wide needs 2 bytes per row; the last 4 bits are padding.
    const row = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255];
    const packed = packBilevel(rgba([...row, ...row.map(() => 0)]), 12, 2);
    expect(packed).toHaveLength(6); // 2 rows x (1 filter + 2 data)
    expect(bits(packed[1])).toBe('11111111');
    expect(bits(packed[2])).toBe('11110000'); // 4 white pixels, then padding
    expect(packed[3]).toBe(0); // second row's filter byte
    expect(packed[4]).toBe(0);
  });

  it('thresholds mid grey at 128 so antialiased edges resolve either way', () => {
    const packed = packBilevel(rgba([127, 128, 0, 255, 0, 0, 0, 0]), 8, 1);
    expect(bits(packed[1])).toBe('01010000');
  });

  it('treats a transparent pixel as white rather than black', () => {
    // Reading only the colour channels would make transparent pixels black,
    // smearing ink across anything the SVG left uncovered.
    const packed = packBilevel(rgba([null, null, null, null, null, null, null, null]), 8, 1);
    expect(bits(packed[1])).toBe('11111111');
  });
});

describe('encodeBilevelPng', () => {
  const WIDTH = 16;
  const HEIGHT = 4;
  const packed = packBilevel(
    rgba(Array.from({ length: WIDTH * HEIGHT }, (_, i) => (i % 3 ? 255 : 0))),
    WIDTH,
    HEIGHT
  );

  it('starts with the PNG signature', async () => {
    const png = await encodeBilevelPng(packed, WIDTH, HEIGHT);
    expect([...png.subarray(0, 8)]).toEqual(SIGNATURE);
  });

  it('emits IHDR, IDAT and IEND in that order and nothing else', async () => {
    const png = await encodeBilevelPng(packed, WIDTH, HEIGHT);
    expect(chunksOf(png).map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
  });

  it('declares one-bit greyscale, uninterlaced, at the given size', async () => {
    const png = await encodeBilevelPng(packed, WIDTH, HEIGHT);
    const [ihdr] = chunksOf(png);
    const header = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
    expect(ihdr.data).toHaveLength(13);
    expect(header.getUint32(0)).toBe(WIDTH);
    expect(header.getUint32(4)).toBe(HEIGHT);
    expect(ihdr.data[8]).toBe(1); // bit depth: the whole point of this module
    expect(ihdr.data[9]).toBe(0); // colour type 0: greyscale, no palette, no alpha
    expect(ihdr.data[10]).toBe(0); // compression: deflate
    expect(ihdr.data[11]).toBe(0); // filter method: adaptive
    expect(ihdr.data[12]).toBe(0); // no interlace
  });

  it('writes a CRC every chunk that Node computes the same way', async () => {
    const png = await encodeBilevelPng(packed, WIDTH, HEIGHT);
    for (const chunk of chunksOf(png)) {
      expect(chunk.declaredCrc, chunk.type).toBe(chunk.actualCrc);
    }
  });

  it('stores the scanlines as zlib data that inflates back byte for byte', async () => {
    const png = await encodeBilevelPng(packed, WIDTH, HEIGHT);
    const idat = chunksOf(png).find((c) => c.type === 'IDAT');
    expect(new Uint8Array(inflateSync(Buffer.from(idat.data)))).toEqual(packed);
  });

  it('ends with an empty IEND chunk', async () => {
    const png = await encodeBilevelPng(packed, WIDTH, HEIGHT);
    const iend = chunksOf(png).at(-1);
    expect(iend.type).toBe('IEND');
    expect(iend.data).toHaveLength(0);
  });

  it('actually compresses: a large blank image stays tiny', async () => {
    const blank = packBilevel(rgba(Array(1000 * 1000).fill(255)), 1000, 1000);
    expect(blank.length).toBeGreaterThan(125000); // ~1 bit per pixel, uncompressed
    const png = await encodeBilevelPng(blank, 1000, 1000);
    expect(png.length).toBeLessThan(2000);
  });
});

describe('bilevelSupported', () => {
  it('is true where CompressionStream exists', () => {
    expect(bilevelSupported()).toBe(typeof CompressionStream === 'function');
  });
});
