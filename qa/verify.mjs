// Real HTTP, Git, PTY and browser checks. All mutations stay in qa/.runs/<unique run>.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { startFlintBench, loadConfig } from '../app/server/main.js';
import { defaultSettings } from '../app/server/settings/defaults.js';
import { customDefaults } from '../app/web/js/lib/profiles.js';
import { verifyIconMotion } from './icon-motion.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.FLINTBENCH_PLAYWRIGHT || 'playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = fileURLToPath(new URL('..', import.meta.url));
const runDir = path.join(root, 'qa', '.runs', `${Date.now()}`);
const fixtures = path.join(runDir, 'projects');
const dataDir = path.join(runDir, 'data');
const artifacts = path.join(root, 'docs', 'v2');
await fs.mkdir(fixtures, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(artifacts, { recursive: true });
const settings = defaultSettings();
Object.assign(settings, { roots: [fixtures], scanDepth: 1, setup: { done: true }, autoLockMinutes: 0, profile: 'custom', customProfile: customDefaults('pro') });
Object.assign(settings.customProfile.style, { accent: '', background: 'none', density: 'comfortable' });
settings.customProfile.flags['ui.greeting'] = false;
settings.agents.detection = false;
settings.agents.readSessionFiles = false;
settings.agents.taskPreviews = false;
settings.docker.enabled = false;
await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(settings));
const projects = [
  ['flintbench-web', 'The local control center for projects, services and your next idea.'],
  ['pulse-bot', 'Community tools, moderation and notifications for Discord.'],
  ['velora-network', 'A home for the network. Built for people who build things.'],
  ['brain-vault', 'Notes, decisions and research. Everything connected.'],
  ['store-intelligence', 'A clearer view of the store, its teams and the day ahead.'],
  ['field-notes', 'Small observations, useful references and work in progress.'],
  ['design-system', 'The components and foundations behind the interface.'],
  ['release-tools', 'Build scripts and the tools that get projects out the door.'],
];
const git = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', windowsHide: true });
for (const [name, description] of projects) {
  const dir = path.join(fixtures, name);
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ name, description, type: 'module' }));
  await fs.writeFile(path.join(dir, 'README.md'), `# ${name}\n\n${description}\n`);
  await fs.writeFile(path.join(dir, 'server.js'), "import http from 'node:http'; http.createServer((q,s)=>s.end('FLINTBENCH_QA_SERVICE_OK')).listen(4499,'127.0.0.1');\n");
  git(dir, 'init', '-b', 'main');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.name=FlintBench QA', '-c', 'user.email=qa@localhost', 'commit', '-qm', `Initialize ${name}`);
}
await fs.appendFile(path.join(fixtures, 'pulse-bot', 'README.md'), '\nQA uncommitted change.\n');
let instance, browser;
const checks = [];
const errors = [];
const warnings = [];
const pass = (name) => { checks.push(name); console.log(`PASS ${name}`); };
const password = randomBytes(20).toString('hex');
try {
  instance = await startFlintBench(loadConfig({ FLINTBENCH_PORT: '4488', FLINTBENCH_DATA_DIR: dataDir }), { log() {}, info() {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => errors.push(a.join(' ')) });
  const ids = [];
  for (const [name] of projects) ids.push((await instance.app.projects.add(path.join(fixtures, name))).id);
  await instance.app.runtime.defineService(ids[0], { name: 'QA web', command: 'node server.js', port: 4499, autostart: true });
  await instance.app.runtime.defineService(ids[2], { name: 'QA worker', command: 'node -e "setInterval(()=>{},1000)"', autostart: true });
  for (const id of ids) await instance.app.git.refresh(id, { full: true });
  browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1060 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:4488');
  await page.getByLabel('Username', { exact: true }).fill('QA Workspace');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.locator('.project-card').first().waitFor();
  assert.equal(await page.locator('.project-card').count(), 8);
  pass('Local account creation and real bootstrap render');
  await verifyIconMotion(page, context, artifacts, pass);
  const api = async (route, method = 'GET', body) => {
    const response = await context.request.fetch(`http://127.0.0.1:4488${route}`, { method, data: body, headers: { Origin: 'http://127.0.0.1:4488', 'X-FlintBench': '1' } });
    assert.ok(response.ok(), `${method} ${route}: ${response.status()} ${await response.text()}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const first = page.locator(`.project-card[data-id="${ids[0]}"]`);
  assert.equal(await first.locator('.project-card-description').textContent(), projects[0][1]);
  pass('Card descriptions come from package.json');
  assert.equal(await page.locator('.indev, .live-card').count(), 0);
  assert.equal(await page.locator('summary', { hasText: 'Live activity' }).count(), 0);
  const agentState = (agent, busy = true) => ({ active: [{ id: `qa-${agent}`, agent, agentName: { claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini', antigravity: 'Antigravity' }[agent], busy, startedAt: Date.now() - 65000 }], last: null });
  const resetActivity = (id) => instance.app.projects.patch(id, 'activity', { ...instance.app.projects.get(id).activity, lastFileChangeAt: Date.now() - 180000 });
  resetActivity(ids[0]);
  instance.app.projects.patch(ids[0], 'agents', agentState('claude'));
  instance.app.projects.patch(ids[2], 'agents', agentState('codex'));
  instance.app.projects.patch(ids[1], 'editors', [{ id: 'vscode', name: 'VS Code', since: Date.now() - 95000 }]);
  await fs.appendFile(path.join(fixtures, 'pulse-bot', 'README.md'), '\nActivity regression: a real file save.\n');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await first.locator('.live-signal.is-claude').waitFor();
  await page.waitForFunction((id) => document.querySelector(`[data-id="${id}"]`)?.classList.contains('is-working'), ids[1]);
  assert.match(await first.locator('.project-card-activity-text').textContent(), /Claude Code working/);
  assert.equal(await first.locator('.project-card-activity-text').evaluate((el) => getComputedStyle(el, '::before').animationName), 't-shimmer');
  assert.equal(await first.locator('.live-signal > span').first().evaluate((el) => el.getAnimations()[0]?.playState), 'running');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(artifacts, 'activity-desktop.png') });
  const before = await first.locator('.live-signal > span').first().evaluate((el) => ({ progress: el.getAnimations()[0].effect.getComputedTiming().progress, at: performance.now() }));
  instance.app.projects.patch(ids[0], 'attention', [{ severity: 'info', label: 'QA refresh' }]);
  await page.waitForTimeout(700);
  const after = await first.locator('.live-signal > span').first().evaluate((el) => ({ progress: el.getAnimations()[0].effect.getComputedTiming().progress, at: performance.now() }));
  const expected = (before.progress + (after.at - before.at) / 2000) % 1;
  const phaseError = Math.abs(expected - after.progress);
  assert.ok(Math.min(phaseError, 1 - phaseError) < .08, 'Agent animation restarted during a live update');
  pass('Live activity is integrated in main cards; agent animation continues across WebSocket updates');
  const editorCard = page.locator(`.project-card[data-id="${ids[1]}"]`);
  // Host polling can clear a simulated editor while the preceding screenshot/phase check runs.
  // Re-publish the fixture immediately before asserting its WebSocket-rendered editor state.
  instance.app.projects.patch(ids[1], 'editors', [{ id: 'vscode', name: 'VS Code', since: Date.now() - 95000 }]);
  await page.waitForFunction((id) => /VS Code.*editing/.test(document.querySelector(`[data-id="${id}"] .project-card-activity-text`)?.textContent ?? ''), ids[1]);
  assert.match(await editorCard.locator('.project-card-activity-text').textContent(), /VS Code.*editing/);
  assert.equal(await editorCard.locator('.live-signal.is-caret').count(), 1);
  pass('VS Code editor state plus a real filesystem save animates the main card');
  for (const agent of ['codex', 'antigravity', 'gemini']) {
    instance.app.projects.patch(ids[0], 'agents', agentState(agent));
    await page.waitForFunction(({ id, agent }) => document.querySelector(`[data-id="${id}"]`)?.dataset.tool === agent, { id: ids[0], agent });
    assert.equal(await first.locator(`.live-signal.is-${agent === 'codex' ? 'codex' : 'braille'}`).count(), 1);
  }
  pass('Tool-specific signals for Claude, Codex, Antigravity and Gemini');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('flintbench-web');
  await page.screenshot({ path: path.join(artifacts, 'activity-mobile.png') });
  await page.getByRole('searchbox', { name: 'Search projects' }).press('Escape');
  await page.setViewportSize({ width: 1600, height: 1060 });
  instance.app.projects.patch(ids[0], 'agents', agentState('claude', false));
  instance.app.projects.patch(ids[2], 'agents', agentState('codex', false));
  resetActivity(ids[0]); resetActivity(ids[1]); resetActivity(ids[2]);
  await page.waitForFunction((id) => document.querySelector(`[data-id="${id}"]`)?.dataset.activity === 'idle', ids[0]);
  await page.waitForFunction((id) => document.querySelector(`[data-id="${id}"]`)?.dataset.activity === 'idle', ids[1]);
  assert.equal(await first.locator('.live-signal.is-idle').count(), 1);
  assert.equal(await first.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length), 0);
  assert.equal(await editorCard.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length), 0);
  pass('Waiting agents and an editor without recent saves remain static');
  instance.app.projects.patch(ids[0], 'agents', agentState('claude'));
  await page.waitForFunction((id) => document.querySelector(`[data-id="${id}"]`)?.dataset.activity === 'working', ids[0]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await first.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length), 0);
  assert.equal(await first.locator('.live-signal > span').nth(2).evaluate((el) => getComputedStyle(el).opacity), '1');
  pass('Reduced motion retains the work status and a static visible agent signal');
  for (const id of [ids[0], ids[2]]) instance.app.projects.patch(id, 'agents', { active: [], last: null });
  instance.app.projects.patch(ids[1], 'editors', []);
  instance.app.projects.patch(ids[0], 'attention', []);
  await page.waitForFunction((id) => document.querySelector(`[data-id="${id}"]`)?.dataset.activity === 'rest', ids[0]);
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('pulse-bot');
  assert.equal(await page.locator('.project-card').count(), 1);
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('no-matching-project');
  await page.getByRole('heading', { name: 'No projects match' }).waitFor();
  await page.getByRole('searchbox', { name: 'Search projects' }).press('Escape');
  assert.equal(await page.locator('.project-card').count(), 8);
  pass('Search, empty results and Escape reset');
  await page.getByRole('button', { name: 'Sort projects by', exact: true }).click();
  await page.getByRole('option', { name: 'Name', exact: true }).click();
  assert.match(await page.locator('.project-card').first().locator('h3').textContent(), /brain-vault/);
  await page.getByRole('button', { name: 'Sort projects by', exact: true }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  pass('Project sorting by pointer and keyboard');
  await first.getByRole('switch').click();
  await page.waitForFunction((id) => document.querySelector(`[data-id="${id}"] [role="switch"]`)?.getAttribute('aria-checked') === 'true', ids[0], { timeout: 20000 });
  let serviceResponse;
  for (let tries = 0; tries < 80; tries++) {
    try { serviceResponse = await fetch('http://127.0.0.1:4499'); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 150)); }
  }
  assert.ok(serviceResponse, 'QA service did not bind its HTTP port');
  assert.equal(await serviceResponse.text(), 'FLINTBENCH_QA_SERVICE_OK');
  await page.getByRole('checkbox', { name: 'Only running' }).check();
  assert.equal(await page.locator('.project-card').count(), 1);
  await page.getByRole('checkbox', { name: 'Only running' }).uncheck();
  pass('Card Start → HTTP API → real PTY service → live switch and running filter');
  await page.getByRole('button', { name: /^Uncommitted/ }).click();
  assert.equal(await page.locator('.project-card').count(), 1);
  assert.match(await page.locator('.project-card h3').textContent(), /pulse-bot/);
  await page.getByRole('button', { name: /^All projects/ }).click();
  pass('Git changes filter uses actual uncommitted files');
  await first.getByRole('button', { name: 'Actions for flintbench-web' }).click();
  await page.getByRole('menu').waitFor();
  assert.ok(await page.getByRole('menuitem', { name: 'Copy path' }).count());
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('menu').count(), 0);
  await first.focus();
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await page.evaluate(() => document.activeElement?.dataset.id), ids[0]);
  pass('Project actions menu, Escape and keyboard card navigation');
  assert.equal(await page.locator('.rail .led-clock').isVisible(), true);
  await page.locator('.led-trigger').click();
  assert.equal(await page.locator('.timer-pop').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.timer-pop').isVisible(), false);
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  pass('Clock always in the top bar, timer access and command palette');
  await first.getByRole('link', { name: 'Open flintbench-web', exact: true }).click();
  await page.waitForURL(`**/p/${ids[0]}`);
  for (const tab of ['files', 'git', 'services', 'agents', 'context', 'sessions', 'work']) {
    await page.goto(`http://127.0.0.1:4488/p/${ids[0]}/${tab}`);
    await page.locator('.project').waitFor();
    await page.locator('.boot-stage').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }
  assert.equal(await page.locator('.rail .led-clock').isVisible(), true, 'Clock hidden inside a project');
  const file = await api(`/api/projects/${ids[0]}/files/content?path=README.md`);
  assert.match(JSON.stringify(file), /flintbench-web/);
  pass('Project workspace tabs and actual file reading');
  await page.goto('http://127.0.0.1:4488');
  await page.locator('.project-card').first().waitFor();
  await first.getByRole('button', { name: /^Resume/ }).click();
  await page.waitForURL(`**/p/${ids[0]}/workspace`);
  await page.locator('.xterm').first().waitFor({ timeout: 15000 });
  pass('Resume opens the project with the terminal dock');
  await page.goto('http://127.0.0.1:4488');
  await page.locator('.project-card').first().waitFor();
  for (const [width, height] of [[1920,1080],[1600,1060],[1366,900],[1024,900],[820,1180],[768,1024],[390,844],[320,720]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body, .app, .main, .view, .view-inner')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.className || e.tagName));
    assert.deepEqual(overflow, [], `Horizontal overflow at ${width}: ${overflow}`);
    if (width === 390) {
      assert.equal(await page.locator('.v2-navlinks .rl-side').first().isVisible(), true);
      const brand = await page.locator('.rail-brand').boundingBox();
      const clockButton = await page.locator('.led-trigger').boundingBox();
      assert.ok(brand.x + brand.width < clockButton.x, 'Mobile brand overlaps the clock');
      await page.locator('.led-trigger').click();
      assert.equal(await page.locator('.timer-pop').isVisible(), true);
      await page.keyboard.press('Escape');
    }
    if (width === 1600) await page.screenshot({ path: path.join(artifacts, 'home-desktop.png') });
    if (width === 390) await page.screenshot({ path: path.join(artifacts, 'home-mobile.png'), fullPage: true });
  }
  pass('Desktop, laptop, tablet and mobile: 8 widths without horizontal overflow');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await api('/api/settings', 'PATCH', { theme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.screenshot({ path: path.join(artifacts, 'home-light.png') });
  await api('/api/settings', 'PATCH', { theme: 'dark' });
  pass('Light theme and reduced motion');
  await api('/api/settings', 'PATCH', { appearance: { palette: 'blue-hour', scene: 'blue-hour', sceneMotion: true, sceneBlur: 4, transparency: 30 } });
  await page.waitForFunction(() => document.documentElement.dataset.palette === 'blue-hour' && document.querySelector('.scene video source[type="video/webm"]'));
  const look = await page.evaluate(async () => ({
    glass: getComputedStyle(document.documentElement).getPropertyValue('--glass').trim(),
    blur: getComputedStyle(document.querySelector('.scene video')).filter,
    media: await fetch('/media/blue-hour.webm', { headers: { Range: 'bytes=0-1023' } }).then((r) => `${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-range')}`),
    card: getComputedStyle(document.querySelector('.project-card')).backgroundColor,
  }));
  assert.equal(look.glass, '0.3');
  assert.match(look.blur, /blur\(4px\)/);
  assert.match(look.media, /^206 video\/webm bytes 0-1023\/\d+$/, `Background video is not served in ranges: ${look.media}`);
  assert.match(look.card, /0\.7\)$|color\(srgb .* \/ 0\.7\)/, `Card background is not translucent: ${look.card}`);
  const rejected = await context.request.fetch('http://127.0.0.1:4488/api/settings', { method: 'PATCH', data: { appearance: { transparency: 90 } }, headers: { Origin: 'http://127.0.0.1:4488', 'X-FlintBench': '1' } });
  assert.equal(rejected.status(), 400);
  await page.screenshot({ path: path.join(artifacts, 'home-blue-hour.png') });
  for (const scene of ['night-sky', 'fireworks', 'geometric']) {
    await api('/api/settings', 'PATCH', { appearance: { scene } });
    await page.waitForFunction((s) => document.querySelector(`.scene[data-scene="${s}"] video source[type="video/webm"]`), scene);
    const served = await page.evaluate((s) => Promise.all([`/media/${s}.webm`, `/media/${s}.mp4`, `/media/${s}.jpg`].map((u) => fetch(u, { headers: { Range: 'bytes=0-1023' } }).then((r) => r.status))), scene);
    assert.deepEqual(served.map((st) => st === 200 || st === 206), [true, true, true], `Background ${scene} is not served: ${served}`);
  }
  await api('/api/settings', 'PATCH', { appearance: { palette: 'graphite', scene: 'none', sceneBlur: 0, transparency: 0 } });
  await page.waitForFunction(() => !document.querySelector('.scene') && !document.documentElement.dataset.palette);
  pass('Colour theme, blue hour video background (served in ranges), blur and transparency apply and are validated');
  await api('/api/settings', 'PATCH', { profile: 'pro' });
  await page.goto('http://127.0.0.1:4488/settings');
  await page.locator('.stab[data-tab="appearance"]').click();
  const sizeField = page.locator('.srow[data-row="uiScale"] .range-number');
  await sizeField.fill('125');
  await sizeField.press('Enter');
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--ui-scale') === '1.25');
  await page.locator('.srow[data-row="style.accent"] .accent-swatch[title="Violet"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.profile === 'custom' && document.querySelector('.pf-card.is-on')?.dataset.id === 'custom');
  await page.locator('.settings-foot .btn.primary').click();
  await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === 'All changes saved');
  let saved = await api('/api/settings');
  assert.deepEqual([saved.profile, saved.customProfile.base, saved.customProfile.style.accent, saved.uiScale], ['custom', 'pro', '#7c3aed', 1.25]);
  await page.locator('.srow[data-row="style.accent"] .accent-swatch').first().focus();
  await page.locator('.settings-detail button', { hasText: 'Reset to default' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.profile === 'pro');
  await page.locator('.settings-foot .btn.primary').click();
  await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === 'All changes saved');
  saved = await api('/api/settings');
  assert.equal(saved.profile, 'pro');
  const outOfRange = await context.request.fetch('http://127.0.0.1:4488/api/settings', { method: 'PATCH', data: { uiScale: 2 }, headers: { Origin: 'http://127.0.0.1:4488', 'X-FlintBench': '1' } });
  assert.equal(outOfRange.status(), 400);
  await api('/api/settings', 'PATCH', { profile: 'custom', customProfile: settings.customProfile, uiScale: 1 });
  pass('Numbers by slider or typed; changing the accent makes the profile Custom, resetting it brings Pro back');
  await page.goto(`http://127.0.0.1:4488/p/${ids[0]}/overview`);
  await page.locator('.p-nav').waitFor();
  if (await page.locator('.dock.collapsed').count()) await page.locator('.dock-bar button[aria-expanded]').click();
  await page.locator('.dock-bar button[title="Maximize terminal"]').click();
  await page.waitForFunction(() => document.querySelector('.dock.maximized:not(.is-moving)'));
  const dockBox = await page.evaluate(() => {
    const r = (q) => document.querySelector(q).getBoundingClientRect();
    return { dock: r('.dock'), nav: r('.p-nav'), head: r('.p-head') };
  });
  assert.ok(dockBox.dock.left >= dockBox.nav.right - 1 && dockBox.dock.top >= dockBox.head.bottom - 1, `Maximised terminal covers the project menu: ${JSON.stringify(dockBox)}`);
  await page.locator('.dock-bar button[title="Restore terminal size"]').click();
  await page.waitForFunction(() => !document.querySelector('.dock.maximized, .dock.is-moving'));
  await page.locator('.dock-bar button[aria-expanded="true"]').click();
  await page.waitForFunction(() => document.querySelector('.dock.collapsed:not(.is-moving)'));
  pass('Terminal opens, closes, maximises and restores beside the project menu, never over it');
  await page.goto('http://127.0.0.1:4488');
  await page.locator('.project-card').first().waitFor();
  await first.getByRole('switch').click();
  await page.waitForFunction((id) => document.querySelector(`[data-id="${id}"] [role="switch"]`)?.getAttribute('aria-checked') === 'false', ids[0], { timeout: 20000 });
  pass('Card Stop → HTTP API → PTY teardown → live stopped state');
  for (const route of ['/projects', '/agents', '/activity', '/github', '/settings']) {
    await page.goto(`http://127.0.0.1:4488${route}`);
    await page.locator('.rail').waitFor();
    await page.waitForTimeout(300);
    assert.ok(await page.locator('h1').count(), route);
  }
  pass('All main sections still mount');
  const extra = path.join(fixtures, 'qa-added-from-ui');
  await fs.mkdir(extra);
  await fs.writeFile(path.join(extra, 'index.html'), '<!doctype html><title>QA added project</title>');
  await page.goto('http://127.0.0.1:4488');
  await page.getByRole('link', { name: 'Add project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project folder' }).fill(extra);
  await page.getByRole('button', { name: 'Add path', exact: true }).click();
  await page.getByRole('link', { name: 'FlintBench home', exact: true }).click();
  await page.locator('.project-card').first().waitFor();
  await page.getByRole('searchbox', { name: 'Search projects' }).fill('qa-added-from-ui');
  await page.locator('.project-card h3 a', { hasText: 'qa-added-from-ui' }).waitFor();
  assert.equal(await page.locator('.project-card [role="switch"]').isDisabled(), true);
  pass('Add project from the home CTA, persistence and disabled power for static folders');
  await page.getByRole('searchbox', { name: 'Search projects' }).press('Escape');
  await api('/api/settings', 'PATCH', { agents: { use: 'none' }, profile: 'essentials' });
  await page.waitForFunction(() => ![...document.querySelectorAll('.v2-navlinks a')].some((a) => a.textContent.includes('Agents') && a.offsetWidth));
  assert.equal(await page.locator('.project-card').count(), 9);
  pass('Profile changes preserve the home and hide disabled agent features');
  await api('/api/settings', 'PATCH', { appearance: { scene: 'night-sky' } });
  await page.getByRole('button', { name: 'Lock FlintBench', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).waitFor();
  assert.equal(await page.locator('.project-card').count(), 0);
  // a browser that never saw the console (no cached look) still gets the background from the server
  await page.evaluate(() => localStorage.removeItem('flintbench:appearance'));
  await page.reload();
  await page.getByLabel('Password', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.auth') && document.querySelector('.scene[data-scene="night-sky"] video'));
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /Unlock|Sign in/ }).click();
  await page.locator('.project-card').first().waitFor();
  await api('/api/settings', 'PATCH', { appearance: { scene: 'none' } });
  await page.waitForFunction(() => !document.querySelector('.scene'));
  pass('Lock clears project data from the DOM, the sign-in wears the video background, password unlock restores it');
  assert.deepEqual(errors, [], 'Runtime or console errors');
  pass('No browser runtime errors');
  const result = { result: 'PASS', checks, warnings, errors, browser: { name: 'Chromium', version: browser.version(), desktop: '1600x1060, mouse and keyboard', mobile: '390x844, touch emulation', reducedMotion: 'reduce and no-preference' }, unverified: ['Physical touch device', 'Safari', 'Firefox', 'Screen reader'], note: 'Browser Chromium; isolated QA projects. Activity checks send simulated agent/editor records through the real WebSocket channel and edit real fixture files. External editor launch, live GitHub mutations, Docker and AI agent execution are not exercised.' };
  await fs.writeFile(path.join(artifacts, 'verification.json'), JSON.stringify(result, null, 2));
  console.log(`V2_VERIFIED ${checks.length} checks. Screenshots: ${artifacts}`);
} catch (error) {
  await fs.writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ result: 'FAIL', checks, errors, warnings, failure: error.stack }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await instance?.stop();
}
// System-tool polling in inherited host integrations can keep a Node handle alive after stop().
process.exit(0);
