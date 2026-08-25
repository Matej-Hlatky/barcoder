import { byId, optionsOf, defaultsOf, clamp, DEFAULT_SYMBOLOGY } from './symbologies.js';

export function defaultState() {
  return { s: DEFAULT_SYMBOLOGY, t: '', ...defaultsOf(DEFAULT_SYMBOLOGY) };
}

export function groupOf(state) {
  const sym = byId(state.s);
  return sym ? sym.group : byId(DEFAULT_SYMBOLOGY).group;
}

function coerce(option, raw) {
  if (option.type === 'bool') {
    if (raw === '1') return true;
    if (raw === '0') return false;
    return option.def;
  }
  if (option.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(option, n) : option.def;
  }
  if (option.type === 'enum') {
    return option.values.some((v) => v.value === raw) ? raw : option.def;
  }
  return option.def;
}

function adopt(option, value) {
  if (option.type === 'bool') return typeof value === 'boolean' ? value : option.def;
  if (option.type === 'number') {
    return Number.isFinite(value) ? clamp(option, value) : option.def;
  }
  if (option.type === 'enum') {
    return option.values.some((v) => v.value === value) ? value : option.def;
  }
  return option.def;
}

export function fromQuery(search) {
  const params = new URLSearchParams(
    typeof search === 'string' && search.startsWith('?') ? search.slice(1) : (search || '')
  );
  const id = params.has('s') && byId(params.get('s')) ? params.get('s') : DEFAULT_SYMBOLOGY;
  const state = { s: id, t: params.get('t') ?? '', ...defaultsOf(id) };
  for (const option of optionsOf(id)) {
    if (!params.has(option.k)) continue;
    const value = coerce(option, params.get(option.k));
    if (value === undefined || value === null) delete state[option.k];
    else state[option.k] = value;
  }
  return state;
}

export function toQuery(state) {
  const params = new URLSearchParams();
  if (state.s !== DEFAULT_SYMBOLOGY) params.set('s', state.s);
  if (state.t) params.set('t', state.t);
  for (const option of optionsOf(state.s)) {
    const value = state[option.k];
    if (value === undefined || value === null) continue;
    if (value === option.def) continue;
    params.set(option.k, option.type === 'bool' ? (value ? '1' : '0') : String(value));
  }
  return params.toString();
}

export function setSymbology(state, id) {
  if (!byId(id)) return state;
  const next = { s: id, t: state.t, ...defaultsOf(id) };
  for (const option of optionsOf(id)) {
    if (!Object.prototype.hasOwnProperty.call(state, option.k)) continue;
    const adopted = adopt(option, state[option.k]);
    if (adopted === undefined || adopted === null) delete next[option.k];
    else next[option.k] = adopted;
  }
  return next;
}
