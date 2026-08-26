export function filename(symbologyId, text, ext) {
  // Case is preserved: the payload is often a SKU or a code where the capitals
  // carry meaning, and every platform Barcoder targets has a case-aware
  // filesystem for the name it is handed.
  const slug = String(text)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return slug ? `${slug}-${symbologyId}.${ext}` : `${symbologyId}.${ext}`;
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
