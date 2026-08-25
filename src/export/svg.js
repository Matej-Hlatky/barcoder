import { normalize } from '../svg.js';

export async function toBlob(svg) {
  return new Blob([normalize(svg)], { type: 'image/svg+xml;charset=utf-8' });
}
