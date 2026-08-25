import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { build } from '../build.js';

describe('build', () => {
  beforeAll(async () => { await build(); }, 60000);

  it('emits dist/index.html', () => {
    expect(existsSync('dist/index.html')).toBe(true);
  });

  it('inlines the CSS and leaves no placeholders', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).not.toContain('<!--CSS-->');
    expect(html).not.toContain('<!--SCRIPT-->');
    expect(html).toContain('font-family');
  });

  it('references the entry script with a relative, hashed path', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).toMatch(/<script type="module" src="\.\/assets\/main-[A-Z0-9]+\.js"><\/script>/);
  });

  it('uses no absolute asset paths', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    expect(html).not.toMatch(/src="\//);
    expect(html).not.toMatch(/href="\//);
  });
});
