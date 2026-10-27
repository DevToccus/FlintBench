import { h, icon, actionButton } from '../lib/dom.js';
import { store, notify } from '../lib/store.js';
import { projectPath, navigate } from '../lib/router.js';
import { ago, shortPath, plural, duration } from '../lib/format.js';
import { contextMenu, openMenu } from '../lib/menu.js';
import { agentWorking, projectMoving } from '../lib/ui.js';
import { toolMarks } from '../lib/agent-icons.js';

const pendingPower = new Set();

/** A home card uses the same commands and live project state as the project workspace. */
export function projectCard(p, { canStart, startProject, stopProject, resumeProject, projectMenuItems, agentsInUse, liveSignal, liveEnabled = true }) {
  const current = () => store.project(p.id) ?? p;
  const running = p.running;
  const git = p.git;
  const active = agentsInUse() ? p.agents?.active ?? [] : [];
  const editors = p.editors ?? [];
  const tools = [...new Set([...active.map((a) => a.agent), ...editors.map((e) => e.id)])];
  const now = Date.now();
  const answering = active.find(agentWorking);
  const moving = p.exists && projectMoving({ ...p, agents: { active } }, now);
  const opened = p.exists && tools.length > 0;
  const tone = answering?.agent ?? (moving ? editors[0]?.id : null) ?? active[0]?.agent ?? editors[0]?.id ?? 'edit';
  const names = [...new Set([...active.map((a) => a.agentName), ...editors.map((e) => e.name)])];
  const since = Math.min(...active.map((a) => a.startedAt ?? Infinity), ...editors.map((e) => e.since ?? Infinity));
  const elapsed = Number.isFinite(since) ? ` · ${duration(now - since)}` : '';
  const last = agentsInUse() ? p.agents?.cutOff ?? p.agents?.last : null;
  const workText = !p.exists ? 'Locate this project folder to continue'
    : answering ? `${answering.agentName} working${elapsed}`
      : moving ? `${editors.length ? editors.map((e) => e.name).join(' + ') + ' · editing' : 'Files changing'}${editors.length ? elapsed : ''}`
        : opened ? `${names.join(' + ')} · idle${elapsed}`
          : last ? `${p.agents?.cutOff ? 'Interrupted' : 'Last with'} ${last.agentName}${last.task ? ` · ${last.task}` : ''}`
            : shortPath(p.path, 46);
  const workSignal = opened || moving ? liveSignal(moving ? answering?.agent ?? 'edit' : 'idle') : null;
  // Keep the loop's phase across WebSocket redraws instead of restarting on every file write.
  const phase = performance.now() / 1000;
  if (workSignal) {
    for (const frame of workSignal.querySelectorAll('span')) {
      const cycle = parseFloat(frame.style.animationDuration) || 2;
      frame.style.animationDelay = `${parseFloat(frame.style.animationDelay) - phase % cycle}s`;
    }
    if (workSignal.classList.contains('is-caret')) workSignal.style.animationDelay = `${-(phase % 1.05)}s`;
  }
  const activityText = h('span.project-card-activity-text.t-shimmer.ellipsis', { title: workText, 'data-text': workText }, workText);
  activityText.style.animationDelay = `${-(phase % 2.4)}s`;
  const status = !p.exists ? 'Folder missing' : running ? 'Running' : 'Stopped';
  const port = p.runtime?.ports?.[0];
  const detail = port ? `localhost:${port}` : running ? 'Services active' : canStart(p) ? 'Ready to start' : 'No service configured';
  const description = p.description?.trim() || p.stack?.join(' · ') || 'Local project';
  const commit = git?.lastCommit;
  const footer = commit ? `${ago(commit.at)} · ${commit.subject}` : p.activity?.lastActivityAt ? `Last activity ${ago(p.activity.lastActivityAt)}` : 'No activity recorded yet';

  const toggle = actionButton('', async () => {
    if (pendingPower.has(p.id)) return;
    pendingPower.add(p.id);
    try { await (running ? stopProject(current()) : startProject(current())); }
    finally { pendingPower.delete(p.id); notify('projects'); }
  }, {
    cls: 'project-toggle',
    disabled: pendingPower.has(p.id) || !p.exists || (!running && !canStart(p)),
    title: !p.exists ? 'Locate this project folder first' : !running && !canStart(p) ? 'Configure a service in the project to enable Start' : `${running ? 'Stop' : 'Start'} ${p.name}`,
  });
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(Boolean(running)));
  toggle.setAttribute('aria-label', `${running ? 'Stop' : 'Start'} ${p.name}`);
  toggle.dataset.control = 'power';
  toggle.append(h('span', { 'aria-hidden': 'true' }));

  const more = h('button.project-card-more', { type: 'button', 'aria-label': `Actions for ${p.name}`, 'aria-haspopup': 'menu' }, icon('dots', 18));
  more.addEventListener('click', () => openMenu(projectMenuItems(current()), { anchor: more, label: `${p.name} actions` }));

  const card = h(`article.project-card${running ? '.is-running' : ''}${!p.exists ? '.is-missing' : ''}${moving && liveEnabled ? '.is-working' : ''}${opened ? '.has-open-tools' : ''}`, {
    tabindex: 0,
    dataset: { id: p.id, activity: moving ? 'working' : opened ? 'idle' : 'rest', tool: tone },
    'aria-label': `${p.name}: ${status}${opened || moving ? `, ${workText}` : ''}`,
    onkeydown: (e) => {
      if (e.target !== card) return;
      if (e.key === 'Enter') navigate(projectPath(p.id));
      if (e.key.toLowerCase() === 'r') resumeProject(current());
    },
  },
  h('header.project-card-head',
    h('span.project-card-dot', { 'aria-hidden': 'true' }),
    h('h3', h('a', { href: projectPath(p.id), title: p.name }, p.name)),
    h('span.project-card-stack', p.stack?.[0] || (git?.isRepo ? 'Git' : 'Folder')),
    more),
  h('p.project-card-description', { title: description }, description),
  h('div.project-card-power', toggle,
    h('div.project-card-status', h('strong', status), h('span.mono', detail)),
    h('a.project-card-open', { href: projectPath(p.id), 'aria-label': `Open ${p.name}` }, 'Open', icon('external', 13))),
  h('div.project-card-context',
    h('div.project-card-branch', icon('branch', 14), h('span.ellipsis', git?.isRepo ? git.detached ? 'Detached HEAD' : git.branch || 'No branch' : 'No Git repository'),
      git?.changed ? h('a.project-card-changes', { href: projectPath(p.id, 'git'), title: plural(git.changed, 'uncommitted file') }, `${git.changed} changed`) : git?.isRepo ? h('span.project-card-clean', 'Clean') : null),
    h('div.project-card-now', { title: p.path },
      tools.length ? toolMarks(tools, 14) : last ? toolMarks([last.agent], 14) : icon(moving ? 'editor' : 'folder', 13),
      activityText, liveEnabled ? workSignal : null)),
  h('footer.project-card-footer',
    h('a.project-card-commit', { href: projectPath(p.id, 'git'), title: footer }, footer),
    actionButton('Resume', () => resumeProject(current()), { cls: 'project-card-resume', iconName: 'resume', disabled: !p.exists, title: `Resume ${p.name}: restore services, terminals and the last conversation` })));
  contextMenu(card, () => projectMenuItems(current()), { label: `${p.name} actions` });
  return card;
}
