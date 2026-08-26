import { SYMBOLOGIES, optionsOf } from './symbologies.js';
import { groupOf } from './state.js';
import { SUN, MOON } from './icons.js';

const GROUPS = [
  { id: 'linear', label: 'Linear' },
  { id: '2d', label: '2D' },
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
    el('button', { type: 'button', 'data-group': g.id, 'aria-pressed': 'false', text: g.label })
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

  const options = el('details', { class: 'options' }, [el('summary', { text: 'Options' })]);

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
  for (const field of [...container.querySelectorAll('.field')]) field.remove();

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

    container.appendChild(el('div', { class: 'field' }, [
      el('label', { htmlFor: id, text: option.label }),
      control,
    ]));
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
