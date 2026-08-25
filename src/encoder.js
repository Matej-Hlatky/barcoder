import {
  code128, code39, ean13, ean8, upca, itf14,
  qrcode, datamatrix, pdf417, azteccode, drawingSVG,
} from '@bwip-js/browser';
import { byId, optionsOf } from './symbologies.js';

const RENDERERS = { code128, code39, ean13, ean8, upca, itf14, qrcode, datamatrix, pdf417, azteccode };

export function stripBwipPrefix(message) {
  return String(message).replace(/^bwipp?[.\-][\w#]*:?\s*/, '');
}

export function toBwipOptions(state) {
  const options = { text: state.t };
  for (const option of optionsOf(state.s)) {
    const value = state[option.k];
    if (value === undefined || value === null) continue;
    for (const name of option.bwip ?? [option.k]) options[name] = value;
  }
  return options;
}

export function encode(state) {
  const symbology = byId(state.s);
  if (!symbology) throw new Error(`Unknown symbology: ${state.s}`);
  const render = RENDERERS[symbology.bcid];
  if (!render) throw new Error(`Unknown symbology: ${state.s}`);
  try {
    return render(toBwipOptions(state), drawingSVG());
  } catch (error) {
    throw new Error(stripBwipPrefix(error && error.message ? error.message : error));
  }
}
