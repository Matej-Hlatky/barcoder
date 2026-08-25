export function viewBoxOf(svg) {
  const match = svg.match(/viewBox="([\d.\s-]+)"/);
  if (!match) throw new Error('SVG has no viewBox');
  const [x, y, w, h] = match[1].trim().split(/\s+/).map(Number);
  return { x, y, w, h };
}

function attrOf(attrs, name) {
  const match = attrs.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

// Splits an M/L-only path into subpaths of points, or returns null for anything
// else — better to fall back than to mis-render a path we cannot read.
function polylinesOf(d) {
  const out = [];
  let current = null;
  let cmd = null;
  let nums = [];

  const flush = () => {
    if (!cmd) { nums = []; return; }
    for (let i = 0; i + 2 <= nums.length; i += 2) {
      const point = [nums[i], nums[i + 1]];
      if (cmd === 'M' && i === 0) { current = [point]; out.push(current); }
      else if (current) current.push(point);
    }
    nums = [];
  };

  const token = /([A-Za-z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let match;
  while ((match = token.exec(d))) {
    if (match[1]) {
      flush();
      cmd = match[1].toUpperCase();
      if (cmd !== 'M' && cmd !== 'L') return null;
    } else {
      nums.push(parseFloat(match[2]));
    }
  }
  flush();
  return out;
}

const n = (v) => String(Math.round(v * 1000) / 1000);

const rect = (x0, y0, x1, y1) =>
  `M${n(x0)} ${n(y0)}L${n(x1)} ${n(y0)}L${n(x1)} ${n(y1)}L${n(x0)} ${n(y1)}Z`;

// bwip-js draws linear bars as zero-area stroked polylines, which a fill-only
// exporter paints as nothing. Widen each axis-aligned segment into the rectangle
// a butt-capped stroke covers: half the stroke width to either side.
export function strokeToFill(d, width) {
  const lines = polylinesOf(d);
  if (!lines) return null;
  const half = width / 2;
  const rects = [];
  for (const points of lines) {
    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      if (x0 === x1) {
        rects.push(y0 < y1 ? rect(x0 - half, y0, x0 + half, y1) : rect(x0 - half, y1, x0 + half, y0));
      } else if (y0 === y1) {
        rects.push(x0 < x1 ? rect(x0, y0 - half, x1, y0 + half) : rect(x1, y0 - half, x0, y0 + half));
      } else {
        return null;
      }
    }
  }
  return rects.join('');
}

// Path data ready to fill. The vector exporters must use this rather than the
// raw `d` attributes, or stroked bars come out blank.
export function fillPathsOf(svg) {
  const out = [];
  for (const [, attrs] of svg.matchAll(/<path\b([^>]*?)\/?>/g)) {
    const d = attrOf(attrs, 'd');
    if (!d) continue;
    const width = Number(attrOf(attrs, 'stroke-width'));
    if (attrOf(attrs, 'stroke') && Number.isFinite(width) && width > 0) {
      out.push(strokeToFill(d, width) ?? d);
    } else {
      out.push(d);
    }
  }
  return out;
}

export function normalize(svg) {
  const { w, h } = viewBoxOf(svg);
  const sized = /<svg[^>]*\swidth="/.test(svg)
    ? svg
    : svg.replace(/<svg([^>]*)>/, `<svg$1 width="${w}" height="${h}">`);
  return sized.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/>`);
}
