import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import { PNG } from 'pngjs';
import { measureCapColors, measureScreenContinuity } from './color-fidelity.mjs';
import { exportVoices, exportSampleVoices, table as audioTable } from './audio-analysis.mjs';

const port = Number(process.env.SHOTS_PORT ?? 4175);
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = '';
server.stdout.on('data', data => { serverOutput += data; });
server.stderr.on('data', data => { serverOutput += data; });
let browser;
const variants = ['glacial-blue', 'cool-black', 'emerald', 'pink', 'overnight', 'white-blue-purple', 'white-brown'];
const errors = [];
const checks = {};
const expectedEnvironment = { lightformerIntensity: 1.28, hdriIntensity: 0.095, rotation: -1.29 };
const expectedHero = {
  position: [0.153890, 1.375464, 1.229136], target: [0, 0.825, 0.005],
  minDistance: 0.317, maxDistance: 1.351, focalLengthMm: 80.343,
};
const orbitEpsilon = 1e-6;
function assertHeroCamera(value, aspect = 1.6) {
  assert.deepEqual(value.position, expectedHero.position, 'Copied desktop pose must remain exact, including after idle frames');
  assert.deepEqual(value.target, expectedHero.target);
  assert.equal(value.minDistance, expectedHero.minDistance); assert.equal(value.maxDistance, expectedHero.maxDistance);
  assert.ok(value.distance <= expectedHero.maxDistance + orbitEpsilon, 'Rounded pose may exceed max only within one micrometer');
  assert.ok(Math.abs(value.distance - expectedHero.maxDistance) < orbitEpsilon);
  assert.ok(Math.abs(value.polarDeg - 65.955) < 0.001 && Math.abs(value.azimuthDeg - 7.165) < 0.001);
  const expectedFov = 2 * Math.atan((35 / Math.max(1, aspect)) / (2 * expectedHero.focalLengthMm)) * 180 / Math.PI;
  assert.ok(Math.abs(value.lens.focalLengthMm - expectedHero.focalLengthMm) < 1e-9);
  assert.ok(Math.abs(value.lens.verticalFovDeg - expectedFov) < 1e-9, 'FOV must derive from 80.343 mm and the current aspect');
  assert.equal(value.lens.filmGaugeMm, 35); assert.equal(value.lens.near, 0.008); assert.equal(value.lens.far, 25);
  assert.equal(value.lens.depthOfField, false); assert.equal(value.lens.focusDistance, 0.719);
  assert.equal(value.lens.bokehScale, 1); assert.equal(value.lens.focalRange, 0.1);
}
const expectedLayout = {
  headphones: { x: -0.5380, z: -0.3517, rotationY: 0.0, y: 0.75 },
  monitor: { x: 0.0000, z: -0.3840, rotationY: 0.0, y: 0.75 },
  streamdeck: { x: 0.2810, z: -0.3350, rotationY: -24.6, y: 0.75 },
};
const expectedDesk = { clearcoat: 0.24, clearcoatRoughness: 0.22, roughnessMin: 0.30, roughnessScale: 0.32, normalStrength: 0.45, coatNormalStrength: 0.18, coatRoughnessInfluence: 0.32, envMapIntensity: 0.9 };
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
// --- interaction & sfx (spec 07c) ---
// Every physical code the configurator maps, written out independently of src/keyboard/keymap.ts.
// Every synthesized voice and its micro-variation count (src/audio/synth.ts).
const expectedVoices = { keyDown: 6, keyUp: 5, keyDownStab: 4, keyUpStab: 3, hover: 3, knobTick: 4, knobClick: 2, capLift: 3, capSeat: 4, knobSeat: 2, thud: 2, softClick: 3, matUnroll: 1 };
const audioFile = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba)(\?|$)|\/audio\//i;
// Recorded key samples (08b follow-up): one manifest and one sprite per page load.
const sampleClasses = { alpha: { press: 16, release: 16 }, space: { press: 7, release: 7 }, stab: { press: 5, release: 5 } };
const audioName = url => new URL(url).pathname.split('/').pop();
const expectedCodeMap = {
  Escape: 'esc', F1: 'f1', F2: 'f2', F3: 'f3', F4: 'f4', F5: 'f5', F6: 'f6', F7: 'f7', F8: 'f8', F9: 'f9', F10: 'f10', F11: 'f11', F12: 'f12',
  Backquote: 'num0', Digit1: 'num1', Digit2: 'num2', Digit3: 'num3', Digit4: 'num4', Digit5: 'num5', Digit6: 'num6', Digit7: 'num7', Digit8: 'num8', Digit9: 'num9', Digit0: 'num10', Minus: 'num11', Equal: 'num12', Backspace: 'backspace', Delete: 'delete',
  Tab: 'tab', KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T', KeyY: 'Y', KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P', BracketLeft: '[', BracketRight: ']', Backslash: 'backslash', PageUp: 'pageup',
  CapsLock: 'caps', KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G', KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L', Semicolon: ';', Quote: "'", Enter: 'enter', NumpadEnter: 'enter', PageDown: 'pagedown',
  ShiftLeft: 'shiftleft', KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M', Comma: ',', Period: '.', Slash: '/', ShiftRight: 'shiftright', ArrowUp: 'up', End: 'end',
  ControlLeft: 'ctrlleft', MetaLeft: 'win', OSLeft: 'win', AltLeft: 'alt', Space: 'space', AltRight: 'alt', MetaRight: 'win', OSRight: 'win', ContextMenu: 'fn', Fn: 'fn', ControlRight: 'ctrlright',
  ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right', IntlBackslash: 'backslash',
};
async function interactionChecks(browser) {
  const W = 1600, H = 1000;
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5 });
  // Count real AudioContext constructions and real source starts (headless has
  // no audible output, so scheduling calls are the evidence).
  await context.addInitScript(() => {
    const Native = window.AudioContext; let contexts = 0, starts = 0;
    window.AudioContext = class extends Native { constructor(...args) { super(...args); contexts++; } };
    // AudioBufferSourceNode overrides start(); oscillators use the base class.
    for (const proto of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
      const start = proto.start;
      proto.start = function (...args) { starts++; return start.apply(this, args); };
    }
    window.__audioProbe = () => ({ contexts, starts });
  });
  // Only the key-sample manifest and one sprite (Chromium: Opus) may be requested,
  // lazily after load; never a media element, never the m4a fallback as well.
  const audioRequests = [], audioFailures = [];
  context.on('request', request => { if (audioFile.test(request.url()) || request.resourceType() === 'media') audioRequests.push({ file: audioName(request.url()), type: request.resourceType(), at: Date.now() }); });
  context.on('requestfailed', request => { if (audioFile.test(request.url())) audioFailures.push(request.url()); });
  context.on('response', response => { if (audioFile.test(response.url()) && !response.ok()) audioFailures.push(`${response.status()} ${response.url()}`); });
  const page = await context.newPage(); observeErrors(page);
  const result = {};
  const frames = (count = 6) => idleFrames(page, count);
  const state = () => page.evaluate(() => window.__interaction.state());
  const sound = () => page.evaluate(() => ({ ...window.__sfx(), probe: window.__audioProbe() }));
  const at = async id => { const p = await page.evaluate(id => window.__interaction.keyPoint(id), id); assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `${id} must be in frame`); return [p.x * W, p.y * H]; };
  const settle = async () => { await page.waitForFunction(() => window.__interaction.state().active === 0, null, { timeout: 5000 }); await frames(2); };
  const finishPage = async () => { await page.evaluate(() => window.__kb.finish()); await page.waitForFunction(() => window.__kb.finished && window.__kb.introPhase === 'done'); await frames(3); };
  try {
    await page.goto(`${url}/?capture=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__kb.generation > 0 && window.__interaction);
    // 1. Hover is ignored mid-assembly, and nothing makes a sound before a gesture.
    // Use the seated key's screen position: during the mat/frame beats the
    // keyboard is deliberately hidden, and raised caps can project offscreen.
    await finishPage();
    await page.evaluate(() => window.__kb.camera('closeup')); await frames();
    const restG = await at('G');
    await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(window.__kb.introTimings.keysAt + 0.95); });
    await frames();
    await page.mouse.move(...restG);
    await frames();
    const midHover = await state();
    assert.equal(midHover.hovered, null, 'Hover must be ignored while the keys animate');
    assert.deepEqual(midHover.offsets, {}, 'No interaction offset during assembly');
    await finishPage();
    // A low profile view shows the 0.7 mm sink best; the cap has seated since.
    await page.evaluate(() => window.__kb.camera('profile')); await frames();
    await page.mouse.move(...await at('G'));
    await settle();
    const hover = await state();
    assert.equal(hover.hovered, 'G'); assert.equal(hover.cursor, 'pointer');
    assert.deepEqual(Object.keys(hover.offsets), ['G'], 'Only the hovered key sinks');
    assert.ok(Math.abs(hover.offsets.G - 0.0007) < 1e-6 && hover.offsets.G >= 0.0006 && hover.offsets.G <= 0.0008, 'Hover sinks 0.6-0.8 mm');
    assert.equal((await page.evaluate(() => window.__kb.inspect())).capOffsets.every(y => y === 0), true, 'Assembly transforms stay untouched (additive layer)');
    const beforeGesture = await sound();
    assert.equal(beforeGesture.probe.contexts, 0, 'No AudioContext before a user gesture');
    assert.equal(beforeGesture.probe.starts, 0); assert.equal(beforeGesture.scheduled, 0);
    assert.ok(beforeGesture.suppressed >= 1, 'The pre-gesture hover was suppressed, silently');
    assert.equal(beforeGesture.precompute.runs, 0, 'Nothing is synthesized before a gesture');
    assert.deepEqual(beforeGesture.buffers, {}); assert.equal(beforeGesture.ready, false);
    assert.ok(['idle', 'fetching', 'fetched'].includes(beforeGesture.samples.status), `Samples are not decoded before a gesture (${beforeGesture.samples.status})`);
    await shot('interaction-hover');
    await detail('interaction-hover-detail', 'G');
    await page.evaluate(() => window.__kb.camera('closeup')); await frames();
    result.hover = { status: 'passed', midAssembly: midHover, assembled: hover, silentBeforeGesture: beforeGesture.probe };

    // 2. Pointer press: full travel, stem follows, types, does not orbit, unlocks audio.
    const camera0 = await page.evaluate(() => window.__camera());
    const [hx, hy] = await at('H');
    await page.mouse.move(hx, hy); await page.mouse.down();
    await page.mouse.move(hx + 60, hy + 25, { steps: 6 });
    await settle();
    const press = await state();
    assert.deepEqual(press.pressed, ['H']);
    assert.ok(press.offsets.H >= 0.0035 && press.offsets.H <= 0.004, `Press depth ${press.offsets.H} must be 3.5-4 mm`);
    assert.ok(Math.abs(press.stemOffsets.H - press.offsets.H) < 1e-6, 'The switch stem travels with the cap');
    const camera1 = await page.evaluate(() => window.__camera());
    nearArray(camera1.position, camera0.position, 'A drag that starts on a key must not orbit');
    await page.mouse.move(hx, hy);
    await shot('interaction-press');
    await detail('interaction-press-detail', 'H');
    await page.mouse.up(); await settle();
    const released = await state();
    assert.equal(released.offsets.H, 0.0007, 'Back to hover depth under the pointer after release');
    const afterPress = await sound();
    assert.equal(afterPress.probe.contexts, 1); assert.equal(afterPress.contexts, 1);
    assert.equal(afterPress.byName.keyDown, 1); assert.equal(afterPress.byName.keyUp, 1);
    assert.ok(afterPress.probe.starts >= 2, 'Press and release scheduled real sources');
    // Voices are rendered right after the unlocking gesture, in short slices.
    await page.waitForFunction(() => window.__sfx().ready);
    const synthesized = await sound();
    assert.deepEqual(synthesized.buffers, expectedVoices, 'Every voice precomputed with its micro-variations');
    assert.equal(synthesized.precompute.runs, 1); assert.equal(synthesized.precompute.buffers, Object.values(expectedVoices).reduce((a, b) => a + b, 0));
    assert.ok(synthesized.precompute.afterUnlockMs >= 0 && synthesized.precompute.afterUnlockMs < 50, 'Precompute starts on unlock');
    assert.ok(synthesized.precompute.workMs < 150, `Precompute work ${synthesized.precompute.workMs} ms must be < 150 ms`);
    assert.ok(synthesized.precompute.longestSliceMs < 16, `Longest precompute slice ${synthesized.precompute.longestSliceMs} ms must not block a frame`);
    // Recorded keys: fetched once on idle, decoded once after the unlock.
    await page.waitForFunction(() => window.__sfx().samples.status === 'decoded', null, { timeout: 10000 });
    const sampled = await sound();
    assert.deepEqual(sampled.samples.classes, sampleClasses, 'Round-robin classes with their expected variant counts');
    assert.equal(sampled.samples.format, 'ogg'); assert.ok(Math.abs(sampled.samples.codecShiftMs) < 25);
    assert.deepEqual(audioRequests.map(r => r.file).sort(), ['keys.json', 'keys.ogg'], 'Manifest and one sprite only');
    assert.ok(audioRequests.every(r => r.type === 'fetch')); assert.deepEqual(audioFailures, []);
    assert.equal(sampled.probe.contexts, 1, 'Decoding uses the single AudioContext');
    // Objective evidence: the exact played samples, as WAV, with a spectral analysis.
    const dump = await page.evaluate(() => window.__sfxDump());
    const voiceStats = await exportVoices(dump.voices, dump.sampleRate);
    console.log(audioTable(voiceStats));
    // The recorded slices as decoded and played (own report, own WAVs).
    const sampleVoices = Object.fromEntries(Object.entries(dump.samples).flatMap(([cls, kinds]) => Object.entries(kinds).map(([kind, list]) => [`${cls}-${kind}`, list])));
    const sampleStats = await exportSampleVoices(sampleVoices, dump.samplesRate);
    console.log(audioTable(sampleStats));
    for (const [name, v] of Object.entries(sampleStats)) {
      if (name === 'relations') continue;
      assert.ok(v.peakDb <= -1 && v.durationMs >= 40 && v.durationMs <= 230, `${name}: headroom, 40-230 ms`);
      assert.ok(v.spread.peakDb[1] - v.spread.peakDb[0] <= 9, `${name}: round-robin levels are consistent`);
    }
    assert.ok(sampleStats['space-press'].centroidHz < sampleStats['alpha-press'].centroidHz && sampleStats['stab-press'].centroidHz < sampleStats['alpha-press'].centroidHz, 'Space and stabilized presses sit lower than alphas');
    for (const [name, v] of Object.entries(voiceStats)) {
      if (name === 'relations') continue;
      assert.ok(Number.isFinite(v.peakDb) && v.peakDb <= -1 && v.durationMs > 0, `${name}: finite, headroom`);
    }
    const kd = voiceStats.keyDown, kds = voiceStats.keyDownStab, ku = voiceStats.keyUp;
    // Retargeted after listening (08b follow-up): a close-miked real press, i.e. a
    // short contact click, a mid clack body and a modest thock; never harsh.
    for (const [name, v] of Object.entries(voiceStats)) if (name !== 'relations') assert.ok(v.peak3to8kDb <= 10, `${name}: no narrow 3-8 kHz resonance (${v.peak3to8kDb} dB)`);
    assert.ok(kd.centroidHz >= 850 && kd.centroidHz <= 1600 && kd.spread.centroidHz[0] >= 800, `Press centroid ~0.9-1.6 kHz (${kd.spread.centroidHz.join('-')} Hz)`);
    assert.ok(kd.bandsPercent.high >= 3 && kd.bandsPercent.high < 25 && kd.bandsPercent.air < 2, `Press click present, top end tame (2-6 kHz ${kd.bandsPercent.high}%, >6 kHz ${kd.bandsPercent.air}%)`);
    assert.ok(kd.bandsPercent.sub + kd.bandsPercent.lowMid >= 8 && kd.bandsPercent.sub + kd.bandsPercent.lowMid <= 35, 'The thock supports rather than dominates');
    assert.ok(kd.above4kPeakDbRel <= -10 && kd.decay40Ms >= 25 && kd.decay40Ms <= 80, `Press decay ${kd.decay40Ms} ms to -40 dB, no piercing peak`);
    assert.ok(kds.centroidHz < kd.centroidHz && kds.centroidHz >= kd.centroidHz * 0.7 && kds.decay40Ms > kd.decay40Ms && kds.bandsPercent.sub < 15, 'Stabilized press: slightly deeper, longer, never boomy');
    assert.ok(voiceStats.relations.keyUpVsKeyDownDb <= -7 && voiceStats.relations.keyUpVsKeyDownDb >= -11, 'Release is ~8-10 dB under the press');
    assert.ok(ku.centroidHz > kd.centroidHz && ku.durationMs < kd.durationMs, 'Release is a distinct, lighter, shorter, higher event');
    assert.ok(voiceStats.hover.peakDb <= -20, 'Hover stays almost subliminal');
    const tick = voiceStats.knobTick, click = voiceStats.knobClick;
    assert.ok(tick.durationMs <= 40 && tick.centroidHz >= 1000 && tick.centroidHz <= 2000 && tick.bandsPercent.high < 20 && tick.above4kPeakDbRel <= -10, 'Detent tick: short, clicky, little 4-6 kHz');
    assert.ok(click.centroidHz >= 400 && click.centroidHz <= 1000 && click.bandsPercent.lowMid >= 40 && click.bandsPercent.high >= 1, 'Knob press: a grounded switch click');
    assert.ok(voiceStats.matUnroll.durationMs >= 1000 && voiceStats.matUnroll.attackMs >= 50 && voiceStats.matUnroll.centroidHz < 1000, 'Mat unroll is a slow, soft swoosh');
    result.synthesis = { status: 'passed', sampleRate: dump.sampleRate, precompute: synthesized.precompute, buffers: synthesized.buffers, wavDir: 'screenshots/audio', voices: voiceStats };
    result.samples = { status: 'passed', ...sampled.samples, requests: audioRequests.map(r => r.file), wavDir: 'screenshots/audio/samples', voices: sampleStats };
    assert.equal(await page.evaluate(() => window.__screen().text), 'h', 'Clicking a key types its character');
    result.press = { status: 'passed', depth: press.offsets.H, stem: press.stemOffsets.H, cameraUnchanged: true, audio: afterPress.probe };
    await page.mouse.move(5, H / 2); await settle();

    // 3. Physical typing to the monitor, including Shift and Backspace.
    await page.evaluate(() => window.__kb.camera('default'));
    await frames();
    const environmentBefore = await page.evaluate(() => window.__environment().captures);
    const soundBeforeTyping = await sound();
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Hello, desk. Typing on the screen', { delay: 25 });
    await page.keyboard.down('Shift'); await page.keyboard.press('KeyQ'); await page.keyboard.press('Digit1'); await page.keyboard.up('Shift');
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    await page.keyboard.type('!', { delay: 25 });
    // Click 3D Shift (one-shot latch), then a 3D letter.
    await page.keyboard.press('Space');
    for (const id of ['shiftleft', 'K']) { await page.mouse.click(...await at(id)); }
    await page.mouse.move(5, H / 2);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.type('o'); await page.keyboard.press('End');
    const typed = await page.evaluate(() => window.__screen());
    assert.equal(typed.text, 'Hello, desk. Typing on the screen!o K', 'Typed text, Shift, Backspace, 3D Shift latch and caret movement');
    assert.equal(typed.caret, typed.text.length);
    // Hold matching keys for the evidence shot.
    await page.keyboard.down('KeyT'); await page.keyboard.down('KeyY');
    await settle();
    const held = await state();
    assert.deepEqual(held.pressed.sort(), ['T', 'Y']);
    assert.ok(held.offsets.T >= 0.0035 && held.offsets.Y >= 0.0035);
    await shot('screen-typing');
    await page.keyboard.up('KeyT'); await page.keyboard.up('KeyY');
    await settle();
    const environmentAfter = await page.evaluate(() => window.__environment().captures);
    assert.equal(environmentAfter, environmentBefore, 'Keystrokes never re-capture the environment');
    const monitor = await page.evaluate(() => window.__lighting().monitor);
    assert.equal(monitor.material, 'MeshBasicMaterial'); assert.equal(monitor.hasWallpaper, true);
    const soundAfterTyping = await sound();
    const pressNames = ['keyDown', 'keyDownStab', 'keyDownSpace'], count = (s, names) => names.reduce((n, name) => n + (s.byName[name] ?? 0), 0);
    const downs = count(soundAfterTyping, pressNames) - count(soundBeforeTyping, pressNames);
    assert.ok(downs >= 40, 'Every physical key down schedules a press sound');
    assert.ok(count(soundAfterTyping, ['keyDownSpace']) - count(soundBeforeTyping, ['keyDownSpace']) >= 6, 'Space uses the spacebar samples');
    assert.ok(count(soundAfterTyping, ['keyDownStab']) - count(soundBeforeTyping, ['keyDownStab']) >= 4, 'Shift and Backspace use the stabilized samples');
    const typedEvents = soundAfterTyping.events.slice(-(soundAfterTyping.scheduled - soundBeforeTyping.scheduled)).filter(e => e.category === 'typing');
    assert.ok(typedEvents.length >= 40 && typedEvents.every(e => e.source === 'sample'), 'Typing plays recorded samples');
    assert.equal(soundAfterTyping.probe.contexts, 1);
    const rates = soundAfterTyping.events.filter(e => e.name === 'keyDown').map(e => e.rate);
    assert.ok(new Set(rates.map(r => r.toFixed(4))).size > 5 && rates.every(r => r > 0.95 && r < 1.05), 'Pitch jitter within ±4%');
    result.typing = { status: 'passed', text: typed.text, lines: typed.lines, fontPx: typed.fontPx, pressedDuringShot: held.pressed, environmentCaptures: [environmentBefore, environmentAfter], pressSounds: downs };

    // 4. Idle: only the caret blink redraws the CanvasTexture.
    const idleStart = await page.evaluate(() => window.__screen().redraws);
    await page.waitForTimeout(3000);
    const idleEnd = await page.evaluate(() => window.__screen().redraws);
    assert.ok(idleEnd - idleStart <= 7, `Idle redraws ${idleEnd - idleStart} in 3 s must be <= 7`);
    assert.ok(idleEnd - idleStart >= 3, 'The caret blinks');
    assert.equal(await page.evaluate(() => window.__environment().captures), environmentBefore);
    result.idleRedraws = { status: 'passed', seconds: 3, redraws: idleEnd - idleStart };

    // 5. The full physical map, end to end through the real listener.
    const hookMap = await page.evaluate(() => window.__interaction.codeMap);
    assert.deepEqual(hookMap, expectedCodeMap, 'Code map must match the independent table');
    const layoutIds = Object.keys((await page.evaluate(() => window.__kb.inspect())).keys);
    assert.deepEqual([...new Set(Object.values(expectedCodeMap))].sort(), [...layoutIds].sort(), 'All 80 layout keys are reachable from a physical code');
    const mapped = await page.evaluate(map => {
      const out = {};
      for (const code of Object.keys(map)) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: 'Unidentified', bubbles: true }));
        out[code] = window.__interaction.state().pressed;
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: 'Unidentified', bubbles: true }));
      }
      return out;
    }, expectedCodeMap);
    for (const [code, id] of Object.entries(expectedCodeMap)) assert.deepEqual(mapped[code], [id], `${code} presses ${id}`);
    const repeat = await page.evaluate(() => {
      const before = window.__sfx().byName.keyDown ?? 0;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'Unidentified' }));
      for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'Unidentified', repeat: true }));
      const held = window.__interaction.state().pressed;
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'Unidentified' }));
      return { presses: (window.__sfx().byName.keyDown ?? 0) - before, held, after: window.__interaction.state().pressed };
    });
    assert.equal(repeat.presses, 1, 'Auto-repeat does not re-trigger the press'); assert.deepEqual(repeat.held, ['R']); assert.deepEqual(repeat.after, []);
    await settle();
    result.codeMap = { status: 'passed', codes: Object.keys(expectedCodeMap).length, layoutIds: layoutIds.length, autoRepeat: repeat };

    // 6. Polyphony cap.
    const poly = await page.evaluate(() => {
      for (const code of ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM']) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: 'Unidentified' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: 'Unidentified' }));
      }
      return window.__sfx();
    });
    assert.ok(poly.voices <= poly.maxVoices && poly.stolen > 0, 'Voice stealing keeps polyphony capped');
    result.polyphony = { status: 'passed', voices: poly.voices, maxVoices: poly.maxVoices, stolen: poly.stolen };
    await settle();

    // 7. Hover tick rate limit while sweeping across a row.
    await page.evaluate(() => window.__kb.camera('closeup'));
    await frames();
    const hoverBefore = (await sound()).events.filter(e => e.name === 'hover').length;
    const [ax, ay] = await at('A'), [lx, ly] = await at('L');
    await page.mouse.move(ax, ay);
    await page.mouse.move(lx, ly, { steps: 24 });
    await frames(4);
    const hoverEvents = (await sound()).events.filter(e => e.name === 'hover');
    const gaps = hoverEvents.slice(1).map((e, i) => e.at - hoverEvents[i].at);
    assert.ok(hoverEvents.length > hoverBefore, 'Hover ticks after the gesture');
    assert.ok(gaps.every(gap => gap >= 0.0599), 'Hover ticks are at most one per 60 ms');
    result.hoverRateLimit = { status: 'passed', ticks: hoverEvents.length - hoverBefore, minGapMs: Math.min(...gaps) * 1000 };

    // 8. Knob: drag detents with ticks, magnetic snap, click without drag, no orbit.
    const knobPoint = await page.evaluate(() => window.__interaction.knobPoint());
    const [kx, ky] = [knobPoint.x * W, knobPoint.y * H];
    await knobDetail('knob-rest-detail', knobPoint);
    await page.mouse.move(kx, ky); await frames(3);
    assert.equal((await state()).cursor, 'grab');
    const detentPx = await page.evaluate(() => window.__interaction.constants.detentPx);
    // Regression (knob spun wildly on 5181): the drag spring was integrated with
    // one explicit step per frame and diverged at 60 Hz. A 100 px drag held still
    // must sit at its 7 detents (+ the 30% residual pull) on every frame.
    await page.mouse.move(kx, ky); await page.mouse.down(); await page.mouse.move(kx + 100, ky, { steps: 8 });
    const heldAngles = [];
    for (let i = 0; i < 45; i++) { heldAngles.push(await page.evaluate(() => window.__interaction.state().knob.angleDeg)); await frames(1); }
    const heldKnob = await state();
    const expectedHold = -(7 + (100 / detentPx - 7) * 0.3) * 15;
    assert.equal(heldKnob.knob.detents, 7, 'A 100 px drag is 7 detents');
    assert.ok(heldAngles.slice(15).every(a => Math.abs(a - expectedHold) < 0.5), `Holding still: no rotation (${heldAngles.slice(15, 18).map(a => a.toFixed(2))} vs ${expectedHold.toFixed(2)})`);
    assert.ok(heldAngles.every(a => Math.abs(a) < Math.abs(expectedHold) + 20), 'No overshoot spin while dragging');
    await page.mouse.move(kx, ky, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => Math.abs(window.__interaction.state().knob.angleDeg) < 0.01, null, { timeout: 5000 });
    const regression = { dragPx: 100, detents: heldKnob.knob.detents, heldAngleDeg: +heldAngles.at(-1).toFixed(3), expectedDeg: +expectedHold.toFixed(3), maxAbsDeg: +Math.max(...heldAngles.map(Math.abs)).toFixed(3) };

    const masterBefore = (await sound()).master, ticksBefore = (await sound()).byName.knobTick ?? 0;
    const coalescedBefore = (await sound()).coalesced;
    const knobTicksBefore = (await state()).knob.ticks;
    const cameraKnob = await page.evaluate(() => window.__camera());
    await page.mouse.down();
    await page.mouse.move(kx + detentPx * 5 + 3, ky, { steps: 12 });
    await frames(3);
    const dragging = await state();
    assert.equal(dragging.knob.detents, 5); assert.equal(dragging.knob.dragging, true);
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(window.__interaction.state().knob.angleDeg + 75) < 0.01, null, { timeout: 5000 });
    const knob = await state();
    const knobSound = await sound();
    assert.equal(knob.knob.detents, 5); assert.equal(knob.knob.ticks - knobTicksBefore, 5);
    // A fast drag delivers detents a few ms apart: they coalesce into a ratchet
    // spaced by the minimum tick gap (the visual detents above are all there).
    const fastTicks = knobSound.events.filter(e => e.name === 'knobTick').slice(-((knobSound.byName.knobTick ?? 0) - ticksBefore));
    const tickGap = knobSound.tickGap;
    assert.ok(fastTicks.length >= 1 && fastTicks.length <= 5, `Fast drag ticks ${fastTicks.length}`);
    assert.equal(fastTicks.length + knobSound.coalesced - coalescedBefore, 5, 'Every detent either ticks or is coalesced');
    assert.ok(fastTicks.slice(1).every((e, i) => e.at - fastTicks[i].at >= tickGap - 1e-6), 'Ticks respect the minimum gap');
    // A flick: 24 detents 10 ms apart through the engine (as the caller staggers them).
    const flick = await page.evaluate(() => {
      const before = window.__sfx();
      for (let i = 0; i < 24; i++) window.__sfxPlay('knobTick', { delay: i * 0.01, pan: 0.33 });
      const after = window.__sfx();
      const ticks = after.events.slice(-(after.scheduled - before.scheduled));
      return { scheduled: ticks.length, coalesced: after.coalesced - before.coalesced, gaps: ticks.slice(1).map((e, i) => e.at - ticks[i].at), gains: ticks.map(e => e.gain), gap: after.tickGap };
    });
    assert.equal(flick.scheduled + flick.coalesced, 24);
    assert.ok(flick.scheduled >= 4 && flick.scheduled <= 7 && flick.gaps.every(g => g >= flick.gap - 1e-6), `A flick becomes a ratchet (${flick.scheduled} ticks)`);
    assert.ok(new Set(flick.gains.map(g => g.toFixed(3))).size > 2, 'Ratchet ticks vary slightly');
    assert.ok(Math.abs(knobSound.master - Math.min(1, masterBefore + 0.2)) < 1e-9, 'Clockwise detents raise the master volume');
    nearArray((await page.evaluate(() => window.__camera())).position, cameraKnob.position, 'Knob drags never orbit');
    assert.ok(await page.locator('.sound-level.visible').count() === 1, 'Transient volume readout');
    await shot('knob-rotate');
    await knobDetail('knob-rotate-detail', knobPoint);
    await page.mouse.move(kx, ky); await page.mouse.down(); await frames(20);
    const dip = (await state()).knob.dip;
    assert.ok(Math.abs(dip - 0.0005) < 2e-5, `Knob press dips 0.5 mm (${dip})`);
    await page.mouse.up(); await frames(3);
    assert.equal((await state()).knob.clicks, 1); assert.equal((await sound()).byName.knobClick, 1);
    await page.mouse.move(kx - detentPx * 5 - 3, ky, { steps: 12 }); // no button: nothing happens
    assert.equal((await state()).knob.detents, 5);
    // A slow turn back: one detent every ~90 ms, so every detent ticks.
    const slowBefore = await sound();
    await page.mouse.move(kx, ky); await page.mouse.down();
    for (let i = 1; i <= 5; i++) { await page.mouse.move(kx - detentPx * i - (i === 5 ? 3 : 0), ky); await page.waitForTimeout(90); }
    await page.mouse.up();
    await page.waitForFunction(() => Math.abs(window.__interaction.state().knob.angleDeg) < 0.01, null, { timeout: 5000 });
    const slowAfter = await sound();
    assert.equal((slowAfter.byName.knobTick ?? 0) - (slowBefore.byName.knobTick ?? 0), 5, 'A slow turn ticks once per detent');
    assert.equal(slowAfter.coalesced, slowBefore.coalesced);
    assert.ok(Math.abs((await sound()).master - masterBefore) < 1e-9, 'Counter-clockwise restores the volume');
    result.knob = { status: 'passed', detents: knob.knob.detents, angleDeg: knob.knob.angleDeg, ticks: knob.knob.ticks, dipMm: dip * 1000, master: [masterBefore, knobSound.master], tickGapMs: tickGap * 1000, fastDragTicks: fastTicks.length, coalesced: knobSound.coalesced - coalescedBefore, spinRegression: regression, flick: { detents: 24, ticks: flick.scheduled, coalesced: flick.coalesced, minGapMs: Math.min(...flick.gaps) * 1000 }, slowTurnTicks: 5 };
    await page.mouse.move(5, H / 2);
    await page.evaluate(() => window.__kb.camera('default'));

    // 9. Replacement wave: thinned, spread-out, quieter clicks in real playback.
    const waveBefore = (await sound()).events.length;
    const scheduledBefore = (await sound()).scheduled;
    const generation = await page.evaluate(() => window.__kb.generation);
    await page.evaluate(() => window.__kb.setVariant('cool-black'));
    await page.waitForFunction(g => window.__kb.generation > g, generation);
    await page.evaluate(() => window.__kb.play());
    await page.waitForFunction(() => window.__kb.finished, null, { timeout: 20000 });
    const waveSound = await sound();
    const waveEvents = waveSound.events.slice(-(waveSound.scheduled - scheduledBefore)).filter(e => e.category === 'replacement');
    assert.ok(waveEvents.length >= 8 && waveEvents.length <= 20, `Replacement events ${waveEvents.length} must be thinned to <= 20`);
    assert.ok(waveEvents.some(e => e.name === 'capLift') && waveEvents.some(e => e.name === 'capSeat'));
    const span = waveEvents.at(-1).at - waveEvents[0].at;
    assert.ok(span > 1.2, 'Spread across the wave, in sync with the stagger');
    result.replacement = { status: 'passed', events: waveEvents.length, byName: waveEvents.reduce((m, e) => ({ ...m, [e.name]: (m[e.name] ?? 0) + 1 }), {}), spanSeconds: span, ignoredEarlierEvents: waveBefore };
    await page.evaluate(() => window.__kb.setVariant('glacial-blue')); await page.waitForFunction(() => window.__kb.selectedId === 'glacial-blue');
    await finishPage();

    // Merged intro + interaction: every beat rejects pointer/physical presses,
    // then the landed board's bounding pre-check must admit the same rays.
    await page.evaluate(() => window.__kb.camera('profile')); await frames();
    const landedG = await at('G');
    const landedKnob = await page.evaluate(() => window.__interaction.knobPoint());
    const introBeats = [];
    const timings = await page.evaluate(() => window.__kb.introTimings);
    // A variant timeline has no intro timings; start a fresh replay first.
    await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); });
    const introTimes = timings ?? await page.evaluate(() => window.__kb.introTimings);
    for (const [beat, time] of [['mat', 0.95], ['frame', introTimes.frameAt + 0.35], ['keys', introTimes.keysAt + 0.95]]) {
      await page.evaluate(time => window.__kb.seek(time), time); await frames();
      const before = await page.evaluate(() => ({ text: window.__screen().text, sounds: window.__sfx().scheduled }));
      await page.mouse.move(...landedG); await page.mouse.down(); await frames(3);
      await page.keyboard.down('KeyG'); await frames(3);
      const ignored = await state();
      assert.equal(await page.evaluate(() => window.__kb.introPhase), beat);
      assert.equal(ignored.hovered, null); assert.deepEqual(ignored.pressed, []);
      assert.deepEqual(ignored.offsets, {}); assert.deepEqual(ignored.stemOffsets, {});
      await page.mouse.up(); await page.keyboard.up('KeyG');
      await page.mouse.click(landedKnob.x * W, landedKnob.y * H); await frames(3);
      const knobIgnored = await state();
      assert.equal(knobIgnored.knob.dragging, false); assert.equal(knobIgnored.knob.dip, 0);
      assert.equal(knobIgnored.knob.clicks, knob.knob.clicks + 1);
      assert.equal(await page.evaluate(() => window.__screen().text), before.text, `${beat}: typing is disabled`);
      assert.equal((await sound()).scheduled, before.sounds, `${beat}: no input/replacement sounds while paused`);
      introBeats.push({ beat, pressed: ignored.pressed, hovered: ignored.hovered, offsets: ignored.offsets, typingIgnored: true });
    }
    // Keep the pointer still through completion, so readiness must invalidate
    // both hover and the cached world-space bounds after the frame/mat motion.
    await page.mouse.move(...landedG); await finishPage(); await settle();
    assert.equal((await state()).hovered, 'G', 'Hover works as soon as the intro is done, without another pointer move');
    await page.mouse.down(); await settle();
    assert.deepEqual((await state()).pressed, ['G']);
    assert.ok((await state()).offsets.G >= 0.0035, 'Pointer raycast passes the landed frame bounds');
    await page.mouse.up(); await settle();
    await page.keyboard.down('KeyG'); await settle();
    await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0.95); }); await frames();
    const cancelled = await state();
    assert.deepEqual(cancelled.pressed, []); assert.deepEqual(cancelled.offsets, {}); assert.deepEqual(cancelled.stemOffsets, {});
    await finishPage(); await page.keyboard.up('KeyG'); await settle();
    result.introInput = { status: 'passed', beats: introBeats, stationaryHoverAfterLanding: true, pointerPressAfterLanding: true, heldPressCancelledOnReplay: true };

    // Replay uses the already-unlocked singleton. Contact cues follow the
    // parent timeline; initial-load silence was checked before the first click.
    await page.mouse.move(5, H / 2); await settle();
    const replayBefore = await sound();
    const replayAt = await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); const at = performance.now(); window.__kb.play(); return at; });
    await page.waitForFunction(() => window.__kb.finished && window.__kb.introPhase === 'done', null, { timeout: 20000 });
    const replaySound = await sound();
    const replayEvents = replaySound.events.slice(-(replaySound.scheduled - replayBefore.scheduled));
    const thuds = replayEvents.filter(e => e.name === 'thud');
    const seats = replayEvents.filter(e => e.name === 'capSeat');
    assert.equal(thuds.length, 1, 'One thud at the frame\'s first contact');
    assert.ok(Math.abs((thuds[0].wall - replayAt) / 1000 - introTimes.keysAt) < 0.25, 'Thud follows the actual landing time');
    assert.ok(seats.length >= 6 && seats.length <= 12, 'Intro cap seating is thinned to at most twelve events');
    assert.ok(seats.every(e => e.category === 'intro' && e.gain < 0.4 && (e.wall - replayAt) / 1000 >= introTimes.keysAt));
    assert.ok(seats.slice(1).every((e, i) => e.at - seats[i].at >= 0.065), 'Seating cues are spread through the stagger');
    assert.ok(replayEvents.every(e => e.category === 'intro'), 'Replay must not trigger replacement-wave sounds');
    assert.equal(replaySound.probe.contexts, 1); assert.deepEqual(replaySound.errors, []);
    result.introSound = { status: 'passed', thuds: thuds.length, capSeats: seats.length, contexts: replaySound.probe.contexts, landingSeconds: (thuds[0].wall - replayAt) / 1000, events: replayEvents };

    // 10. Sound toggle: accessible, mutes scheduling, persists across reloads.
    const toggle = page.getByRole('button', { name: 'Sound', exact: true });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await toggle.focus(); await page.keyboard.press('Enter');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    const muted = await page.evaluate(() => { const before = window.__sfx(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', key: 'Unidentified' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', key: 'Unidentified' })); const after = window.__sfx(); return { scheduled: after.scheduled - before.scheduled, muted: after.muted - before.muted, stored: localStorage.getItem('kc.sound') }; });
    assert.deepEqual(muted, { scheduled: 0, muted: 2, stored: 'off' });
    await page.reload();
    await page.waitForFunction(() => window.__kb?.ready && window.__sfx);
    assert.equal(await page.getByRole('button', { name: 'Sound', exact: true }).getAttribute('aria-pressed'), 'false', 'Off persists across reloads');
    assert.equal(await page.evaluate(() => window.__sfx().enabled), false);
    await page.getByRole('button', { name: 'Sound', exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('kc.sound')), 'on');
    const unlockedByToggle = await sound();
    assert.equal(unlockedByToggle.probe.contexts, 1, 'The toggle click is the unlocking gesture; still one context');
    result.toggle = { status: 'passed', muted, persisted: 'off -> reload -> off', contextsAfterReload: unlockedByToggle.probe.contexts };

    // 11. Disposal: the screen overlay and listeners leave with the Canvas.
    await page.evaluate(() => window.__kb.finish());
    await page.waitForFunction(() => window.__kb.finished);
    await page.evaluate(() => window.__app.setMounted(false));
    await page.waitForFunction(() => !window.__kb && Object.values(window.__app.resources()).every(owner => owner.active === 0));
    const owners = await page.evaluate(() => ({ typing: window.__app.resources()['Monitor.Typing'], interaction: Boolean(window.__interaction), screen: Boolean(window.__screen), screenControl: Boolean(window.__screenControl) }));
    assert.ok(owners.typing.registered > 0 && owners.typing.registered === owners.typing.disposed, 'Typing texture/material/geometry disposed');
    assert.equal(owners.interaction, false); assert.equal(owners.screen, false); assert.equal(owners.screenControl, false);
    const audioErrors = await page.evaluate(() => window.__sfx().errors);
    assert.deepEqual(audioErrors, [], 'The audio engine records no errors');
    const files = audioRequests.map(r => r.file);
    assert.equal(files.filter(f => f === 'keys.json').length, 2); assert.equal(files.filter(f => f === 'keys.ogg').length, 2);
    assert.equal(files.length, 4, 'One manifest and one sprite per page load (reload included), no fallback format'); assert.deepEqual(audioFailures, []);
    result.disposal = { status: 'passed', ...owners, audioErrors, audioRequests: files };
    result.status = 'passed';
    return result;
  } finally {
    await writeFile('screenshots/checks-interaction.json', `${JSON.stringify(result, null, 2)}\n`);
    await context.close();
  }

  async function knobDetail(name, point) {
    await renderedPage(page); await page.screenshot({ path: `screenshots/${name}.png`, clip: { x: point.x * W - 90, y: point.y * H - 70, width: 180, height: 140 } }); console.log(`screenshots/${name}.png`);
  }
  async function detail(name, id) {
    const [x, y] = await at(id);
    await renderedPage(page); await page.screenshot({ path: `screenshots/${name}.png`, clip: { x: x - 250, y: y - 150, width: 500, height: 300 } }); console.log(`screenshots/${name}.png`);
  }
  async function shot(name) { await renderedPage(page); await page.screenshot({ path: `screenshots/${name}.png` }); console.log(`screenshots/${name}.png`); }
}
// --- end interaction & sfx (spec 07c) ---
try {
  await mkdir('screenshots', { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Preview failed: ${serverOutput}`);
    try { if ((await fetch(url)).ok) break; } catch { /* preview is starting */ }
    if (attempt === 99) throw new Error('Preview did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' && process.env.SHOTS_RENDERER !== 'swiftshader' ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
    assert.ok(points.every(p => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1), 'Projected cap-top hue patches must remain inside the new hero');
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
  await page.evaluate(() => window.__layoutStore.show(true));
  await rendered();
  const hiddenGizmos = await page.evaluate(() => window.__layout());
  assert.equal(hiddenGizmos.visible, false);
  assert.ok(Object.values(hiddenGizmos.handles).every(points => points.length === 0), 'No gizmo objects outside debug, even when toggled in the store');
  await page.evaluate(() => window.__layoutStore.show(false));
  checks.gizmosDebugOnly = { status: 'passed' };
  // Intro evidence uses the public timeline, actual deformed vertices, and
  // world-space case/feet bounds. Keep this independent of dust evidence.
  const introTimings = await page.evaluate(() => window.__kb.introTimings);
  const seekIntro = async time => { await page.evaluate(time => window.__kb.seek(time), time); await rendered(); };
  const staticProps = (await page.evaluate(() => window.__props())).props;
  const phases = [];
  for (const time of [0, introTimings.frameAt + 0.05, introTimings.keysAt + 0.2, introTimings.end]) {
    await seekIntro(time);
    phases.push(await page.evaluate(() => window.__kb.introPhase));
    assert.equal(await page.evaluate(() => window.__lighting().shadowAutoUpdate), time < introTimings.end);
    const props = (await page.evaluate(() => window.__props())).props;
    for (const name of ['prop-streamdeck', 'prop-headphones', 'monitor-screen']) assert.deepEqual(props[name], staticProps[name], `${name} stays static across every intro beat`);
  }
  assert.deepEqual(phases, ['mat', 'frame', 'keys', 'done']);
  await seekIntro(introTimings.matEnd * (1 - Math.cbrt(0.5)));
  const rolled = await page.evaluate(() => window.__kb.inspect().intro.mat);
  assert.ok(Math.abs(rolled.progress - 0.5) < 1e-5);
  assert.ok(rolled.maxY > 0.045, 'Half-unrolled felt has a real thick, layered roll');
  assert.ok(rolled.minY >= -1e-7 && rolled.normalError < 1e-6);
  await shot('intro-mat-mid');
  // A fixed 24fps sample, including every final small bend and the exact flat
  // endpoint. The wider view includes the roll's complete path across the mat.
  await mkdir('screenshots/intro-unroll', { recursive: true });
  await page.evaluate(() => window.__kb.camera('props-wide'));
  const unrollFrames = [];
  for (let frame = 0; frame <= 48; frame++) {
    const time = introTimings.matEnd * frame / 48;
    await seekIntro(time);
    const mat = await page.evaluate(() => window.__kb.inspect().intro.mat);
    assert.ok(mat.minY >= -1e-7 && mat.normalError < 1e-6);
    await page.screenshot({ path: `screenshots/intro-unroll/frame-${String(frame).padStart(3, '0')}.png` });
    unrollFrames.push({ time, ...mat });
  }
  await page.evaluate(() => window.__kb.camera('default'));
  await seekIntro(introTimings.frameAt + (introTimings.frameEnd - introTimings.frameAt) * 0.55);
  const landingMid = await page.evaluate(() => window.__kb.inspect().intro);
  assert.ok(landingMid.frameOffset > 0.02 && landingMid.frameVisible && !landingMid.keysVisible);
  await shot('intro-frame-mid');
  const landingSamples = [];
  for (let sample = 0; sample <= 40; sample++) {
    const time = introTimings.frameAt + (introTimings.frameEnd - introTimings.frameAt) * sample / 40;
    await seekIntro(time);
    const contact = await page.evaluate(() => {
      const p = window.__props();
      return { bodyBottom: p.bodyBottom, feetBottom: p.feetBottom, matTop: p.matTop, shadowAutoUpdate: window.__lighting().shadowAutoUpdate };
    });
    assert.ok(contact.bodyBottom >= contact.matTop - 1e-7);
    assert.ok(contact.feetBottom.every(y => y >= contact.matTop - 1e-7), 'No rubber foot penetrates the mat at any sampled landing time');
    assert.equal(contact.shadowAutoUpdate, true);
    landingSamples.push({ time, ...contact });
  }
  await seekIntro(introTimings.end);
  const flat = await page.evaluate(() => window.__kb.inspect().intro.mat);
  assert.equal(flat.maxRestError, 0, 'Every mat vertex returns exactly to its original flat position');
  assert.equal(flat.minY, 0); assert.ok(Math.abs(flat.maxY - 0.004) < 1e-8);
  assert.equal(await page.evaluate(() => window.__lighting().shadowAutoUpdate), false);
  checks.intro = { status: 'passed', duration: introTimings.end, timings: introTimings, phases, halfUnrolled: rolled, flat, landingSamples, unrollFrames };

  // Retarget twice in each beat; the live sequence must retain its time/phase.
  checks.introSelection = { status: 'passed', beats: [] };
  for (const [beat, time] of [['mat', 0.35], ['frame', introTimings.frameAt + 0.2], ['keys', introTimings.keysAt + 0.8]]) {
    await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); });
    await seekIntro(time);
    await change('pink'); await change('cool-black');
    assert.equal(await page.evaluate(() => window.__kb.introPhase), beat);
    await finish();
    const result = await page.evaluate(() => ({ phase: window.__kb.introPhase, selected: window.__kb.selectedId, displayed: window.__kb.displayedId, info: window.__kb.inspect() }));
    assert.equal(result.phase, 'done'); assert.equal(result.selected, 'cool-black'); assert.equal(result.displayed, 'cool-black');
    assertPalette(result.info, 'cool-black');
    checks.introSelection.beats.push({ beat, selected: result.selected, displayed: result.displayed, palette: result.info.palette });
    await change('glacial-blue'); await finish();
  }
  // Replay interrupts every intro beat as well as an ordinary variant change.
  for (const time of [0.3, introTimings.frameAt + 0.1, introTimings.keysAt + 0.9, introTimings.end]) {
    await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); });
    await seekIntro(time);
    await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); window.__kb.finish(); });
    await finish();
    assert.equal(await page.evaluate(() => window.__kb.introPhase), 'done');
  }
  await change('pink'); await page.evaluate(() => window.__kb.seek(0.5));
  await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); window.__kb.play(); });
  await page.waitForFunction(() => window.__kb.finished && window.__kb.introPhase === 'done', null, { timeout: 20000 });
  assertPalette(await finish(), 'pink');
  checks.replayIntro = { status: 'passed', interruptedStates: ['mat', 'frame', 'keys', 'done', 'variant-change'], realtimePlayback: true };
  await change('glacial-blue'); await finish();
  await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); window.__kb.setVariant('pink'); window.__kb.setVariant('glacial-blue'); });
  await rendered();
  assert.equal(await page.evaluate(() => window.__kb.introPhase), 'mat');
  await page.evaluate(() => window.__kb.play());
  await page.waitForFunction(() => window.__kb.finished, null, { timeout: 20000 });
  assertPalette(await finish(), 'glacial-blue');
  checks.introBatchedReturn = { status: 'passed' };
  await page.evaluate(() => { window.__kb.replayIntro(); window.__kb.seek(0); });
  await seekIntro(introTimings.keysAt + 0.95);
  const mid = await page.evaluate(() => window.__kb.inspect());
  assert.ok(mid.capOffsets.some(y => y > 0.01) && mid.capOffsets.some(y => y < 0.001), 'Initial shot must show a partially seated wave');
  await shot('intro-keys-mid');
  await shot('assembly-mid');
  const assemblyProps = await page.evaluate(() => window.__props());
  checks['glacial-blue'] = await finish();
  assertPalette(checks['glacial-blue'], 'glacial-blue');
  const backslash = checks['glacial-blue'].keys.backslash.labels[1];
  assert.equal(backslash, String.fromCharCode(92)); assert.equal(backslash.length, 1);
  checks.backslashLegend = { status: 'passed', codePoint: backslash.codePointAt(0), length: backslash.length };
  const heroCamera = await page.evaluate(() => window.__camera());
  assertHeroCamera(heroCamera);
  await idleFrames(page);
  assertHeroCamera(await page.evaluate(() => window.__camera()));
  checks.heroCameraDefaults = { status: 'passed', ...heroCamera, orbitEpsilon, clampingSlackMeters: heroCamera.distance - heroCamera.maxDistance };
  assert.ok(checks['glacial-blue'].framing.keyboardWidthRatio >= 0.59 && checks['glacial-blue'].framing.keyboardWidthRatio <= 0.63, 'Tuned hero keyboard must occupy about 61% of the 16:10 frame');
  assert.ok(checks['glacial-blue'].framing.deskFrontEdgeNdcY > -0.95 && checks['glacial-blue'].framing.deskFrontEdgeNdcY < -0.70, 'Desktop front edge must be in the lower frame');
  checks.heroFraming = { status: 'passed', ...checks['glacial-blue'].framing };
  const seated = await page.evaluate(() => window.__props());
  assert.equal(seated.feetBottom.length, 4);
  assert.ok(seated.contactErrorMm <= 0.5, 'Every actual rubber foot must sit on the actual mat surface within 0.5mm');
  assert.ok(seated.bodyBottom >= seated.matTop, 'The case must not penetrate the felt');
  assert.ok(Math.abs(seated.matTop - 0.754) < 1e-7);
  for (const [name, bounds] of Object.entries(assemblyProps.props)) {
    nearArray(bounds.min, seated.props[name].min, `${name}: props stay static during assembly`);
    nearArray(bounds.max, seated.props[name].max, `${name}: props stay static during assembly`);
  }
  assert.equal(seated.wood.type, 'MeshPhysicalMaterial');
  assert.equal(seated.wood.explicitEnvironment, true, 'Desk intensity must bind an explicit environment, not be bypassed by scene.environmentIntensity');
  checks.matContact = { status: 'passed', matTop: seated.matTop, feetBottom: seated.feetBottom, bodyBottom: seated.bodyBottom, contactErrorMm: seated.contactErrorMm, propsStaticDuringAssembly: true };
  assert.equal(seated.wood.standardCoatIBL, true);
  assert.equal(seated.wood.sharedNormalMap, true); assert.equal(seated.wood.sharedRoughnessMap, true);
  assert.ok(seated.wood.coatNormalStrength < seated.wood.normalStrength);
  checks.deskFinish = { status: 'passed', ...seated.wood };
  assert.equal(seated.streamdeck.keyCount, 15);
  assert.ok(seated.streamdeck.lcdRecessMm > 0 && seated.streamdeck.lcdRecessMm < 1, 'LCD faces must be recessed below real open bezels');
  assert.ok(Math.abs(seated.streamdeck.keyProtrusionMm - 3) < 0.05, 'Clear key tops protrude 3mm above the actual faceplate');
  assert.ok(seated.streamdeck.topRoughness < 0.2 && seated.streamdeck.emission > 1.25);
  assert.ok(seated.streamdeck.openingGapMm >= 0.25);
  checks.streamdeckGeometry = { status: 'passed', ...seated.streamdeck };
  assert.ok(Math.abs(seated.props['prop-streamdeck'].min[1] - 0.75) < 0.0005, 'Control pad stand must rest on the wood, off the mat');
  assert.ok(seated.props['prop-streamdeck'].max[2] < -0.24, 'The entire default deck must be behind the felt edge');
  const startupLayout = await page.evaluate(() => window.__layout().values);
  assert.deepEqual(startupLayout, expectedLayout, 'Initialize exact copied Layout defaults, in degrees, with computed wood support');
  assert.ok(Math.abs(seated.props['prop-headphones'].min[1] - 0.75) < 0.0005, 'Headphone tray must rest on the wood');
  assert.ok(seated.headrestOverlapMm.every(size => size > 0), 'Walnut headrest must connect to the upright');
  checks.propSupport = { status: 'passed', streamdeckBottom: seated.props['prop-streamdeck'].min[1], trayBottom: seated.props['prop-headphones'].min[1], headrestJointMm: seated.headrestOverlapMm };
  await shot('glacial-blue');
  await colorShot('lighting-hero', 'glacial-blue');
  const lighting = await page.evaluate(() => window.__lighting());
  assert.equal(lighting.keyFrustum.outside, true, 'Studio key must be outside the default hero frustum');
  checks.keyOutsideHeroFrustum = { status: 'passed', ...lighting.keyFrustum };
  assert.deepEqual(Object.keys(lighting.areaFrusta).sort(), ['key-softbox', 'studio-fill']);
  for (const [name, source] of Object.entries(lighting.areaFrusta)) assert.equal(source.outside, true, `${name}: entire area source must be outside the hero frustum`);
  checks.areasOutsideHeroFrustum = { status: 'passed', sources: lighting.areaFrusta };
  assert.deepEqual(lighting.lights.map(light => light.type).sort(), ['RectAreaLight', 'RectAreaLight', 'RectAreaLight', 'RectAreaLight', 'RectAreaLight', 'SpotLight']);
  assert.equal(lighting.lights.filter(light => light.castShadow).length, 1);
  assert.equal(lighting.shadowAutoUpdate, false);
  assert.equal(lighting.environment, 1, 'Individual source intensities are baked into the environment');
  assert.deepEqual(lighting.values.environment, expectedEnvironment);
  assert.deepEqual(lighting.values.rendering, { exposure: 1 });
  assert.deepEqual(lighting.values.lights, {
    softbox: { type: 'RectAreaLight', intensity: 0.75, color: '#fff7f0', width: 0.44, height: 0.68, position: [-0.67, 1.75, 0.8], aim: [0, 0.79, -0.02] },
    spot: { type: 'SpotLight', intensity: 6.235, color: '#fff7f0', angle: 0.21, penumbra: 0.78, shadowSoftness: 147, shadowRadius: 4.1, linkedToSoftbox: true, position: [-0.67, 1.75, 0.8], aim: [0, 0.79, -0.02], unlinkedPosition: [-0.67, 1.75, 0.8], unlinkedAim: [0, 0.79, -0.02] },
    fill: { type: 'RectAreaLight', intensity: 0.25, color: '#eee4ff', width: 1.8, height: 1.5, position: [1.4, 1.4, 0.4], aim: [0, 0.79, -0.02] },
    monitor: { screenOn: true, type: 'RectAreaLight', intensity: 0, color: '#8d2d2d', width: 0.598, height: 0.028, position: [0, 1.025, -0.43], aim: [0, 0.99, 0], wallGlow: { intensity: 23.3, color: '#8d2d2d', width: 0.5, height: 0.26, localPosition: [0, 0, -0.06] } },
  }, 'Keep every user-tuned default exactly');
  for (const [name, role] of [['key-softbox', 'softbox'], ['studio-key', 'spot'], ['studio-fill', 'fill'], ['screen-rim', 'monitor']]) {
    const actual = lighting.lights.find(light => light.name === name), expected = lighting.values.lights[role];
    assert.equal(actual.intensity, expected.intensity); assert.equal(actual.color, expected.color);
  }
  const environment = await page.evaluate(() => window.__environment());
  assert.equal(environment.frames, 1); assert.equal(environment.captures, 1, 'Assembly must not rebake the environment');
  assert.equal(environment.hdriIntensity, expectedEnvironment.hdriIntensity);
  assert.equal(environment.hdriRotation, expectedEnvironment.rotation);
  assert.deepEqual(Object.keys(environment.lightformers).sort(), ['reflection-fill', 'reflection-screen', 'reflection-softbox', 'reflection-wall-glow']);
  assertReflectionCards(lighting, environment);
  nearArray(environment.lightformers['reflection-wall-glow'].radiance, new Color('#8d2d2d').multiplyScalar(23.3 * 0.035 * 1.28).toArray(), 'Wall-bounce reflection radiance');
  const rawMonitor = lighting.values.lights.monitor, pose = startupLayout.monitor;
  const screenQ = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(...rawMonitor.aim).sub(new Vector3(...rawMonitor.position)).normalize());
  const origin = new Vector3(pose.x, rawMonitor.position[1], pose.z);
  const attached = local => new Vector3(...local).applyQuaternion(screenQ).add(origin).toArray();
  nearArray(lighting.monitor.position, attached([0, 0.003, 0.0001]), 'Screen initializes at new monitor pose');
  nearArray(lighting.lights.find(light => light.name === 'screen-rim').position, attached([0, -0.154, 0.002]), 'Rim initializes at new monitor pose');
  nearArray(lighting.lights.find(light => light.name === 'screen-wall-glow').position, attached([0, 0, -0.06]), 'Wall glow initializes at new monitor pose');
  nearArray(environment.lightformers['reflection-screen'].position, lighting.monitor.position, 'LCD reflection initializes with the screen');
  const wallPosition = environment.lightformers['reflection-wall-glow'].position;
  nearArray(wallPosition, [0, 1.025 + (0.854 + pose.z) * 0.035 / 0.43, -0.854], 'Wall reflection initializes on the real wall');
  checks.layoutInitialization = { status: 'passed', defaults: startupLayout, screen: lighting.monitor.position, rim: lighting.lights.find(light => light.name === 'screen-rim').position, wallGlow: lighting.lights.find(light => light.name === 'screen-wall-glow').position, wallReflection: wallPosition, environmentCaptures: environment.captures, deckOnWood: true };
  checks.wallGlowReflection = { status: 'passed', bounceGain: 0.035, ...environment.lightformers['reflection-wall-glow'] };
  checks.rigMatchedEnvironment = { status: 'passed', defaults: expectedEnvironment, ...environment };
  assert.deepEqual(lighting.values.streamDeck, { emissiveIntensity: 2.4, bloomStrength: 0.16, bloomThreshold: 1.25, spillIntensity: 0.8 });
  assert.deepEqual(lighting.values.wall, { color: '#2a2b2e', roughness: 0.55, normalStrength: 0.035 });
  checks.studioLighting = { status: 'passed', ...lighting };

  assert.equal(lighting.monitor.screenOn, true); assert.equal(lighting.monitor.hasWallpaper, true);
  assert.equal(lighting.monitor.material, 'MeshBasicMaterial');
  assert.deepEqual(lighting.values.desk, expectedDesk);
  await idleFrames(page);
  assert.equal(await page.evaluate(() => window.__environment().captures), environment.captures, 'Idle frames must not rebake the cubemap');
  const panel = environment.lightformers['reflection-screen'];
  nearArray(panel.position, lighting.monitor.position, 'Screen reflection world position');
  nearArray(panel.quaternion, lighting.monitor.quaternion, 'Screen reflection orientation');
  nearArray(panel.size, [0.598, 0.336], 'Full screen reflection size');
  const screenBuffer = await shot('monitor-on');
  checks.screenContinuity = measureScreenContinuity(screenBuffer, lighting.screenRegion);
  assert.equal(checks.screenContinuity.status, 'passed', 'Powered-on wallpaper must have no narrow dark seams or stand-edge fragments');
  await page.evaluate(() => window.__lightingStore.set({ 'Monitor · rim.rimIntensity': 42, 'Monitor · rim.wallGlow': 16 }));
  await page.waitForFunction(() => window.__lighting().lights.find(light => light.name === 'screen-rim').intensity === 42);
  await page.evaluate(() => window.__lightingStore.set({ 'Monitor · rim.screenOn': false }));
  await page.waitForFunction(() => window.__lighting().monitor.material === 'MeshPhysicalMaterial' && !window.__environment().lightformers['reflection-screen']);
  await shot('monitor-off');
  const off = await page.evaluate(() => ({ lighting: window.__lighting(), environment: window.__environment() }));
  assert.ok(off.lighting.lights.filter(light => light.name.startsWith('screen-')).every(light => light.intensity === 0), 'Off control must gate both monitor lights');
  assert.equal(Boolean(off.environment.lightformers['reflection-wall-glow']), false);
  assert.equal(off.lighting.monitor.hasWallpaper, false); assert.equal(off.lighting.monitor.color, '030405');
  assert.equal(off.lighting.monitor.emissiveIntensity, 0); assert.equal(off.lighting.monitor.clearcoat, 1);
  assert.ok(off.lighting.monitor.roughness < 0.3); assert.ok(off.lighting.monitor.reflectionCaptures > 0);
  await idleFrames(page);
  assert.equal(await page.evaluate(() => window.__environment().captures), off.environment.captures);
  assert.equal(await page.evaluate(() => window.__lighting().monitor.reflectionCaptures), off.lighting.monitor.reflectionCaptures);
  checks.monitorOff = { status: 'passed', ...off.lighting.monitor, idleReflectionCaptures: off.lighting.monitor.reflectionCaptures };
  await page.evaluate(() => window.__lightingStore.set({ 'Monitor · rim.screenOn': true, 'Monitor · rim.rimIntensity': 0, 'Monitor · rim.wallGlow': 23.3 }));
  await page.waitForFunction(() => window.__lighting().monitor.material === 'MeshBasicMaterial' && window.__environment().lightformers['reflection-screen']);
  assert.deepEqual(await page.evaluate(() => window.__lighting().values), lighting.values, 'Restore the exact saved rig for every colorway');
  checks.monitorToggle = { status: 'passed', onMaterial: lighting.monitor.material, screenLightformer: panel, offGatesBothLights: true, wallpaperContinuity: checks.screenContinuity.status };
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
  // Unobscured product details; ordinary hero/mobile/UI captures retain the picker.
  await page.locator('.variant-picker').evaluate(element => { element.style.visibility = 'hidden'; });
  for (const view of ['props-wide', 'props-streamdeck', 'props-airpods', 'deskmat-closeup', 'desk-sheen', 'desk-sheen-closeup', 'wall-paint']) {
    await page.evaluate(view => window.__kb.camera(view), view);
    const coatedBuffer = await shot(view);
    if (view === 'desk-sheen') {
      const point = await page.evaluate(() => window.__props().sheenSample);
      await page.evaluate(() => window.__lightingStore.set({ 'Desk.deskClearcoat': 0 }));
      await page.waitForFunction(() => window.__props().wood.clearcoat === 0);
      const bareBuffer = await shot('desk-sheen-uncoated');
      const sample = (buffer, point) => {
        const p = PNG.sync.read(buffer), x = Math.round(point[0] * p.width), y = Math.round(point[1] * p.height);
        assert.ok(x > 8 && x < p.width - 8 && y > 8 && y < p.height - 8, 'Wood comparison patch must be in frame');
        const rgb = [0, 0, 0];
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) for (let c = 0; c < 3; c++) rgb[c] += p.data[((y + dy) * p.width + x + dx) * 4 + c] / 81;
        return { pixel: [x, y], rgb, luminance: rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 };
      };
      const coated = sample(coatedBuffer, point), uncoated = sample(bareBuffer, point);
      assert.ok(coated.rgb[0] > coated.rgb[2] + 8, 'Reflected wood must retain a rich warm base');
      checks.woodSheen = { status: coated.luminance > uncoated.luminance + 3 ? 'passed' : 'failed', coated, uncoated, luminanceGain: coated.luminance - uncoated.luminance };
      await writeFile('screenshots/checks.json', JSON.stringify(checks, null, 2) + '\n');
      assert.equal(checks.woodSheen.status, 'passed', 'Clearcoat must produce visible reflected light on actual wood pixels');
      await page.evaluate(() => window.__lightingStore.set({ 'Desk.deskClearcoat': 0.24 }));
      await page.waitForFunction(() => window.__props().wood.clearcoat === 0.24);
    }
    if (view === 'desk-sheen-closeup') {
      // Fixed bare-wood ROI, with the same albedo/camera/lighting in every pair.
      // Differences measure light response, rather than the diffuse grain photo.
      const compare = (mappedBuffer, comparisonBuffer) => {
        const a = PNG.sync.read(mappedBuffer), b = PNG.sync.read(comparisonBuffer);
        const region = [0.4, 0.55, 0.86, 0.85];
        const delta = (x, y) => {
          const i = (y * a.width + x) * 4;
          return [0.2126, 0.7152, 0.0722].reduce((v, w, c) => v + w * (a.data[i + c] - b.data[i + c]), 0);
        };
        let absolute = 0, gain = 0, along = 0, across = 0, pixels = 0;
        for (let y = Math.floor(a.height * region[1]); y < a.height * region[3]; y++) {
          for (let x = Math.floor(a.width * region[0]); x < a.width * region[2]; x++) {
            const d = delta(x, y); absolute += Math.abs(d); gain += d;
            along += (delta(x + 1, y) - d) ** 2; across += (delta(x, y + 1) - d) ** 2; pixels++;
          }
        }
        return { region, pixels, meanAbsoluteDelta: absolute / pixels, meanLuminanceGain: gain / pixels, alongGrainRms: Math.sqrt(along / pixels), acrossGrainRms: Math.sqrt(across / pixels) };
      };
      await page.evaluate(() => window.__lightingStore.set({ 'Desk.deskNormalStrength': 0, 'Desk.deskCoatNormalStrength': 0, 'Desk.deskCoatRoughnessInfluence': 0, 'Desk.deskRoughnessMin': 0.46, 'Desk.deskRoughnessScale': 0 }));
      await page.waitForFunction(() => window.__props().wood.normalStrength === 0 && window.__props().wood.roughnessScale === 0);
      const smoothBuffer = await shot('desk-sheen-smooth');
      const grain = compare(coatedBuffer, smoothBuffer);
      assert.ok(grain.meanAbsoluteDelta > 0.5 && grain.acrossGrainRms > 1.5 * grain.alongGrainRms, 'Mapped light response must visibly break up across the horizontal grain');
      await page.evaluate(() => window.__lightingStore.set({ 'Desk.deskNormalStrength': 0.45, 'Desk.deskRoughnessMin': 0.30, 'Desk.deskRoughnessScale': 0.32 }));
      await page.waitForFunction(() => window.__props().wood.normalStrength === 0.45);
      const flatCoatBuffer = await shot('desk-sheen-coat-smooth');
      const coat = compare(coatedBuffer, flatCoatBuffer);
      assert.ok(coat.meanAbsoluteDelta > 0.15 && coat.acrossGrainRms > 0.1, 'The clearcoat itself must respond to its grain maps');
      await page.evaluate(() => window.__lightingStore.set({ 'Desk.deskCoatNormalStrength': 0.18, 'Desk.deskCoatRoughnessInfluence': 0.32 }));
      await page.waitForFunction(() => window.__props().wood.coatNormalStrength === 0.18);
      const before = await page.evaluate(() => window.__environment().captures);
      await page.evaluate(() => window.__lightingStore.set({ 'Environment.lightformerIntensity': 0 }));
      await page.waitForFunction(n => window.__environment().captures > n && window.__environment().lightformers['reflection-screen'].radiance.every(c => c === 0), before);
      const noCards = await shot('desk-sheen-no-lightformers');
      const environment = compare(coatedBuffer, noCards);
      assert.ok(environment.meanLuminanceGain > 3, 'The real rig environment must contribute visible reflected light');
      await page.evaluate(() => window.__lightingStore.set({ 'Environment.lightformerIntensity': 1.28 }));
      await page.waitForFunction(() => window.__environment().lightformers['reflection-screen'].radiance.some(c => c > 0));
      checks.woodGrainResponse = { status: 'passed', grain, coat };
      checks.woodReflectionSources = { status: 'passed', environment, standardCoatIBL: true };
    }
    if (view === 'props-wide') {
      const info = await page.evaluate(() => window.__props());
      for (const [name, bounds] of Object.entries(info.props)) assert.equal(bounds.inFrame, true, `${name}: all five desk objects must fit the wide view`);
      const png = PNG.sync.read(coatedBuffer);
      const colors = info.screenSamples.map(([x, y]) => { const i = (Math.round(y * png.height) * png.width + Math.round(x * png.width)) * 4; return [...png.data.slice(i, i + 3)]; });
      const maxChannel = Math.max(...colors.flat()), range = Math.max(...[0, 1, 2].map(c => Math.max(...colors.map(rgb => rgb[c])) - Math.min(...colors.map(rgb => rgb[c]))));
      assert.ok(maxChannel < 235 && range >= 10, 'Wallpaper must retain visible gradient color without near-white clipping');
      checks.screenGradient = { status: 'passed', sampledPoints: colors.length, maxChannel, channelRange: range, colors };
      const h = info.headphones;
      assert.deepEqual(h.aluminum, { color: '5d5f63', metalness: 0.9, roughness: 0.34 });
      for (const cup of h.cups) { nearArray(cup.up, [0, 1, 0], 'Cups hang vertically'); assert.ok(cup.inwardDot > 0.99999); assert.equal(cup.stemGeometry, 'CylinderGeometry'); }
      nearArray(h.cups[0].localPosition, [-h.cups[1].localPosition[0], ...h.cups[1].localPosition.slice(1)], 'Cup positions are symmetric');
      assert.equal(h.canopy.alphaTest, 0); assert.equal(h.canopy.hasAlphaMap, false); assert.equal(h.canopy.hasNormalMap, true); assert.equal(h.canopy.hasRoughnessMap, true); assert.ok(h.canopy.sheen > 0);
      checks.headphones = { status: 'passed', ...h };
      checks.propsWide = { status: 'passed', bounds: info.props };
    }
  }
  await page.evaluate(() => window.__kb.camera('default'));

  // Lens evidence uses one unchanged hero pose/target. An 85 mm lens crops in
  // optically; the controls must not dolly the camera to disguise that change.
  const heroLens = await page.evaluate(() => window.__camera());
  await page.evaluate(() => window.__cameraStore.set({ focalLengthMm: 85 }));
  await rendered();
  const lens85 = await page.evaluate(() => window.__camera());
  assert.ok(Math.abs(lens85.lens.focalLengthMm - 85) < 1e-9);
  nearArray(lens85.position, heroLens.position, '85 mm retains camera position');
  nearArray(lens85.target, heroLens.target, '85 mm retains camera target');
  await page.screenshot({ path: 'screenshots/lens-85mm.png' });
  console.log('screenshots/lens-85mm.png');
  await page.evaluate(() => { window.__cameraStore.reset(); window.__cameraStore.set({ depthOfField: true }); window.__cameraStore.focusOnKeyboard(); });
  await rendered();
  const focusedLens = await page.evaluate(() => window.__camera());
  assert.equal(focusedLens.lens.depthOfField, true);
  assert.ok(focusedLens.lens.focusDistance > 1.3 && focusedLens.lens.focusDistance < 1.5);
  const dofBuffer = await page.screenshot({ path: 'screenshots/lens-dof.png' });
  console.log('screenshots/lens-dof.png');
  // Bloom remains active, evaluated before lens blur on linear HDR pixels.
  const focusedSpill = await page.evaluate(() => window.__lighting().values.streamDeck);
  assert.ok(focusedSpill.bloomStrength > 0 && focusedSpill.bloomThreshold > 1);
  await page.evaluate(() => window.__cameraStore.set({ depthOfField: false }));
  await rendered();
  const sharpBuffer = await page.screenshot();
  const softImage = PNG.sync.read(dofBuffer), sharpImage = PNG.sync.read(sharpBuffer);
  let changed = 0;
  for (let i = 0; i < softImage.data.length; i += 4) if (Math.abs(softImage.data[i] - sharpImage.data[i]) > 2) changed++;
  assert.ok(changed > softImage.width * softImage.height * 0.01, 'DoF must actually change rendered pixels');
  checks.lensEvidence = { status: 'passed', lens85, focused: focusedLens, changedPixels: changed, bloom: focusedSpill };
  await page.evaluate(() => window.__cameraStore.reset());

  await page.locator('.variant-picker').evaluate(element => { element.style.visibility = ''; });

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
    for (const owner of ['Keyboard', 'Case', 'Switches', 'Knob', 'Desk.Finishes', 'Desk.Wood', 'Desk.Beam', 'Desk.Foot', 'Desk.Handset', 'StudioFloor', 'Monitor.Wallpaper', 'Monitor.Neck', 'Monitor.Reflection', 'Environment.Cubemap', 'StudioWall', 'FloorContact', 'Props.DeskMat', 'Props.StreamDeck', 'Props.Headphones', 'Props.StreamDeckLight', 'StudioPost', 'StudioPost.DoF', 'DustMotes']) {
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

  // --- interaction & sfx (spec 07c) ---
  checks.interaction = await interactionChecks(browser);
  // --- end interaction & sfx (spec 07c) ---

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
    const expected = { key: ['key-softbox', 'studio-key'], softbox: ['key-softbox'], spot: ['studio-key'], fill: ['studio-fill'], rim: ['screen-wall-glow'], env: [] }[role];
    assert.deepEqual(active.map(light => light.name).sort(), expected.sort(), `Only the ${role} role may be active`);
    assert.equal(active.some(light => light.castShadow), role === 'key' || role === 'spot');
    assert.equal(info.environment, 1);
    const soloEnvironment = await soloPage.evaluate(() => window.__environment());
    assert.equal(soloEnvironment.hdriIntensity, role === 'env' ? expectedEnvironment.hdriIntensity : 0.008);
    assert.equal(Object.keys(soloEnvironment.lightformers).length, role === 'env' ? 4 : 0);
    assert.equal(info.shadowAutoUpdate, false);
    assert.equal(info.keyFrustum.outside, true);
    for (const source of Object.values(info.areaFrusta)) assert.equal(source.outside, true);
    checks.soloLights[role] = { status: 'passed', ...info, environmentCapture: soloEnvironment };
    await soloPage.screenshot({ path: `screenshots/solo-${role}.png` });
    console.log(`screenshots/solo-${role}.png`);
    await soloContext.close();
  }

  // --- dust motes (spec 07a) ---
  {
    const expectedDust = { enabled: true, count: 240, size: 0.9, intensity: 0.5, speed: 1, padding: 0.03 };
    const dustContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
    const dustPage = await dustContext.newPage(); observeErrors(dustPage);
    await dustPage.goto(`${url}/?capture=1`);
    await dustPage.waitForFunction(() => window.__kb?.ready && window.__kb.generation > 0 && window.__dust);
    await dustPage.evaluate(() => window.__kb.finish());
    await dustPage.waitForFunction(() => window.__kb.finished);
    // The merged typing layer blinks independently of the frozen dust clock.
    // Hold its current caret phase so on/off pixels differ only by dust.
    await dustPage.evaluate(() => window.__screenControl.freezeCaret(true));
    await dustPage.locator('.variant-picker').evaluate(element => { element.style.visibility = 'hidden'; });
    await renderedPage(dustPage); await idleFrames(dustPage, 4);
    const settle = async () => { await renderedPage(dustPage); await idleFrames(dustPage, 4); };
    const setDust = async values => {
      await dustPage.evaluate(values => window.__lightingStore.set(values), values);
      await dustPage.waitForFunction(values => Object.entries(values).every(([key, value]) => window.__lighting().values.dust[key.replace('Dust.dust', '').toLowerCase()] === value), values);
      await settle();
    };
    const dustState = () => dustPage.evaluate(() => { const { evaluate, ...state } = window.__dust(); return state; });
    const initial = await dustState();
    assert.deepEqual(await dustPage.evaluate(() => window.__lighting().values.dust), expectedDust, 'Dust defaults are part of the copied lighting values');
    assert.equal(initial.enabled, true); assert.equal(initial.count, 240); assert.equal(initial.frozen, true, 'Capture freezes dust time for repeatable shots');
    assert.equal(initial.castShadow, false); assert.equal(initial.receiveShadow, false);
    assert.equal(initial.raycastDisabled, true, 'Decorative dust must never intercept pointer rays');
    assert.equal(initial.depthWrite, false); assert.equal(initial.depthTest, true); assert.equal(initial.transparent, true); assert.equal(initial.additive, true);

    // One draw call: renderer.info for the whole frame, dust on vs off.
    const calls = () => dustPage.evaluate(() => window.__kb.inspect().calls);
    const shadowsBefore = initial.shadowUpdates, capturesBefore = (await dustPage.evaluate(() => window.__environment())).captures;
    const onCalls = await calls();
    assert.equal(await calls(), onCalls, 'Assembled frame draw calls must be stable');
    await setDust({ 'Dust.dustEnabled': false });
    const offCalls = await calls();
    await setDust({ 'Dust.dustEnabled': true });
    assert.equal(onCalls - offCalls, 1, 'Dust must be exactly one draw call');
    assert.equal(await calls(), onCalls);
    checks.dustDrawCalls = { status: 'passed', on: onCalls, off: offCalls, dust: onCalls - offCalls };

    // Pixel evidence: dust-on minus dust-off. Every changed pixel must belong to a
    // mote that the shader-equivalent CPU model places inside the live cone.
    const coneEvidence = async (name, requireOutsideInFrame) => {
      await settle();
      const onBuffer = await dustPage.screenshot({ path: `screenshots/${name}.png` }); console.log(`screenshots/${name}.png`);
      const motes = await dustPage.evaluate(() => window.__dust().evaluate());
      const state = await dustState();
      await setDust({ 'Dust.dustEnabled': false });
      const offBuffer = await dustPage.screenshot();
      await setDust({ 'Dust.dustEnabled': true });
      const on = PNG.sync.read(onBuffer), off = PNG.sync.read(offBuffer);
      const project = m => [(m.ndc[0] + 1) / 2 * on.width, (1 - m.ndc[1]) / 2 * on.height];
      const visible = m => Math.abs(m.ndc[0]) < 1 && Math.abs(m.ndc[1]) < 1 && m.ndc[2] < 1 && m.depth > 0;
      const lit = motes.filter(m => m.luminance > 0 && visible(m)).map(m => ({ ...m, px: project(m) }));
      const outside = motes.filter(m => !m.insideCone);
      const outsideInFrame = outside.filter(visible);
      assert.ok(outside.every(m => m.luminance === 0 && m.spot === 0), 'Motes outside the cone must evaluate to zero brightness');
      assert.ok(outside.length > 0 && (!requireOutsideInFrame || outsideInFrame.length > 0), 'The test needs out-of-cone motes in frame');
      assert.ok(lit.length >= 3, 'Some motes must be lit inside the beam');
      assert.ok(Math.max(...motes.map(m => m.luminance)) <= state.bloomThreshold * 0.5 + 1e-9, 'Every mote stays well below the bloom threshold');
      let changed = 0, stray = 0, maxDelta = 0;
      for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
        const i = (y * on.width + x) * 4;
        const delta = Math.max(Math.abs(on.data[i] - off.data[i]), Math.abs(on.data[i + 1] - off.data[i + 1]), Math.abs(on.data[i + 2] - off.data[i + 2]));
        if (delta <= 2) continue;
        changed++; maxDelta = Math.max(maxDelta, delta);
        if (!lit.some(m => Math.hypot(m.px[0] - x, m.px[1] - y) <= m.pointSize / 2 + 2)) stray++;
      }
      assert.ok(changed > 20, `${name}: dust must be visible`);
      assert.equal(stray, 0, `${name}: no dust pixels may appear away from lit, in-cone motes`);
      return { status: 'passed', motes: motes.length, insideCone: motes.length - outside.length, outsideCone: outside.length, outsideInFrame: outsideInFrame.length, litInFrame: lit.length,
        changedPixels: changed, strayPixels: stray, maxChannelDelta: maxDelta, maxLuminance: Math.max(...motes.map(m => m.luminance)), bloomThreshold: state.bloomThreshold };
    };
    checks.dustHero = await coneEvidence('dust-hero', true);
    await dustPage.evaluate(() => window.__kb.camera('profile'));
    checks.dustCloseup = await coneEvidence('dust-closeup', false);
    await dustPage.evaluate(() => window.__kb.camera('default'));

    // Editing dust never updates shadow maps or the environment probe.
    await setDust({ 'Dust.dustCount': 400, 'Dust.dustSize': 1.2, 'Dust.dustIntensity': 0.8, 'Dust.dustSpeed': 2, 'Dust.dustPadding': 0.06 });
    await setDust({ 'Dust.dustCount': 240, 'Dust.dustSize': 0.9, 'Dust.dustIntensity': 0.5, 'Dust.dustSpeed': 1, 'Dust.dustPadding': 0.03 });
    const after = await dustState();
    const lighting = await dustPage.evaluate(() => window.__lighting());
    assert.equal(after.shadowUpdates, shadowsBefore, 'Dust must add no shadow-map updates when assembled');
    assert.equal(lighting.shadowAutoUpdate, false);
    assert.equal((await dustPage.evaluate(() => window.__environment())).captures, capturesBefore, 'Dust must not invalidate the environment probe');
    assert.deepEqual(lighting.values.dust, expectedDust);
    checks.dustShadowsAndProbe = { status: 'passed', shadowUpdates: { before: shadowsBefore, after: after.shadowUpdates }, environmentCaptures: capturesBefore, shadowAutoUpdate: lighting.shadowAutoUpdate };

    // Motion is a function of shader time: slow, and visibly different frames.
    const positionsAt = time => dustPage.evaluate(time => { window.__dustControl.setTime(time); return window.__dust().evaluate().map(m => m.world); }, time);
    const t0 = await positionsAt(0), t10 = await positionsAt(10);
    const moved = t0.map((p, i) => Math.hypot(...p.map((v, c) => v - t10[i][c]))).filter(d => d < 0.1); // exclude wraps
    const meanMove = moved.reduce((a, b) => a + b, 0) / moved.length;
    assert.ok(meanMove > 0.005 && meanMove < 0.06, `Dust drifts slowly: mean ${meanMove} m in 10 s`);
    await settle();
    const later = PNG.sync.read(await dustPage.screenshot());
    await dustPage.evaluate(() => window.__dustControl.setTime(0)); await settle();
    const start = PNG.sync.read(await dustPage.screenshot());
    let motionPixels = 0;
    for (let i = 0; i < later.data.length; i += 4) if (Math.abs(later.data[i] - start.data[i]) > 2) motionPixels++;
    assert.ok(motionPixels > 20, 'GPU positions follow shader time');
    checks.dustMotion = { status: 'passed', meanDisplacement10s: meanMove, changedPixels: motionPixels };

    // The key light drives the lit region live.
    await dustPage.evaluate(() => window.__lightingStore.set({ 'Key · softbox.keyAim': { x: 0.2, y: 0.79, z: -0.02 } }));
    await dustPage.waitForFunction(() => window.__lighting().values.lights.spot.aim[0] === 0.2);
    await settle();
    const movedLight = await dustState(), spotLight = (await dustPage.evaluate(() => window.__lighting())).lights.find(light => light.name === 'studio-key');
    nearArray(movedLight.uniforms.lightPos, spotLight.position, 'Dust uses the live spot position');
    const aimDir = [0.2 - spotLight.position[0], 0.79 - spotLight.position[1], -0.02 - spotLight.position[2]], aimLength = Math.hypot(...aimDir);
    assert.ok(movedLight.uniforms.lightDir.every((v, i) => Math.abs(v - aimDir[i] / aimLength) < 1e-6), 'Dust cone follows the live aim');
    assert.ok(Math.abs(movedLight.uniforms.coneCos - Math.cos(0.21)) < 1e-6 && Math.abs(movedLight.uniforms.penumbraCos - Math.cos(0.21 * (1 - 0.78))) < 1e-6);
    await dustPage.evaluate(() => window.__lightingStore.set({ 'Key · softbox.keyAim': { x: 0, y: 0.79, z: -0.02 } }));
    await dustPage.waitForFunction(() => window.__lighting().values.lights.spot.aim[0] === 0);
    checks.dustFollowsKeyLight = { status: 'passed', lightPos: movedLight.uniforms.lightPos, lightDir: movedLight.uniforms.lightDir, coneCos: movedLight.uniforms.coneCos, penumbraCos: movedLight.uniforms.penumbraCos };

    // Its geometry and material are released on every unmount.
    const dustLifecycles = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      await dustPage.evaluate(() => window.__app.setMounted(false));
      await dustPage.waitForFunction(() => !window.__dust && window.__app.resources().DustMotes?.active === 0);
      const owner = await dustPage.evaluate(() => window.__app.resources().DustMotes);
      assert.ok(owner.registered >= 2 * (cycle + 1)); assert.equal(owner.registered, owner.disposed, 'DustMotes must release every owned resource');
      dustLifecycles.push(owner);
      if (cycle === 0) { await dustPage.evaluate(() => window.__app.setMounted(true)); await dustPage.waitForFunction(() => window.__kb?.ready && window.__dust); }
    }
    checks.dustDisposal = { status: 'passed', unmounts: 2, owner: dustLifecycles.at(-1) };
    await dustContext.close();

    // prefers-reduced-motion: the motes stay, at a fifth of the speed.
    const reducedContext = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const reducedPage = await reducedContext.newPage(); observeErrors(reducedPage);
    await reducedPage.goto(url);
    await reducedPage.waitForFunction(() => window.__kb?.finished && window.__dust);
    const reduced = await reducedPage.evaluate(async () => {
      const start = window.__dust().time, began = performance.now();
      await new Promise(resolve => setTimeout(resolve, 1000));
      const state = window.__dust();
      return { enabled: state.enabled, motionScale: state.motionScale, frozen: state.frozen, advanced: state.time - start, elapsed: (performance.now() - began) / 1000 };
    });
    assert.equal(reduced.enabled, true); assert.equal(reduced.frozen, false); assert.equal(reduced.motionScale, 0.2);
    assert.ok(reduced.advanced > 0 && reduced.advanced <= reduced.elapsed * 0.2 + 0.02, 'Reduced motion still drifts, about 5x slower');
    checks.dustReducedMotion = { status: 'passed', ...reduced };
    await reducedContext.close();
    await writeFile('screenshots/checks.json', `${JSON.stringify(checks, null, 2)}\n`);
  }
  // --- end dust motes (spec 07a) ---

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', error => errors.push(error.message));
  await mobilePage.goto(url);
  await mobilePage.waitForFunction(() => window.__kb?.finished);
  assert.ok(await mobilePage.evaluate(() => window.__kb.duration < 0.7));
  const reducedIntro = await mobilePage.evaluate(() => ({ timings: window.__kb.introTimings, info: window.__kb.inspect().intro }));
  assert.equal(reducedIntro.timings.frameAt, 0); assert.equal(reducedIntro.timings.keysAt, 0);
  assert.equal(reducedIntro.info.mat.maxRestError, 0); assert.equal(reducedIntro.info.frameOffset, 0);
  checks.reducedIntro = { status: 'passed', ...reducedIntro };
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
  await mobilePage.evaluate(() => window.__cameraStore.set({ verticalFovDeg: 46 }));
  await mobilePage.setViewportSize({ width: 430, height: 900 });
  await renderedPage(mobilePage);
  await mobilePage.waitForFunction(() => window.__camera().lens.verticalFovDeg === 46);
  const mobileLens = await mobilePage.evaluate(() => window.__camera());
  assert.equal(mobileLens.minDistance, 0.317); assert.equal(mobileLens.maxDistance, 0.719);
  assert.ok(mobileLens.distance <= 0.719 + 1e-8);
  assert.ok(Math.abs(mobileLens.lens.focalLengthMm - 35 / (2 * Math.tan(46 * Math.PI / 360))) < 1e-9);
  checks.mobileLiveLens = { status: 'passed', resized: mobileLens, viewport: [430, 900] };
  await mobile.close();

  const debugContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, permissions: ['clipboard-read', 'clipboard-write'] });
  const debugPage = await debugContext.newPage(); observeErrors(debugPage);
  await debugPage.goto(`${url}/?capture=1&debug`);
  await debugPage.waitForFunction(() => window.__kb?.ready && window.__camera);
  await debugPage.evaluate(() => window.__kb.finish());
  const originalCamera = await debugPage.evaluate(() => window.__camera());
  assertHeroCamera(originalCamera);
  const edit = async (name, value) => {
    // Linked numeric fields update together. Let Leva render the previous
    // conversion before focusing another field and committing its text buffer.
    await renderedPage(debugPage);
    const input = debugPage.getByRole('textbox', { name, exact: true }).first();
    await input.fill(String(value)); await input.press('Enter');
    await renderedPage(debugPage);
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
  assert.deepEqual(Object.keys(copied).sort(), ['minDistance', 'maxDistance', 'distance', 'polarDeg', 'azimuthDeg', 'position', 'target', 'lens'].sort());
  assert.ok(Math.abs(copied.distance - setMax.distance) < 0.0001);
  await debugPage.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await debugPage.waitForFunction(() => window.__camera().minDistance === 0.317 && window.__camera().maxDistance === 1.351);
  const resetCamera = await debugPage.evaluate(() => window.__camera());
  assertHeroCamera(resetCamera);
  await idleFrames(debugPage);
  assertHeroCamera(await debugPage.evaluate(() => window.__camera()));
  checks.cameraControls = { status: 'passed', defaults: originalCamera, draggedLimits, sliderLimits, setMin, setMax, copied, reset: resetCamera };
  await renderedPage(debugPage);
  await debugPage.screenshot({ path: 'screenshots/debug-camera.png' });
  console.log('screenshots/debug-camera.png');

  await debugPage.getByText('Lens', { exact: true }).click();
  await edit('Focal length (mm)', 50);
  await debugPage.waitForFunction(() => Math.abs(window.__camera().lens.focalLengthMm - 50) < 1e-9);
  const lens50 = await debugPage.evaluate(() => window.__camera().lens);
  const expectedFov50 = 2 * Math.atan((35 / 1.6) / (2 * 50)) * 180 / Math.PI;
  assert.ok(Math.abs(lens50.verticalFovDeg - expectedFov50) < 1e-9);
  assert.ok(Math.abs(parseFloat(await debugPage.getByRole('textbox', { name: 'Vertical FOV (deg)', exact: true }).inputValue()) - expectedFov50) <= 0.05);
  // Sensor changes retain 50 mm and update FOV; FOV edits update the lens too.
  await edit('Film gauge (mm)', 50);
  await debugPage.waitForFunction(() => window.__camera().lens.filmGaugeMm === 50);
  const largerSensor = await debugPage.evaluate(() => window.__camera().lens);
  assert.ok(Math.abs(largerSensor.focalLengthMm - 50) < 1e-9);
  assert.ok(Math.abs(largerSensor.verticalFovDeg - 2 * Math.atan((50 / 1.6) / 100) * 180 / Math.PI) < 1e-9);
  await edit('Vertical FOV (deg)', 40);
  await debugPage.waitForFunction(() => window.__camera().lens.verticalFovDeg === 40);
  const reverseLens = await debugPage.evaluate(() => window.__camera().lens);
  assert.ok(Math.abs(reverseLens.focalLengthMm - (50 / 1.6) / (2 * Math.tan(40 * Math.PI / 360))) < 1e-9);
  await edit('Near (m)', 0.015); await edit('Far (m)', 32);
  // Leva's native checkbox has zero dimensions; its visible label is the UI.
  await debugPage.getByText('Enabled', { exact: true }).click();
  await edit('Bokeh scale', 0.85); await edit('Focal range (m)', 0.12);
  await debugPage.getByRole('button', { name: 'Focus on keyboard', exact: true }).click();
  await debugPage.waitForFunction(() => {
    const lens = window.__camera().lens;
    return lens.near === 0.015 && lens.far === 32 && lens.depthOfField && lens.bokehScale === 0.85 && lens.focalRange === 0.12 && lens.focusDistance > 1.3;
  });
  const editedLens = await debugPage.evaluate(() => window.__camera().lens);
  assert.equal(editedLens.near, 0.015); assert.equal(editedLens.far, 32);
  assert.equal(editedLens.depthOfField, true); assert.equal(editedLens.bokehScale, 0.85); assert.equal(editedLens.focalRange, 0.12);
  assert.ok(editedLens.focusDistance > 1.3 && editedLens.focusDistance < 1.5);
  await debugPage.getByRole('button', { name: 'Copy camera values', exact: true }).click();
  const lensCopy = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(lensCopy.lens, editedLens);
  assert.equal(Object.keys(lensCopy.lens).length, 9);
  await debugPage.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await debugPage.waitForFunction(() => !window.__camera().lens.depthOfField && Math.abs(window.__camera().lens.focalLengthMm - 80.343) < 1e-9);
  const lensReset = await debugPage.evaluate(() => window.__camera());
  assert.deepEqual(lensReset.lens, originalCamera.lens);
  assertHeroCamera(lensReset);
  // Defaults also retain 80.343 mm at the user's approximate copied aspect.
  await debugPage.setViewportSize({ width: 1300, height: 1000 });
  await renderedPage(debugPage);
  await debugPage.waitForFunction(() => Math.abs(window.__camera().lens.focalLengthMm - 80.343) < 1e-9);
  const copiedAspectCamera = await debugPage.evaluate(() => window.__camera());
  assertHeroCamera(copiedAspectCamera, 1.3);
  assert.ok(Math.abs(copiedAspectCamera.lens.verticalFovDeg - 19.022) < 0.002);
  await debugPage.setViewportSize({ width: 1600, height: 1000 });
  await renderedPage(debugPage);
  assertHeroCamera(await debugPage.evaluate(() => window.__camera()));
  checks.cameraAspectConversion = { status: 'passed', copiedAspect: copiedAspectCamera, desktopAspect: lensReset };
  await debugPage.evaluate(lens => window.__cameraStore.set(lens), lensCopy.lens);
  const roundTripped = await debugPage.evaluate(() => window.__camera().lens);
  for (const [key, value] of Object.entries(editedLens)) {
    if (typeof value === 'number') assert.ok(Math.abs(roundTripped[key] - value) < 1e-9, `${key} round trip`);
    else assert.equal(roundTripped[key], value);
  }
  checks.lensControls = { status: 'passed', lens50, expectedFov50, largerSensor, reverseLens, copied: lensCopy, roundTripped, reset: lensReset.lens };
  await debugPage.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await idleFrames(debugPage);
  await debugPage.screenshot({ path: 'screenshots/debug-lens.png' });
  console.log('screenshots/debug-lens.png');
  await debugPage.getByText('Lens', { exact: true }).click();

  const defaultLighting = await debugPage.evaluate(() => window.__lighting().values);
  await debugPage.getByRole('button', { name: 'Copy lighting values', exact: true }).click();
  const lightingCopy = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(lightingCopy, defaultLighting, 'Clipboard must contain every current light parameter');
  assert.deepEqual(Object.keys(lightingCopy.lights).sort(), ['softbox', 'spot', 'fill', 'monitor'].sort());
  assert.deepEqual(lightingCopy.lights.softbox.position, [-0.67, 1.75, 0.8]);
  assert.deepEqual(lightingCopy.lights.spot.position, [-0.67, 1.75, 0.8]);
  checks.lightingClipboard = { status: 'passed', values: lightingCopy };
  assert.deepEqual(lightingCopy, checks.studioLighting.values, 'Startup clipboard must round-trip the exact saved rig, environment, rendering and desk defaults');
  checks.lightingRoundTrip = { status: 'passed', values: lightingCopy };
  await debugPage.evaluate(() => window.__lightingStore.set({ 'Desk.deskClearcoat': 0.57, 'Desk.deskClearcoatRoughness': 0.31, 'Desk.deskRoughnessMin': 0.4, 'Desk.deskRoughnessScale': 0.35, 'Desk.deskNormalStrength': 0.55, 'Desk.deskCoatNormalStrength': 0.21, 'Desk.deskCoatRoughnessInfluence': 0.4, 'Desk.deskEnvMapIntensity': 1.7 }));
  await debugPage.waitForFunction(() => window.__props().wood.envMapIntensity === 1.7 && window.__props().wood.roughnessMin === 0.4 && window.__props().wood.coatRoughnessInfluence === 0.4);
  const editedDesk = await debugPage.evaluate(() => window.__props().wood);
  assert.equal(editedDesk.normalStrength, 0.55); assert.equal(editedDesk.coatNormalStrength, 0.21); assert.equal(editedDesk.coatRoughnessInfluence, 0.4);
  assert.equal(editedDesk.clearcoat, 0.57); assert.equal(editedDesk.clearcoatRoughness, 0.31); assert.equal(editedDesk.roughnessScale, 0.35); assert.equal(editedDesk.explicitEnvironment, true);
  await debugPage.getByRole('button', { name: 'Copy lighting values', exact: true }).click();
  const editedDeskCopy = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(editedDeskCopy.desk, { clearcoat: 0.57, clearcoatRoughness: 0.31, roughnessMin: 0.4, roughnessScale: 0.35, normalStrength: 0.55, coatNormalStrength: 0.21, coatRoughnessInfluence: 0.4, envMapIntensity: 1.7 });
  checks.deskControls = { status: 'passed', editedMaterial: editedDesk, copied: editedDeskCopy.desk };
  await debugPage.evaluate(() => window.__lightingStore.set({ 'Desk.deskClearcoat': 0.24, 'Desk.deskClearcoatRoughness': 0.22, 'Desk.deskRoughnessMin': 0.30, 'Desk.deskRoughnessScale': 0.32, 'Desk.deskNormalStrength': 0.45, 'Desk.deskCoatNormalStrength': 0.18, 'Desk.deskCoatRoughnessInfluence': 0.32, 'Desk.deskEnvMapIntensity': 0.9 }));

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
    'Key · softbox.softboxWidth': 0.44, 'Key · softbox.keyColor': '#fff7f0',
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
  // Restore the user's rig before layout evidence. Only prop transforms change.
  await debugPage.evaluate(() => window.__lightingStore.set({
    'Key · softbox.softboxIntensity': 0.75, 'Key · softbox.keyPosition': { x: -0.67, y: 1.75, z: 0.8 },
    'Key · spot (shadows).linkSpot': true, 'Key · spot (shadows).keyIntensity': 6.235, 'Key · spot (shadows).shadowRadius': 4.1,
  }));
  await debugPage.waitForFunction(() => window.__lighting().values.lights.spot.intensity === 6.235);
  await debugPage.evaluate(() => window.__kb.camera('props-wide'));
  await debugPage.getByText('Key · spot (shadows)', { exact: true }).click();
  await debugPage.getByText('Camera', { exact: true }).click();
  await debugPage.getByText('Layout', { exact: true }).click();
  const initialLayout = await debugPage.evaluate(() => window.__layout().values);
  assert.deepEqual(initialLayout, expectedLayout, 'Debug controls must retain exact startup defaults');
  await debugPage.getByRole('button', { name: 'Copy layout values', exact: true }).click();
  assert.deepEqual(JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText())), initialLayout);
  await debugPage.getByText('Show gizmos', { exact: true }).click();
  await renderedPage(debugPage);
  await debugPage.screenshot({ path: 'screenshots/gizmos-debug.png' }); console.log('screenshots/gizmos-debug.png');
  const initialGizmos = await debugPage.evaluate(() => window.__layout());
  assert.equal(initialGizmos.visible, true);
  assert.ok(Object.values(initialGizmos.handles).every(points => points.length === 2), 'Only X/Z translation handles plus the Y rotation arc');
  // Exercise a real PivotControls hit target, not a synthetic dragging flag.
  const handle = initialGizmos.handles.monitor[0];
  const captureBeforeDrag = await debugPage.evaluate(() => window.__environment().captures);
  await debugPage.mouse.move(handle.x * 1600, handle.y * 1000); await debugPage.mouse.down();
  await debugPage.waitForFunction(() => window.__layout().dragging === 'monitor');
  const duringDown = await debugPage.evaluate(() => window.__layout());
  assert.equal(duringDown.orbitEnabled, false);
  await debugPage.mouse.move(handle.x * 1600 + 28, handle.y * 1000, { steps: 3 });
  await idleFrames(debugPage, 4);
  const duringDrag = await debugPage.evaluate(() => ({ layout: window.__layout(), captures: window.__environment().captures }));
  assert.equal(duringDrag.captures, captureBeforeDrag, 'A gizmo drag holds the environment capture until release');
  assert.ok(Math.abs(duringDrag.layout.values.monitor.x - initialLayout.monitor.x) > 0.005);
  await debugPage.mouse.up();
  await debugPage.waitForFunction(n => window.__layout().orbitEnabled && !window.__layout().dragging && window.__environment().captures > n, captureBeforeDrag);
  await idleFrames(debugPage, 5);
  const afterDrag = await debugPage.evaluate(() => ({ layout: window.__layout(), captures: window.__environment().captures }));
  assert.equal(afterDrag.captures, captureBeforeDrag + 1, 'One recapture after a completed drag');
  checks.gizmoDrag = { status: 'passed', down: duringDown.orbitEnabled, during: duringDrag.layout.orbitEnabled, after: afterDrag.layout.orbitEnabled, beforeCaptures: captureBeforeDrag, duringCaptures: duringDrag.captures, afterCaptures: afterDrag.captures, from: initialLayout.monitor, to: afterDrag.layout.values.monitor };
  const beforeLayoutMove = await debugPage.evaluate(() => ({ lighting: window.__lighting(), env: window.__environment(), layout: window.__layout() }));
  await debugPage.evaluate(() => {
    window.__layoutStore.set('monitor', { x: 0.10, z: -0.36, rotationY: 12 });
    window.__layoutStore.set('headphones', { x: -0.44, z: -0.36, rotationY: -12 });
    window.__layoutStore.set('streamdeck', { x: 0.59, z: -0.14, rotationY: -12 });
  });
  await debugPage.waitForFunction(() => Math.abs(window.__lighting().monitor.position[0] - 0.10) < 0.005 && window.__layout().values.streamdeck.y === 0.75);
  await renderedPage(debugPage); await idleFrames(debugPage, 4);
  const movedLayout = await debugPage.evaluate(() => ({ lighting: window.__lighting(), env: window.__environment(), layout: window.__layout(), props: window.__props() }));
  const rigid = pose => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.rotationY * Math.PI / 180);
    return new Matrix4().compose(new Vector3(pose.x, pose.y, pose.z), q, new Vector3(1, 1, 1));
  };
  const beforePose = beforeLayoutMove.layout.values.monitor, nextPose = movedLayout.layout.values.monitor;
  const delta = rigid(nextPose).multiply(rigid(beforePose).invert());
  for (const name of ['screen-rim', 'screen-wall-glow']) {
    const before = beforeLayoutMove.lighting.lights.find(l => l.name === name), moved = movedLayout.lighting.lights.find(l => l.name === name);
    nearArray(moved.position, new Vector3(...before.position).applyMatrix4(delta).toArray(), `${name}: rigidly follows the monitor`);
    assert.equal(moved.intensity, before.intensity); assert.equal(moved.color, before.color);
  }
  nearArray(movedLayout.env.lightformers['reflection-screen'].position, movedLayout.lighting.monitor.position, 'Moved LCD Lightformer matches actual screen');
  nearArray(movedLayout.env.lightformers['reflection-screen'].quaternion, movedLayout.lighting.monitor.quaternion, 'Moved LCD Lightformer orientation');
  assert.equal(movedLayout.props.wood.explicitEnvironment, true, 'Wood reflects the same live rig cubemap after layout changes');
  assert.equal(movedLayout.props.wood.standardCoatIBL, true);
  assert.ok(Math.abs(movedLayout.env.lightformers['reflection-wall-glow'].position[2] + 0.854) < 1e-9);
  assert.notDeepEqual(movedLayout.env.lightformers['reflection-wall-glow'].position, beforeLayoutMove.env.lightformers['reflection-wall-glow'].position);
  const beforeSpill = beforeLayoutMove.lighting.lights.find(l => l.name === 'streamdeck-spill');
  const movedSpill = movedLayout.lighting.lights.find(l => l.name === 'streamdeck-spill');
  const deckDelta = rigid(movedLayout.layout.values.streamdeck).multiply(rigid(beforeLayoutMove.layout.values.streamdeck).invert());
  nearArray(movedSpill.position, new Vector3(...beforeSpill.position).applyMatrix4(deckDelta).toArray(), 'Deck spill follows the wedge and keys');
  assert.ok(Math.abs(movedLayout.props.props['prop-streamdeck'].min[1] - 0.75) < 0.0005);
  await debugPage.getByRole('button', { name: 'Copy layout values', exact: true }).click();
  const copiedLayout = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(copiedLayout, movedLayout.layout.values);
  checks.layoutClipboard = { status: 'passed', defaults: initialLayout, moved: copiedLayout };
  checks.layoutAttachments = { status: 'passed', before: beforeLayoutMove, moved: movedLayout };
  await debugPage.evaluate(() => { window.__layoutStore.show(false); document.querySelector('.variant-picker').style.visibility = 'hidden'; document.getElementById('studio-controls').style.display = 'none'; });
  await renderedPage(debugPage);
  await debugPage.screenshot({ path: 'screenshots/layout-moved.png' }); console.log('screenshots/layout-moved.png');
  // Exact numeric fields remain in two-way sync with gizmo/debug-store edits.
  const input = debugPage.locator('[id="Layout.monitor.monitorPosition"]');
  assert.ok(Math.abs(parseFloat(await input.inputValue()) - 0.10) < 0.001);
  await debugPage.evaluate(() => { document.getElementById('studio-controls').style.display = ''; });
  await input.fill('0.125'); await input.press('Enter');
  await debugPage.waitForFunction(() => Math.abs(window.__layout().values.monitor.x - 0.125) < 0.0001);
  await debugPage.evaluate(() => window.__layoutStore.set('streamdeck', { x: 99, z: 99 }));
  await renderedPage(debugPage);
  const clamped = await debugPage.evaluate(() => window.__props().props['prop-streamdeck']);
  assert.ok(clamped.min[0] >= -0.8 && clamped.max[0] <= 0.8 && clamped.min[2] >= -0.56 && clamped.max[2] <= 0.19);
  await debugPage.evaluate(() => window.__layoutStore.set('monitor', { rotationY: 170 }));
  await debugPage.waitForFunction(() => window.__environment().lightformers['reflection-wall-glow'].radiance.every(c => c === 0));
  assert.equal(await debugPage.evaluate(() => window.__props().wood.explicitEnvironment), true, 'Wood stays bound to the environment with the phantom wall card disabled');
  checks.wallProjectionDirection = { status: 'passed', facingAwayRotationY: 170, wallRadiance: [0, 0, 0] };
  await debugPage.evaluate(() => window.__layoutStore.set('streamdeck', { x: 0.281, z: -0.14, rotationY: -24.6 }));
  await debugPage.waitForFunction(() => window.__layout().values.streamdeck.y === 0.754);
  const onMat = await debugPage.evaluate(() => ({ pose: window.__layout().values.streamdeck, bounds: window.__props().props['prop-streamdeck'] }));
  assert.ok(Math.abs(onMat.bounds.min[1] - 0.754) < 0.0005, 'Moving onto felt raises the real deck to mat height');
  await debugPage.evaluate(pose => window.__layoutStore.set('streamdeck', pose), expectedLayout.streamdeck);
  await debugPage.waitForFunction(() => window.__layout().values.streamdeck.y === 0.75);
  checks.layoutConstraints = { status: 'passed', clamped, numericX: 0.125, onMat, defaultOffMat: initialLayout.streamdeck, movedOffMat: copiedLayout.streamdeck };
  // Copy -> store -> copy round trip, including four-decimal positions.
  await debugPage.evaluate(layout => { for (const [id, pose] of Object.entries(layout)) window.__layoutStore.set(id, pose); }, expectedLayout);
  await renderedPage(debugPage);
  await debugPage.getByRole('button', { name: 'Copy layout values', exact: true }).click();
  const restoredLayout = JSON.parse(await debugPage.evaluate(() => navigator.clipboard.readText()));
  assert.deepEqual(restoredLayout, expectedLayout);
  checks.layoutClipboard.restored = restoredLayout;
  // Sound also has an "Intro" volume label after the branch merge.
  await debugPage.getByText('Intro', { exact: true }).and(debugPage.locator('div')).click();
  for (const [key, value] of [['mat', 1.8], ['frame', 0.9], ['keys', 2.35]]) {
    const input = debugPage.locator(`[id="Intro.${key}"]`);
    await input.fill(String(value)); await input.press('Enter');
    await renderedPage(debugPage);
  }
  await debugPage.getByRole('button', { name: 'Replay intro', exact: true }).click();
  await debugPage.evaluate(() => window.__kb.seek(0));
  const editedIntro = await debugPage.evaluate(() => window.__kb.introTimings);
  assert.equal(editedIntro.matEnd, 1.8);
  assert.ok(Math.abs(editedIntro.frameEnd - editedIntro.frameAt - 0.9) < 1e-7);
  assert.ok(Math.abs(editedIntro.end - editedIntro.keysAt - 2.35) < 1e-7);
  assert.equal(await debugPage.evaluate(() => window.__kb.introPhase), 'mat');
  await debugPage.evaluate(() => window.__kb.finish());
  await debugPage.waitForFunction(() => window.__kb.finished && window.__kb.introPhase === 'done');
  checks.introDebugControls = { status: 'passed', editedTimings: editedIntro };
  // Sound debug (spec 08b): per-voice Preview buttons and live Synthesis character.
  await debugPage.getByText('Sound', { exact: true }).and(debugPage.locator('div')).click();
  await debugPage.getByText('Preview', { exact: true }).and(debugPage.locator('div')).click();
  const previewBefore = await debugPage.evaluate(() => window.__sfx().byName);
  for (const name of ['Key press', 'Stab press', 'Knob tick', 'Frame thud', 'Mat unroll']) {
    await debugPage.getByRole('button', { name, exact: true }).click();
  }
  await debugPage.waitForFunction(() => window.__sfx().ready);
  for (const name of ['Spacebar', 'Backspace']) await debugPage.getByRole('button', { name, exact: true }).click();
  await debugPage.waitForTimeout(250);
  const keystrokes = await debugPage.evaluate(() => window.__sfx());
  for (const voice of ['keyDownSpace', 'keyUpSpace', 'keyUpStab']) assert.ok((keystrokes.byName[voice] ?? 0) - (previewBefore[voice] ?? 0) >= 1, `Preview plays ${voice}`);
  const previewAfter = await debugPage.evaluate(() => window.__sfx());
  for (const voice of ['keyDown', 'knobTick', 'thud', 'matUnroll']) assert.equal((previewAfter.byName[voice] ?? 0) - (previewBefore[voice] ?? 0), 1, `Preview plays ${voice}`);
  await debugPage.getByText('Synthesis', { exact: true }).and(debugPage.locator('div')).click();
  const runsBefore = previewAfter.precompute.runs;
  const pitchInput = debugPage.locator('[id="Sound.Synthesis.synthPitch"]');
  await pitchInput.fill('0.85'); await pitchInput.press('Enter');
  await debugPage.waitForFunction(runs => window.__sfx().precompute.runs > runs && window.__sfx().precompute.buffers === 22, runsBefore);
  const recharacter = await debugPage.evaluate(() => window.__sfx());
  assert.equal(recharacter.character.pitch, 0.85); assert.equal(recharacter.contexts, 1); assert.deepEqual(recharacter.errors, []);
  const gapInput = debugPage.locator('[id="Sound.tickGap"]');
  await gapInput.fill('60'); await gapInput.press('Enter');
  await debugPage.waitForFunction(() => Math.abs(window.__sfx().tickGap - 0.06) < 1e-9);
  checks.soundDebugControls = { status: 'passed', tickGapMs: 60, previewed: ['keyDown', 'keyDownStab', 'knobTick', 'thud', 'matUnroll'], character: recharacter.character, rerender: recharacter.precompute };
  await debugContext.close();
  assert.deepEqual(errors, [], 'Browser must have no runtime or console errors');
  checks.browserErrors = errors;
  await writeFile('screenshots/checks.json', `${JSON.stringify(checks, null, 2)}\n`);
  console.log('All checks passed. Evidence saved to screenshots/checks.json');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
