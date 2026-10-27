import { agentMark } from '../lib/agent-icons.js';
import { h, icon, replace, actionButton } from '../lib/dom.js';
import { store, subscribe } from '../lib/store.js';
import { api } from '../lib/api.js';
import { navigate, projectPath } from '../lib/router.js';
import { ago, duration, clock } from '../lib/format.js';
import { attempt, statusDot, confirmDialog, toast } from '../lib/ui.js';
import { selectMenu } from '../lib/select-menu.js';
import { openMenu } from '../lib/menu.js';
import { usesAgents } from '../lib/profiles.js';
import { launchAgent } from './project/agent-panel.js';

export function evidenceText(s) {
  if (s.evidence === 'pty') return 'Started by FlintBench in this project folder.';
  if (s.evidence === 'session-file') return `Detected from ${s.agentName}'s own session file for this folder (started outside FlintBench).`;
  if (s.evidence === 'process') return `Detected from the running ${s.agentName} process, whose working folder is this project (started outside FlintBench).`;
  return '';
}

export function filesText(s) {
  if (s.filesChanged === null || s.filesChanged === undefined) return s.source === 'external' && !s.filesObserved ? 'not observed' : '—';
  return `${s.filesChanged} changed while active`;
}

const DAY = 86_400_000;
function dayLabel(ts) {
  const day = new Date(ts).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  if (day === today) return 'Today';
  if (day === today - DAY) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Opens a project with one of its terminal-dock tabs in front (a terminal, or a conversation). */
function showTab(projectId, tabId) {
  navigate(projectPath(projectId));
  setTimeout(() => window.dispatchEvent(new CustomEvent('flintbench:show-tab', { detail: { projectId, tabId } })), 0);
}

const metric = (value, label, title) => h('span.ag-metric', { title }, h('strong', value), h('span', label));
const sourceChip = (s) => h(`span.jr-source${s.source === 'flintbench' ? '.is-own' : ''}`, { title: evidenceText(s) }, s.source === 'flintbench' ? 'Started here' : 'External');

/**
 * The journal as a log grouped by day: one row per session — who and where on the left, when and
 * how long in the middle, what changed around it on the right. Only real facts are shown: no
 * "unknown" task, no zero counts. A row opens its project's Agents tab.
 */
export function journalList(rows, { showProject = true } = {}) {
  if (!rows.length) return h('div.panel.panel-empty', 'No agent sessions recorded yet.');
  const groups = [];
  for (const s of rows) {
    const label = dayLabel(s.startedAt);
    if (groups.at(-1)?.label !== label) groups.push({ label, rows: [] });
    groups.at(-1).rows.push(s);
  }
  return h('div.journal', groups.map((g) => h('section.jr-day',
    h('div.jr-day-head', h('span.label', g.label), h('span.faint.small', `${g.rows.length} session${g.rows.length > 1 ? 's' : ''}`)),
    h('ol.jr-list', g.rows.map((s) => {
      const p = store.project(s.projectId);
      const files = s.filesChanged ?? null;
      const commits = s.commits?.length ?? 0;
      const row = h(`li.jr-row${s.live ? '.is-live' : ''}${p ? '.is-link' : ''}.is-${s.agent}`,
        h('span.jr-mark', agentMark(s.agent, 16)),
        h('div.jr-who',
          h('div.jr-line', h('strong', s.agentName), showProject ? (p ? h('a.jr-project', { href: projectPath(p.id, 'agents') }, p.name) : h('span.faint', 'removed project')) : null,
            s.live ? h('span.chip.agent', statusDot('agent live', 'Active'), 'active') : null),
          s.task ? h('div.jr-task', s.task) : null),
        h('div.jr-when', { title: new Date(s.startedAt).toLocaleString() },
          h('span.mono', `${clock(s.startedAt)}${s.endedAt ? ` – ${clock(s.endedAt)}` : ''}`),
          h('span.jr-dur', s.live ? `${duration(Date.now() - s.startedAt)} so far` : duration(s.durationMs ?? (s.endedAt - s.startedAt)))),
        h('div.jr-facts',
          !files ? null : metric(String(files), files === 1 ? 'file' : 'files', 'Files changed in the project while the session was active. Not attributed to the agent.'),
          commits ? metric(String(commits), commits === 1 ? 'commit' : 'commits', s.commits.map((c) => `${c.short} ${c.subject}`).join('\n')) : null),
        sourceChip(s));
      // the whole row leads to the project's agents; the project name stays a real link
      if (p) row.addEventListener('click', (e) => { if (!e.target.closest('a, button')) navigate(projectPath(p.id, 'agents')); });
      return row;
    })))));
}

/** One active session: who, where, how long, what changed — and what can be done with it. */
function sessionCard(s) {
  const p = store.project(s.projectId);
  const canWatch = s.source === 'external' && ['claude', 'codex', 'antigravity'].includes(s.agent) && s.agentSessionId && !s.terminalId;
  const stop = async () => {
    const ok = await confirmDialog({ title: `Stop ${s.agentName}?`, body: `${s.agentName} stops in ${p?.name ?? 'its project'} and its terminal closes. The conversation can be continued later from the project.`, confirm: 'Stop', danger: true });
    if (ok) await attempt(() => api.post(`/api/agent-sessions/${s.id}/stop`), { success: `${s.agentName} stopped` });
  };
  return h(`article.ag-session.is-${s.agent}`,
    h('div.ag-head',
      agentMark(s.agent, 20),
      h('div.ag-title',
        h('div.jr-line', h('strong', s.agentName), statusDot('agent live', 'Active'), h('span.agent-text.small', s.busy ? 'working' : 'active')),
        h('div.faint.small', p ? ['in ', h('a', { href: projectPath(p.id, 'agents') }, p.name)] : 'project unknown')),
      h('span.spacer'),
      h('div.ag-actions',
        p && s.terminalId ? h('button.btn.sm', { type: 'button', onclick: () => showTab(p.id, s.terminalId) }, icon('terminal', 13), 'Show terminal') : null,
        p && canWatch ? h('button.btn.sm', { type: 'button', onclick: () => showTab(p.id, `tx:${s.id}`) }, icon('eye', 13), 'Conversation') : null,
        s.source === 'flintbench' ? actionButton('Stop', stop, { cls: 'btn sm ghost danger', iconName: 'stop' }) : null)),
    h('div.ag-metrics',
      metric(clock(s.startedAt), 'started'),
      metric(duration(Date.now() - s.startedAt), 'running'),
      metric(ago(s.lastActivityAt), 'last activity'),
      s.filesChanged === null || s.filesChanged === undefined ? null : metric(String(s.filesChanged), s.filesChanged === 1 ? 'file changed' : 'files changed')),
    h('p.ag-evidence', icon('eye', 12), evidenceText(s)));
}

const AGENT_FILTER = [{ value: '', text: 'All agents' }, { value: 'claude', text: 'Claude Code' }, { value: 'codex', text: 'Codex' }, { value: 'antigravity', text: 'Antigravity CLI' }];
const PAGE = 100;

export function mount(container) {
  const inner = h('div.view-inner.agents-view');
  container.append(h('div.view', inner));
  let journal = [];
  let limit = PAGE;
  let projectFilter = '';
  let agentFilter = '';
  let projectsKey = '';

  // the page is built once; each part is drawn again only when its own data changes, so an open
  // filter menu or the scroll position survive the live updates
  const tools = h('div.ag-tools');
  const activeCount = h('span.ag-count');
  const active = h('div');
  const filters = h('div.ag-filters');
  const journalBox = h('div');
  const more = h('div.ag-more');
  const agentMenu = selectMenu({ label: 'Journal agent', prefix: 'Agent', width: '220px', value: '', options: AGENT_FILTER, onChange: (v) => { agentFilter = v; drawJournal(); } });

  replace(inner,
    h('header.page-head',
      h('div', h('h1', 'Agents')),
      h('span.spacer'),
      actionButton('Re-detect', async () => { const r = await attempt(() => api.post('/api/agents/detect')); if (r) store.set('agents', r); }, { cls: 'btn', iconName: 'refresh' })),
    tools,
    h('h2.ag-section-title', 'Active now', activeCount),
    active,
    h('div.ag-journal-head',
      h('h2.ag-section-title', 'Journal',
        h('span.ag-info', { tabIndex: 0, role: 'note', title: 'Files and commits are counted inside the session window: they are not claims that the agent made those changes. Tasks appear only when typed at launch.', 'aria-label': 'About the journal: files and commits are counted inside the session window, not attributed to the agent. Tasks appear only when typed at launch.' }, icon('eye', 13))),
      filters),
    journalBox,
    more);

  /** The projects to start an agent in, most recently worked on first. */
  function startMenu(t, anchor) {
    const projects = [...store.state.projects.values()].filter((p) => p.exists !== false)
      .sort((a, b) => (b.activity?.lastActivityAt ?? 0) - (a.activity?.lastActivityAt ?? 0));
    if (!projects.length) { toast('Add a project first', { kind: 'info' }); return; }
    openMenu(projects.slice(0, 14).map((p) => ({
      label: p.name, icon: 'folder', hint: p.git?.branch ?? '',
      run: async () => {
        const r = await launchAgent(p.id, t.id, 'new');
        if (r?.terminal) showTab(p.id, r.terminal.id);
      },
    })), { anchor, label: `Start ${t.name} in a project` });
  }

  function drawTools() {
    const a = store.state.agents;
    const canStart = usesAgents(store.state.settings);
    replace(tools, a.tools.map((t) => h(`div.ag-tool${t.active ? '.is-agent' : ''}${t.installed ? '' : '.is-missing'}`,
      h('div.ag-tool-head', agentMark(t.id, 18), h('strong', t.name)),
      h('div.ag-tool-state', t.installed ? (t.active ? `${t.active} active` : 'Ready') : 'Not installed'),
      h('div.ag-tool-meta', t.installed ? `${t.version ?? ''}${t.launchable ? '' : ' · start it from its own terminal'}` : 'Not found on PATH. Install it, then Re-detect.'),
      t.installed && t.launchable && canStart
        ? h('button.btn.sm.ag-start', { type: 'button', 'aria-haspopup': 'menu', onclick: (e) => startMenu(t, e.currentTarget) }, icon('play', 11), 'Start in…')
        : null)));
  }

  function drawActive() {
    const list = store.state.agents.active;
    activeCount.textContent = list.length ? String(list.length) : '';
    replace(active, list.length ? h('div.ag-sessions', list.map(sessionCard))
      : h('div.panel.panel-empty.ag-empty', 'No agent is running. Start one above, or from a project.'));
  }

  function drawFilters() {
    const projects = [...store.state.projects.values()].sort((x, y) => x.name.localeCompare(y.name));
    const key = projects.map((p) => `${p.id}:${p.name}`).join('|');
    if (key === projectsKey) return;
    projectsKey = key;
    const projectMenu = selectMenu({
      label: 'Journal project', prefix: 'Project', width: '240px', value: projectFilter,
      options: [{ value: '', text: 'All projects' }, ...projects.map((p) => ({ value: p.id, text: p.name }))],
      onChange: (v) => { projectFilter = v; limit = PAGE; loadJournal(); },
    });
    replace(filters, agentMenu.el, projectMenu.el);
  }

  function drawJournal() {
    const rows = agentFilter ? journal.filter((s) => s.agent === agentFilter) : journal;
    replace(journalBox, rows.length || !agentFilter ? journalList(rows) : h('div.panel.panel-empty', 'No sessions of this agent in the journal.'));
    replace(more, journal.length >= limit
      ? h('button.btn', { type: 'button', onclick: () => { limit += PAGE; loadJournal(); } }, 'Show older sessions')
      : null);
  }

  async function loadJournal() {
    journal = (await attempt(() => api.get(`/api/agents/journal?limit=${limit}${projectFilter ? `&project=${encodeURIComponent(projectFilter)}` : ''}`))) ?? [];
    drawJournal();
  }

  const unsubAgents = subscribe('agents', () => { drawTools(); drawActive(); });
  const unsubProjects = subscribe('projects', drawFilters);
  const unsubSettings = subscribe('settings', drawTools);
  const unsubEvents = subscribe('event', () => {
    if (store.state.lastEvent?.type?.startsWith('agent.')) loadJournal();
  });
  // running times move on while you look
  const tick = setInterval(() => { if (store.state.agents.active.length) drawActive(); }, 30_000);
  drawTools();
  drawActive();
  drawFilters();
  loadJournal();
  return { destroy() { unsubAgents(); unsubProjects(); unsubSettings(); unsubEvents(); clearInterval(tick); } };
}
