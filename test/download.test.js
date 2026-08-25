// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filename, downloadBlob } from '../src/download.js';

describe('filename', () => {
  it('slugifies the text', () => {
    expect(filename('code128', 'ABC-123', 'png')).toBe('code128-abc-123.png');
  });

  it('collapses runs of non-alphanumerics to a single dash', () => {
    expect(filename('qrcode', 'a  !!  b', 'svg')).toBe('qrcode-a-b.svg');
  });

  it('trims leading and trailing dashes', () => {
    expect(filename('qrcode', '!!hello!!', 'pdf')).toBe('qrcode-hello.pdf');
  });

  it('falls back to the symbology alone when nothing survives', () => {
    expect(filename('code128', '', 'svg')).toBe('code128.svg');
    expect(filename('code128', '   !!!   ', 'pdf')).toBe('code128.pdf');
  });

  it('truncates the slug to 32 characters with no trailing dash', () => {
    const name = filename('qrcode', 'a'.repeat(60), 'xml');
    expect(name).toBe(`qrcode-${'a'.repeat(32)}.xml`);
    const dashy = filename('qrcode', `${'a'.repeat(32)} tail`, 'xml');
    expect(dashy.endsWith('-.xml')).toBe(false);
  });
});

describe('downloadBlob', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:fake');
    URL.revokeObjectURL = vi.fn();
  });

  it('clicks an anchor carrying the download name, then revokes the URL', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadBlob(new Blob(['x']), 'thing.png');
    expect(click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('leaves no anchor behind in the document', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadBlob(new Blob(['x']), 'thing.png');
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});
