import { SYMBOLOGIES, optionsOf } from './symbologies.js';
import { groupOf } from './state.js';
import { SUN, MOON, BARCODE, QR, CARET } from './icons.js';

const GROUPS = [
  { id: 'linear', label: 'Linear', icon: BARCODE },
  { id: '2d', label: '2D', icon: QR },
];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('data-')) node.setAttribute(k, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

// document.createElement cannot produce SVG elements — they need the correct
// namespace, and the HTML parser is the cheapest way to get it.
function parse(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content.firstElementChild;
}

export function renderShell(root, formats) {
  root.textContent = '';

  const themeButton = el('button', {
    class: 'theme', type: 'button', role: 'switch', 'aria-checked': 'false',
    'aria-label': 'Dark theme',
  }, [parse(SUN), parse(MOON), el('span', { class: 'thumb' })]);
  const header = el('header', { class: 'header' }, [el('h1', { text: 'Barcoder' }), themeButton]);

  const groupButtons = GROUPS.map((g) =>
    el('button', { type: 'button', 'data-group': g.id, 'aria-pressed': 'false' },
      [parse(g.icon), el('span', { text: g.label })])
  );
  const group = el('div', { class: 'group', role: 'group', 'aria-label': 'Barcode kind' }, groupButtons);

  const select = el('select', { class: 'symbology', 'aria-label': 'Barcode type' });
  const input = el('input', {
    class: 'text-input', type: 'text', 'aria-label': 'Text to encode',
    placeholder: 'Type something to encode', autocomplete: 'off',
    autocapitalize: 'off', autocorrect: 'off', spellcheck: false,
  });

  const preview = el('div', { class: 'preview', role: 'img', 'aria-label': 'Barcode preview' });
  const error = el('p', { class: 'error', 'aria-live': 'polite' });

  const downloads = el('div', { class: 'downloads' },
    formats.map((f) => el('button', { type: 'button', 'data-format': f.id, disabled: true, text: f.label }))
  );

  // Collapsing the panel from the keyboard produces no pointer event outside the
  // popover, so an open tip would survive it, listeners and all.
  const options = el('details', { class: 'options' }, [
    el('summary', {}, [el('span', { text: 'Options' }), parse(CARET)]),
    el('div', { class: 'fields' }),
  ]);
  options.addEventListener('toggle', () => closeTips(options));

  root.append(header, group, select, input, preview, error, downloads, options);
  return { root, themeButton, groupButtons, group, select, input, preview, error, downloads, options };
}

export function syncControls(refs, state) {
  const activeGroup = groupOf(state);

  for (const button of refs.groupButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.group === activeGroup));
  }

  const wanted = SYMBOLOGIES.filter((s) => s.group === activeGroup);
  const current = [...refs.select.options].map((o) => o.value).join(',');
  if (current !== wanted.map((s) => s.id).join(',')) {
    refs.select.textContent = '';
    for (const s of wanted) refs.select.appendChild(el('option', { value: s.id, text: s.label }));
  }
  refs.select.value = state.s;

  if (refs.input.value !== state.t) refs.input.value = state.t;
}

export function renderSymbologyOptions(container, state) {
  const fields = container.querySelector('.fields');
  // Dropping an open popover from the document hides it silently, leaving its
  // scroll and resize listeners attached for good. Close it first.
  closeTips(fields);
  for (const field of [...fields.querySelectorAll('.field')]) field.remove();

  for (const option of optionsOf(state.s)) {
    const value = state[option.k];
    const id = `opt-${option.k}`;
    let control;

    if (option.type === 'bool') {
      control = el('input', { type: 'checkbox', id, 'data-k': option.k, checked: Boolean(value) });
    } else if (option.type === 'enum') {
      control = el('select', { id, 'data-k': option.k },
        option.values.map((v) => el('option', { value: v.value, text: v.label })));
      control.value = value ?? option.def ?? '';
    } else {
      control = el('input', {
        type: 'number', id, 'data-k': option.k,
        inputmode: 'numeric', step: '1',
        ...(Number.isFinite(option.min) ? { min: String(option.min) } : {}),
        ...(Number.isFinite(option.max) ? { max: String(option.max) } : {}),
        placeholder: option.def === null ? 'Auto' : '',
        value: value === undefined || value === null ? '' : String(value),
      });
    }

    const tipId = `${id}-info`;
    const info = el('button', {
      class: 'info', type: 'button', 'aria-label': `About ${option.label}`,
    });
    const row = el('div', { class: 'field' }, [
      el('div', { class: 'field-label' }, [el('label', { htmlFor: id, text: option.label }), info]),
      control,
    ]);

    if (supportsPopover()) {
      const tip = el('div', { class: 'tip', id: tipId, role: 'note', popover: 'auto', text: option.info });
      info.setAttribute('popovertarget', tipId);
      control.setAttribute('aria-describedby', tipId);
      bindTip(tip, info);
      row.appendChild(tip);
    } else {
      // A .tip is kept out of the document entirely rather than hidden: it stays
      // out of view only through the UA's [popover] rule, which is absent here.
      info.title = option.info;
    }

    fields.appendChild(row);
  }
}

// The tip is fixed to the viewport and cannot follow its row, so scrolling
// dismisses it rather than letting it drift over an unrelated option.
function bindTip(tip, anchor) {
  const dismiss = () => { if (tip.matches(':popover-open')) tip.hidePopover(); };
  tip.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') {
      placeTip(tip, anchor);
      // Armed a frame late: tapping the button can itself scroll the page, and
      // that scroll event lands after the tip opens, closing it on the spot.
      requestAnimationFrame(() => {
        if (!tip.matches(':popover-open')) return;
        window.addEventListener('scroll', dismiss, { passive: true, capture: true });
        window.addEventListener('resize', dismiss, { passive: true });
      });
    } else {
      window.removeEventListener('scroll', dismiss, { capture: true });
      window.removeEventListener('resize', dismiss);
    }
  });
}

// A popover renders in the top layer, so it cannot be positioned by its place in
// the document; CSS anchor positioning would do this declaratively but is
// Chrome-only today. Nothing here measures the tip: its width is pinned in CSS,
// and anchoring by `bottom` in the lower half of the screen avoids ever needing
// its height, so the very first painted frame is already in the right place.
const TIP_WIDTH = 280;
const TIP_GAP = 8;
const ICON_INSET = 15; // dead space between the 48px tap target and its 18px circle

const supportsPopover = () => 'popover' in HTMLElement.prototype;

function closeTips(root) {
  for (const tip of root.querySelectorAll('.tip')) {
    if (tip.hidePopover && tip.matches(':popover-open')) tip.hidePopover();
  }
}

function placeTip(tip, anchor) {
  const a = anchor.getBoundingClientRect();
  const width = Math.min(TIP_WIDTH, window.innerWidth - TIP_GAP * 2);
  const left = a.left + a.width / 2 - width / 2;

  tip.style.left = `${Math.round(Math.min(Math.max(TIP_GAP, left), window.innerWidth - width - TIP_GAP))}px`;
  if (a.top + a.height / 2 > window.innerHeight / 2) {
    tip.style.top = 'auto';
    tip.style.bottom = `${Math.round(window.innerHeight - a.top - ICON_INSET + TIP_GAP)}px`;
  } else {
    tip.style.bottom = 'auto';
    tip.style.top = `${Math.round(a.bottom - ICON_INSET + TIP_GAP)}px`;
  }
}

function setDownloadsEnabled(refs, enabled) {
  for (const button of refs.downloads.querySelectorAll('button')) button.disabled = !enabled;
}

export function showPreview(refs, svg) {
  refs.preview.innerHTML = svg;
  refs.preview.classList.remove('is-stale');
  refs.error.textContent = '';
  setDownloadsEnabled(refs, true);
}

export function showError(refs, message) {
  refs.error.textContent = message;
  if (refs.preview.querySelector('svg')) refs.preview.classList.add('is-stale');
  setDownloadsEnabled(refs, false);
}

export function showEmpty(refs) {
  refs.preview.textContent = '';
  refs.preview.appendChild(el('p', { class: 'placeholder', text: 'Your barcode will appear here' }));
  refs.preview.classList.remove('is-stale');
  refs.error.textContent = '';
  setDownloadsEnabled(refs, false);
}

export function syncTheme(refs, theme) {
  refs.themeButton.setAttribute('aria-checked', String(theme === 'dark'));
}
