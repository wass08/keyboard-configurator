import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Color } from 'three';
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
const expectedEnvironment = { lightformerIntensity: 2, hdriIntensity: 0.09, rotation: 1.2 };
const nearArray = (actual, expected, message) => {
  assert.equal(actual.length, expected.length, message);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9, `${message}: ${actual} vs ${expected}`));
};
const idleFrames = (page, count = 20) => page.evaluate(count => new Promise(resolve => {
  const tick = () => { if (--count <= 0) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
}), count);
function assertReflectionCards(lighting, environment) {
  for (const [source, card] of [['key-softbox', 'reflection-softbox'], ['studio-fill', 'reflection-fill']]) {
    const light = lighting.lights.find(light => light.name === source);
    const reflection = environment.lightformers[card];
    nearArray(reflection.position, light.position, `${card}: actual world position`);
    nearArray(reflection.quaternion, light.quaternion, `${card}: actual plane orientation`);
    nearArray(reflection.size, light.size, `${card}: physical size`);
    nearArray(reflection.radiance, new Color(light.color).multiplyScalar(light.intensity * lighting.values.environment.lightformerIntensity).toArray(), `${card}: linear radiance/color`);
  }
}
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
    // Keep actionable pixel deltas even if a later assertion fails.
    await writeFile('screenshots/checks.json', `${JSON.stringify(checks, null, 2)}\n`);
    assert.equal(checks.colorFidelity[id].status, 'passed', `${id}: rendered cap hue/saturation must match (see checks.json)`);
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
  assert.equal(lighting.keyFrustum.outside, true, 'Studio key must be outside the default hero frustum');
  checks.keyOutsideHeroFrustum = { status: 'passed', ...lighting.keyFrustum };
  assert.deepEqual(Object.keys(lighting.areaFrusta).sort(), ['key-softbox', 'studio-fill']);
  for (const [name, source] of Object.entries(lighting.areaFrusta)) assert.equal(source.outside, true, `${name}: entire area source must be outside the hero frustum`);
  checks.areasOutsideHeroFrustum = { status: 'passed', sources: lighting.areaFrusta };
  assert.deepEqual(lighting.lights.map(light => light.type).sort(), ['RectAreaLight', 'RectAreaLight', 'RectAreaLight', 'RectAreaLight', 'SpotLight']);
  assert.equal(lighting.lights.filter(light => light.castShadow).length, 1);
  assert.equal(lighting.shadowAutoUpdate, false);
  assert.equal(lighting.environment, 1, 'Individual source intensities are baked into the environment');
  assert.deepEqual(lighting.values.environment, expectedEnvironment);
  assert.deepEqual(lighting.values.rendering, { exposure: 1 });
  assert.deepEqual(lighting.values.lights, {
    softbox: { type: 'RectAreaLight', intensity: 10.8, color: '#fff7f0', width: 0.6, height: 0.9, position: [-0.67, 1.75, 0.8], aim: [0, 0.79, -0.02] },
    spot: { type: 'SpotLight', intensity: 2.385, color: '#fff7f0', angle: 0.23, penumbra: 0.8, shadowSoftness: 147, shadowRadius: 4.1, linkedToSoftbox: true, position: [-0.67, 1.75, 0.8], aim: [0, 0.79, -0.02], unlinkedPosition: [-0.67, 1.75, 0.8], unlinkedAim: [0, 0.79, -0.02] },
    fill: { type: 'RectAreaLight', intensity: 0.85, color: '#eee4ff', width: 1.8, height: 1.5, position: [1.4, 1.4, 0.4], aim: [0, 0.79, -0.02] },
    monitor: { screenOn: false, type: 'RectAreaLight', intensity: 0, color: '#be7cff', width: 0.598, height: 0.028, position: [0, 1.025, -0.43], aim: [0, 0.99, 0], wallGlow: { intensity: 0, color: '#be7cff', width: 0.5, height: 0.26, localPosition: [0, 0, -0.06] } },
  }, 'Keep every user-tuned default exactly');
  for (const [name, role] of [['key-softbox', 'softbox'], ['studio-key', 'spot'], ['studio-fill', 'fill'], ['screen-rim', 'monitor']]) {
    const actual = lighting.lights.find(light => light.name === name), expected = lighting.values.lights[role];
    assert.equal(actual.intensity, expected.intensity); assert.equal(actual.color, expected.color);
  }
  const environment = await page.evaluate(() => window.__environment());
  assert.equal(environment.frames, 1); assert.equal(environment.captures, 1, 'Assembly must not rebake the environment');
  assert.equal(environment.hdriIntensity, expectedEnvironment.hdriIntensity);
  assert.equal(environment.hdriRotation, expectedEnvironment.rotation);
  assert.deepEqual(Object.keys(environment.lightformers).sort(), ['reflection-fill', 'reflection-softbox']);
  assertReflectionCards(lighting, environment);
  checks.rigMatchedEnvironment = { status: 'passed', defaults: expectedEnvironment, ...environment };
  checks.studioLighting = { status: 'passed', ...lighting };

  assert.equal(lighting.monitor.screenOn, false); assert.equal(lighting.monitor.hasWallpaper, false);
  assert.equal(lighting.monitor.material, 'MeshPhysicalMaterial');
  assert.equal(lighting.monitor.emissiveIntensity, 0); assert.equal(lighting.monitor.color, '030405');
  assert.equal(lighting.monitor.clearcoat, 1); assert.ok(lighting.monitor.roughness < 0.3);
  assert.ok(lighting.monitor.reflectionCaptures > 0, 'Off screen must reflect the actual scene');
  await shot('monitor-off');
  await idleFrames(page);
  assert.equal(await page.evaluate(() => window.__environment().captures), environment.captures, 'Idle frames must not rebake the cubemap');
  assert.equal(await page.evaluate(() => window.__lighting().monitor.reflectionCaptures), lighting.monitor.reflectionCaptures, 'Stationary panel reflections must also be cached');
  checks.monitorOff = { status: 'passed', ...lighting.monitor, idleReflectionCaptures: lighting.monitor.reflectionCaptures };

  // Retain wallpaper regression coverage behind the default-off control. Its
  // seam check belongs on the on-screen image, not real reflected geometry.
  await page.evaluate(() => window.__lightingStore.set({ 'Monitor · rim.screenOn': true }));
  await page.waitForFunction(() => window.__lighting().monitor.material === 'MeshBasicMaterial' && window.__environment().lightformers['reflection-screen']);
  const powered = await page.evaluate(() => ({ lighting: window.__lighting(), environment: window.__environment() }));
  assert.equal(powered.lighting.monitor.hasWallpaper, true);
  const panel = powered.environment.lightformers['reflection-screen'];
  nearArray(panel.position, powered.lighting.monitor.position, 'Screen reflection world position');
  nearArray(panel.quaternion, powered.lighting.monitor.quaternion, 'Screen reflection orientation');
  nearArray(panel.size, [0.598, 0.336], 'Full screen reflection size');
  const screenBuffer = await shot('monitor-on');
  checks.screenContinuity = measureScreenContinuity(screenBuffer, powered.lighting.screenRegion);
  assert.equal(checks.screenContinuity.status, 'passed', 'Powered-on wallpaper must have no narrow dark seams or stand-edge fragments');
  await page.evaluate(() => window.__lightingStore.set({ 'Monitor · rim.rimIntensity': 42, 'Monitor · rim.wallGlow': 16 }));
  await page.waitForFunction(() => window.__lighting().lights.find(light => light.name === 'screen-rim').intensity === 42);
  await page.evaluate(() => window.__lightingStore.set({ 'Monitor · rim.screenOn': false }));
  await page.waitForFunction(() => window.__lighting().monitor.material === 'MeshPhysicalMaterial' && !window.__environment().lightformers['reflection-screen']);
  const offAgain = await page.evaluate(() => window.__lighting());
  assert.ok(offAgain.lights.filter(light => light.name.startsWith('screen-')).every(light => light.intensity === 0), 'screenOn=false must gate both monitor lights even when their configured values are positive');
  await page.evaluate(() => window.__lightingStore.set({ 'Monitor · rim.rimIntensity': 0, 'Monitor · rim.wallGlow': 0 }));
  checks.monitorToggle = { status: 'passed', onMaterial: powered.lighting.monitor.material, screenLightformer: panel, offGatesBothLights: true, wallpaperContinuity: checks.screenContinuity.status };
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
  await change('cool-black'); await finish();
  await page.evaluate(() => window.__kb.camera('lighting-closeup'));
  await shot('lighting-closeup');
  await change('glacial-blue'); await finish();
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
    for (const owner of ['Keyboard', 'Case', 'Switches', 'Knob', 'Desk.Finishes', 'Desk.Wood', 'Desk.Beam', 'Desk.Foot', 'Desk.Handset', 'StudioFloor', 'Monitor.Wallpaper', 'Monitor.Neck', 'Monitor.Reflection', 'Environment.Cubemap', 'StudioWall', 'FloorContact']) {
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
  for (const role of ['key', 'softbox', 'spot', 'fill', 'rim', 'env']) {
    const soloContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
    const soloPage = await soloContext.newPage(); observeErrors(soloPage);
    await soloPage.goto(`${url}/?capture=1&solo=${role}`);
    await soloPage.waitForFunction(() => window.__kb?.ready && window.__kb.generation > 0);
    await soloPage.evaluate(() => window.__kb.finish());
    await soloPage.waitForFunction(() => window.__kb.finished);
    await renderedPage(soloPage);
    const info = await soloPage.evaluate(() => window.__lighting());
    const active = info.lights.filter(light => light.intensity > 0);
    const expected = { key: ['key-softbox', 'studio-key'], softbox: ['key-softbox'], spot: ['studio-key'], fill: ['studio-fill'], rim: [], env: [] }[role];
    assert.deepEqual(active.map(light => light.name).sort(), expected.sort(), `Only the ${role} role may be active`);
    assert.equal(active.some(light => light.castShadow), role === 'key' || role === 'spot');
    assert.equal(info.environment, 1);
    const soloEnvironment = await soloPage.evaluate(() => window.__environment());
    assert.equal(soloEnvironment.hdriIntensity, role === 'env' ? expectedEnvironment.hdriIntensity : 0.008);
    assert.equal(Object.keys(soloEnvironment.lightformers).length, role === 'env' ? 2 : 0);
    assert.equal(info.shadowAutoUpdate, false);
    assert.equal(info.keyFrustum.outside, true);
    for (const source of Object.values(info.areaFrusta)) assert.equal(source.outside, true);
    checks.soloLights[role] = { status: 'passed', ...info, environmentCapture: soloEnvironment };
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
  const mobileCamera = await mobilePage.evaluate(() => window.__camera());
  assert.equal(mobileCamera.minDistance, 0.317);
  assert.equal(mobileCamera.maxDistance, 0.719, "Never override the user's max orbit distance for mobile");
  assert.ok(mobileCamera.distance <= 0.719 + 1e-8);
  // Spec 04 explicitly retains this limit and requires an honest framing report,
  // rather than automatically widening the mobile camera to make a fit test pass.
  checks.mobileFraming = { status: 'measured', fits: mobileInfo.info.framing.keyboardWidthRatio < 0.98, keyboardWidthRatio: mobileInfo.info.framing.keyboardWidthRatio, camera: mobileCamera, viewport: [390, 844] };
  await mobilePage.screenshot({ path: 'screenshots/mobile.png' });
  console.log('screenshots/mobile.png');
  checks.reducedMotionAndMobile = 'passed';
  await mobile.close();

  const debugContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, permissions: ['clipboard-read', 'clipboard-write'] });
  const debugPage = await debugContext.newPage(); observeErrors(debugPage);
  await debugPage.goto(`${url}/?capture=1&debug`);
  await debugPage.waitForFunction(() => window.__kb?.ready && window.__camera);
  await debugPage.evaluate(() => window.__kb.finish());
  const originalCamera = await debugPage.evaluate(() => window.__camera());
  const edit = async (name, value) => {
    const input = debugPage.getByRole('textbox', { name, exact: true }).first();
    await input.fill(String(value)); await input.press('Enter');
  };
  // Drag both real slider tracks and inspect the actual OrbitControls limits.
  // The adjacent numeric fields exercise precise values separately.
  const dragLimit = async (name, fraction) => {
    const range = debugPage.getByRole('textbox', { name, exact: true }).locator('..').locator('..').locator(':scope > div').first();
    const bounds = await range.boundingBox();
    assert.ok(bounds, `${name}: slider track must be visible`);
    const handle = await range.locator(':scope > div').last().boundingBox();
    assert.ok(handle);
    await debugPage.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await debugPage.mouse.down();
    await debugPage.mouse.move(bounds.x + bounds.width * fraction, bounds.y + bounds.height / 2, { steps: 4 });
    await debugPage.mouse.up();
    await renderedPage(debugPage);
  };
  await dragLimit('minDistance', 0.08); await dragLimit('maxDistance', 0.85);
  const draggedLimits = await debugPage.evaluate(() => window.__camera());
  assert.ok(draggedLimits.minDistance > 0.30 && draggedLimits.minDistance < 0.50);
  assert.ok(draggedLimits.maxDistance > 4.9 && draggedLimits.maxDistance < 5.3);
  await edit('minDistance', 0.31); await edit('maxDistance', 5.6);
  await debugPage.waitForFunction(() => window.__camera().minDistance === 0.31 && window.__camera().maxDistance === 5.6);
  const sliderLimits = await debugPage.evaluate(() => window.__camera());
  await debugPage.getByRole('button', { name: 'Set min = current', exact: true }).click();
  await debugPage.waitForFunction(distance => Math.abs(window.__camera().minDistance - distance) < 0.0011, originalCamera.distance);
  const setMin = await debugPage.evaluate(() => window.__camera());
  assert.ok(Math.abs(setMin.minDistance - setMin.distance) <= 0.0011);
  await debugPage.getByRole('button', { name: 'Set max = current', exact: true }).click();
  await debugPage.waitForFunction(() => Math.abs(window.__camera().maxDistance - window.__camera().distance) <= 0.0011);
  const setMax = await debugPage.evaluate(() => window.__camera());
  await debugPage.getByRole('button', { name: 'Copy camera values', exact: true }).click();
  const copied = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(Object.keys(copied).sort(), ['minDistance', 'maxDistance', 'distance', 'polarDeg', 'azimuthDeg', 'position', 'target'].sort());
  assert.ok(Math.abs(copied.distance - setMax.distance) < 0.0001);
  await debugPage.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await debugPage.waitForFunction(() => window.__camera().minDistance === 0.317 && window.__camera().maxDistance === 0.719);
  const resetCamera = await debugPage.evaluate(() => window.__camera());
  assert.ok(Math.abs(resetCamera.distance - originalCamera.distance) < 0.0001);
  checks.cameraControls = { status: 'passed', defaults: originalCamera, draggedLimits, sliderLimits, setMin, setMax, copied, reset: resetCamera };
  await renderedPage(debugPage);
  await debugPage.screenshot({ path: 'screenshots/debug-camera.png' });
  console.log('screenshots/debug-camera.png');

  const defaultLighting = await debugPage.evaluate(() => window.__lighting().values);
  await debugPage.getByRole('button', { name: 'Copy lighting values', exact: true }).click();
  const lightingCopy = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(lightingCopy, defaultLighting, 'Clipboard must contain every current light parameter');
  assert.deepEqual(Object.keys(lightingCopy.lights).sort(), ['softbox', 'spot', 'fill', 'monitor'].sort());
  assert.deepEqual(lightingCopy.lights.softbox.position, [-0.67, 1.75, 0.8]);
  assert.deepEqual(lightingCopy.lights.spot.position, [-0.67, 1.75, 0.8]);
  checks.lightingClipboard = { status: 'passed', values: lightingCopy };

  // Use the real debug Leva store. Verify actual portal mesh transforms and
  // camera.update calls, rather than merely checking copied control values.
  const beforeEnvironment = await debugPage.evaluate(() => window.__environment());
  await idleFrames(debugPage);
  assert.equal(await debugPage.evaluate(() => window.__environment().captures), beforeEnvironment.captures);
  await debugPage.evaluate(() => window.__lightingStore.set({
    'Key · softbox.keyPosition': { x: -0.81, y: 1.82, z: 0.91 },
    'Key · softbox.keyAim': { x: 0.02, y: 0.80, z: -0.01 },
    'Key · softbox.softboxWidth': 0.72, 'Key · softbox.keyColor': '#faf1e9',
  }));
  await debugPage.waitForFunction(previous => window.__environment().captures > previous && window.__environment().lightformers['reflection-softbox'].position[0] === -0.81, beforeEnvironment.captures);
  await renderedPage(debugPage);
  const movedEnvironment = await debugPage.evaluate(() => window.__environment());
  const movedLighting = await debugPage.evaluate(() => window.__lighting());
  assertReflectionCards(movedLighting, movedEnvironment);
  nearArray(movedEnvironment.lightformers['reflection-softbox'].position, [-0.81, 1.82, 0.91], 'Debug store moves the actual environment Lightformer');
  await idleFrames(debugPage);
  const idleCaptureCount = await debugPage.evaluate(() => window.__environment().captures);
  assert.equal(idleCaptureCount, movedEnvironment.captures);
  checks.lightformerFollowsDebugStore = { status: 'passed', before: beforeEnvironment.lightformers['reflection-softbox'], moved: movedEnvironment.lightformers['reflection-softbox'], actualLight: movedLighting.lights.find(light => light.name === 'key-softbox'), captures: { before: beforeEnvironment.captures, afterMove: movedEnvironment.captures, afterIdle: idleCaptureCount } };
  await debugPage.evaluate(() => window.__lightingStore.set({
    'Key · softbox.keyPosition': { x: -0.67, y: 1.75, z: 0.8 },
    'Key · softbox.keyAim': { x: 0, y: 0.79, z: -0.02 },
    'Key · softbox.softboxWidth': 0.6, 'Key · softbox.keyColor': '#fff7f0',
  }));

  const editFolder = async (folder, key, value) => {
    const input = debugPage.locator(`[id="${folder}.${key}"]`);
    await input.fill(String(value)); await input.press('Enter');
  };
  await debugPage.getByText('Key · softbox', { exact: true }).click();
  await editFolder('Key · softbox', 'softboxIntensity', 13.15);
  await editFolder('Key · softbox', 'keyPosition', -0.75);
  await debugPage.waitForFunction(() => {
    const lights = window.__lighting().lights;
    return lights.find(light => light.name === 'key-softbox').intensity === 13.15 &&
      lights.find(light => light.name === 'studio-key').position[0] === -0.75;
  });
  await debugPage.getByText('Key · softbox', { exact: true }).click();
  await debugPage.getByText('Key · spot (shadows)', { exact: true }).click();
  await debugPage.getByText('Link to softbox', { exact: true }).click();
  await editFolder('Key · spot (shadows)', 'spotPosition', -0.67);
  await debugPage.waitForFunction(() => window.__lighting().lights.find(light => light.name === 'studio-key').position[0] === -0.67);
  await editFolder('Key · spot (shadows)', 'keyIntensity', 2.35);
  await editFolder('Key · spot (shadows)', 'shadowRadius', 3.2);
  await renderedPage(debugPage);
  const tuned = await debugPage.evaluate(() => window.__lighting());
  assert.equal(tuned.shadowAutoUpdate, false);
  assert.equal(tuned.lights.find(light => light.name === 'studio-key').intensity, 2.35);
  await debugPage.getByRole('button', { name: 'Copy lighting values', exact: true }).click();
  const tunedCopy = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(tunedCopy, tuned.values, 'Copy must use live edited values, not mount-time defaults');
  checks.debugControls = { status: 'passed', linkedPosition: [-0.75, 1.75, 0.8], unlinkedPosition: tunedCopy.lights.spot.position, assembledShadowCache: true, values: tunedCopy };
  await debugContext.close();
  assert.deepEqual(errors, [], 'Browser must have no runtime or console errors');
  checks.browserErrors = errors;
  await writeFile('screenshots/checks.json', `${JSON.stringify(checks, null, 2)}\n`);
  console.log('All checks passed. Evidence saved to screenshots/checks.json');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
