import { h, icon, replace, actionButton } from '../lib/dom.js';
import { store, subscribe, prefs, notify } from '../lib/store.js';
import { api, projectUrl } from '../lib/api.js';
import { navigate, projectPath } from '../lib/router.js';
import { plural } from '../lib/format.js';
import { statusDot, attempt, FILES_MOVING_MS } from '../lib/ui.js';
import { addRootForm } from './settings.js';
import { projectCard } from './home-card.js';
import { agentMark } from '../lib/agent-icons.js';
import { contextMenu, copyText } from '../lib/menu.js';
import { toast } from '../lib/ui.js';
import { removeProject } from './projects.js';
import { has, agentsInUse } from '../lib/feature.js';
import { editorItems } from '../lib/editor-menu.js';
import { selectMenu } from '../lib/select-menu.js';
import { closedNotice, dismissClosed, reopenConversation, moveHere } from './project/agent-panel.js';
import { resumeWork } from '../lib/resume.js';
import { relocationText, relocationActions } from '../lib/relocation.js';

/** Something FlintBench can start: a defined service or a compose file with Docker available. */
export function canStart(p) {
  return (p.runtime?.services ?? []).some((s) => s.kind !== 'test') || Boolean(p.docker?.composeFiles?.length && p.docker?.available);
}

export async function startProject(p) {
  // each service that comes up gets its own "Service started" notification (shell, from the server event)
  const r = await attempt(() => api.post(projectUrl(p.id, '/start')), { failure: `Could not start ${p.name}` });
  if (r && !r.started?.length) toast(`${p.name}: nothing to start`, { kind: 'info' });
  return r;
}

export async function stopProject(p) {
  // stopping is what was asked: no notification, except for what was stopped in another window
  // (a dev server started from your own terminal) and when there was nothing to stop
  const r = await attempt(() => api.post(projectUrl(p.id, '/stop')), { failure: `Could not stop ${p.name}` });
  if (r?.external?.length) {
    const what = r.external.map((x) => `${x.name.replace(/\.exe$/i, '')}${x.ports?.length ? ` :${x.ports.join(', :')}` : ''}`).join(', ');
    toast(`Stopped ${what}`, { kind: 'ok', title: `${p.name} stopped`, detail: 'Started outside FlintBench: its terminal stays open.' });
  } else if (r && !r.stopped?.length) {
    toast(`${p.name}: nothing was running`, { kind: 'info' });
  }
  return r;
}

/** Open the project and show one of its dock tabs (a terminal, or 'tx:<session>' for a conversation). */
function showTab(p, tabId) {
  navigate(projectPath(p.id));
  setTimeout(() => window.dispatchEvent(new CustomEvent('flintbench:show-tab', { detail: { projectId: p.id, tabId } })), 0);
}

/** VS Code on the project: to the front if open, opened otherwise. */
async function focusEditor(p) {
  const r = await attempt(() => api.post(projectUrl(p.id, '/editor/focus')), { failure: 'Could not reach VS Code' });
  if (r?.action === 'focused') toast(r.focused ? 'VS Code brought to the front' : 'VS Code found, but Windows kept the focus where it was', { kind: r.focused ? 'ok' : 'warn' });
  else if (r) toast(`Opening ${p.name} in VS Code`, { kind: 'info' });
}

/** A live agent session to the front: its window outside FlintBench, or its tab inside. */
async function focusSession(p, s) {
  const r = await attempt(() => api.post(`/api/agent-sessions/${encodeURIComponent(s.id)}/focus`), { failure: `Could not reach ${s.agentName}` });
  if (!r) return;
  if (r.action === 'terminal') showTab(p, r.terminalId);
  else if (r.action === 'focused') toast(r.focused ? `${s.agentName} brought to the front${r.app ? ` (${r.app.replace(/\.exe$/i, '')})` : ''}` : `${s.agentName} found, but Windows kept the focus where it was`, { kind: r.focused ? 'ok' : 'warn' });
  else if (['claude', 'codex', 'antigravity'].includes(s.agent) && s.agentSessionId) showTab(p, `tx:${s.id}`);
  else toast(`No window found for ${s.agentName}`, { kind: 'warn' });
}

async function startHere(p, tool) {
  navigate(projectPath(p.id));
  const r = await attempt(() => api.post(projectUrl(p.id, `/agents/${tool.id}/start`), { mode: 'new' }), { failure: `Could not start ${tool.name}` });
  if (r?.terminal) {
    store.setTerminal(r.terminal);
    setTimeout(() => window.dispatchEvent(new CustomEvent('flintbench:show-tab', { detail: { projectId: p.id, tabId: r.terminal.id } })), 0);
  }
}

/** The tools at work on a project: VS Code and every live agent session, each one click to the front. */
function toolItems(p) {
  const vs = (p.editors ?? []).find((e) => e.id === 'vscode');
  const active = p.agents?.active ?? [];
  const tools = (store.state.agents.tools ?? []).filter((t) => t.installed && t.launchable && t.enabled);
  return [
    // VS Code open on the project: bring that window forward; otherwise your editors, default first
    vs ? { label: 'Bring VS Code to the front', iconNode: agentMark('vscode', 14), run: () => focusEditor(p) } : null,
    ...editorItems(p.id, { disabled: !p.exists, skip: vs ? ['code'] : [] }),
    ...active.map((s) => ({ label: `Bring ${s.agentName} to the front`, iconNode: agentMark(s.agent, 14), run: () => focusSession(p, s) })),
    // a conversation open in a window outside FlintBench can move into a tab here
    ...active.filter((s) => s.source === 'external' && !s.terminalId && s.movable).map((s) => ({
      label: s.moving === 'in' ? `Cancel moving ${s.agentName}` : `Move ${s.agentName} into FlintBench`,
      icon: 'resume',
      run: async () => {
        const terminal = await moveHere(s);
        if (terminal) showTab(p, terminal.id);
      },
    })),
    ...tools.filter((t) => !active.some((s) => s.agent === t.id)).map((t) => ({ label: `Start ${t.name} here`, iconNode: agentMark(t.id, 14), disabled: !p.exists, run: () => startHere(p, t) })),
  ];
}

/** The right-click menu of a project, wherever a project is listed. */
export function projectMenuItems(p) {
  return [
    ...toolItems(p),
    '-',
    { label: 'Open', icon: 'chevron', hint: 'Enter', run: () => navigate(projectPath(p.id)) },
    { label: 'Resume', icon: 'resume', hint: 'R', disabled: !p.exists, run: () => resumeProject(p) },
    p.running
      ? { label: 'Stop', icon: 'stop', run: () => stopProject(p) }
      : { label: 'Start', icon: 'play', disabled: !p.exists || !canStart(p), run: () => startProject(p) },
    '-',
    { label: 'Files', icon: 'folder', run: () => navigate(projectPath(p.id, 'files')) },
    { label: 'Open in File Explorer', icon: 'folder', disabled: !p.exists, run: () => attempt(() => api.post(projectUrl(p.id, '/reveal'))) },
    { label: 'Copy path', icon: 'file', run: () => copyText(p.path, toast) },
    '-',
    { label: 'Remove from FlintBench', icon: 'trash', danger: true, run: () => removeProject(p) },
  ];
}

/** Opens the project with its terminals restored (the project view performs the resume). */
/** The one Resume (lib/resume.js), then the project with its terminal panel open. */
export async function resumeProject(p) {
  const r = await resumeWork(p.id);
  if (!r) return;
  navigate(projectPath(p.id, 'workspace'));
  if (r.agentTerminal) setTimeout(() => window.dispatchEvent(new CustomEvent('flintbench:show-tab', { detail: { projectId: p.id, tabId: r.agentTerminal.id } })), 0);
}

const LIVE_WINDOW = 10 * 60_000;

/**
 * The live signal, in the style of the tool at work: Claude Code's spark (the glyphs it cycles
 * while it thinks), a dot flipping full and empty for Codex (quick, then slow), the braille spinner of Google's CLIs for Antigravity
 * and Gemini, a blinking text cursor for files edited by hand or in an editor. A grey dot at rest.
 * Frame sequences are stacked glyphs, each shown for its tenth of the cycle (CSS).
 */
const FRAMES = {
  claude: { glyphs: ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'], cycle: 2 }, // 200 ms a glyph
  // a full and an empty dot, quick then slow: four 200 ms flips, then 600 ms on and 600 ms off
  codex: { glyphs: ['●', '○', '●', '○', '●', '●', '●', '○', '○', '○'], cycle: 2 },
  // 8-dot cells: one dot missing goes round, the ink keeps its place (6-dot frames jump up and down)
  braille: { glyphs: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷', '⣾', '⣽'], cycle: 1 },
};
const SIGNAL_OF = { claude: 'claude', codex: 'codex', antigravity: 'braille', gemini: 'braille', edit: 'caret' };

export function liveSignal(kind) {
  if (kind === 'idle') return h('span.live-signal.is-idle', { 'aria-hidden': 'true' }, '·');
  const look = SIGNAL_OF[kind] ?? 'claude';
  const frames = FRAMES[look];
  if (frames) {
    return h(`span.live-signal.is-frames.is-${look}`, { 'aria-hidden': 'true' },
      frames.glyphs.map((g, i) => h('span', { style: { animationDuration: `${frames.cycle}s`, animationDelay: `${((i * frames.cycle) / 10 - frames.cycle).toFixed(2)}s` } }, g)));
  }
  return h(`span.live-signal.is-${look}`, { 'aria-hidden': 'true' }, '▍');
}

/**
 * Agent conversations that just ended — cut off, closed mid-answer, or simply closed —
 * each with one click back into the same conversation. Shown while recent; dismissable.
 */
function closedStrip(all, onChange) {
  const now = Date.now();
  const items = all.map((p) => ({ p, n: closedNotice(p, now) })).filter((x) => x.n).sort((a, b) => b.n.endedAt - a.n.endedAt).slice(0, 4);
  if (!items.length) return null;
  const reopen = async (p, n) => {
    const r = await reopenConversation(p.id, n);
    if (r?.terminal) showTab(p, r.terminal.id);
  };
  return h('section.closed-strip', { 'aria-label': 'Conversations that just ended' },
    items.map(({ p, n }) => h(`div.agent-closed.is-${n.kind}`,
      h('span.agent-closed-ic', { 'aria-hidden': 'true' }, icon(n.kind === 'interrupted' ? 'st-warn' : 'st-info', 16)),
      h('div.agent-closed-text',
        h('strong', h('a', { href: projectPath(p.id) }, p.name), ' · ', n.title),
        h('span', agentMark(n.agent, 13), n.detail)),
      h('div.agent-closed-actions',
        actionButton(n.reopenLabel, () => reopen(p, n), { cls: `btn sm${n.kind === 'interrupted' ? ' primary' : ''}`, iconName: 'resume' }),
        h('button.btn.sm.ghost', { type: 'button', 'aria-label': `Dismiss: ${p.name}, ${n.title}`, onclick: () => { dismissClosed(p, n); onChange(); } }, 'Dismiss')))));
}

/**
 * Projects whose folder is gone (profile Test): renamed or moved — found again by the server, to
 * confirm — or not found, to locate. Listed first: until then the project cannot be worked on.
 */
function movedStrip(all) {
  const missing = all.filter((p) => !p.exists).sort((a, b) => Number(Boolean(b.relocation)) - Number(Boolean(a.relocation)));
  if (!missing.length) return null;
  return h('section.closed-strip', { 'aria-label': 'Projects whose folder moved' },
    missing.map((p) => {
      const t = relocationText(p);
      return h('div.agent-closed.is-interrupted',
        h('span.agent-closed-ic', { 'aria-hidden': 'true' }, icon('folder', 16)),
        h('div.agent-closed-text',
          h('strong', h('a', { href: projectPath(p.id) }, t.title)),
          h('span', t.detail)),
        h('div.agent-closed-actions', relocationActions(p)));
    }));
}

// Folders hidden from the Home inbox with "Ignore": still detected, still listed in Projects (this browser)
const HIDDEN_CANDIDATES = 'home.hiddenCandidates';
const candidateKey = (path) => path.replace(/[\\/]+$/, '').toLowerCase();

/**
 * New projects detected. Ignore only takes one off this inbox (it stays in Projects › Detected,
 * not added); Skip in scans is the separate, lasting choice: FlintBench stops looking at the folder.
 */
/** The detected folders the Home inbox shows: the ones not hidden with Ignore (the rail badge counts these). */
export function visibleCandidates(all = store.state.candidates) {
  const hidden = new Set(prefs.get(HIDDEN_CANDIDATES, []));
  return all.filter((c) => !hidden.has(candidateKey(c.path)));
}

function candidateInbox(all) {
  const hidden = new Set(prefs.get(HIDDEN_CANDIDATES, []));
  const candidates = visibleCandidates(all);
  if (!candidates.length) return null;
  const add = (paths) => attempt(() => api.post('/api/candidates/add', { paths }), { success: `Added ${plural(paths.length, 'project')}`, failure: 'Could not add project' });
  const hide = (path) => {
    prefs.set(HIDDEN_CANDIDATES, [...hidden, candidateKey(path)].slice(-500));
    notify('candidates'); // the inbox and the rail badge both follow
  };
  const skip = async (paths) => {
    const r = await attempt(() => api.post('/api/candidates/ignore', { paths }), { failure: 'Could not skip the folder in scans' });
    if (r) store.set('ignored', r.ignored);
  };
  return h('section.inbox', { 'aria-label': 'New projects detected' },
    h('div.inbox-head',
      h('span.inbox-badge', { 'aria-hidden': 'true' }, icon('plus', 16)),
      h('div.inbox-title',
        h('strong', candidates.length === 1 ? 'New project detected' : `${candidates.length} new projects detected`),
        h('span', 'Found in your project folders. Ignore hides one from here (it stays in Projects); Skip in scans stops FlintBench looking at that folder.')),
      h('span.spacer'),
      candidates.length > 1 ? actionButton(`Add all ${candidates.length}`, () => add(candidates.map((c) => c.path)), { cls: 'btn' }) : null),
    candidates.slice(0, 8).map((c) => h('div.inbox-row',
      h('span.inbox-icon', { 'aria-hidden': 'true' }, icon('folder', 17)),
      h('div', { style: { minWidth: 0 } },
        h('div.inbox-name', h('strong', c.name), c.stack.map((s) => h('span.tag', s))),
        h('div.path.ellipsis', { title: c.path }, c.path)),
      h('div.inbox-actions',
        h('button.btn.ghost', { type: 'button', title: 'Hide it from Home; it stays in Projects › Detected, not added', onclick: () => hide(c.path) }, 'Ignore'),
        actionButton('Skip in scans', () => skip([c.path]), { cls: 'btn ghost', title: 'Never offer this folder again (undo in Settings › Project directories)' }),
        actionButton('Add project', () => add([c.path]), { cls: 'btn primary' })))),
    candidates.length > 8 ? h('a.inbox-more', { href: '/projects' }, `${candidates.length - 8} more in Projects`) : null);
}

export function mount(container) {
  const filterKey = 'home.filter';
  const sortKey = 'home.sort';
  let filter = prefs.get(filterKey, 'all');
  let sort = prefs.get(sortKey, 'recent');
  let query = '';

  const telemetry = h('div.v2-filter-group', { 'aria-label': 'Filter projects' });
  const closed = h('div');
  const moved = h('div');
  const inbox = h('div');
  const rows = h('div', { 'aria-live': 'polite', 'aria-label': 'Project results' });
  const search = h('input.input', { type: 'search', placeholder: 'Search projects', 'aria-label': 'Search projects', 'data-search': true, spellcheck: false });
  const sortMenu = selectMenu({
    label: 'Sort projects by', prefix: 'Sort', width: '220px', value: sort,
    options: [{ value: 'recent', text: 'Recent activity' }, { value: 'status', text: 'Status' }, { value: 'name', text: 'Name' }],
    onChange: (v) => { sort = v; prefs.set(sortKey, sort); render(); },
  });
  const summary = h('div.v2-home-summary');
  const rootPath = h('p.v2-root-path.mono');
  const note = h('p.v2-home-note');
  const runningOnly = h('input', { type: 'checkbox', checked: filter === 'running' });
  runningOnly.addEventListener('change', () => setFilter(runningOnly.checked ? 'running' : 'all'));
  const detectedTitle = h('summary');
  const detectedDetails = h('details.v2-home-context', detectedTitle, inbox);

  const view = h('div.view.v2-home', h('div.view-inner',
    h('header.v2-home-header',
      h('div', h('p.v2-eyebrow', h('span', { 'aria-hidden': 'true' }), 'Your local workspace'),
        h('h1.v2-home-title', 'FlintBench', h('span', ' / home')), rootPath),
      h('div', summary, note)),
    moved,
    closed,
    h('div.v2-toolbar', h('label.search', icon('search', 14), search, h('kbd', '/')),
      h('label.v2-running-only', runningOnly, 'Only running'), h('span.spacer'),
      actionButton('Scan', async () => { await attempt(() => api.post('/api/projects/scan'), { success: 'Scan complete' }); }, { cls: 'btn v2-scan', iconName: 'refresh', title: 'Rescan project directories' }),
      h('a.btn.v2-add', { href: '/projects' }, icon('plus', 15), 'Add project')),
    h('div.v2-collection', telemetry, sortMenu.el),
    rows,
    detectedDetails));
  container.append(view);
  const previous = new Map(); // telemetry label -> last value, to flash real changes only

  function filtered() {
    let list = [...store.state.projects.values()];
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((p) => `${p.name} ${p.path} ${p.stack?.join(' ')} ${p.git?.branch ?? ''}`.toLowerCase().includes(q));
    if (filter === 'running') list = list.filter((p) => p.running);
    if (filter === 'agents' && agentsInUse()) list = list.filter((p) => p.agents?.active?.length);
    if (filter === 'attention') list = list.filter((p) => p.needsAttention || !p.exists);
    if (filter === 'dirty') list = list.filter((p) => p.git?.changed);
    const rank = (p) => (p.agents?.active?.length ? 0 : p.running ? 1 : p.needsAttention ? 2 : 3);
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'status') return rank(a) - rank(b) || (b.activity?.lastActivityAt ?? 0) - (a.activity?.lastActivityAt ?? 0);
      return (b.activity?.lastActivityAt ?? 0) - (a.activity?.lastActivityAt ?? 0) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function setFilter(f) {
    filter = f;
    prefs.set(filterKey, f);
    runningOnly.checked = f === 'running';
    render();
  }

  // the cards change with time too (files quiet for 2 minutes: idle; for 10: no longer active):
  // render again the moment the next of those thresholds is crossed, not at the next minute
  let edge = 0;
  function scheduleEdge(all) {
    clearTimeout(edge);
    const now = Date.now();
    const next = Math.min(...all.flatMap((p) => {
      const t = p.activity?.lastFileChangeAt ?? 0;
      return [t + FILES_MOVING_MS, t + LIVE_WINDOW].filter((x) => x > now);
    }));
    if (Number.isFinite(next) && next - now < 60_000) edge = setTimeout(render, next - now + 50);
  }

  function render() {
    const all = [...store.state.projects.values()];
    scheduleEdge(all);
    replace(closed, closedStrip(all, render));
    replace(moved, movedStrip(all));
    const running = all.filter((p) => p.running).length;
    const attention = all.filter((p) => p.needsAttention || !p.exists).length;
    const agents = all.reduce((n, p) => n + (p.agents?.active?.length ?? 0), 0);
    const inEditor = all.filter((p) => p.editors?.length).length;
    const dirty = all.filter((p) => p.git?.changed).length;
    const roots = store.state.settings?.roots ?? [];
    replace(summary, statusDot(running ? 'ok' : '', running ? 'Projects running' : 'Nothing running'), h('strong', `${running} running`), h('span.dim', `out of ${all.length}`));
    rootPath.textContent = roots.length ? roots.join('  ·  ') : 'All your projects. Right where you left them.';
    rootPath.title = roots.join('\n');
    note.textContent = [agents && agentsInUse() ? plural(agents, 'agent') + ' active' : null, inEditor ? plural(inEditor, 'editor') + ' open' : null, attention ? `${attention} need attention` : null].filter(Boolean).join(' · ');

    const cell = (label, value, cls, f, unit) => {
      const changed = previous.has(label) && previous.get(label) !== value;
      previous.set(label, value);
      return h(`button.v2-filter${changed ? '.flash' : ''}`, { type: 'button', onclick: () => setFilter(filter === f ? 'all' : f), 'aria-pressed': String(filter === f), title: `Show ${label.toLowerCase()}` },
        label, h('span.v2-filter-count', String(value)));
    };
    telemetry.hidden = !has('home.counters');
    replace(telemetry,
      cell('All projects', all.length, '', 'all'),
      cell('Running', running, running ? 'is-ok' : '', 'running'),
      cell('Need attention', attention, attention ? 'is-warn' : '', 'attention'),
      agentsInUse() ? cell('Agents active', agents, agents ? 'is-agent' : '', 'agents') : null,
      cell('Uncommitted', dirty, '', 'dirty'));

    replace(inbox, candidateInbox(store.state.candidates));
    detectedDetails.hidden = !visibleCandidates().length;
    detectedTitle.textContent = `${plural(visibleCandidates().length, 'new project')} detected`;

    if (!roots.length && !all.length) {
      replace(rows, h('div.empty-state',
        h('h3', 'Point FlintBench at your code'),
        h('p', 'Add the folders where your projects live (for example C:\\Dev or ~/Projects). FlintBench scans them for Git repositories and project files, and keeps watching for new ones.'),
        addRootForm()));
      return;
    }
    const list = filtered();
    const focusedCard = document.activeElement?.closest?.('.project-card');
    const focusedId = focusedCard?.dataset.id;
    const focusedControl = focusedCard ? [...focusedCard.querySelectorAll('a, button')].indexOf(document.activeElement) : -1;
    if (!list.length) {
      replace(rows, h('div.empty-state', h('h3', all.length ? 'No projects match' : 'No projects added yet'), h('p', all.length ? 'Change the filter or search.' : 'Add detected projects above, or add one by path in Projects.')));
      return;
    }
    replace(rows, h('div.v2-project-grid', { role: 'list', 'aria-label': 'Projects' },
      list.map((p, i) => {
        const row = projectCard(p, { canStart, startProject, stopProject, resumeProject, projectMenuItems, agentsInUse, liveSignal, liveEnabled: has('home.live') });
        row.setAttribute('role', 'listitem');
        row.style.setProperty('--i', String(Math.min(i, 7)));
        return row;
      })));
    if (focusedId) {
      const card = rows.querySelector(`.project-card[data-id="${CSS.escape(focusedId)}"]`);
      const target = focusedControl >= 0 ? card?.querySelectorAll('a, button')[focusedControl] : card;
      (target ?? card)?.focus({ preventScroll: true });
    }
  }

  rows.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'j', 'k'].includes(e.key) || !e.target.classList.contains('project-card')) return;
    e.preventDefault();
    const all = [...rows.querySelectorAll('.project-card')];
    const idx = all.indexOf(e.target);
    const next = all[(['ArrowDown', 'ArrowRight', 'j'].includes(e.key)) ? Math.min(all.length - 1, idx + 1) : Math.max(0, idx - 1)];
    next?.focus();
  });
  search.addEventListener('input', () => { query = search.value; render(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      rows.querySelector('.project-card')?.focus();
    } else if (e.key === 'Escape') {
      search.value = '';
      query = '';
      render();
    }
  });

  const unsub = subscribe(['projects', 'candidates', 'settings', 'agents'], render);
  const tick = setInterval(render, 60_000);
  render();
  return {
    destroy() {
      unsub();
      clearInterval(tick);
      clearTimeout(edge);
    },
  };
}
