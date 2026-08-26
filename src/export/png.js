const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // The CRC covers the type and the data, but not the length.
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function header(width, height) {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 1; // bit depth
  data[9] = 0; // colour type: greyscale
  return data;
}

async function deflate(bytes) {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export function bilevelSupported() {
  return typeof CompressionStream === 'function';
}

export function packBilevel(rgba, width, height) {
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array((rowBytes + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const row = y * (rowBytes + 1);
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      // A transparent pixel has no colour to read, and taking its channels at
      // face value would paint it black across anything the SVG left uncovered.
      const luma = rgba[i + 3] < 128
        ? 255
        : (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
      if (luma >= 128) out[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  return out;
}

export async function encodeBilevelPng(packed, width, height) {
  const parts = [
    SIGNATURE,
    chunk('IHDR', header(width, height)),
    chunk('IDAT', await deflate(packed)),
    chunk('IEND', new Uint8Array(0)),
  ];

  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
