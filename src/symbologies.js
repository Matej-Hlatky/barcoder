export const DEFAULT_SYMBOLOGY = 'qrcode';
export const GROUP_DEFAULTS = { linear: 'code128', '2d': 'qrcode' };

export const SHARED_OPTIONS = [
  { k: 'scale', type: 'number', def: 3, min: 1, max: 10, label: 'Size',
    info: 'Pixel size of the narrowest bar or module. Larger values give a bigger, sharper image without changing what the code says.' },
  { k: 'margin', type: 'number', def: 2, min: 0, max: 20, label: 'Margin', bwip: ['paddingwidth', 'paddingheight'],
    info: 'Blank quiet zone around the code. Scanners need clear space to find where the symbol starts and ends, so avoid going below 2.' },
];

const barHeight = { k: 'height', type: 'number', def: 10, min: 5, max: 50, label: 'Bar height',
  info: 'How tall the bars are, in millimetres at 1x size. Taller bars are easier to scan at an angle or with a shaky hand.' };
const showText = { k: 'includetext', type: 'bool', def: true, label: 'Show text',
  info: 'Prints the value in readable digits under the bars, so somebody can type it in by hand when a scan fails.' };
const guard = { k: 'guardwhitespace', type: 'bool', def: true, label: 'Guard whitespace',
  info: 'Adds the < and > marks that show where the quiet zone ends, so artwork is not trimmed too close to the bars.' };

export const SYMBOLOGIES = [
  { id: 'code128', label: 'Code 128', group: 'linear', bcid: 'code128', options: [barHeight, showText] },
  { id: 'code39', label: 'Code 39', group: 'linear', bcid: 'code39',
    options: [barHeight, showText, { k: 'includecheck', type: 'bool', def: false, label: 'Add check digit',
      info: 'Appends a modulo-43 character the scanner recalculates and compares, so a misread is rejected instead of accepted.' }] },
  { id: 'ean13', label: 'EAN-13', group: 'linear', bcid: 'ean13', options: [barHeight, showText, guard] },
  { id: 'ean8', label: 'EAN-8', group: 'linear', bcid: 'ean8', options: [barHeight, showText, guard] },
  { id: 'upca', label: 'UPC-A', group: 'linear', bcid: 'upca', options: [barHeight, showText, guard] },
  { id: 'itf14', label: 'ITF-14', group: 'linear', bcid: 'itf14',
    options: [barHeight, showText, { k: 'borderwidth', type: 'number', def: 4, min: 0, max: 10, label: 'Bearer bar width',
      info: 'Thickness of the frame around the code. On rough carton printing it stops a partial scan being read as a valid shorter code.' }] },
  { id: 'qrcode', label: 'QR Code', group: '2d', bcid: 'qrcode',
    options: [{ k: 'eclevel', type: 'enum', def: 'M', label: 'Error correction',
      info: 'How much of the code can be dirty, torn or covered and still read. Higher levels survive more damage but pack the modules tighter.',
      values: [{ value: 'L', label: 'L — 7%' }, { value: 'M', label: 'M — 15%' },
               { value: 'Q', label: 'Q — 25%' }, { value: 'H', label: 'H — 30%' }] }] },
  { id: 'datamatrix', label: 'DataMatrix', group: '2d', bcid: 'datamatrix',
    options: [{ k: 'format', type: 'enum', def: 'square', label: 'Shape',
      info: 'Square suits most labels. Rectangle fits narrow spots such as cable flags and component tape.',
      values: [{ value: 'square', label: 'Square' }, { value: 'rectangle', label: 'Rectangle' }] }] },
  { id: 'pdf417', label: 'PDF417', group: '2d', bcid: 'pdf417',
    options: [
      { k: 'columns', type: 'number', def: null, min: 1, max: 30, label: 'Columns',
        info: 'How many data columns wide the symbol is. Leave it on Auto unless the code has to fit a label of a fixed width.' },
      { k: 'eclevel', type: 'number', def: null, min: 0, max: 8, label: 'Error correction',
        info: 'Recovery strength from 0 to 8, each step roughly doubling the repair data. Auto picks a level to suit how much text you encoded.' },
      { k: 'compact', type: 'bool', def: false, label: 'Compact',
        info: 'Drops the right-hand row markers to save width. Only use it where you know the scanner reads Compact PDF417.' },
    ] },
  { id: 'azteccode', label: 'Aztec', group: '2d', bcid: 'azteccode',
    options: [{ k: 'eclevel', type: 'number', def: 23, min: 5, max: 95, label: 'Error correction %',
      info: 'Share of the symbol given over to repair data. The 23% default is the usual choice; raise it for labels that get scuffed.' }] },
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
