import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMITS = { entry: 12 * 1024, encoder: 115 * 1024 };

export async function build({ assertLimits = false } = {}) {
  rmSync('dist', { recursive: true, force: true });
  mkdirSync('dist', { recursive: true });

  const result = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    minify: true,
    splitting: true,
    format: 'esm',
    target: 'es2020',
    outdir: 'dist/assets',
    entryNames: '[name]-[hash]',
    chunkNames: '[name]-[hash]',
    metafile: true,
  });

  const outputs = Object.entries(result.metafile.outputs);
  const [entryPath] = outputs.find(([, o]) => o.entryPoint === 'src/main.js');
  const entryName = entryPath.replace(/^dist\/assets\//, '');

  const css = readFileSync('src/styles.css', 'utf8');
  const html = readFileSync('src/index.html', 'utf8')
    .replace('<!--CSS-->', css)
    .replace('<!--SCRIPT-->', `<script type="module" src="./assets/${entryName}"></script>`);
  writeFileSync('dist/index.html', html);

  if (assertLimits) assertBundleLimits(outputs);
  return result.metafile;
}

export function assertBundleLimits(outputs) {
  const sizes = outputs.map(([p]) => ({
    path: p,
    gzip: gzipSync(readFileSync(p)).length,
  }));
  const entry = sizes.find((s) => /\/main-/.test(s.path));
  const encoder = sizes.find((s) => /\/encoder-/.test(s.path));
  const fail = [];
  if (entry && entry.gzip > LIMITS.entry) fail.push(`entry ${entry.gzip} > ${LIMITS.entry}`);
  if (encoder && encoder.gzip > LIMITS.encoder) fail.push(`encoder ${encoder.gzip} > ${LIMITS.encoder}`);
  if (fail.length) throw new Error(`Bundle size ceiling exceeded: ${fail.join('; ')}`);
  for (const s of sizes) console.log(`${s.path}  ${(s.gzip / 1024).toFixed(1)} KB gzip`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await build({ assertLimits: true });
}
