import { normalize, viewBoxOf } from '../svg.js';

const MIN_EDGE = 1024;
const MAX_EDGE = 4096;

export function rasterScale({ w, h }, { min = MIN_EDGE, max = MAX_EDGE } = {}) {
  const longest = Math.max(w, h);
  const wanted = Math.ceil(min / longest);
  const allowed = Math.floor(max / longest);
  return Math.max(1, Math.min(wanted, Math.max(1, allowed)));
}

export function webpSupported() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

export function toBlob(svg, mime = 'image/png') {
  const box = viewBoxOf(svg);
  const factor = rasterScale(box);
  const source = normalize(svg);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(box.w * factor);
        canvas.height = Math.round(box.h * factor);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
          mime
        );
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not rasterize the barcode'));
    };
    image.src = url;
  });
}
