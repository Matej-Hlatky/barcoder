// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDisplayDialog, requestWakeLock } from '../src/dialog.js';

const SVG = '<svg viewBox="0 0 10 10"><path d="M0 0Z"/></svg>';

beforeEach(() => {
  document.body.innerHTML = '';
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.open = false; this.dispatchEvent(new Event('close')); });
  delete navigator.wakeLock;
});

describe('createDisplayDialog', () => {
  it('appends a dialog carrying the display class', () => {
    const d = createDisplayDialog();
    expect(d.element.tagName).toBe('DIALOG');
    expect(d.element.classList.contains('display')).toBe(true);
    expect(document.body.contains(d.element)).toBe(true);
  });

  it('shows the code modally', () => {
    const d = createDisplayDialog();
    d.open(SVG);
    expect(d.element.showModal).toHaveBeenCalled();
    expect(d.element.querySelector('svg')).toBeTruthy();
  });

  it('closes on a click anywhere on the stage', () => {
    const d = createDisplayDialog();
    d.open(SVG);
    d.element.querySelector('.stage').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(d.element.close).toHaveBeenCalled();
  });

  it('offers an explicit close button', () => {
    const d = createDisplayDialog();
    d.open(SVG);
    const button = d.element.querySelector('button.close');
    expect(button.getAttribute('aria-label')).toBeTruthy();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(d.element.close).toHaveBeenCalled();
  });

  it('never calls requestFullscreen', () => {
    const spy = vi.fn();
    HTMLDialogElement.prototype.requestFullscreen = spy;
    createDisplayDialog().open(SVG);
    expect(spy).not.toHaveBeenCalled();
  });

  it('replaces the code on a second open', () => {
    const d = createDisplayDialog();
    d.open(SVG);
    d.open('<svg viewBox="0 0 20 20"><path d="M1 1Z"/></svg>');
    expect(d.element.querySelectorAll('svg')).toHaveLength(1);
    expect(d.element.querySelector('svg').getAttribute('viewBox')).toBe('0 0 20 20');
  });
});

describe('requestWakeLock', () => {
  it('returns null when the API is missing', async () => {
    expect(await requestWakeLock()).toBeNull();
  });

  it('returns null when the request is rejected', async () => {
    navigator.wakeLock = { request: vi.fn().mockRejectedValue(new Error('denied')) };
    expect(await requestWakeLock()).toBeNull();
  });

  it('returns the sentinel when granted', async () => {
    const sentinel = { release: vi.fn() };
    navigator.wakeLock = { request: vi.fn().mockResolvedValue(sentinel) };
    expect(await requestWakeLock()).toBe(sentinel);
  });
});

describe('wake lock lifecycle', () => {
  it('takes a lock on open and releases it on close', async () => {
    const sentinel = { release: vi.fn().mockResolvedValue(undefined) };
    navigator.wakeLock = { request: vi.fn().mockResolvedValue(sentinel) };
    const d = createDisplayDialog();
    d.open(SVG);
    await Promise.resolve();
    await Promise.resolve();
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    d.close();
    await Promise.resolve();
    expect(sentinel.release).toHaveBeenCalled();
  });
});
