import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

export async function screenPolishChecks(browser, url, observeErrors) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage(); observeErrors(page);
  const frames = (n = 4) => page.evaluate(n => new Promise(resolve => { const tick = () => --n <= 0 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), n);
  const shot = async name => { await frames(2); const buffer = await page.screenshot({ path: `screenshots/${name}.png` }); console.log(`screenshots/${name}.png`); return buffer; };
  const read = () => page.evaluate(() => window.__screen());
  try {
    await page.goto(`${url}/?capture=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__screen && window.__case);
    await page.evaluate(() => window.__kb.finish()); await frames();
    const captures = await page.evaluate(() => window.__environment().captures);
    const empty = await read();
    assert.equal(empty.text, ''); assert.equal(empty.osd.visible, false); assert.equal(empty.practical.intensity, 0);
    await shot('screen-terminal');
    await page.keyboard.type('Make the assembly feel a little softer.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Now polish the corner highlights'); await frames(2);
    const typed = await read();
    assert.deepEqual(typed.transcript, ['Make the assembly feel a little softer.']);
    assert.equal(typed.text, 'Now polish the corner highlights'); assert.equal(typed.caretOn, true);
    await page.evaluate(() => { window.__screenControl.freezeCaret(true); window.__kb.camera('screen-terminal'); });
    await shot('screen-terminal-typing');
    await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
    await page.keyboard.type('Keep the groove crisp.'); await frames();
    assert.equal((await read()).text, 'Now polish the corner highlights\nKeep the groove crisp.');
    assert.equal((await read()).promptLines, 2);
    await page.keyboard.press('Backspace'); await page.keyboard.press('ArrowLeft'); await page.keyboard.type('!');
    assert.ok((await read()).text.endsWith('cris!p'), 'Backspace and caret edits stay inside the input');
    await page.evaluate(() => window.__screenControl.clear());
    await page.keyboard.type('A long input wraps and scrolls inside the prompt, without covering the session header. '.repeat(5)); await frames();
    const wrapped = await read(); assert.equal(wrapped.promptLines, 3); assert.ok(wrapped.scroll > 0); assert.equal(wrapped.lines.length, 3);
    await page.keyboard.press('Home'); await frames(); assert.equal((await read()).caret, 0);
    await page.evaluate(() => window.__screenControl.clear());
    await page.keyboard.type('Shape the keycap highlights with a gentle cool-white screen glow.');
    await frames(18); // Let the 150 ms keystroke flare settle for the A/B pair.
    await page.evaluate(() => window.__kb.camera('lighting-closeup')); await frames();
    const samples = await page.evaluate(() => window.__kb.inspect().lightSamples);
    const steady = await read(); assert.ok(steady.practical.intensity > 0);
    const on = PNG.sync.read(await shot('typed-light-on'));
    await page.evaluate(() => window.__lightingStore.set({ 'Screen.textLightEnabled': false })); await frames();
    assert.equal((await read()).practical.intensity, 0);
    const off = PNG.sync.read(await shot('typed-light-off'));
    const deltas = samples.map(point => {
      assert.ok(point.x > 0 && point.x < 1 && point.y > 0 && point.y < 1);
      const x = Math.round(point.x * on.width), y = Math.round(point.y * on.height); let delta = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const i = ((y + dy) * on.width + x + dx) * 4;
        delta += [0.2126, 0.7152, 0.0722].reduce((sum, w, c) => sum + w * (on.data[i + c] - off.data[i + c]), 0) / 49;
      }
      return { key: point.key, pixel: [x, y], luminanceDelta: delta };
    });
    const luminanceDelta = deltas.reduce((sum, point) => sum + point.luminanceDelta, 0) / deltas.length;
    assert.ok(luminanceDelta > 0.015 && luminanceDelta < 5, `Prompt light must be subtle but non-zero: ${luminanceDelta}`);
    await page.evaluate(() => window.__lightingStore.set({ 'Screen.textLightEnabled': true })); await frames();
    await page.keyboard.type('x'); await frames(1); const flare = (await read()).practical.intensity;
    await frames(18); const settled = (await read()).practical.intensity;
    assert.ok(flare > settled + 0.03, 'A tiny keystroke flare decays in about 150 ms');
    assert.equal(await page.evaluate(() => window.__environment().captures), captures, 'Typing and practical controls never recapture the environment');
    assert.deepEqual(await page.evaluate(() => window.__lighting().values.screen), { textLightEnabled: true, textIntensity: 12, textFlare: 0.32 });

    // Drive the real knob; the OSD follows the shared master store, not a
    // duplicated volume value or the old DOM indicator.
    await page.evaluate(() => window.__kb.camera('closeup')); await frames();
    const kp = await page.evaluate(() => window.__interaction.knobPoint());
    const [kx, ky] = [kp.x * 1600, kp.y * 1000];
    await page.mouse.move(kx, ky); await page.mouse.down(); await page.mouse.move(kx + 42, ky, { steps: 5 }); await page.mouse.up();
    await frames(2); const osd = await read(); assert.equal(osd.osd.visible, true); assert.equal(osd.osd.alpha, 1);
    assert.ok(Math.abs(osd.osd.volume - 0.82) < 1e-9);
    assert.equal(await page.locator('.sound-level').count(), 0);
    await page.evaluate(() => window.__kb.camera('default')); await shot('screen-volume-osd');
    await page.waitForFunction(() => !window.__screen().osd.visible, null, { timeout: 3000 });
    assert.equal((await read()).osd.alpha, 0);
    assert.equal(await page.evaluate(() => window.__environment().captures), captures);
    await page.evaluate(() => window.__screenControl.freezeCaret(false));
    const beforeIdle = (await read()).redraws, staticBeforeIdle = (await read()).staticRedraws; await page.waitForTimeout(2100);
    const idleRedraws = (await read()).redraws - beforeIdle; assert.ok(idleRedraws <= 5, 'Idle still redraws <=2/s');
    assert.equal((await read()).staticRedraws, staticBeforeIdle, 'Caret ticks never repaint/upload the full LCD');
    assert.ok((await read()).dynamicCanvas[1] < 250, 'Live pixels stay in a narrow footer texture');

    await page.evaluate(() => window.__kb.camera('case-corner')); await frames();
    await shot('case-corner');
    const normals = await page.evaluate(() => window.__case());
    for (const [name, audit] of Object.entries(normals)) {
      assert.ok(audit.adjacentPairs > 64, `${name}: audit real adjacent curved triangles`);
      assert.ok(audit.maxFaceAngle < 5, `${name}: adjacent corner faces must differ by only a few degrees`);
      assert.ok(audit.maxNormalSeam < 0.1, `${name}: no normal discontinuity at shared curved positions`);
    }
    assert.ok(Math.abs(normals.body.max[0] - normals.body.min[0] - 0.344) < 1e-7);
    assert.ok(Math.abs(normals.body.max[2] - normals.body.min[2] - 0.153) < 1e-7);
    return { status: 'passed', terminal: { submitted: typed.transcript, input: typed.text, wrappedLines: wrapped.promptLines, scrolledRows: wrapped.scroll, idleRedraws, idleSeconds: 2.1 }, practical: { status: 'passed', steadyIntensity: steady.practical.intensity, luminanceDelta, samples: deltas, flareIntensity: flare, settledIntensity: settled, environmentCaptures: captures }, volumeOSD: { status: 'passed', volume: osd.osd.volume, hiddenAfterTimeout: true, holdMs: 1200, fadeMs: 300 }, corners: { status: 'passed', normals } };
  } finally { await context.close(); }
}
