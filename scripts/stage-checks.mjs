import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const names = ['Bare', 'Studio light', 'Practicals', 'Desk dressing', 'Lens', 'Sound design', 'Final'];
const frames = (page, n = 6) => page.evaluate(n => new Promise(resolve => { const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }), n);
async function settle(page) {
  await frames(page, 2); // Let autofocus observe the immediately preceding pose/intro edit.
  await page.waitForFunction(() => !window.__stages().transitioning);
  await page.waitForFunction(() => { const f = window.__cameraStore.focusState(); return f.distance === f.target && f.range === f.rangeTarget; });
  await frames(page);
}
async function freeze(page) {
  // ScreenText is remounted when practicals arrive. Freeze an explicit blink
  // phase on both captures, rather than whichever phase that mount inherited.
  const screen = await page.evaluate(() => { window.__screenControl?.freezeCaret(false); return Boolean(window.__screen); });
  if (screen) await page.waitForFunction(() => !window.__screen().caretOn);
  await page.evaluate(() => { window.__screenControl?.freezeCaret(true); window.__dustControl.setTime(0); }); await frames(page);
}
function pixelDifference(a, b) { const A = PNG.sync.read(a), B = PNG.sync.read(b); assert.equal(A.width, B.width); let changed = 0, max = 0; for (let i = 0; i < A.data.length; i++) { const d = Math.abs(A.data[i] - B.data[i]); if (d) changed++; max = Math.max(max, d); } return { changedChannels: changed, maxDelta: max }; }

export async function stageChecks(browser, url, observeErrors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage(); observeErrors(page);
  const result = { stages: {} };
  try {
    await page.goto(`${url}/?capture=1&debug`);
    await page.waitForFunction(() => window.__kb?.ready && window.__stages);
    await page.evaluate(() => window.__kb.finish()); await settle(page); await freeze(page);
    // Hide Leva via the actual recording hotkey, leaving the stage label off.
    await page.keyboard.press('Alt+h'); await frames(page);
    assert.equal(await page.evaluate(() => window.__stages().panelHidden), true);
    assert.equal(await page.locator('#studio-controls').getByText('Stages', { exact: true }).isVisible(), false);
    const tuned = await page.evaluate(() => ({ lighting: window.__lighting().values, camera: window.__camera() }));
    const baseline = await page.screenshot({ path: 'screenshots/stage-normal.png' });
    for (let n = 1; n <= 7; n++) {
      const captures = await page.evaluate(() => window.__environment().captures);
      await page.evaluate(n => window.__stageControl.select(n), n);
      await settle(page); await freeze(page);
      const info = await page.evaluate(() => ({ ...window.__stages(), film: window.__film(), camera: window.__camera(), tuned: window.__lighting().values, captures: window.__environment().captures, monitor: window.__lighting().monitor, mat: window.__kb.inspect().intro.mat, feet: window.__props().feetBottom }));
      assert.deepEqual(info.tuned, tuned.lighting, 'Stages never rewrite tuned lighting');
      assert.deepEqual(info.props, { mat: n >= 4, streamdeck: n >= 3, headphones: n >= 4, screen: n >= 3 });
      const expected = n === 1 ? [['stage-bare', 'DirectionalLight']] : [['key-softbox', 'RectAreaLight'], ['studio-key', 'SpotLight'], ['studio-fill', 'RectAreaLight'], ...(n >= 3 ? [['screen-rim', 'RectAreaLight'], ['screen-wall-glow', 'RectAreaLight'], ['streamdeck-spill', 'RectAreaLight']] : [])];
      assert.deepEqual(info.lights.map(l => [l.name, l.type]).sort(), expected.sort());
      assert.equal(info.film.operator, n === 7 ? 'ACES Filmic' : 'None');
      assert.equal(info.film.rendererToneMapping, 0);
      assert.equal(info.film.toneMapStages, n === 7 ? 1 : 0);
      assert.equal(info.film.gradingActive, n === 7);
      for (const [pass, enabled] of [['bloom', n === 7], ['depthOfField', n >= 5], ['dustAfterDoF', n === 7]]) assert.equal(info.film.passes.find(p => p.name === pass).enabled, enabled, `${n}: ${pass}`);
      assert.equal(await page.evaluate(() => window.__dust().visible), n === 7);
      assert.ok(Math.abs(info.lens.fov - (n < 5 ? 50 : tuned.camera.lens.verticalFovDeg)) < 1e-9);
      assert.equal(info.camera.lens.focalLengthMm, tuned.camera.lens.focalLengthMm, 'Leva/copy lens stays tuned');
      assert.equal(info.audio.mode, n < 6 ? 'synth-keys-only' : 'full');
      assert.equal(info.audio.recordedKeys, n >= 6);
      assert.equal(info.environment.intensity, n >= 3 ? 1 : 0);
      assert.ok(Math.abs(info.keyboardY - info.supportedHeight) < 1e-9, 'Keyboard follows the actual support height');
      assert.ok(info.feet.every(y => Math.abs(y - (0.75 + (n >= 4 ? 0.004 : 0))) < 1e-7), 'Actual rubber feet rest on wood/felt');
      assert.ok(info.captures - captures <= 1, 'At most one environment capture per stage change');
      const stable = info.captures; await frames(page, 12);
      assert.equal(await page.evaluate(() => window.__environment().captures), stable, 'No per-frame probe captures');
      await page.screenshot({ path: `screenshots/stage-${n}.png` }); console.log(`screenshots/stage-${n}.png`);
      result.stages[n] = { status: 'passed', lights: info.lights, props: info.props, lens: info.lens, audio: info.audio, post: { operator: info.film.operator, grade: info.film.gradingActive, passes: info.film.passes }, keyboardY: info.keyboardY, captures: info.captures - captures };
    }
    assert.deepEqual(await page.evaluate(() => window.__camera()), tuned.camera, 'Final optical state exactly matches the baseline');
    result.finalParity = pixelDifference(baseline, await page.screenshot());
    assert.equal(result.finalParity.changedChannels, 0, 'Stage 7 must be pixel-identical to no stage');
    // Real input, including macOS Option characters (use physical Digit codes).
    const text = await page.evaluate(() => window.__stages().typing);
    await page.keyboard.press('Alt+Digit2'); await settle(page);
    assert.equal(await page.evaluate(() => window.__stages().stage), 2);
    assert.deepEqual(await page.evaluate(() => window.__stages().typing), text);
    assert.deepEqual(await page.evaluate(() => window.__interaction.state().pressed), []);
    await page.keyboard.press('Alt+ArrowRight'); await settle(page);
    assert.equal(await page.evaluate(() => window.__stages().stage), 3);
    await page.keyboard.press('Alt+ArrowLeft'); await settle(page);
    assert.equal(await page.evaluate(() => window.__stages().stage), 2);
    await page.keyboard.press('Alt+l'); await frames(page);
    assert.equal(await page.locator('.stage-label').textContent(), 'Stage 2 — Studio light');
    await page.keyboard.press('Alt+l'); await page.keyboard.press('Alt+h'); await frames(page);
    assert.equal(await page.locator('#studio-controls').getByText('Stages', { exact: true }).isVisible(), true);
    // Replay intro with no mat: the unroll beat really is omitted.
    await page.getByRole('button', { name: 'Replay stage intro', exact: true }).click();
    const timing = await page.evaluate(() => window.__kb.introTimings);
    assert.equal(timing.matEnd, timing.holdEnd); assert.equal(timing.frameAt, timing.holdEnd);
    await page.evaluate(() => window.__kb.finish());
    // Both primitive key sounds actually schedule synth voices; other hooks do not.
    await page.mouse.click(8, 450);
    await page.waitForFunction(() => window.__sfx().ready && window.__sfx().samples.status === 'decoded');
    const synth = await page.evaluate(() => { const count = window.__sfx().scheduled; for (const name of ['hover','knobClick','knobTick','capLift','capSeat','thud','matUnroll']) window.__sfxPlay(name); window.__sfxPlay('keyDown'); window.__sfxPlay('keyUp'); return { count, after: window.__sfx() }; });
    assert.equal(synth.after.scheduled - synth.count, 2); assert.ok(synth.after.events.slice(-2).every(e => e.source === 'synth'));
    await page.evaluate(() => window.__stageControl.select(6)); await settle(page);
    const full = await page.evaluate(() => { const count = window.__sfx().scheduled; window.__sfxPlay('keyDownSpace'); window.__sfxPlay('knobClick'); window.__sfxPlay('thud'); return { count, after: window.__sfx() }; });
    assert.equal(full.after.scheduled - full.count, 3); assert.equal(full.after.events.at(-3).source, 'sample');
    await page.keyboard.type('hello'); await page.keyboard.press('Enter'); await frames(page);
    assert.equal(await page.evaluate(() => window.__stages().typing.transcript.at(-1)), 'hello');
    await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'å', code: 'KeyA', altKey: true, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'å', code: 'KeyA', altKey: true, bubbles: true })); });
    assert.equal(await page.evaluate(() => window.__stages().typing.text), 'å', 'Unreserved Option characters still type normally');
    await page.keyboard.press('Backspace');
    // Exit restores exactly, including the automatic optical values and pose.
    await page.getByRole('button', { name: 'Exit stages', exact: true }).click(); await settle(page);
    assert.equal(await page.evaluate(() => window.__stages().stage), null);
    assert.deepEqual(await page.evaluate(() => window.__lighting().values), tuned.lighting);
    assert.deepEqual(await page.evaluate(() => window.__camera()), tuned.camera);
    result.behaviour = { status: 'passed', hotkeysNeverTypeOrPress: true, optionCharactersPreserved: true, hiddenPanelHotkeys: true, labelToggle: true, introSkipsMat: timing, audioScheduled: { synth: 2, full: 3 }, terminalTyping: true, lightingCameraRestoreExact: true };
    // URL stage loads without opening or an explicit select/drag.
    await page.goto(`${url}/?stage=3`); await page.waitForFunction(() => window.__kb?.ready && window.__stages);
    await page.evaluate(() => window.__kb.finish()); await settle(page);
    assert.equal(await page.locator('.opening').count(), 0); assert.equal(await page.evaluate(() => window.__stages().stage), 3);
    assert.deepEqual(await page.evaluate(() => window.__stages().props), { mat: false, streamdeck: true, headphones: false, screen: true });
    result.url = { status: 'passed', stage: 3, openingSkipped: true };
  } finally { await context.close(); }
  // A single image with all seven stages, labels and the fixed camera.
  const sheet = await browser.newPage({ viewport: { width: 1920, height: 736 }, deviceScaleFactor: 1 });
  try {
    const images = await Promise.all(names.map((_, i) => readFile(`screenshots/stage-${i + 1}.png`).then(b => b.toString('base64'))));
    await sheet.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#141416;color:#eee;font:18px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px}figure{margin:0}img{display:block;width:100%}figcaption{padding:12px 8px}p{padding:30px;line-height:1.6;color:#bbb}</style>${images.map((b, i) => `<figure><img src="data:image/png;base64,${b}"><figcaption>${i + 1} — ${names[i]}</figcaption></figure>`).join('')}<p>Seven cumulative stages<br>Fixed hero pose • 50° through stage 4<br>80.343 mm + DoF from stage 5<br>Stage 6 adds sound; stage 7 adds film</p>`);
    await sheet.locator('img').last().waitFor(); await sheet.screenshot({ path: 'screenshots/stages-sheet.png', fullPage: true }); console.log('screenshots/stages-sheet.png');
  } finally { await sheet.close(); }
  return result;
}
