// One valid sample per symbology, shared by the export tests.
export const SAMPLES = {
  code128: 'ABC-123', code39: 'ABC123', ean13: '5901234123457', ean8: '96385074',
  upca: '012345678905', itf14: '0012345678901', qrcode: 'hello',
  datamatrix: 'hello', pdf417: 'hello', azteccode: 'hello',
};

// Total absolute area enclosed by an M/L/Q/Z path, by the shoelace formula.
// Quadratic control points are treated as vertices — close enough to tell
// "this path encloses ink" from "this path is a zero-area line".
export function filledArea(d) {
  const token = /([MLQZmlqz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let total = 0;
  let points = [];
  let cmd = null;
  let nums = [];

  const shoelace = () => {
    let sum = 0;
    for (let i = 0; i < points.length; i += 1) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      sum += x0 * y1 - x1 * y0;
    }
    total += Math.abs(sum) / 2;
    points = [];
  };

  const flush = () => {
    if (!cmd) { nums = []; return; }
    for (let i = 0; i + 2 <= nums.length; i += 2) {
      if (cmd === 'M' && i === 0) shoelace();
      points.push([nums[i], nums[i + 1]]);
    }
    nums = [];
  };

  let match;
  while ((match = token.exec(d))) {
    if (match[1]) {
      flush();
      cmd = match[1].toUpperCase();
      if (cmd === 'Z') { shoelace(); cmd = null; }
    } else {
      nums.push(parseFloat(match[2]));
    }
  }
  flush();
  shoelace();
  return total;
}
