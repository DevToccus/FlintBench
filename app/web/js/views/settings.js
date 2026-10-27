import { h, icon, replace, actionButton } from '../lib/dom.js';
import { store, subscribe, prefs } from '../lib/store.js';
import { play, playGreeting } from '../lib/sound.js';
import { api } from '../lib/api.js';
import { attempt, toast, confirmDialog } from '../lib/ui.js';
import { ago } from '../lib/format.js';
import { showSampleNotifications } from '../lib/notify.js';
import { applyAccent, isHex, hslHex, hueOf, DEFAULT_ACCENT, PATTERNS } from '../lib/theme.js';
import { setLeaveGuard } from '../lib/router.js';
import { browseButton } from '../lib/picker.js';
import { applySettingsLook } from '../lib/theme.js';
import { PRESETS, DENSITIES, customDefaults, resolveProfile, usesAgents } from '../lib/profiles.js';
import { EDITORS, editorName } from '../lib/editors.js';
import { profileCards, customEditor, markProfile } from './profile-editor.js';
import { PALETTES, SCENES, BLUR_RANGE, TRANSPARENCY_RANGE, UI_SCALE_RANGE } from '../lib/appearance.js';
import { sceneThumbnail } from '../lib/scene.js';

// vivid presets: the whole interface and the clock take the chosen one
const SWATCHES = [
  ['#6cc6ff', 'Sky (default)'], ['#00e5ff', 'Cyan'], ['#2f6bff', 'Blue'], ['#7c3aed', 'Violet'],
  ['#d946ef', 'Magenta'], ['#ff2d75', 'Pink'], ['#ff3b30', 'Red'], ['#ff7a00', 'Orange'],
  ['#ffd400', 'Yellow'], ['#a3ff12', 'Lime'], ['#00e676', 'Green'], ['#00c2a8', 'Teal'],
];

/**
 * Accent colour: vivid swatches, a full-saturation hue slider, the system picker for anything else,
 * and a hex field. Changes preview live; the choice is reported when the gesture ends (not on
 * every pixel) and is kept only when Settings are saved.
 */
export function accentPicker(current, onChange) {
  let value = isHex(current) ? current.toLowerCase() : DEFAULT_ACCENT;
  let saved = value;
  const save = () => {
    if (value === saved) return;
    saved = value;
    onChange(value === DEFAULT_ACCENT ? '' : value);
  };
  const hexInput = h('input.input.mono.accent-hex', { value, maxLength: 7, spellcheck: false, 'aria-label': 'Accent colour, hex' });
  const native = h('input.accent-native', { type: 'color', value, title: 'Pick any colour', 'aria-label': 'Pick any colour' });
  const hue = h('input.accent-hue', { type: 'range', min: 0, max: 359, step: 1, value: hueOf(value), 'aria-label': 'Hue' });
  const chip = h('span.accent-chip', { 'aria-hidden': 'true', style: { background: value } });
  const swatches = SWATCHES.map(([hex, name]) => h('button.accent-swatch', {
    type: 'button', title: name, 'aria-label': name, dataset: { hex }, style: { background: hex },
    'aria-pressed': String(hex === value),
    onclick: () => { show(hex); hue.value = hueOf(hex); save(); },
  }));
  function show(hex) {
    value = hex.toLowerCase();
    applyAccent(value);
    hexInput.value = value;
    native.value = value;
    chip.style.background = value;
    hexInput.classList.remove('is-invalid');
    for (const s of swatches) s.setAttribute('aria-pressed', String(s.dataset.hex === value));
  }
  hue.addEventListener('input', () => show(hslHex(Number(hue.value), 100, 56)));
  hue.addEventListener('change', save);
  native.addEventListener('input', () => { show(native.value); hue.value = hueOf(native.value); });
  native.addEventListener('change', save);
  hexInput.addEventListener('input', () => {
    const v = hexInput.value.trim().replace(/^([^#])/, '#$1');
    if (isHex(v)) { show(v); hue.value = hueOf(v); } else hexInput.classList.add('is-invalid');
  });
  hexInput.addEventListener('change', () => { if (isHex(hexInput.value.trim().replace(/^([^#])/, '#$1'))) save(); else show(value); });
  return h('div.accent',
    h('div.accent-swatches', { role: 'group', 'aria-label': 'Accent presets' }, swatches),
    h('div.accent-row',
      hue,
      h('label.accent-custom', native, h('span.sr-only', 'Custom colour')),
      h('span.accent-hexbox', chip, hexInput),
      h('button.btn.sm.ghost', { type: 'button', onclick: () => { show(DEFAULT_ACCENT); hue.value = hueOf(DEFAULT_ACCENT); save(); } }, 'Reset')));
}

async function saveSettings(patch, success) {
  const s = await attempt(() => api.patch('/api/settings', patch), { success, failure: 'Could not save setting' });
  if (s) store.set('settings', s);
  return s;
}

/** Add-a-root form, reused by the Home empty state. */
export function addRootForm() {
  const input = h('input.input.mono', { placeholder: store.state.platform === 'win32' ? 'C:\\Dev' : '~/Projects', 'aria-label': 'Folder path', spellcheck: false });
  const error = h('p.field-error', { role: 'alert' });
  const suggestions = (store.state.rootSuggestions ?? []).filter((s) => !(store.state.settings?.roots ?? []).includes(s));
  const addRoot = async (dir) => {
    error.textContent = '';
    try {
      const s = await api.post('/api/settings/roots', { path: dir });
      store.set('settings', s);
      input.value = '';
      toast('Directory added. Scanning…', { kind: 'ok' });
    } catch (err) {
      if (err.status === 409) { toast(err.message, { kind: 'warn', detail: dir }); return; }
      error.textContent = err.message;
      input.setAttribute('aria-invalid', 'true');
    }
  };
  const form = h('form.stack', { style: { width: 'min(720px, 100%)' } },
    h('div.row.wrap',
      browseButton('Choose folder…', { kind: 'folder', title: 'Choose a folder where your projects live' }, addRoot, { cls: 'btn primary' }),
      h('span.faint.small', 'or'),
      h('div.row', { style: { flex: '1 1 300px' } }, input, h('button.btn', { type: 'submit' }, 'Add path'))),
    suggestions.length ? h('div.row.wrap', h('span.faint', { style: { fontSize: '12px' } }, 'Found on this machine:'), suggestions.map((s) => h('button.btn.sm', { type: 'button', onclick: () => { input.value = s; form.requestSubmit(); } }, s))) : null,
    error);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    if (input.value.trim()) addRoot(input.value.trim());
  });
  return form;
}


/* ------------------------------------------------------------------ game-style settings
   The layout of a good game options screen: category tabs (Q / E), one row per setting with the
   label on the left and the control on the right, a detail panel for the selected row (what it
   does, default, current), a mark on every changed value, reset per row or per tab, and search.
   Changes are staged: they preview at once (theme, accent, background) but are kept only on Save;
   Cancel drops them. With unsaved changes the tabs, search and leaving the page are held. */

const TABS = [
  ['general', 'General'], ['profile', 'Profile'], ['appearance', 'Appearance'], ['audio', 'Audio'], ['agents', 'Agents'],
  ['integrations', 'Integrations'], ['terminal', 'Terminal'], ['security', 'Security'], ['data', 'Data'],
];

const at = (o, key) => key.split('.').reduce((v, k) => v?.[k], o);
const patchOf = (key, value) => key.split('.').reduceRight((v, k) => ({ [k]: v }), value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const onOff = (v) => (v ? 'On' : 'Off');
function merge(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] ?? {}, v) : v;
  return a;
}
/** Ignored folders: a large drawer that opens in place, with "Ignore a folder…" at its foot. */
function ignoredDrawer(ignored, open, onToggle) {
  const box = h('details.drawer', { open },
    h('summary.drawer-head', { dataset: { primary: '' } },
      icon('folder', 16),
      h('span.drawer-title', ignored.length ? `${ignored.length} ignored folder${ignored.length > 1 ? 's' : ''}` : 'No ignored folders'),
      h('span.spacer'),
      h('span.drawer-hint'),
      icon('down', 16)),
    h('div.drawer-body',
      ignored.length
        ? h('ul.drawer-list', ignored.map((x) => h('li',
          h('span.drawer-path', { title: x.path }, x.path),
          x.at ? h('span.faint.small', ago(x.at)) : null,
          actionButton('Restore', async () => {
            const list = await attempt(() => api.post('/api/ignored/remove', { path: x.path }), { success: 'Folder restored: scans will find it again' });
            if (list) store.set('ignored', list);
          }, { cls: 'btn sm' }))))
        : h('p.drawer-empty', 'Nothing is ignored. Folders you dismiss from the new-project inbox, or choose here, are skipped by scans.'),
      h('div.drawer-foot',
        browseButton('Ignore a folder…', { kind: 'folder', title: 'Choose a folder FlintBench should not scan' }, async (dir) => {
          const list = await attempt(() => api.post('/api/ignored/add', { path: dir }), { success: 'Folder ignored' });
          if (list) store.set('ignored', list);
        }))));
  box.addEventListener('toggle', () => onToggle(box.open));
  return box;
}

// a slider is not a field: Q / E still change tab and a re-render may take it
const inField = (t) => Boolean(t?.closest?.('input:not([type="range"]), textarea, select, [contenteditable="true"], .xterm'));

/** Off | On segmented switch. Click or Space toggles; ← / → pick a side. */
function switchControl(label, on, onChange) {
  const btn = h('button.switch', { type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label, dataset: { primary: '' } },
    h('span.switch-knob', { 'aria-hidden': 'true' }), h('span.switch-opt', 'Off'), h('span.switch-opt', 'On'));
  const set = (v) => {
    if (v === (btn.getAttribute('aria-checked') === 'true')) return;
    btn.setAttribute('aria-checked', String(v));
    onChange(v);
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-checked') !== 'true'));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); set(e.key === 'ArrowRight'); }
  });
  return btn;
}

/** ‹ value › selector with position pips. ← / → step through the options. */
function stepper(label, options, value, onChange) {
  let i = Math.max(0, options.findIndex((o) => same(o.value, value)));
  const out = h('span.stepper-value', { 'aria-live': 'polite' });
  const pips = h('span.stepper-pips', { 'aria-hidden': 'true' }, options.map(() => h('i')));
  const prev = h('button.stepper-btn.is-prev', { type: 'button', tabIndex: -1, 'aria-label': `Previous ${label}` }, icon('chevron', 12));
  const next = h('button.stepper-btn', { type: 'button', tabIndex: -1, 'aria-label': `Next ${label}` }, icon('chevron', 12));
  const root = h('div.stepper', { tabIndex: 0, role: 'group', 'aria-label': label, 'aria-roledescription': 'selector', dataset: { primary: '' } },
    prev, h('span.stepper-mid', out, pips), next);
  const show = () => {
    out.textContent = options[i].text;
    [...pips.children].forEach((p, n) => p.classList.toggle('on', n === i));
    prev.disabled = i === 0;
    next.disabled = i === options.length - 1;
  };
  const step = (d) => {
    const n = i + d;
    if (n < 0 || n >= options.length) return;
    i = n;
    show();
    onChange(options[i].value);
  };
  prev.addEventListener('click', () => { step(-1); root.focus(); });
  next.addEventListener('click', () => { step(1); root.focus(); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
  });
  show();
  return root;
}

/**
 * A number to drag on a slider or type in its field, with its unit and a word for special values
 * (0 → Never). Dragging previews at once and is staged when the gesture ends; a typed number is
 * staged as it is typed, within range, and settled on Enter or when the field is left (out of
 * range it is brought back in). Esc in the field restores the value it had.
 */
function rangeField(label, { min, max, step = 1, unit = '', hint }, value, onChange) {
  const slider = h('input.range-slider', { type: 'range', min, max, step, value, 'aria-label': label, dataset: { primary: '' } });
  const field = h('input.input.range-number', { type: 'number', min, max, step, value, autocomplete: 'off', 'aria-label': unit ? `${label} (${unit})` : label });
  const word = hint ? h('span.range-hint') : null;
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const show = (v) => {
    slider.value = v;
    slider.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    const said = hint?.(v) ?? '';
    if (word) word.textContent = said;
    slider.setAttribute('aria-valuetext', `${v}${unit ? ` ${unit}` : ''}${said ? `, ${said}` : ''}`);
  };
  // the look is previewed once per frame while dragging, however many input events arrive
  let frame = 0;
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    field.value = v;
    show(v);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => onChange(v, { typing: true }));
  });
  slider.addEventListener('change', () => { cancelAnimationFrame(frame); onChange(Number(slider.value)); });
  field.addEventListener('input', () => {
    const v = Number(field.value);
    if (field.value === '' || v < min || v > max) return;
    show(clamp(v));
    onChange(clamp(v), { typing: true });
  });
  field.addEventListener('change', () => {
    const v = field.value === '' ? Number(slider.value) : clamp(Number(field.value));
    field.value = v;
    show(v);
    onChange(v, { typing: true, settle: true });
  });
  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    field.value = value;
    show(value);
    onChange(value, { typing: true, settle: true });
  });
  show(value);
  return h('div.range', slider, h('span.range-box', field, unit ? h('span.range-unit', { 'aria-hidden': 'true' }, unit) : null), word);
}

/**
 * A number set with − and + (or ← / → in its field), or typed: for sizes, where each press should
 * be one visible step. The typed number is staged as it is typed and settled on Enter or when the
 * field is left; Esc restores the value it had.
 */
function numberStepper(label, { min, max, step = 1, unit = '' }, value, onChange) {
  let current = value;
  const field = h('input.input.range-number', { type: 'number', min, max, step, value, autocomplete: 'off', 'aria-label': unit ? `${label} (${unit})` : label, dataset: { primary: '' } });
  const less = h('button.btn.icon.num-btn', { type: 'button', tabIndex: -1, 'aria-label': `Smaller ${label.toLowerCase()}` }, icon('minus', 14));
  const more = h('button.btn.icon.num-btn', { type: 'button', tabIndex: -1, 'aria-label': `Larger ${label.toLowerCase()}` }, icon('plus', 14));
  const show = (v) => { current = v; field.value = v; less.disabled = v <= min; more.disabled = v >= max; };
  // a press lands on the next multiple of the step (103 → 105 → 110)
  const by = (d) => {
    const next = Math.min(max, Math.max(min, d > 0 ? Math.floor(current / step) * step + step : Math.ceil(current / step) * step - step));
    if (next === current) return;
    show(next);
    onChange(next, { typing: true, settle: true });
  };
  less.addEventListener('click', () => { by(-1); field.focus(); });
  more.addEventListener('click', () => { by(1); field.focus(); });
  field.addEventListener('input', () => {
    const v = Math.round(Number(field.value));
    if (field.value === '' || v < min || v > max) return;
    current = v;
    less.disabled = v <= min; more.disabled = v >= max;
    onChange(v, { typing: true });
  });
  field.addEventListener('change', () => {
    show(field.value === '' ? current : Math.min(max, Math.max(min, Math.round(Number(field.value)))));
    onChange(current, { typing: true, settle: true });
  });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); by(e.key === 'ArrowRight' ? 1 : -1); }
    if (e.key === 'Escape') { e.stopPropagation(); show(value); onChange(value, { typing: true, settle: true }); }
  });
  show(value);
  return h('div.num-step', { role: 'group', 'aria-label': label }, less, h('span.range-box', field, unit ? h('span.range-unit', { 'aria-hidden': 'true' }, unit) : null), more);
}

const lockText = (m) => (m === 0 ? 'Never' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);
const accentText = (v) => (v ? v.toUpperCase() : 'Copper (default)');

/**
 * A row of picture choices (colour themes, backgrounds): one stop for Tab, ← / → pick the
 * neighbour, a click picks that one. Each option: { value, text, visual }.
 */
function choiceCards(label, options, value, onChange, cls = '') {
  const cards = options.map((o) => h('button.look-choice', {
    type: 'button', tabIndex: -1, 'aria-pressed': String(same(o.value, value)), dataset: { value: JSON.stringify(o.value) },
    onclick: () => pick(o.value, true),
  }, h('span.look-visual', { 'aria-hidden': 'true' }, o.visual), h('span.look-name', o.text)));
  const root = h(`div.look-choices${cls}`, { tabIndex: 0, role: 'group', 'aria-label': label, dataset: { primary: '' } }, cards);
  function pick(v, focus = false) {
    if (same(v, value)) return;
    value = v;
    for (const c of cards) c.setAttribute('aria-pressed', String(c.dataset.value === JSON.stringify(v)));
    if (focus) root.focus();
    onChange(v);
  }
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = options.findIndex((o) => same(o.value, value));
    const next = options[i + (e.key === 'ArrowRight' ? 1 : -1)];
    if (next) pick(next.value);
  });
  return root;
}

const paletteVisual = (bg, surface) => h('span.look-swatch', { style: { background: bg } },
  h('span.look-swatch-card', { style: { background: surface } }), h('span.look-swatch-accent'));

function sceneVisual(id) {
  if (id === 'none') return h('span.look-scene.is-none');
  return h('span.look-scene', sceneThumbnail(id));
}

/** Text value staged as it is typed; Esc restores the value it had. */
function textField(label, value, placeholder, onChange) {
  const input = h('input.input.mono', { value, placeholder, spellcheck: false, autocomplete: 'off', 'aria-label': label, dataset: { primary: '' } });
  input.addEventListener('input', () => onChange(input.value.trim(), { typing: true }));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = value; onChange(value.trim(), { typing: true }); e.stopPropagation(); }
  });
  return input;
}

function statusRow(name, ok, detail) {
  return h('tr',
    h('td', h('strong', name)),
    h('td', h('span.row', h(`span.dot.${ok === null ? 'hollow' : ok ? 'ok' : 'warn'}`), ok === null ? 'Not detected' : ok ? 'Connected' : 'Unavailable')),
    h('td.dim.mono', { style: { fontSize: '11px' } }, detail ?? ''));
}

export function mount(container, _route, actions) {
  const inner = h('div.view-inner.settings-view');
  container.append(h('div.view', inner));
  let defaults = null;
  let tab = TABS.some(([id]) => id === prefs.get('settings.tab')) ? prefs.get('settings.tab') : 'general';
  let query = '';
  let currentKey = null;
  let pending = false;
  let ignoredOpen = false;
  const meta = new Map(); // row element -> row spec
  // staged, unsaved changes: dotted settings key (or "local:<pref>") -> value
  const draft = new Map();
  const LOCAL = { 'sound.enabled': true, 'voice.enabled': true, 'voice.volume': 1 };
  const dirty = () => draft.size > 0;
  const stored = (key) => (key.startsWith('local:') ? prefs.get(key.slice(6), LOCAL[key.slice(6)]) : at(store.state.settings, key));
  const valueOf = (key) => (draft.has(key) ? draft.get(key) : stored(key));

  // the settings the server ships with, so every row can show its default and be reset to it
  api.get('/api/settings/defaults').then((d) => { defaults = d; render(); }).catch(() => {});

  const search = h('input.input.settings-search', { type: 'search', placeholder: 'Search settings', 'aria-label': 'Search settings', dataset: { search: '' }, spellcheck: false });
  search.addEventListener('input', () => { query = search.value; applyFilter(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; query = ''; applyFilter(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(visibleRows()[0]); }
  });

  const tabBar = h('div.stabs-list', { role: 'tablist', 'aria-label': 'Settings categories' });
  const panels = h('div.spanels');
  const detail = h('aside.settings-detail', { 'aria-label': 'About the selected setting' });
  const resetTabBtn = h('button.btn.sm.ghost', { type: 'button', onclick: () => resetTab() }, icon('refresh', 12), h('span.reset-label', 'Reset tab'));
  const saveState = h('span.save-state', { role: 'status' });
  const cancelBtn = h('button.btn', { type: 'button', onclick: () => cancelDraft() }, 'Cancel');
  const saveBtn = h('button.btn.primary', { type: 'button', onclick: () => saveDraft(), title: 'Save (Ctrl+S)' }, icon('check', 14), 'Save');
  const foot = h('div.settings-foot',
    h('span.settings-keys', { 'aria-hidden': 'true' }, [[['↑', '↓'], 'select'], [['←', '→'], 'change'], [['Q', 'E'], 'tab'], [['/'], 'search']].map(([keys, what]) => h('span', keys.map((k) => h('kbd', k)), what))),
    h('span.spacer'), resetTabBtn, saveState, cancelBtn, saveBtn);
  const empty = h('p.settings-empty', { hidden: true }, 'No setting matches.');

  inner.append(
    h('header.page-head.settings-head', h('div', h('h1', 'Settings')), h('span.spacer'), search),
    h('div.stabs', h('kbd.stabs-key', { 'aria-hidden': 'true', title: 'Previous tab' }, 'Q'), tabBar, h('kbd.stabs-key', { 'aria-hidden': 'true', title: 'Next tab' }, 'E')),
    h('div.settings-body',
      h('div.settings-main', panels, empty, foot),
      detail));

  tabBar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); cycle(e.key === 'ArrowRight' ? 1 : -1, true); }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(visibleRows()[0]); }
  });
  panels.addEventListener('focusin', (e) => select(e.target.closest('.srow')));
  panels.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.srow');
    if (row && !panels.contains(document.activeElement)) select(row);
  });
  panels.addEventListener('focusout', () => setTimeout(() => {
    if (pending && !inField(document.activeElement)) render();
  }));

  /* ---------- row specs ---------- */

  /** A server setting at `key` (dotted path) with its default, current value and reset. */
  function setting(key, label, desc, control, { fmt = String, ...extra } = {}) {
    const value = valueOf(key);
    const d = defaults ? at(defaults, key) : undefined;
    return {
      key, label, desc, current: fmt(value), ...extra,
      control: control(value, (v, o) => stage(key, v, o)),
      def: d === undefined ? undefined : fmt(d),
      modified: d !== undefined && !same(d, value),
      staged: draft.has(key),
      reset: d === undefined ? null : { key, value: d },
    };
  }
  const toggleSetting = (key, label, desc, extra) => setting(key, label, desc, (v, set) => switchControl(label, Boolean(v), set), { fmt: onOff, ...extra });

  /** A preference kept only in this browser (sound, voice). */
  function localToggle(pref, label, desc) {
    const key = `local:${pref}`;
    const fallback = LOCAL[pref];
    const v = valueOf(key);
    return {
      key, label, desc, note: 'Remembered only in this browser.',
      control: switchControl(label, v, (nv) => stage(key, nv)),
      def: onOff(fallback), current: onOff(v), modified: v !== fallback, staged: draft.has(key),
      reset: { key, value: fallback },
    };
  }

  /** A preference kept only in this browser, with its own control (voice volume). */
  function localSetting(pref, label, desc, control, fmt, extra = {}) {
    const key = `local:${pref}`;
    const fallback = LOCAL[pref];
    const v = valueOf(key);
    return {
      key, label, desc, note: 'Remembered only in this browser.', ...extra,
      control: control(v, (nv, o) => stage(key, nv, o)),
      def: fmt(fallback), current: fmt(v), modified: !same(v, fallback), staged: draft.has(key),
      reset: { key, value: fallback },
    };
  }

  /* ---------- the profile: ready-made, or made your own ---------- */

  /** The profile in force, unsaved choices included: id, name, flags, style, start tab. */
  const draftProfile = () => resolveProfile({ profile: valueOf('profile'), customProfile: valueOf('customProfile') });
  /** The ready-made profile it comes from: itself, or the one Custom was made from. */
  const baseOf = () => {
    const id = valueOf('profile');
    if (id !== 'custom') return id;
    const base = valueOf('customProfile')?.base;
    return PRESETS[base] ? base : 'builder';
  };

  /**
   * Makes the profile yours: Custom, starting from everything the profile in force has, with
   * `change` applied. When the change undoes the last difference it is the ready-made one again.
   */
  function customise(change, { revert = true, ...opts } = {}) {
    const p = draftProfile();
    const base = baseOf();
    const c = { base, flags: { ...p.flags }, style: { ...p.style }, startTab: p.startTab };
    change(c);
    const preset = customDefaults(base);
    const back = revert && same(c.flags, preset.flags) && same(c.style, preset.style) && c.startTab === preset.startTab;
    stage('customProfile', back ? stored('customProfile') : c, { typing: true });
    stage('profile', back ? base : 'custom', opts);
  }

  function pickProfile(id) {
    // Custom picked by hand: the one you made before, or a copy of the profile in force
    if (id === 'custom' && !valueOf('customProfile')) customise(() => {}, { revert: false });
    else stage('profile', id);
  }

  /** Something the profile brings (accent, background, density): yours to change, which makes it Custom. */
  function styleSetting(k, label, desc, control, { fmt = String, ...extra } = {}) {
    const key = `style.${k}`;
    const value = draftProfile().style[k];
    const base = PRESETS[baseOf()];
    const brought = base.style[k];
    return {
      key, label, desc, current: fmt(value), ...extra,
      control: control(value, (v, o) => stage(key, v, o)),
      def: fmt(brought),
      modified: !same(value, brought),
      staged: !same(value, resolveProfile(store.state.settings).style[k]),
      reset: { key, value: brought },
      note: `Default: what ${base.name} brings. Changing it makes your profile Custom, with everything else ${base.name} has.`,
    };
  }

  /** The features of the profile in force; turning one on or off makes it Custom. */
  function featuresRow() {
    const p = draftProfile();
    const base = baseOf();
    const custom = p.id === 'custom';
    return {
      key: 'features', label: 'What the profile shows',
      desc: `The sections, tabs and blocks of ${custom ? 'your profile' : p.name}, and the tab a project opens on. Turn one on or off and the profile becomes Custom, starting from these choices. Agent features stay hidden while you do not use agents (Agents tab).`,
      control: customEditor({ base, flags: p.flags, style: p.style, startTab: p.startTab }, (c) => {
        customise((x) => { x.flags = c.flags; x.startTab = c.startTab; }, { typing: true, settle: true });
        markProfile(panels.querySelector('.pf-cards'), valueOf('profile'));
      }, { agentsInUse: usesAgents({ agents: { use: valueOf('agents.use') } }) }),
      current: custom ? `Custom, made from ${PRESETS[base].name}` : `As in ${p.name}`,
      def: `As in ${PRESETS[base].name}`,
      modified: custom,
      staged: draft.has('profile') || draft.has('customProfile'),
      reset: custom ? { key: 'profile', value: base } : null,
      wide: true, keywords: 'features sections tabs blocks custom start tab',
    };
  }

  const action = (key, label, desc, control, extra) => ({ key, label, desc, control, ...extra });

  function buildTabs() {
    const s = store.state.settings;
    const i = store.state.integrations;
    const auth = store.state.auth;
    const ignored = store.state.ignored ?? [];
    const tools = i?.agents ?? store.state.agents.tools ?? [];
    const editorInstalled = (command) => Boolean(i?.editors?.find((e) => e.command === command)?.installed);

    const roots = h('ul.list.panel.roots', s.roots.length
      ? s.roots.map((r) => h('li', icon('folder', 14), h('span.ellipsis', r), h('span.spacer'),
        actionButton('', () => attempt(async () => store.set('settings', await api.del('/api/settings/roots', { path: r }))), { cls: 'btn sm icon ghost', iconName: 'x', title: `Remove ${r}` })))
      : h('li.faint', 'No directories yet.'));

    const pwCurrent = h('input.input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Current password' });
    const pwNext = h('input.input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'New password', minLength: 8 });
    const pinPassword = h('input.input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Password' });
    const pinValue = h('input.input.mono', { inputMode: 'numeric', maxLength: 8, autocomplete: 'off', placeholder: '4–8 digits', 'aria-label': 'New PIN' });

    return {
      general: [
        ['Project directories', [
          action('roots', 'Watched folders', 'FlintBench scans these folders on startup and watches them for new projects. Your folders are only read, never modified.',
            h('div.stack', roots, addRootForm()), { wide: true }),
          setting('scanDepth', 'Scan depth', 'How many folder levels below each watched folder are searched for projects. Deeper finds more, but scans take longer.',
            (v, set) => rangeField('Scan depth', { min: 1, max: 8, unit: 'levels' }, v ?? 3, set),
            { fmt: (v) => `${v} level${v > 1 ? 's' : ''}`, keywords: 'depth levels deep folders' }),
          toggleSetting('autoAddGitRepos', 'Add Git repositories automatically', 'Discovered Git repositories join the project list without asking. Off: they wait in the new-project inbox on Home.'),
          action('rescan', 'Rescan now', 'Scans every watched folder again right away instead of waiting for a change.',
            actionButton('Rescan', () => attempt(() => api.post('/api/projects/scan'), { success: 'Scan complete' }), { cls: 'btn sm', iconName: 'refresh' })),
          action('ignored', 'Ignored folders', 'Folders scans skip: projects you dismissed, or folders you chose. Restore one to let scans find it again.',
            ignoredDrawer(ignored, ignoredOpen, (v) => { ignoredOpen = v; }), { wide: true }),
        ]],
      ],
      profile: [
        ['Profile', [
          setting('profile', 'Profile', 'Decides which sections, tabs and details the console shows and the tab a project opens on, and brings an accent and a density. Change any of them, here or in Appearance, and it becomes Custom, keeping the rest. It previews at once; Save keeps it.',
            (v) => profileCards({ value: v, labs: true, onPick: pickProfile }),
            { fmt: (v) => PRESETS[v]?.name ?? 'Custom', wide: true, keywords: 'layout structure style essentials builder pro pilot custom labs test' }),
          featuresRow(),
        ]],
      ],
      appearance: [
        ['Display', [
          setting('uiScale', 'Text size', 'How large text is drawn. Containers, spacing and icons grow with it, so everything keeps its proportions; the top bar keeps its size. − and + step by 5%, or type any size from 75 to 150%.',
            (v, set) => numberStepper('Text size', { min: UI_SCALE_RANGE[0] * 100, max: UI_SCALE_RANGE[1] * 100, step: 5, unit: '%' }, Math.round((v ?? 1) * 100), (n, o) => set(n / 100, o)),
            { fmt: (v) => `${Math.round((v ?? 1) * 100)}%`, keywords: 'zoom size larger smaller scale bigger text font interface ui' }),
          setting('theme', 'Theme', 'Dark first. System follows the operating system and switches with it.',
            (v, set) => stepper('Theme', [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']].map(([value, text]) => ({ value, text })), v, set),
            { fmt: (v) => v[0].toUpperCase() + v.slice(1) }),
          styleSetting('density', 'Density', 'Row heights and spacing. Compact fits more on screen.',
            (v, set) => stepper('Density', DENSITIES.map(([value, text]) => ({ value, text })), v || 'comfortable', set),
            { fmt: (v) => DENSITIES.find(([id]) => id === v)?.[1] ?? 'Comfortable', keywords: 'compact comfortable spacing rows' }),
        ]],
        ['Colours and background', [
          setting('appearance.palette', 'Colour theme', 'The colours of the canvas, bars and containers, in dark and in light.',
            (v, set) => choiceCards('Colour theme', PALETTES.map(([value, text, bg, surface]) => ({ value, text, visual: paletteVisual(bg, surface) })), v, set, '.is-palettes'),
            { fmt: (v) => PALETTES.find(([id]) => id === v)?.[1] ?? 'Graphite', wide: true, keywords: 'colour color palette theme navy blue green purple brown black oled' }),
          styleSetting('accent', 'Accent colour', 'The colour of selections, links, focus and the clock.',
            (v, set) => accentPicker(v, set),
            { fmt: accentText, wide: true, keywords: 'color colour accent highlight hue' }),
          setting('appearance.scene', 'Background', 'A video behind the console. Blue hour: a city skyline across a calm river just after sunset. Night sky: clouds drifting over a town at dusk. Fireworks: New Year over Dubai. Red and blue: soft geometric shapes on black.',
            (v, set) => choiceCards('Background', SCENES.map(([value, text]) => ({ value, text, visual: sceneVisual(value) })), v, set, '.is-scenes'),
            { fmt: (v) => SCENES.find(([id]) => id === v)?.[1] ?? 'None', wide: true, keywords: 'wallpaper image scene picture video blue hour lake night sky clouds fireworks dubai red blue geometric animated' }),
          valueOf('appearance.scene') !== 'none'
            ? toggleSetting('appearance.sceneMotion', 'Animated background', 'Off: the picture stands still. It also stands still when the system asks for reduced motion, and pauses while FlintBench is not on screen.', { keywords: 'motion animation still' })
            : null,
          valueOf('appearance.scene') !== 'none'
            ? setting('appearance.sceneBlur', 'Background blur', 'Softens the picture so text in front of it stays easy to read. A blurred background also costs less to draw.',
              (v, set) => rangeField('Background blur', { min: BLUR_RANGE[0], max: BLUR_RANGE[1], unit: 'px', hint: (n) => (n ? '' : 'Off') }, v ?? 0, set),
              { fmt: (v) => (v ? `${v} px` : 'Off'), keywords: 'blur soft focus' })
            : null,
          styleSetting('background', 'Pattern', 'A faint pattern on the page canvas. Hidden while a background picture is on.',
            (v, set) => stepper('Pattern', PATTERNS.map(([value, text]) => ({ value, text })), v || 'none', set),
            { fmt: (v) => PATTERNS.find(([id]) => id === v)?.[1] ?? 'None', keywords: 'pattern hexagons dots grid lines texture' }),
          setting('appearance.transparency', 'Transparency', 'How much of the background shows through the bars, cards and panels. Menus and dialogs stay almost solid.',
            (v, set) => rangeField('Transparency', { min: TRANSPARENCY_RANGE[0], max: TRANSPARENCY_RANGE[1], unit: '%', hint: (n) => (n ? '' : 'Solid') }, v ?? 0, set),
            { fmt: (v) => (v ? `${v}%` : 'Solid'), keywords: 'glass opacity translucent see-through' }),
        ].filter(Boolean)],
      ],
      audio: [
        ['Notifications', [
          setting('notifications.level', 'Notifications', 'Everything: agents finishing, services starting, every commit and push made outside FlintBench. Only what matters: agents finishing and pushes. Quiet: only the outcome of what you do yourself.',
            (v, set) => stepper('Notifications', [['all', 'Everything'], ['important', 'Only what matters'], ['quiet', 'Quiet']].map(([value, text]) => ({ value, text })), v ?? 'all', set),
            { fmt: (v) => ({ all: 'Everything', important: 'Only what matters', quiet: 'Quiet' })[v] ?? 'Everything', keywords: 'toast alerts notify' }),
        ]],
        ['Feedback', [
          localToggle('sound.enabled', 'Interface sounds', 'Short synthesised tones mark outcomes — unlock, ready, success, error, agent start and stop, lock. Never hovering or typing.'),
          localToggle('voice.enabled', 'Spoken greeting', 'After you unlock, a recorded voice greets you for the time of day.'),
          localSetting('voice.volume', 'Voice volume', 'How loud the spoken greeting plays, relative to the system volume. Test voice below uses the value shown, before you save.',
            (v, set) => rangeField('Voice volume', { min: 0, max: 100, unit: '%', hint: (n) => (n ? '' : 'Silent') }, Math.round((v ?? 1) * 100), (n, o) => set(n / 100, o)),
            (v) => `${Math.round((v ?? 1) * 100)}%`, { keywords: 'volume loud quiet audio speech greeting' }),
        ]],
        ['Test', [
          action('test-sound', 'Test sound', 'Plays the "ready" tone.', h('button.btn.sm', { type: 'button', onclick: () => play('ready') }, icon('play', 11), 'Play')),
          action('test-voice', 'Test voice', 'Plays the greeting for the current time of day.', h('button.btn.sm', { type: 'button', onclick: async () => { if (!(await playGreeting(new Date(), { volume: valueOf('local:voice.volume') }))) toast('Voice is off, or the browser blocked playback', { kind: 'info' }); } }, icon('play', 11), 'Play')),
          action('test-notify', 'Sample notifications', 'Shows each kind of notification once: success, warning, error, information and an agent finishing a task.', h('button.btn.sm', { type: 'button', onclick: showSampleNotifications }, icon('play', 11), 'Show')),
        ]],
      ],
      agents: [
        ['Use', [
          setting('agents.use', 'Do you build with AI agents?', 'No: no agent buttons, tabs or sections anywhere, whatever the profile. Sometimes: agents are there when you want them. Most of my work: the setup recommends AI Pilot.',
            (v, set) => stepper('Agents', [['none', 'No'], ['sometimes', 'Sometimes'], ['mostly', 'Most of my work']].map(([value, text]) => ({ value, text })), v ?? 'sometimes', set),
            { fmt: (v) => ({ none: 'No', sometimes: 'Sometimes', mostly: 'Most of my work' })[v] ?? 'Sometimes', keywords: 'ai agent claude codex' }),
        ]],
        ['Detection', [
          toggleSetting('agents.detection', 'Detect installed agents', 'Looks for Claude Code and Codex on PATH. FlintBench starts them in the project folder; they use their own login, plan and limits — no API key is stored or proxied here.'),
          toggleSetting('agents.readSessionFiles', 'Read session metadata', 'Reads only file names, timestamps and the recorded working directory of ~/.claude/projects and ~/.codex/sessions to detect sessions started outside FlintBench. Conversation content is never read.'),
          toggleSetting('agents.readTranscripts', 'Live transcript of external sessions', 'Shows the conversation of a Claude Code, Codex or Antigravity CLI session running in another terminal as a read-only tab in the terminal dock. Reads the transcript only while that tab is open; nothing is stored.'),
          toggleSetting('agents.taskPreviews', 'Task previews in notifications', 'When an agent finishes a task, the notification quotes the first lines of its last reply, read from its own session file. Off: it only says which agent finished, and where.'),
          toggleSetting('agents.resumeExchange', 'Agent work in Welcome back', 'When you come back to a project, "What you did" also says what an agent did: how many requests, the files its tools edited, the commands it ran, whether it stopped mid-request. Read from the agent\'s own session file each time the briefing is shown, never saved by FlintBench and never quoted. Off: files, lines, commits and tests only.'),
        ]],
        ['Claude Code', [
          toggleSetting('agents.claude.enabled', 'Claude Code', 'Offer Claude Code in project menus and the Agents section.'),
          setting('agents.claude.command', 'Claude Code command', 'Command used to start Claude Code. Empty: "claude" from PATH.',
            (v, set) => textField('Claude Code command', v, 'claude', set), { fmt: (v) => v || 'claude' }),
        ]],
        ['Codex', [
          toggleSetting('agents.codex.enabled', 'Codex', 'Offer Codex in project menus and the Agents section.'),
          setting('agents.codex.command', 'Codex command', 'Command used to start Codex. Empty: "codex" from PATH.',
            (v, set) => textField('Codex command', v, 'codex', set), { fmt: (v) => v || 'codex' }),
        ]],
        ['Antigravity CLI', [
          toggleSetting('agents.antigravity.enabled', 'Antigravity CLI', 'Offer Antigravity CLI in project menus and the Agents section.'),
          setting('agents.antigravity.command', 'Antigravity CLI command', 'Command used to start Antigravity CLI. Empty: "agy" from PATH.',
            (v, set) => textField('Antigravity CLI command', v, 'agy', set), { fmt: (v) => v || 'agy' }),
        ]],
      ],
      integrations: [
        ['Status', [
          action('integrations', 'Detected tools', 'Tools FlintBench connects to. Nothing is installed or configured on your behalf.',
            h('div.table-wrap', h('table.table',
              h('thead', h('tr', h('th', 'Tool'), h('th', 'Status'), h('th', 'Details'))),
              h('tbody',
                statusRow('Git', i?.git?.installed ?? null, i?.git?.version),
                statusRow('Docker', i?.docker?.installed ? i.docker.running : null, i?.docker?.enabled === false ? 'integration disabled' : (i?.docker?.version ? `engine ${i.docker.version}` : i?.docker?.error)),
                tools.map((t) => statusRow(t.name, t.installed ? true : null, t.installed ? `${t.version ?? ''} ${t.launchable ? '' : '· launch not supported yet'}` : 'not on PATH')),
                statusRow('Editor', i?.editor?.installed ? true : null, i?.editor?.command)))),
            { wide: true, keywords: 'git docker editor' }),
          action('recheck', 'Check again', 'Looks for the tools again, e.g. after installing one.',
            actionButton('Re-check', async () => {
              const next = await attempt(() => api.get('/api/integrations'));
              if (next) store.set('integrations', next);
            }, { cls: 'btn sm', iconName: 'refresh' })),
        ]],
        ['Tools', [
          toggleSetting('docker.enabled', 'Docker integration', 'Shows compose services and containers in each project and lets you start and stop them.'),
          setting('editor.command', 'Default editor', 'Opens on a click ("Open in editor"). Its command must be on PATH.',
            (v, set) => stepper('Default editor', [...new Set([v || 'code', ...EDITORS.filter((e) => editorInstalled(e.command)).map((e) => e.command)])].map((c) => ({ value: c, text: editorName(c) })), v || 'code', set),
            { fmt: (v) => editorName(v || 'code'), keywords: 'ide vscode cursor zed open' }),
          setting('editor.others', 'Other editors', 'Offered in the menus as "Open in …", next to the default one.',
            (v, set) => h('div.row.wrap.editor-picks', EDITORS.filter((e) => e.command !== (valueOf('editor.command') || 'code')).map((e) => h('label.check',
              h('input', { type: 'checkbox', checked: (v ?? []).includes(e.command), onchange: (ev) => set(ev.target.checked ? [...(v ?? []), e.command] : (v ?? []).filter((c) => c !== e.command)) }),
              e.name, editorInstalled(e.command) ? null : h('span.faint.small', ' (not found)')))),
            { fmt: (v) => ((v ?? []).length ? v.map(editorName).join(', ') : 'None'), wide: true, keywords: 'ide vscode cursor zed open' }),
        ]],
      ],
      terminal: [
        ['Shell', [
          setting('terminal.shell', 'Shell', 'Shell used for project terminals and services. Empty: the platform default.',
            (v, set) => h('div.row', textField('Shell', v, i?.shell?.default ?? 'default shell', set),
              browseButton('Browse…', { kind: 'file', title: 'Choose the shell for project terminals', filterName: 'Programs', filterSpec: '*.exe;*.cmd;*.bat' }, (file) => set(file))),
            { fmt: (v) => v || 'platform default', note: `In use: ${i?.shell?.path ?? '—'}` }),
        ]],
      ],
      security: [
        ['Session', [
          setting('autoLockMinutes', 'Auto-lock', 'Locks the console after this much inactivity. Unlock with the password, or the PIN in a browser already signed in.',
            (v, set) => rangeField('Auto-lock', { min: 0, max: 480, unit: 'min', hint: (m) => (m === 0 || m >= 60 ? lockText(m) : '') }, v ?? 30, set),
            { fmt: lockText, note: '0 never locks. Up to 8 hours.', keywords: 'lock timeout idle minutes' }),
          action('lock', 'Lock now', 'Locks this console immediately. Shortcut: Ctrl+Shift+L.',
            h('button.btn.sm', { type: 'button', onclick: () => actions.lock() }, icon('lock', 12), 'Lock')),
          action('logout', 'Log out', 'Signs this browser out. You will need the password to sign in again.',
            h('button.btn.sm.ghost', { type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Log out?', body: 'You will need your password to sign in again on this browser.', confirm: 'Log out' })) actions.logout(); } }, icon('logout', 12), 'Log out')),
        ]],
        [`Credentials · signed in as ${auth?.username ?? 'owner'}`, [
          action('password', 'Password', 'Stored as an Argon2id hash. Changing it keeps this browser signed in.',
            h('form.sform', {
              onsubmit: async (e) => {
                e.preventDefault();
                const ok = await attempt(() => api.post('/api/auth/password', { current: pwCurrent.value, next: pwNext.value }), { success: 'Password changed', failure: 'Password not changed' });
                if (ok) { pwCurrent.value = ''; pwNext.value = ''; }
              },
            }, h('label.field', h('span', 'Current password'), pwCurrent), h('label.field', h('span', 'New password'), pwNext), h('button.btn', { type: 'submit' }, 'Change password')),
            { wide: true }),
          action('pin', auth?.hasPin ? 'PIN' : 'PIN (not set)', 'Quick unlock with 4–8 digits. Works only in browsers already signed in with the password. Stored as an Argon2id hash.',
            h('form.sform', {
              onsubmit: async (e) => {
                e.preventDefault();
                const st = await attempt(() => api.post('/api/auth/pin', { password: pinPassword.value, pin: pinValue.value || null }), { success: pinValue.value ? 'PIN saved' : 'PIN removed', failure: 'PIN not changed' });
                if (st) { store.state.auth = st; pinPassword.value = ''; pinValue.value = ''; render(); }
              },
            }, h('label.field', h('span', 'Password'), pinPassword), h('label.field', h('span', 'New PIN'), pinValue), h('button.btn', { type: 'submit' }, auth?.hasPin ? 'Update PIN' : 'Set PIN')),
            { wide: true, note: auth?.hasPin ? 'Leave the new PIN empty to remove it.' : undefined }),
        ]],
      ],
      data: [
        ['Storage', [
          action('data-dir', 'Data folder', 'All FlintBench state lives here: account hashes, settings, project list, work items, notes, agent journal and activity history. Delete the folder to delete all of it. Your projects are never stored or modified there.',
            h('div.panel.panel-body.row', icon('folder', 14), h('code.ellipsis', store.state.dataDir)), { wide: true }),
          action('last-scan', 'Last scan', 'No database, no cloud copy, no telemetry.', h('span.mono.dim', ago(store.state.lastScanAt))),
        ]],
      ],
    };
  }

  /* ---------- rendering ---------- */

  function rowEl(r, tabId) {
    const descId = `sd-${r.key.replace(/\W/g, '-')}`;
    const el = h(`div.srow${r.wide ? '.is-wide' : ''}`, { dataset: { row: r.key, tab: tabId } },
      h('div.srow-label',
        h('span.srow-name', r.label, r.modified ? h('span.srow-mod', { title: 'Changed from default' }, h('span.sr-only', '(changed)')) : null,
          r.staged ? h('span.srow-unsaved', 'Unsaved') : null),
        r.desc ? h('span.srow-desc', { id: descId }, r.desc) : null),
      h('div.srow-control', r.control));
    const primary = primaryOf(el);
    if (primary && r.desc && !primary.hasAttribute('aria-describedby')) primary.setAttribute('aria-describedby', descId);
    meta.set(el, { ...r, tab: tabId, search: `${r.label} ${r.desc ?? ''} ${r.keywords ?? ''}`.toLowerCase() });
    return el;
  }

  function render() {
    if (!store.state.settings) return;
    pending = false;
    const view = inner.parentElement;
    const scrollTop = view.scrollTop;
    const active = document.activeElement;
    const focusKey = panels.contains(active) ? active.closest('.srow')?.dataset.row : null;
    const tabFocused = tabBar.contains(active);
    meta.clear();

    const spec = buildTabs();
    replace(tabBar, TABS.map(([id, label]) => h('button.stab', {
      type: 'button', role: 'tab', id: `stab-${id}`, 'aria-controls': `spanel-${id}`, dataset: { tab: id },
      'aria-selected': String(id === tab), tabIndex: id === tab ? 0 : -1,
      onclick: () => setTab(id),
    }, label, h('span.stab-count', { 'aria-hidden': 'true' }))));
    replace(panels, TABS.map(([id, label]) => h('section.spanel', { role: 'tabpanel', id: `spanel-${id}`, 'aria-labelledby': `stab-${id}`, dataset: { tab: id } },
      h('h2.spanel-title', label),
      spec[id].map(([title, rows]) => h('div.sgroup', h('h3.sgroup-title', title), rows.filter(Boolean).map((r) => rowEl(r, id)))))));

    applyFilter();
    updateBar();
    if (dirty()) preview(); // a settings push from the server must not undo the preview
    const keep = currentKey && rowByKey(currentKey) && !rowByKey(currentKey).closest('[hidden]') ? rowByKey(currentKey) : visibleRows()[0];
    currentKey = null;
    select(keep);
    view.scrollTop = scrollTop;
    if (focusKey) primaryOf(rowByKey(focusKey))?.focus({ preventScroll: true });
    else if (tabFocused) tabBar.querySelector('[aria-selected="true"]')?.focus();
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    inner.classList.toggle('is-searching', Boolean(q));
    const counts = Object.fromEntries(TABS.map(([id]) => [id, 0]));
    for (const [el, r] of meta) {
      const hit = !q || r.search.includes(q);
      el.hidden = !hit;
      if (hit) counts[r.tab] += 1;
    }
    for (const g of panels.querySelectorAll('.sgroup')) g.hidden = !g.querySelector('.srow:not([hidden])');
    for (const p of panels.children) p.hidden = q ? !counts[p.dataset.tab] : p.dataset.tab !== tab;
    for (const b of tabBar.children) b.querySelector('.stab-count').textContent = q && counts[b.dataset.tab] ? String(counts[b.dataset.tab]) : '';
    empty.hidden = !q || Object.values(counts).some(Boolean);
    const label = TABS.find(([id]) => id === tab)[1];
    const resettable = [...meta.values()].filter((r) => r.tab === tab && r.modified && r.reset);
    resetTabBtn.hidden = Boolean(q);
    resetTabBtn.disabled = !resettable.length;
    resetTabBtn.title = resettable.length ? `Restore ${resettable.length} changed setting${resettable.length > 1 ? 's' : ''} in ${label}` : `Everything in ${label} is at its default`;
    resetTabBtn.querySelector('.reset-label').textContent = `Reset ${label}`;
    if (q && !visibleRows().some((el) => el.dataset.row === currentKey)) select(visibleRows()[0]);
  }

  function visibleRows() {
    return [...panels.querySelectorAll('.srow')].filter((el) => !el.closest('[hidden]'));
  }
  const rowByKey = (key) => [...meta.keys()].find((el) => el.dataset.row === key);

  function primaryOf(row) {
    return row?.querySelector('[data-primary]') ?? row?.querySelector('.srow-control button:not([disabled]), .srow-control input, .srow-control select, .srow-control [tabindex="0"]');
  }

  function focusRow(row) {
    if (!row) return;
    const target = primaryOf(row);
    if (target) target.focus();
    else select(row);
    row.scrollIntoView({ block: 'nearest' });
  }

  /** Highlights a row and shows its details in the side panel. */
  function select(row) {
    if (!row) { currentKey = null; replace(detail, h('p.faint', 'Select a setting to see what it does.')); return; }
    if (row.dataset.row === currentKey) return;
    currentKey = row.dataset.row;
    for (const el of meta.keys()) el.classList.toggle('is-current', el === row);
    const r = meta.get(row);
    replace(detail,
      h('div.label', TABS.find(([id]) => id === r.tab)[1]),
      h('h2', r.label),
      r.desc ? h('p', r.desc) : null,
      r.def !== undefined || r.current !== undefined ? h('dl.detail-facts',
        r.current !== undefined ? [h('dt', 'Current'), h('dd.mono', { class: r.modified ? 'accent-text' : '' }, r.current)] : null,
        r.def !== undefined ? [h('dt', 'Default'), h('dd.mono', r.def)] : null) : null,
      r.note ? h('p.faint.small', r.note) : null,
      r.reset && r.modified ? h('button.btn.sm', { type: 'button', onclick: () => resetRows([r]) }, icon('refresh', 12), 'Reset to default') : null);
  }

  /* ---------- draft: stage, save, cancel ---------- */

  /** Stages a value (dropping it when it equals the saved one) and previews the look at once. */
  function stage(key, value, { typing = false, settle = false } = {}) {
    if (key.startsWith('style.')) { customise((c) => { c.style[key.slice(6)] = value; }, { typing, settle }); return; }
    if (same(value, stored(key))) draft.delete(key);
    else draft.set(key, value);
    if (['theme', 'profile', 'customProfile', 'uiScale'].includes(key) || key.startsWith('appearance.')) preview();
    if (typing) {
      if (settle) pending = true; // drawn again once the focus leaves the field
      updateBar();
      return; // no rebuild under the cursor
    }
    render();
  }

  function preview() {
    // the look of the profile on show, with your theme and scale (unsaved choices included)
    const appearance = Object.fromEntries(['palette', 'scene', 'sceneMotion', 'sceneBlur', 'transparency'].map((k) => [k, valueOf(`appearance.${k}`)]));
    applySettingsLook({ ...store.state.settings, theme: valueOf('theme'), profile: valueOf('profile'), customProfile: valueOf('customProfile'), uiScale: valueOf('uiScale') ?? 1, appearance });
  }

  function updateBar() {
    const n = draft.size;
    inner.classList.toggle('is-dirty', n > 0);
    saveState.textContent = n ? `${n} unsaved change${n > 1 ? 's' : ''}` : 'All changes saved';
    saveBtn.disabled = !n;
    cancelBtn.hidden = !n;
    search.disabled = n > 0;
    search.title = n ? 'Save or cancel your changes first' : '';
    for (const b of tabBar.children) b.setAttribute('aria-disabled', String(n > 0 && b.dataset.tab !== tab));
  }

  async function saveDraft() {
    if (!dirty()) return true;
    const patch = {};
    const local = [];
    for (const [key, value] of draft) {
      if (key.startsWith('local:')) local.push([key.slice(6), value]);
      else merge(patch, patchOf(key, value));
    }
    saveBtn.disabled = true;
    if (Object.keys(patch).length && !(await saveSettings(patch))) { updateBar(); return false; }
    for (const [pref, value] of local) prefs.set(pref, value);
    draft.clear();
    toast('Settings saved', { kind: 'ok' });
    render();
    return true;
  }

  function cancelDraft({ quiet = false } = {}) {
    draft.clear();
    preview();
    if (!quiet) render();
  }

  /** With unsaved changes the page holds: a nudge on the save bar says what to do. */
  function holdBack() {
    if (!dirty()) return false;
    foot.classList.remove('is-nudged');
    void foot.offsetWidth; // restart the nudge
    foot.classList.add('is-nudged');
    saveBtn.focus({ preventScroll: true });
    foot.scrollIntoView({ block: 'nearest' });
    return true;
  }

  function resetRows(rows) {
    for (const r of rows) stage(r.reset.key, r.reset.value, { typing: true });
    currentKey = null;
    render();
  }

  function resetTab() {
    const rows = [...meta.values()].filter((r) => r.tab === tab && r.modified && r.reset);
    if (rows.length) resetRows(rows);
  }

  function setTab(id, focus = false) {
    if (id !== tab && holdBack()) return;
    tab = id;
    prefs.set('settings.tab', id);
    if (query) { query = ''; search.value = ''; }
    for (const b of tabBar.children) {
      const on = b.dataset.tab === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    applyFilter();
    select(visibleRows()[0]);
    inner.parentElement.scrollTop = 0;
  }

  function cycle(d, focus = false) {
    const n = TABS.findIndex(([id]) => id === tab);
    setTab(TABS[(n + d + TABS.length) % TABS.length][0], focus);
  }

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      saveDraft();
      return;
    }
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    const t = e.target;
    const k = e.key.toLowerCase();
    if ((k === 'q' || k === 'e') && !inField(t)) {
      e.preventDefault();
      cycle(k === 'q' ? -1 : 1, tabBar.contains(t));
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && panels.contains(t) && !t.closest('select, textarea')) {
      e.preventDefault();
      const rows = visibleRows();
      const n = rows.indexOf(t.closest('.srow'));
      if (e.key === 'ArrowUp' && n <= 0) search.focus();
      else focusRow(rows[Math.min(rows.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))]);
    }
  }
  document.addEventListener('keydown', onKey);

  // Re-render when settings / integrations change, but never under the user's typing.
  const unsub = subscribe(['settings', 'integrations', 'ignored'], () => {
    if (inner.contains(document.activeElement) && inField(document.activeElement)) { pending = true; return; }
    render();
  });
  // leaving Settings with unsaved changes asks first; saying yes drops them
  const offGuard = setLeaveGuard(async () => {
    if (!dirty()) return true;
    const ok = await confirmDialog({ title: 'Discard unsaved changes?', body: `${draft.size} change${draft.size > 1 ? 's' : ''} in Settings ${draft.size > 1 ? 'are' : 'is'} not saved. Stay to save ${draft.size > 1 ? 'them' : 'it'}, or leave and lose ${draft.size > 1 ? 'them' : 'it'}.`, confirm: 'Discard and leave', danger: true });
    if (ok) cancelDraft({ quiet: true });
    return ok;
  });
  const beforeUnload = (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  render();
  return {
    destroy() {
      unsub();
      offGuard();
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('keydown', onKey);
      if (dirty()) cancelDraft({ quiet: true }); // locked or signed out: the preview goes back
    },
  };
}
