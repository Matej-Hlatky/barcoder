import { viewBoxOf, fillPathsOf } from '../svg.js';

const f = (n) => String(Math.round(n * 100) / 100);

export function parsePath(d) {
  const out = [];
  const token = /([MLQZmlqz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  let match;
  let cmd = null;
  let nums = [];

  const flush = () => {
    if (!cmd) { nums = []; return; }
    const need = cmd === 'Q' ? 4 : 2;
    for (let i = 0; i + need <= nums.length; i += need) {
      const c = i === 0 ? cmd : (cmd === 'M' ? 'L' : cmd);
      out.push([c, ...nums.slice(i, i + need)]);
    }
    nums = [];
  };

  while ((match = token.exec(d))) {
    if (match[1]) {
      flush();
      cmd = match[1].toUpperCase();
      if (cmd === 'Z') { out.push(['Z']); cmd = null; }
    } else {
      nums.push(parseFloat(match[2]));
    }
  }
  flush();
  return out;
}

export function quadToCubic(x0, y0, qx, qy, x, y) {
  return [
    x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0),
    x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y),
    x, y,
  ];
}

export function pathToPdfOps(d) {
  let cx = 0, cy = 0, sx = 0, sy = 0;
  const ops = [];
  for (const [c, ...a] of parsePath(d)) {
    if (c === 'M') { ops.push(`${f(a[0])} ${f(a[1])} m`); cx = sx = a[0]; cy = sy = a[1]; }
    else if (c === 'L') { ops.push(`${f(a[0])} ${f(a[1])} l`); cx = a[0]; cy = a[1]; }
    else if (c === 'Q') {
      const [c1x, c1y, c2x, c2y, ex, ey] = quadToCubic(cx, cy, a[0], a[1], a[2], a[3]);
      ops.push(`${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(ex)} ${f(ey)} c`);
      cx = ex; cy = ey;
    } else if (c === 'Z') { ops.push('h'); cx = sx; cy = sy; }
  }
  return ops.join('\n');
}

export function toPdf(svg, { margin = 20 } = {}) {
  const { w, h } = viewBoxOf(svg);
  const pw = w + margin * 2;
  const ph = h + margin * 2;

  const body = [
    '1 1 1 rg',
    `0 0 ${f(pw)} ${f(ph)} re`,
    'f',
    '0 0 0 rg',
    `1 0 0 -1 ${f(margin)} ${f(ph - margin)} cm`,
    ...fillPathsOf(svg).map((d) => `${pathToPdfOps(d)}\nf`),
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

export async function toBlob(svg) {
  const pdf = toPdf(svg);
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}
