import { fromQuery, toQuery, setSymbology } from './state.js';
import { optionsOf, clamp, GROUP_DEFAULTS } from './symbologies.js';
import { initTheme, applyTheme, nextTheme } from './theme.js';
import { renderShell, syncControls, syncTheme, renderSymbologyOptions, showPreview, showError, showEmpty } from './ui.js';
import { createDisplayDialog } from './dialog.js';
import { FORMATS } from './export/index.js';
import { downloadBlob, filename } from './download.js';

export function start(root) {
  let theme = initTheme();
  let state = fromQuery(window.location.search);
  let svg = null;
  let pending = Promise.resolve();

  const refs = renderShell(root, FORMATS);
  const dialog = createDisplayDialog();

  const encoderModule = import('./encoder.js');

  const settled = () => pending.then(() => pending);

  function writeUrl() {
    const query = toQuery(state);
    history.replaceState({}, '', query ? `?${query}` : window.location.pathname);
  }

  function regenerate() {
    pending = encoderModule
      .then(({ encode }) => {
        if (!state.t) {
          svg = null;
          showEmpty(refs);
          return;
        }
        try {
          svg = encode(state);
          showPreview(refs, svg);
        } catch (error) {
          // Keep the last good svg: the stale preview stays tappable and downloadable.
          showError(refs, error.message);
        }
      })
      .catch(() => {
        svg = null;
        showError(refs, 'Could not load the barcode encoder');
      });
    return pending;
  }

  function update(next, { rerenderOptions = false } = {}) {
    state = next;
    syncControls(refs, state);
    if (rerenderOptions) renderSymbologyOptions(refs.options, state);
    writeUrl();
    regenerate();
  }

  refs.input.addEventListener('input', () => {
    state = { ...state, t: refs.input.value };
    requestAnimationFrame(writeUrl);
    regenerate();
  });

  refs.select.addEventListener('change', () => {
    update(setSymbology(state, refs.select.value), { rerenderOptions: true });
  });

  for (const button of refs.groupButtons) {
    button.addEventListener('click', () => {
      const target = GROUP_DEFAULTS[button.dataset.group];
      if (target === state.s) return;
      update(setSymbology(state, target), { rerenderOptions: true });
    });
  }

  refs.options.addEventListener('input', (event) => {
    const control = event.target.closest('[data-k]');
    if (!control) return;
    const option = optionsOf(state.s).find((o) => o.k === control.dataset.k);
    if (!option) return;

    const next = { ...state };
    const number = Number(control.value);
    if (option.type === 'bool') next[option.k] = control.checked;
    else if (option.type === 'enum') next[option.k] = control.value;
    else if (control.value !== '' && Number.isFinite(number)) next[option.k] = clamp(option, number);
    // A cleared field means "use the default" — deleting the key would instead
    // fall through to bwip-js's own default, which the URL cannot round-trip.
    else if (option.def === null) delete next[option.k];
    else next[option.k] = option.def;

    state = next;
    writeUrl();
    regenerate();
  });

  refs.preview.addEventListener('click', () => {
    if (svg) dialog.open(svg);
  });

  refs.themeButton.addEventListener('click', () => {
    theme = nextTheme(theme);
    applyTheme(theme);
    syncTheme(refs, theme);
  });

  refs.downloads.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-format]');
    if (!button || button.disabled || !svg) return;
    const format = FORMATS.find((f) => f.id === button.dataset.format);
    button.disabled = true;
    try {
      const toBlob = await format.load();
      downloadBlob(await toBlob(svg), filename(state.s, state.t, format.ext));
    } catch (error) {
      // The message on screen stays plain; the cause goes to the console, since
      // this catch spans three steps (chunk load, encode, download) and the
      // failing one is otherwise unknowable from a bug report.
      console.error(`${format.label} export failed`, error);
      refs.error.textContent = `Could not create the ${format.label} file`;
    } finally {
      button.disabled = false;
    }
  });

  syncTheme(refs, theme);
  syncControls(refs, state);
  renderSymbologyOptions(refs.options, state);
  showEmpty(refs);
  regenerate();

  return { refs, dialog, settled, getState: () => state };
}

const root = document.getElementById('app');
if (root) start(root);
