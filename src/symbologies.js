export const DEFAULT_SYMBOLOGY = 'qrcode';
export const GROUP_DEFAULTS = { linear: 'code128', '2d': 'qrcode' };

export const SHARED_OPTIONS = [
  { k: 'scale', type: 'number', def: 3, min: 1, max: 10, label: 'Size' },
  { k: 'margin', type: 'number', def: 2, min: 0, max: 20, label: 'Margin', bwip: ['paddingwidth', 'paddingheight'] },
];

const barHeight = { k: 'height', type: 'number', def: 10, min: 5, max: 50, label: 'Bar height' };
const showText = { k: 'includetext', type: 'bool', def: true, label: 'Show text' };
const guard = { k: 'guardwhitespace', type: 'bool', def: true, label: 'Guard whitespace' };

export const SYMBOLOGIES = [
  { id: 'code128', label: 'Code 128', group: 'linear', bcid: 'code128', options: [barHeight, showText] },
  { id: 'code39', label: 'Code 39', group: 'linear', bcid: 'code39',
    options: [barHeight, showText, { k: 'includecheck', type: 'bool', def: false, label: 'Add check digit' }] },
  { id: 'ean13', label: 'EAN-13', group: 'linear', bcid: 'ean13', options: [barHeight, showText, guard] },
  { id: 'ean8', label: 'EAN-8', group: 'linear', bcid: 'ean8', options: [barHeight, showText, guard] },
  { id: 'upca', label: 'UPC-A', group: 'linear', bcid: 'upca', options: [barHeight, showText, guard] },
  { id: 'itf14', label: 'ITF-14', group: 'linear', bcid: 'itf14',
    options: [barHeight, showText, { k: 'borderwidth', type: 'number', def: 4, min: 0, max: 10, label: 'Bearer bar width' }] },
  { id: 'qrcode', label: 'QR Code', group: '2d', bcid: 'qrcode',
    options: [{ k: 'eclevel', type: 'enum', def: 'M', label: 'Error correction',
      values: [{ value: 'L', label: 'L — 7%' }, { value: 'M', label: 'M — 15%' },
               { value: 'Q', label: 'Q — 25%' }, { value: 'H', label: 'H — 30%' }] }] },
  { id: 'datamatrix', label: 'DataMatrix', group: '2d', bcid: 'datamatrix',
    options: [{ k: 'format', type: 'enum', def: 'square', label: 'Shape',
      values: [{ value: 'square', label: 'Square' }, { value: 'rectangle', label: 'Rectangle' }] }] },
  { id: 'pdf417', label: 'PDF417', group: '2d', bcid: 'pdf417',
    options: [
      { k: 'columns', type: 'number', def: null, min: 1, max: 30, label: 'Columns' },
      { k: 'eclevel', type: 'number', def: null, min: 0, max: 8, label: 'Error correction' },
      { k: 'compact', type: 'bool', def: false, label: 'Compact' },
    ] },
  { id: 'azteccode', label: 'Aztec', group: '2d', bcid: 'azteccode',
    options: [{ k: 'eclevel', type: 'number', def: 23, min: 5, max: 95, label: 'Error correction %' }] },
];

export function byId(id) {
  return SYMBOLOGIES.find((s) => s.id === id);
}

export function optionsOf(id) {
  const s = byId(id);
  return s ? [...SHARED_OPTIONS, ...s.options] : [...SHARED_OPTIONS];
}

// Clamps a number into an option's range. Tolerates a schema entry that leaves
// min or max open, so every clamp site behaves the same way.
export function clamp(option, value) {
  const low = Number.isFinite(option.min) ? Math.max(option.min, value) : value;
  return Number.isFinite(option.max) ? Math.min(option.max, low) : low;
}

export function defaultsOf(id) {
  const out = {};
  for (const o of optionsOf(id)) if (o.def !== null) out[o.k] = o.def;
  return out;
}
