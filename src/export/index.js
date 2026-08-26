export const FORMATS = [
  { id: 'png', label: 'PNG', ext: 'png', load: async () => {
      const m = await import('./raster.js');
      return (svg) => m.toBlob(svg, 'image/png');
    } },
  { id: 'svg', label: 'SVG', ext: 'svg', load: async () => (await import('./svg.js')).toBlob },
  { id: 'xml', label: 'XML', ext: 'xml', load: async () => (await import('./vectordrawable.js')).toBlob },
  { id: 'pdf', label: 'PDF', ext: 'pdf', load: async () => (await import('./pdf.js')).toBlob },
];
