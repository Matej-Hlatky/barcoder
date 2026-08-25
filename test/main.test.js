// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  window.history.replaceState({}, '', '/');
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.open = false; });
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 1; });
  // jsdom does not implement matchMedia; initTheme() needs it to resolve the OS preference.
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
});

const start = async () => {
  const { start } = await import('../src/main.js');
  return start(document.getElementById('app'));
};

describe('start', () => {
  it('renders the empty state for a bare URL', async () => {
    const app = await start();
    await app.settled();
    expect(app.refs.preview.querySelector('.placeholder')).toBeTruthy();
    expect(app.refs.select.value).toBe('qrcode');
  });

  it('hydrates from the query string', async () => {
    window.history.replaceState({}, '', '/?s=code128&t=ABC-123');
    const app = await start();
    await app.settled();
    expect(app.refs.select.value).toBe('code128');
    expect(app.refs.input.value).toBe('ABC-123');
    expect(app.refs.preview.querySelector('svg')).toBeTruthy();
  });

  it('writes state to the URL with replaceState as text changes', async () => {
    const app = await start();
    const spy = vi.spyOn(history, 'replaceState');
    const push = vi.spyOn(history, 'pushState');
    app.refs.input.value = 'hello';
    app.refs.input.dispatchEvent(new Event('input', { bubbles: true }));
    await app.settled();
    expect(spy).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?t=hello');
  });

  it('shows a clean encoder error and keeps the last good code', async () => {
    window.history.replaceState({}, '', '/?s=ean13&t=5901234123457');
    const app = await start();
    await app.settled();
    app.refs.input.value = '123';
    app.refs.input.dispatchEvent(new Event('input', { bubbles: true }));
    await app.settled();
    expect(app.refs.error.textContent).toBe('EAN-13 must be 12 or 13 digits');
    expect(app.refs.preview.classList.contains('is-stale')).toBe(true);
  });

  it('switches group to that group default and keeps the text', async () => {
    window.history.replaceState({}, '', '/?t=hello');
    const app = await start();
    await app.settled();
    app.refs.groupButtons.find((b) => b.dataset.group === 'linear').click();
    await app.settled();
    expect(app.refs.select.value).toBe('code128');
    expect(app.refs.input.value).toBe('hello');
  });

  it('opens the display dialog when the preview is tapped', async () => {
    window.history.replaceState({}, '', '/?t=hello');
    const app = await start();
    await app.settled();
    app.refs.preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(app.dialog.element.showModal).toHaveBeenCalled();
  });

  it('resets a cleared number option to its default instead of dropping it', async () => {
    window.history.replaceState({}, '', '/?s=code128&t=ABC-123&height=25');
    const app = await start();
    await app.settled();
    const control = app.refs.options.querySelector('[data-k="height"]');
    control.value = '';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await app.settled();
    // The URL omits defaults, so the round trip only holds if clearing the field
    // restores the default rather than dropping the option to bwip-js's own.
    expect(app.getState().height).toBe(10);
    const { fromQuery } = await import('../src/state.js');
    expect(fromQuery(window.location.search)).toEqual(app.getState());
  });

  it('drops an auto number option when it is cleared', async () => {
    window.history.replaceState({}, '', '/?s=pdf417&t=hello&columns=4');
    const app = await start();
    await app.settled();
    const control = app.refs.options.querySelector('[data-k="columns"]');
    control.value = '';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await app.settled();
    expect(app.getState().columns).toBeUndefined();
    expect(window.location.search).not.toContain('columns');
    const { fromQuery } = await import('../src/state.js');
    expect(fromQuery(window.location.search)).toEqual(app.getState());
  });

  it('does not open the dialog when there is no code', async () => {
    const app = await start();
    app.refs.preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(app.dialog.element.showModal).not.toHaveBeenCalled();
  });
});

describe('start when the encoder chunk fails to load', () => {
  it('tells the user instead of leaving the preview silently empty', async () => {
    vi.resetModules();
    vi.doMock('../src/encoder.js', () => { throw new Error('chunk load failed'); });
    window.history.replaceState({}, '', '/?t=hello');
    const { start } = await import('../src/main.js');
    const app = start(document.getElementById('app'));
    await app.settled();
    expect(app.refs.error.textContent).toBe('Could not load the barcode encoder');
    vi.doUnmock('../src/encoder.js');
    vi.resetModules();
  });
});
