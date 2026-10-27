import assert from 'node:assert/strict';
import path from 'node:path';

/** Browser checks against the real isolated workspace created by verify.mjs. */
export async function verifyIconMotion(page, context, artifacts, pass) {
  const homeUrl = page.url();
  const settle = (ink) => ink.evaluate((el) => {
    getComputedStyle(el).transform;
    return Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const matrix = (ink) => ink.evaluate((el) => {
    const value = getComputedStyle(el).transform;
    return { value, rest: value === 'none' || new DOMMatrixReadOnly(value).isIdentity };
  });
  const leave = async () => { await page.mouse.move(1, 1); await page.evaluate(() => document.activeElement?.blur()); };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => document.fonts.ready);
  await leave();
  const settings = page.locator('.v2-navlinks a[href="/settings"]');
  const upper = settings.locator('[data-icon-part="upper"]');
  const lower = settings.locator('[data-icon-part="lower"]');
  const bounds = await settings.boundingBox();
  const label = await settings.innerText();
  assert.ok((await matrix(upper)).rest);
  // Enter over the label, away from the SVG: the entire section owns the trigger.
  await settings.hover({ position: { x: bounds.width - 8, y: bounds.height / 2 } });
  await settle(upper);
  const parentPose = await matrix(upper);
  assert.ok(!parentPose.rest, 'Hovering the label must move its icon');
  const directions = await settings.evaluate((el) => [...el.querySelectorAll('path')].map((p) => new DOMMatrixReadOnly(getComputedStyle(p).transform).e));
  assert.ok(directions[0] > 0 && directions[1] < 0, 'Settings sliders should move in opposite directions');
  assert.deepEqual(await settings.boundingBox(), bounds, 'The hit area must stay fixed');
  assert.equal(await settings.innerText(), label);
  await settings.locator('svg').hover();
  await settle(upper);
  assert.equal((await matrix(upper)).value, parentPose.value, 'Direct icon hover must use the same feedback');
  pass('Icon feedback: parent label and direct glyph hover, internal movement and stable hit area');

  await leave(); await settle(upper);
  assert.ok((await matrix(upper)).rest);
  await page.keyboard.press('Tab');
  await settings.focus();
  await settle(upper);
  assert.ok(await settings.evaluate((el) => el.matches(':focus-visible')));
  assert.ok(!(await matrix(upper)).rest, 'Keyboard focus must receive feedback');
  await page.keyboard.press('Enter');
  await page.locator('.settings-body').waitFor();
  assert.equal(await settings.getAttribute('aria-current'), 'page');
  assert.ok(!(await matrix(upper)).rest, 'Selected navigation must retain feedback');
  await page.goto(homeUrl);
  await page.locator('.project-card').first().waitFor();
  pass('Icon feedback: keyboard focus and Enter navigation preserve the selected section');

  const cardId = await page.locator('.project-card').first().getAttribute('data-id');
  const card = page.locator(`.project-card[data-id="${cardId}"]`);
  const open = card.locator('.project-card-open');
  const arrow = open.locator('[data-icon-part="arrow"]');
  const frame = open.locator('[data-icon-part="fixed"]');
  // The home can still receive its initial scan; scroll/settle before measuring,
  // and retain the same project identity rather than following the first row.
  await open.hover(); await settle(arrow);
  await leave(); await settle(arrow);
  const openBounds = await open.boundingBox();
  const framePose = await matrix(frame);
  await open.hover(); await settle(arrow);
  const openPose = await matrix(arrow);
  assert.ok(!openPose.rest);
  assert.deepEqual(await matrix(frame), framePose, 'Open moves the arrow, not the window frame');
  assert.deepEqual(await open.boundingBox(), openBounds);
  await page.mouse.down(); await settle(arrow);
  assert.ok(!(await matrix(arrow)).rest, 'Press feedback remains visible');
  assert.notEqual((await matrix(arrow)).value, openPose.value, 'Press should acknowledge input separately from hover');
  await page.mouse.move(1, 1); await page.mouse.up();
  await leave(); await settle(arrow);
  for (let i = 0; i < 5; i++) { await open.hover(); await page.mouse.move(1, 1); }
  await settle(arrow);
  assert.ok((await matrix(arrow)).rest);
  assert.equal(await arrow.evaluate((el) => el.getAnimations().length), 0, 'Rapid entries must not leave queued effects');
  await card.hover({ position: { x: 8, y: 30 } });
  assert.ok((await matrix(arrow)).rest, 'Card hover must not activate nested actions');
  const resume = page.locator('.project-card-resume').first();
  const resumeInk = resume.locator('path');
  await resume.evaluate((el) => { el.disabled = true; });
  await resume.hover({ force: true }); await settle(resumeInk);
  assert.ok((await matrix(resumeInk)).rest, 'Disabled controls must stay still');
  await resume.evaluate((el) => { el.disabled = false; el.classList.add('busy'); el.setAttribute('aria-busy', 'true'); });
  await settle(resumeInk);
  assert.ok((await matrix(resumeInk)).rest, 'Busy feedback must not imply another action');
  await resume.evaluate((el) => { el.classList.remove('busy'); el.removeAttribute('aria-busy'); });
  await leave();
  pass('Icon feedback: action direction, fixed frames, press, interruption, disabled and busy states');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open.hover();
  assert.equal((await matrix(arrow)).value, 'none');
  assert.equal(await arrow.evaluate((el) => el.getAnimations().length), 0);
  await page.keyboard.press('Tab'); await settings.focus();
  assert.equal((await matrix(settings.locator('[data-icon-part="upper"]'))).value, 'none');
  assert.ok(await settings.evaluate((el) => el.matches(':focus-visible')));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await leave(); await settings.hover();
  await settle(settings.locator('[data-icon-part="upper"]'));
  await page.evaluate(() => document.querySelectorAll('.view, .main').forEach((el) => { el.scrollTop = 0; }));
  await page.screenshot({ path: path.join(artifacts, 'icon-motion-desktop.png') });
  pass('Icon feedback: reduced motion removes travel while preserving visible focus');

  const touch = await context.browser().newContext({ storageState: await context.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  try {
    const mobile = await touch.newPage();
    const errors = [];
    mobile.on('pageerror', (error) => errors.push(error.message));
    mobile.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await mobile.goto(homeUrl);
    const mobileOpen = mobile.locator('.project-card-open').first();
    await mobileOpen.waitFor();
    assert.equal(await mobile.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), false);
    await mobileOpen.hover();
    assert.ok((await matrix(mobileOpen.locator('[data-icon-part="arrow"]'))).rest, 'Touch must not retain hover motion');
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await mobile.evaluate(() => document.querySelectorAll('.view, .main').forEach((el) => { el.scrollTop = 0; }));
    await mobile.screenshot({ path: path.join(artifacts, 'icon-motion-mobile.png') });
    await mobileOpen.tap();
    await mobile.locator('.p-nav').waitFor();
    const projectLink = mobile.locator('.p-nav > a').first();
    await projectLink.tap();
    assert.equal(await projectLink.getAttribute('aria-current'), 'page');
    assert.deepEqual(errors, []);
  } finally { await touch.close(); }
  await leave();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  pass('Icon feedback: touch emulation, no sticky hover, project navigation and mobile overflow');
}
