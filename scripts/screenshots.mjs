import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { measureCapColors, measureScreenContinuity } from './color-fidelity.mjs';

const port = 4175;
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', data => { serverOutput += data; });
server.stderr.on('data', data => { serverOutput += data; });
let browser;
const variants = ['glacial-blue', 'cool-black', 'emerald', 'pink', 'overnight', 'white-blue-purple', 'white-brown'];
const errors = [];
const checks = {};
const expectedPalettes = {
  'glacial-blue': { body: 'e5e8e9', frame: 'f2f3ef', knob: 'e8ecea', ring: 'e5e6e5', alpha: 'edf0ed', mod: 'a9c3d9', accent: '23263a', alphaLegend: '28313a', modLegend: '28313a', accentLegend: 'f9f9f4' },
  'cool-black': { body: '1d1e21', frame: '282a2b', knob: '26282a', ring: '6c7278', alpha: '2b3040', mod: '202123', accent: 'e3b232', alphaLegend: 'e3b232', modLegend: 'e3b232', accentLegend: '242323' },
  pink: { body: 'e6aebd', frame: 'f0b9c4', knob: 'f0b9c4', ring: 'e4e5e4', alpha: 'f3e9dc', mod: 'eeaab8', accent: 'eeaab8', alphaLegend: 'd78c9e', modLegend: 'fff7ed', accentLegend: 'fff7ed' },
};
const modIds = new Set(['f5', 'f6', 'f7', 'f8', 'backspace', 'delete', 'tab', 'pageup', 'caps', 'pagedown', 'shiftleft', 'shiftright', 'end', 'ctrlleft', 'win', 'alt', 'fn', 'ctrlright']);
const accentIds = new Set(['esc', 'enter', 'space', 'up', 'left', 'down', 'right']);
function assertPalette(info, id) {
  const palette = expectedPalettes[id];
  assert.deepEqual(info.palette, palette, `${id}: every shared material must match`);
  assert.equal(Object.keys(info.keys).length, 80);
  for (const [keyId, key] of Object.entries(info.keys)) {
    const group = id === 'pink' && keyId === 'space' ? 'mod' : modIds.has(keyId) ? 'mod' : accentIds.has(keyId) ? 'accent' : 'alpha';
    assert.equal(key.group, group, `${id}/${keyId}: actual bound material group`);
    assert.equal(key.cap, palette[group], `${id}/${keyId}: actual cap color`);
    assert.equal(key.legend, key.labels.length ? palette[`${group}Legend`] : null, `${id}/${keyId}: actual legend color`);
  }
}
const renderedPage = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
function observeErrors(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
}

async function selectionDuringLoading(browser) {
  const cases = [];
  for (const [id, name] of [['pink', 'Pink'], ['cool-black', 'Cool Black']]) {
    // A fresh context plus an explicit HDRI gate guarantees a cold, suspended
    // scene. Select through the real picker before Keyboard has committed.
    const context = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); observeErrors(page);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/hdri/*.hdr', async route => { await gate; await route.continue(); });
    const requested = page.waitForRequest(request => request.url().endsWith('.hdr'));
    try {
      await page.goto(`${url}/?capture=1`, { waitUntil: 'domcontentloaded' });
      await requested;
      assert.equal(await page.evaluate(() => Boolean(window.__kb?.ready)), false, 'Scene must still be loading');
      const radio = page.getByRole('radio', { name, exact: true });
      await radio.click();
      assert.equal(await radio.getAttribute('aria-checked'), 'true');
      release();
      await page.waitForFunction(() => window.__kb?.ready && window.__kb.generation > 0);
      await renderedPage(page);
      const initial = await page.evaluate(() => ({ id: window.__kb.displayedId, info: window.__kb.inspect() }));
      assert.equal(initial.id, id);
      assertPalette(initial.info, id); // Palette and overrides already correct at time zero.
      await page.evaluate(() => window.__kb.finish());
      await page.waitForFunction(() => window.__kb.finished);
      await renderedPage(page);
      const result = await page.evaluate(() => ({ phase: window.__kb.phase, finished: window.__kb.finished, selectedId: window.__kb.selectedId, displayedId: window.__kb.displayedId, info: window.__kb.inspect() }));
      assertPalette(result.info, id);
      assert.equal(result.selectedId, id); assert.equal(result.displayedId, id);
      assert.ok(result.info.capOffsets.every(y => y === 0)); assert.equal(result.info.knobOffset, 0);
      cases.push({ selectedId: id, displayedId: result.displayedId, phase: result.phase, finished: result.finished, palette: result.info.palette, checkedKeys: 80, spaceGroup: result.info.keys.space.group });
    } finally { release(); await context.close(); }
  }
  return { status: 'passed', cases };
}
try {
  await mkdir('screenshots', { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview failed: ${serverOutput}`);
    try { if ((await fetch(url)).ok) break; } catch { /* preview is starting */ }
    if (attempt === 99) throw new Error('Preview did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  checks.selectionDuringLoading = await selectionDuringLoading(browser);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  observeErrors(page);
  await page.goto(`${url}/?capture=1`);
  await page.waitForFunction(() => window.__kb?.ready && window.__kb.generation > 0);
  const rendered = () => renderedPage(page);
  const shot = async name => { await rendered(); const buffer = await page.screenshot({ path: `screenshots/${name}.png` }); console.log(`screenshots/${name}.png`); return buffer; };
  const colorShot = async (name, id) => {
    const buffer = await shot(name);
    const points = await page.evaluate(() => window.__kb.inspect().colorSamples);
    checks.colorFidelity ??= {};
    checks.colorFidelity[id] = measureCapColors(buffer, points, expectedPalettes[id]);
    if (id === 'glacial-blue') {
      const region = await page.evaluate(() => window.__lighting().screenRegion);
      checks.screenContinuity = measureScreenContinuity(buffer, region);
    }
    // Keep actionable pixel deltas even if a later assertion fails.
    await writeFile('screenshots/checks.json', `${JSON.stringify(checks, null, 2)}\n`);
    assert.equal(checks.colorFidelity[id].status, 'passed', `${id}: rendered cap hue/saturation must match (see checks.json)`);
    if (id === 'glacial-blue') assert.equal(checks.screenContinuity.status, 'passed', 'Wallpaper must have no narrow dark seams or stand-edge fragments');
  };
  const change = async id => {
    const previous = await page.evaluate(() => window.__kb.generation);
    await page.evaluate(id => window.__kb.setVariant(id), id);
    await page.waitForFunction(previous => window.__kb.generation > previous, previous);
  };
  const finish = async () => {
    await page.evaluate(() => window.__kb.finish());
    await page.waitForFunction(() => window.__kb.finished);
    await rendered();
    const info = await page.evaluate(() => window.__kb.inspect());
    assert.equal(info.capOffsets.length, 80);
    assert.ok(info.capOffsets.every(offset => Math.abs(offset) < 1e-8), 'All 80 prescribed caps must be seated');
    assert.equal(info.knobOffset, 0);
    return info;
  };
  await page.evaluate(() => window.__kb.seek(0.95));
  const mid = await page.evaluate(() => window.__kb.inspect());
  assert.ok(mid.capOffsets.some(y => y > 0.01) && mid.capOffsets.some(y => y < 0.001), 'Initial shot must show a partially seated wave');
  await shot('assembly-mid');
  checks['glacial-blue'] = await finish();
  assertPalette(checks['glacial-blue'], 'glacial-blue');
  const backslash = checks['glacial-blue'].keys.backslash.labels[1];
  assert.equal(backslash, String.fromCharCode(92)); assert.equal(backslash.length, 1);
  checks.backslashLegend = { status: 'passed', codePoint: backslash.codePointAt(0), length: backslash.length };
  assert.ok(checks['glacial-blue'].framing.keyboardWidthRatio >= 0.55 && checks['glacial-blue'].framing.keyboardWidthRatio <= 0.65, 'Hero keyboard must occupy 55–65% of the 16:10 frame');
  assert.ok(checks['glacial-blue'].framing.deskFrontEdgeNdcY > -0.90 && checks['glacial-blue'].framing.deskFrontEdgeNdcY < 0, 'Desktop front edge must be in the lower frame');
  await shot('glacial-blue');
  await colorShot('lighting-hero', 'glacial-blue');
  const lighting = await page.evaluate(() => window.__lighting());
  assert.ok(lighting.lampAlignment.angleDegrees <= 3, 'Spotlight direction must follow the actual diffuser normal in world space');
  assert.ok(lighting.lampAlignment.openingToCameraDot < 0, 'Hero must see the shade exterior, not look into its opening');
  checks.lampAlignment = { status: 'passed', maximumDegrees: 3, ...lighting.lampAlignment };
  assert.deepEqual(lighting.lights.map(light => light.type).sort(), ['HemisphereLight', 'RectAreaLight', 'RectAreaLight', 'SpotLight']);
  assert.equal(lighting.lights.filter(light => light.castShadow).length, 1);
  assert.equal(lighting.shadowAutoUpdate, false);
  assert.ok(lighting.environment < 0.1);
  checks.practicalLighting = { status: 'passed', ...lighting };
  for (const id of variants.slice(1)) {
    await change(id);
    if (id === 'cool-black') { await page.evaluate(() => window.__kb.seek(0.88)); await shot('switch-mid'); }
    checks[id] = await finish();
    assert.equal(await page.evaluate(() => window.__kb.displayedId), id);
    await shot(id);
    if (id === 'cool-black' || id === 'pink') await colorShot(`lighting-hero-${id}`, id);
  }
  await change('glacial-blue'); await finish();
  await page.evaluate(() => window.__kb.camera('lighting-wide'));
  await shot('lighting-wide');
  await page.evaluate(() => window.__kb.camera('lighting-closeup'));
  await shot('lighting-closeup');
  await page.evaluate(() => window.__kb.camera('closeup'));
  await shot('closeup');
  await change('cool-black'); await finish();
  await shot('dark-closeup');
  await page.evaluate(() => window.__kb.camera('profile'));
  await shot('profile');
  await change('glacial-blue'); await finish();
  await page.evaluate(() => window.__kb.camera('desk'));
  await shot('desk-wide');
  await page.evaluate(() => window.__kb.camera('desk-frame'));
  await shot('desk-frame');
  await page.evaluate(() => window.__kb.camera('default'));

  // Interrupt at different points in lift, recolor and insertion. Last selection wins.
  for (const [id, time] of [['pink', 0.3], ['emerald', 1.1], ['overnight', 1.7], ['cool-black', 0.5], ['white-brown', 2.0]]) {
    await change(id); await page.evaluate(time => window.__kb.seek(time), time);
  }
  const final = await finish();
  assert.equal(final.palette.body, '77665e');
  assert.equal(final.palette.alpha, 'f0ece3');
  assert.equal(final.palette.mod, 'c9b49a');
  assert.equal(final.palette.accent, '6e564b');
  checks.rapidRetarget = 'passed: final palette and every cap/knob seated';

  // Exercise actual elapsed-time playback, not only timeline seeking.
  await change('emerald');
  await page.evaluate(() => window.__kb.play());
  await page.waitForFunction(() => window.__kb.finished, null, { timeout: 20000 });
  await finish();
  checks.realtimePlayback = 'passed';
  await page.getByRole('radio', { name: 'Emerald', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => window.__kb.selectedId === 'pink');
  await finish();
  assert.equal(await page.getByRole('radio', { name: 'Pink', exact: true }).getAttribute('aria-checked'), 'true');
  checks.keyboardNavigation = 'passed';

  await change('glacial-blue'); await finish();
  // Two synchronous calls in one React batch. Do not call finish() afterward:
  // doing so would hide a phase stuck on a completed, unchanged A timeline.
  await page.evaluate(() => { window.__kb.setVariant('cool-black'); window.__kb.setVariant('glacial-blue'); });
  await rendered();
  const batched = await page.evaluate(() => ({ phase: window.__kb.phase, finished: window.__kb.finished, selectedId: window.__kb.selectedId, displayedId: window.__kb.displayedId, info: window.__kb.inspect() }));
  assert.equal(batched.phase, 'assembled'); assert.equal(batched.finished, true);
  assert.equal(batched.selectedId, 'glacial-blue'); assert.equal(batched.displayedId, 'glacial-blue');
  assertPalette(batched.info, 'glacial-blue');
  checks.batchedReturnToCurrent = { status: 'passed', phase: batched.phase, finished: batched.finished, selectedId: batched.selectedId, displayedId: batched.displayedId, palette: batched.info.palette, checkedKeys: 80 };

  // Unmount a real Canvas, then remount and unmount again. Owner-level counters
  // observe Three.js dispose events, covering imperative resources R3F cannot own.
  const lifecycles = [];
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.evaluate(() => window.__app.setMounted(false));
    await page.waitForFunction(() => !window.__kb && Object.values(window.__app.resources()).every(owner => owner.active === 0));
    const owners = await page.evaluate(() => window.__app.resources());
    for (const owner of ['Keyboard', 'Case', 'Switches', 'Knob', 'Desk.Finishes', 'Desk.Wood', 'Desk.Beam', 'Desk.Foot', 'Desk.Handset', 'StudioFloor', 'Monitor.Wallpaper', 'Monitor.Neck', 'FloorContact']) {
      assert.ok(owners[owner].registered > 0, `${owner} must be exercised`);
      assert.equal(owners[owner].registered, owners[owner].disposed, `${owner} must release every owned resource`);
    }
    lifecycles.push(owners);
    if (cycle === 0) {
      await page.evaluate(() => window.__app.setMounted(true));
      await page.waitForFunction(() => window.__kb?.ready && window.__kb.generation > 0);
      assertPalette(await finish(), 'glacial-blue');
    }
  }
  checks.resourceDisposal = { status: 'passed', unmounts: 2, owners: lifecycles.at(-1) };
  await context.close();

  checks.soloLights = {};
  for (const role of ['key', 'rim', 'fill']) {
    const soloContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
    const soloPage = await soloContext.newPage(); observeErrors(soloPage);
    await soloPage.goto(`${url}/?capture=1&solo=${role}`);
    await soloPage.waitForFunction(() => window.__kb?.ready && window.__kb.generation > 0);
    await soloPage.evaluate(() => window.__kb.finish());
    await soloPage.waitForFunction(() => window.__kb.finished);
    await renderedPage(soloPage);
    const info = await soloPage.evaluate(() => window.__lighting());
    const active = info.lights.filter(light => light.intensity > 0);
    assert.equal(active.length, role === 'fill' ? 2 : 1, `Only the ${role} emitter (and ceiling bounce in fill) may be active`);
    const practical = active.find(light => light.type !== 'HemisphereLight');
    assert.equal(practical.type, role === 'key' ? 'SpotLight' : 'RectAreaLight');
    assert.equal(practical.castShadow, role === 'key');
    assert.equal(info.environment, 0.008);
    assert.equal(info.shadowAutoUpdate, false);
    assert.ok(info.lampAlignment.angleDegrees <= 3);
    assert.ok(info.lampAlignment.openingToCameraDot < 0);
    checks.soloLights[role] = { status: 'passed', ...info };
    await soloPage.screenshot({ path: `screenshots/solo-${role}.png` });
    console.log(`screenshots/solo-${role}.png`);
    await soloContext.close();
  }

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', error => errors.push(error.message));
  await mobilePage.goto(url);
  await mobilePage.waitForFunction(() => window.__kb?.finished);
  assert.ok(await mobilePage.evaluate(() => window.__kb.duration < 0.7));
  await mobilePage.getByRole('radio', { name: 'White & Brown', exact: true }).click();
  await mobilePage.waitForFunction(() => window.__kb.finished && window.__kb.displayedId === 'white-brown');
  const mobileInfo = await mobilePage.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, info: window.__kb.inspect() }));
  assert.equal(mobileInfo.width, mobileInfo.scrollWidth);
  assert.ok(mobileInfo.info.capOffsets.every(y => y === 0));
  assert.ok(mobileInfo.info.framing.keyboardWidthRatio < 0.98, 'Portrait framing must fit the complete keyboard');
  await mobilePage.screenshot({ path: 'screenshots/mobile.png' });
  console.log('screenshots/mobile.png');
  checks.reducedMotionAndMobile = 'passed';
  await mobile.close();

  const debugContext = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const debugPage = await debugContext.newPage(); observeErrors(debugPage);
  await debugPage.goto(`${url}/?capture=1&debug`);
  await debugPage.waitForFunction(() => window.__kb?.ready);
  await debugPage.evaluate(() => window.__kb.finish());
  const intensityControl = debugPage.getByRole('textbox', { name: 'Intensity', exact: true }).first();
  await intensityControl.fill('1.15'); await intensityControl.press('Enter');
  await debugPage.waitForFunction(() => window.__lighting().lights.find(light => light.type === 'SpotLight').intensity === 1.15);
  const positionControl = debugPage.getByRole('textbox', { name: 'Head position', exact: true });
  await positionControl.fill('-0.25'); await positionControl.press('Enter');
  await debugPage.waitForFunction(() => window.__lighting().lights.find(light => light.type === 'SpotLight').position[0] === -0.25);
  await renderedPage(debugPage);
  assert.equal(await debugPage.evaluate(() => window.__lighting().shadowAutoUpdate), false);
  const tunedAlignment = await debugPage.evaluate(() => window.__lighting().lampAlignment);
  assert.ok(tunedAlignment.angleDegrees <= 3, 'Shade and spotlight must stay aligned after moving the head');
  checks.debugControls = { status: 'passed', intensity: 1.15, headX: -0.25, assembledShadowCache: true, lampAlignment: tunedAlignment };
  await debugContext.close();
  assert.deepEqual(errors, [], 'Browser must have no runtime or console errors');
  checks.browserErrors = errors;
  await writeFile('screenshots/checks.json', `${JSON.stringify(checks, null, 2)}\n`);
  console.log('All checks passed. Evidence saved to screenshots/checks.json');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
