import { h, icon } from '../lib/dom.js';
import { FEATURES, PRESETS, START_TABS, AGENT_FEATURES, customDefaults } from '../lib/profiles.js';

const ORDER = ['essentials', 'builder', 'pro', 'pilot'];

/** What a profile shows, in a few words: the sections and tabs it adds to the basics. */
function highlights(flags) {
  const on = (k) => flags[k] !== false;
  const parts = [];
  const tabs = ['tab.services', 'tab.agents', 'tab.docs', 'tab.sessions', 'tab.tasks', 'tab.graph'].filter(on).length;
  parts.push(`${tabs + 3} project tabs`);
  const sections = ['nav.agents', 'nav.activity', 'nav.github'].filter(on).length;
  parts.push(`${sections + 3} sections`);
  if (on('ui.technical')) parts.push('technical details');
  return parts.join(' · ');
}

/**
 * The profiles as cards to choose from (radio semantics): the ready-made ones, then Custom. Each
 * is told by its icon (colours are yours to choose in Appearance, so they no longer tell them
 * apart). `recommended` gets a badge; Labs is offered only when `labs` is true.
 */
export function profileCards({ value, recommended = null, labs = false, onPick }) {
  const ids = [...ORDER, 'custom', ...(labs ? ['test'] : [])];
  const name = `pf-${Math.random().toString(36).slice(2, 7)}`;
  return h('div.pf-cards', { role: 'radiogroup', 'aria-label': 'Profiles' }, ids.map((id) => {
    const p = PRESETS[id];
    const input = h('input.pf-radio', { type: 'radio', name, value: id, checked: id === value, onchange: () => onPick(id) });
    return h(`label.pf-card${id === value ? '.is-on' : ''}`, { dataset: { id } },
      input,
      h('span.pf-icon', { 'aria-hidden': 'true' }, icon(p?.icon ?? 'settings', 22)),
      h('span.pf-text',
        h('span.pf-name', p?.name ?? 'Custom', id === recommended ? h('span.chip.accent', 'Recommended') : null),
        h('span.pf-tag', p?.tagline ?? 'Your own mix'),
        h('span.pf-desc', p?.description ?? 'Every section, tab and block on or off, with the accent and density you choose in Appearance. Changing anything in a profile makes it Custom.'),
        p ? h('span.pf-meta', highlights(p.flags)) : null));
  }));
}

/** Shows `id` as the chosen card without drawing the cards again (focus stays where it is). */
export function markProfile(cards, id) {
  for (const c of cards?.querySelectorAll('.pf-card') ?? []) {
    c.classList.toggle('is-on', c.dataset.id === id);
    c.querySelector('.pf-radio').checked = c.dataset.id === id;
  }
}

/**
 * What a profile shows: every feature on or off (grouped as in the console) and the tab a project
 * opens on. `onChange` gets the whole profile each time. Agent features are marked when you said
 * you do not use agents (they stay hidden then). The style (accent, background, density) is
 * carried along unchanged: it is chosen in Settings › Appearance.
 */
export function customEditor(initial, onChange, { agentsInUse = true } = {}) {
  const c = structuredClone(initial ?? customDefaults());
  const emit = () => onChange(structuredClone(c));
  const groups = new Map();
  for (const [key, group, label, hint] of FEATURES) {
    if (!groups.has(group)) groups.set(group, []);
    const box = h('input', { type: 'checkbox', checked: c.flags[key] !== false, onchange: (e) => { c.flags[key] = e.target.checked; emit(); } });
    const off = AGENT_FEATURES.has(key) && !agentsInUse;
    groups.get(group).push(h(`label.pf-flag${off ? '.is-off' : ''}`, box,
      h('span', h('span.pf-flag-name', label), h('span.pf-flag-hint', off ? `${hint} Hidden while you do not use agents.` : hint))));
  }
  const choice = (label, options, value, set) => {
    const name = `pfc-${Math.random().toString(36).slice(2, 7)}`;
    return h('div.pf-choice', { role: 'radiogroup', 'aria-label': label },
      h('span.pf-choice-label', label),
      h('div.pf-seg', options.map(([id, text]) => h('label.pf-seg-opt',
        h('input', { type: 'radio', name, value: id, checked: id === value, onchange: () => { set(id); emit(); } }), h('span', text)))));
  };
  return h('div.pf-editor',
    h('div.pf-groups', [...groups].map(([group, rows]) => h('fieldset.pf-group', h('legend', group), rows))),
    h('fieldset.pf-group.pf-style', h('legend', 'Projects'),
      choice('A project opens on', START_TABS, c.startTab || 'overview', (v) => { c.startTab = v; })));
}
