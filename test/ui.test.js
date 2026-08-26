// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderShell, renderSymbologyOptions, syncControls, syncTheme, showPreview, showError, showEmpty } from '../src/ui.js';
import { defaultState, setSymbology } from '../src/state.js';

const FORMATS = [
  { id: 'png', label: 'PNG', ext: 'png' },
  { id: 'svg', label: 'SVG', ext: 'svg' },
];

let root;
let refs;
beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  root = document.getElementById('app');
  refs = renderShell(root, FORMATS);
});

describe('renderShell', () => {
  it('renders the group toggle, picker, input, preview, downloads and options', () => {
    expect(refs.groupButtons).toHaveLength(2);
    expect(refs.select).toBeTruthy();
    expect(refs.input.type).toBe('text');
    expect(refs.preview).toBeTruthy();
    expect(refs.downloads.querySelectorAll('button')).toHaveLength(2);
    expect(refs.options.tagName).toBe('DETAILS');
  });

  it('labels every control for assistive technology', () => {
    expect(refs.input.getAttribute('aria-label')).toBeTruthy();
    expect(refs.select.getAttribute('aria-label')).toBeTruthy();
    expect(refs.themeButton.getAttribute('aria-label')).toBeTruthy();
  });

  it('marks the error region as a polite live region', () => {
    expect(refs.error.getAttribute('aria-live')).toBe('polite');
  });

  it('starts with the options accordion collapsed', () => {
    expect(refs.options.open).toBe(false);
  });

  it('puts a barcode and a qr icon before the group labels', () => {
    const [linear, twoD] = refs.groupButtons;
    expect(linear.querySelector('svg.barcode')).toBeTruthy();
    expect(twoD.querySelector('svg.qr')).toBeTruthy();
    expect(linear.textContent).toBe('Linear');
    expect(twoD.textContent).toBe('2D');
    // Icon first, label second.
    expect(linear.firstElementChild.tagName.toLowerCase()).toBe('svg');
  });

  it('hides the group icons from assistive technology, leaving the label to name the button', () => {
    for (const button of refs.groupButtons) {
      expect(button.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('renders the theme control as a two-icon switch', () => {
    expect(refs.themeButton.tagName).toBe('BUTTON');
    expect(refs.themeButton.getAttribute('role')).toBe('switch');
    expect(refs.themeButton.getAttribute('aria-checked')).toBe('false');
    expect(refs.themeButton.querySelector('svg.sun')).toBeTruthy();
    expect(refs.themeButton.querySelector('svg.moon')).toBeTruthy();
    expect(refs.themeButton.querySelector('.thumb')).toBeTruthy();
  });

  it('hides the switch icons from assistive technology', () => {
    for (const svg of refs.themeButton.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('syncControls', () => {
  it('lists only the symbologies of the active group', () => {
    syncControls(refs, defaultState());
    const values = [...refs.select.options].map((o) => o.value);
    expect(values).toContain('qrcode');
    expect(values).toContain('datamatrix');
    expect(values).not.toContain('code128');
  });

  it('marks the active group button as pressed', () => {
    syncControls(refs, defaultState());
    const pressed = refs.groupButtons.filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].dataset.group).toBe('2d');
  });

  it('selects the current symbology and reflects the text', () => {
    syncControls(refs, { ...defaultState(), t: 'hello' });
    expect(refs.select.value).toBe('qrcode');
    expect(refs.input.value).toBe('hello');
  });

  it('switches the listed symbologies when the group changes', () => {
    syncControls(refs, setSymbology(defaultState(), 'code128'));
    expect([...refs.select.options].map((o) => o.value)).toContain('code128');
    expect([...refs.select.options].map((o) => o.value)).not.toContain('qrcode');
  });
});

describe('options accordion', () => {
  it('puts a caret at the far end of the summary', () => {
    const summary = refs.options.querySelector('summary');
    expect(summary.textContent).toBe('Options');
    expect(summary.querySelector('svg.caret')).toBeTruthy();
    expect(summary.lastElementChild.tagName.toLowerCase()).toBe('svg');
    expect(summary.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('holds the fields in one wrapper, which is what the open/close animation collapses', () => {
    renderSymbologyOptions(refs.options, defaultState());
    const fields = refs.options.querySelector('.fields');
    expect(fields).toBeTruthy();
    expect(fields.querySelectorAll('.field').length).toBeGreaterThan(0);
    expect([...refs.options.children].map((c) => c.tagName.toLowerCase())).toEqual(['summary', 'div']);
  });
});

describe('renderSymbologyOptions', () => {
  it('renders a control per schema option', () => {
    renderSymbologyOptions(refs.options, defaultState());
    const fields = refs.options.querySelectorAll('.field');
    expect(fields).toHaveLength(3); // scale, margin, eclevel
  });

  it('picks the control type from the schema', () => {
    renderSymbologyOptions(refs.options, setSymbology(defaultState(), 'code128'));
    expect(refs.options.querySelector('[data-k="scale"]').type).toBe('number');
    expect(refs.options.querySelector('[data-k="includetext"]').type).toBe('checkbox');
    renderSymbologyOptions(refs.options, defaultState());
    expect(refs.options.querySelector('[data-k="eclevel"]').tagName).toBe('SELECT');
  });

  it('shows an auto option as an empty value', () => {
    renderSymbologyOptions(refs.options, setSymbology(defaultState(), 'pdf417'));
    expect(refs.options.querySelector('[data-k="columns"]').value).toBe('');
  });

  it('replaces the previous controls when the symbology changes', () => {
    renderSymbologyOptions(refs.options, defaultState());
    renderSymbologyOptions(refs.options, setSymbology(defaultState(), 'code128'));
    expect(refs.options.querySelector('[data-k="eclevel"]')).toBeNull();
  });

  it('labels each field so the label activates its control (48px tap target)', () => {
    renderSymbologyOptions(refs.options, defaultState());
    const fields = [...refs.options.querySelectorAll('.field')];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      const label = field.querySelector('label');
      const control = field.querySelector('[data-k]');
      expect(label).toBeTruthy();
      expect(control).toBeTruthy();
      expect(label.htmlFor).toBe(control.id);
    }
  });

  it('offers a digits-only keypad and integer steps on number fields', () => {
    renderSymbologyOptions(refs.options, defaultState());
    const scale = refs.options.querySelector('[data-k="scale"]');
    expect(scale.getAttribute('inputmode')).toBe('numeric');
    expect(scale.getAttribute('step')).toBe('1');
  });

  it('bounds every number field at zero or above', () => {
    renderSymbologyOptions(refs.options, defaultState());
    for (const input of refs.options.querySelectorAll('input[type="number"]')) {
      expect(Number(input.getAttribute('min'))).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('preview states', () => {
  const svg = '<svg viewBox="0 0 10 10"><path d="M0 0Z"/></svg>';

  it('shows the code and clears the error', () => {
    showError(refs, 'boom');
    showPreview(refs, svg);
    expect(refs.preview.querySelector('svg')).toBeTruthy();
    expect(refs.error.textContent).toBe('');
    expect(refs.preview.classList.contains('is-stale')).toBe(false);
  });

  it('enables the download buttons once there is a code', () => {
    showPreview(refs, svg);
    expect([...refs.downloads.querySelectorAll('button')].every((b) => !b.disabled)).toBe(true);
  });

  it('keeps the last good code on screen but dims it on error', () => {
    showPreview(refs, svg);
    showError(refs, 'EAN-13 must be 12 or 13 digits');
    expect(refs.preview.querySelector('svg')).toBeTruthy();
    expect(refs.preview.classList.contains('is-stale')).toBe(true);
    expect(refs.error.textContent).toBe('EAN-13 must be 12 or 13 digits');
  });

  it('disables downloads while the code is stale', () => {
    showPreview(refs, svg);
    showError(refs, 'boom');
    expect([...refs.downloads.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  });

  it('shows a placeholder and no error for the empty state', () => {
    showPreview(refs, svg);
    showEmpty(refs);
    expect(refs.preview.querySelector('svg')).toBeNull();
    expect(refs.preview.querySelector('.placeholder')).toBeTruthy();
    expect(refs.error.textContent).toBe('');
    expect([...refs.downloads.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  });
});

describe('syncTheme', () => {
  it('checks the switch in dark mode and unchecks it in light', () => {
    syncTheme(refs, 'dark');
    expect(refs.themeButton.getAttribute('aria-checked')).toBe('true');
    syncTheme(refs, 'light');
    expect(refs.themeButton.getAttribute('aria-checked')).toBe('false');
  });
});

describe('option help without popover support', () => {
  beforeEach(() => renderSymbologyOptions(refs.options, setSymbology(defaultState(), 'pdf417')));

  it('leaves no tip in the document, since only the UA rule would hide it', () => {
    expect(refs.options.querySelectorAll('.tip').length).toBe(0);
  });

  it('falls back to a title on the info button and claims no popover wiring', () => {
    for (const button of refs.options.querySelectorAll('button.info')) {
      expect(button.title.length).toBeGreaterThan(20);
      expect(button.hasAttribute('popovertarget')).toBe(false);
    }
  });

  it('does not point a control at an explanation that is not there', () => {
    for (const control of refs.options.querySelectorAll('.field input, .field select')) {
      expect(control.hasAttribute('aria-describedby')).toBe(false);
    }
  });
});

describe('option help', () => {
  // jsdom has no popover support, so stand it up for the supported branch.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'popover', { value: null, configurable: true, writable: true });
    renderSymbologyOptions(refs.options, setSymbology(defaultState(), 'pdf417'));
  });
  afterEach(() => { delete HTMLElement.prototype.popover; });

  it('gives every field an info button wired to a popover', () => {
    const fields = [...refs.options.querySelectorAll('.field')];
    expect(fields.length).toBeGreaterThan(2);
    for (const field of fields) {
      const button = field.querySelector('button.info');
      const tip = field.querySelector('.tip');
      expect(button).toBeTruthy();
      expect(tip).toBeTruthy();
      expect(button.getAttribute('popovertarget')).toBe(tip.id);
      expect(tip.textContent.length).toBeGreaterThan(20);
    }
  });

  it('labels the info button by its option so it is not a bare "i" to a screen reader', () => {
    const field = refs.options.querySelector('.field');
    const label = field.querySelector('label').textContent;
    expect(field.querySelector('button.info').getAttribute('aria-label')).toContain(label);
  });

  it('points the control at its explanation with aria-describedby', () => {
    const field = refs.options.querySelector('.field');
    const control = field.querySelector('input, select');
    expect(control.getAttribute('aria-describedby')).toBe(field.querySelector('.tip').id);
  });

  it('is reachable by keyboard, named, and inert as a form control', () => {
    const button = refs.options.querySelector('button.info');
    // Deliberately a tab stop: tapping is not the only way to reach an
    // explanation, and nothing else exposes the text to a keyboard user.
    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute('aria-label')).toMatch(/^About /);
    expect(button.type).toBe('button');
  });
});
