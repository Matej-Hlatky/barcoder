import { viewBoxOf, fillPathsOf } from '../svg.js';

export function toVectorDrawable(svg) {
  const { w, h } = viewBoxOf(svg);
  const paths = [
    `    <path android:fillColor="#FFFFFFFF" android:pathData="M0,0 L${w},0 L${w},${h} L0,${h} Z"/>`,
    ...fillPathsOf(svg).map((d) => `    <path android:fillColor="#FF000000" android:pathData="${d}"/>`),
  ].join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${w}dp"
    android:height="${h}dp"
    android:viewportWidth="${w}"
    android:viewportHeight="${h}">
${paths}
</vector>
`;
}

export async function toBlob(svg) {
  return new Blob([toVectorDrawable(svg)], { type: 'application/xml' });
}
