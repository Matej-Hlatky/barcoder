// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filename, downloadBlob } from '../src/download.js';

describe('filename', () => {
  it('keeps the case the user typed', () => {
    expect(filename('qrcode', 'HelloWorld', 'svg')).toBe('HelloWorld-qrcode.svg');
    expect(filename('qrcode', 'SKU AB12', 'png')).toBe('SKU-AB12-qrcode.png');
  });

  it('still folds everything that is not a letter or digit into single dashes', () => {
    expect(filename('qrcode', 'Aa  !!  Bb', 'svg')).toBe('Aa-Bb-qrcode.svg');
  });

  it('puts the code before the symbology', () => {
    expect(filename('code128', 'ABC-123', 'png')).toBe('ABC-123-code128.png');
  });

  it('collapses runs of non-alphanumerics to a single dash', () => {
    expect(filename('qrcode', 'a  !!  b', 'svg')).toBe('a-b-qrcode.svg');
  });

  it('trims leading and trailing dashes', () => {
    expect(filename('qrcode', '!!hello!!', 'pdf')).toBe('hello-qrcode.pdf');
  });

  it('falls back to the symbology alone when nothing survives', () => {
    expect(filename('code128', '', 'svg')).toBe('code128.svg');
    expect(filename('code128', '   !!!   ', 'pdf')).toBe('code128.pdf');
  });

  it('truncates the slug to 32 characters with no trailing dash', () => {
    const name = filename('qrcode', 'a'.repeat(60), 'xml');
    expect(name).toBe(`${'a'.repeat(32)}-qrcode.xml`);
    const dashy = filename('qrcode', `${'a'.repeat(32)} tail`, 'xml');
    expect(dashy).toBe(`${'a'.repeat(32)}-qrcode.xml`);
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
