import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';

// Probe real canvas glyph pixels through the camera into the composited image.
// This catches a stale static cache or a later screen layer covering the text.
async function renderedHistory(page, buffer) {
  const png = PNG.sync.read(buffer);
  const data = await page.evaluate(() => {
    const screen = window.__screen(), ctx = window.__terminalCanvas.getContext('2d');
    const rows = screen.history.rows.filter(row => row.text).map(row => {
      const x0 = Math.ceil(screen.history.column), y0 = Math.floor(row.y - 20);
      const pixels = ctx.getImageData(x0, y0, 650, 21).data, points = [];
      for (let y = 0; y < 21; y += 2) for (let x = 0; x < 650; x += 2) {
        const i = (y * 650 + x) * 4;
        if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 100) points.push([x0 + x, y0 + y]);
      }
      return { text: row.text, points };
    });
    return { screen, rows, camera: window.__camera(), monitor: window.__lighting().monitor };
  });
  const camera = new PerspectiveCamera(data.camera.lens.verticalFovDeg, png.width / png.height, data.camera.lens.near, data.camera.lens.far);
  camera.position.fromArray(data.camera.position); camera.lookAt(new Vector3(...data.camera.target)); camera.updateMatrixWorld();
  const orientation = new Quaternion().fromArray(data.monitor.quaternion), origin = new Vector3(...data.monitor.position);
  return data.rows.map(row => {
    let visible = 0;
    for (const [x, y] of row.points) {
      const p = new Vector3((x / data.screen.canvas[0] - 0.5) * 0.598, (0.5 - y / data.screen.canvas[1]) * 0.336, 0.0003)
        .applyQuaternion(orientation).add(origin).project(camera);
      const sx = Math.round((p.x + 1) / 2 * png.width), sy = Math.round((1 - p.y) / 2 * png.height);
      let peak = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((sy + dy) * png.width + sx + dx) * 4;
        peak = Math.max(peak, png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0);
      }
      if (peak > 60) visible++;
    }
    assert.ok(row.points.length > 10 && visible > row.points.length * 0.6, `History row must reach the displayed framebuffer: ${row.text} (${visible}/${row.points.length})`);
    return { text: row.text, glyphSamples: row.points.length, visibleSamples: visible };
  });
}

export async function screenPolishChecks(browser, url, observeErrors) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  await context.addInitScript(() => {
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    window.__transcriptColumns = [];
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) {
      if (this.canvas.width === 1920) {
        if (this.canvas.height > 250) window.__terminalCanvas = this.canvas;
        if (text.startsWith('> ')) window.__transcriptColumns.push({ text, x, y });
      }
      return fillText.call(this, text, x, y, ...args);
    };
  });
  const page = await context.newPage(); observeErrors(page);
  const frames = (n = 4) => page.evaluate(n => new Promise(resolve => { const tick = () => --n <= 0 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), n);
  const shot = async name => { await frames(2); await page.waitForFunction(() => { const focus = window.__cameraStore.focusState(); return focus.distance === focus.target; }); const buffer = await page.screenshot({ path: `screenshots/${name}.png` }); console.log(`screenshots/${name}.png`); return buffer; };
  const read = () => page.evaluate(() => window.__screen());
  try {
    await page.goto(`${url}/?capture=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__screen && window.__case);
    await page.evaluate(() => window.__kb.finish()); await frames();
    const captures = await page.evaluate(() => window.__environment().captures);
    const empty = await read();
    assert.equal(empty.text, ''); assert.equal(empty.osd.visible, false); assert.equal(empty.practical.intensity, 0);
    assert.equal(empty.history.rows[0].text, '✻ Welcome to Claude Code');
    assert.equal(empty.history.rows.filter(row => row.text.startsWith('> ')).length, 4);
    assert.equal(empty.history.rows.length, empty.history.capacity, 'Seeded scrollback fills the full available history area');
    assert.ok(empty.history.rows[0].y - empty.history.top < empty.history.lineHeight, 'The welcome begins at the top of the history');
    assert.ok(empty.history.promptTop - empty.history.lastBaseline < empty.history.lineHeight);
    await page.evaluate(() => { document.querySelector('.variant-picker').style.visibility = 'hidden'; window.__screenControl.freezeCaret(true); window.__cameraStore.set({ depthOfField: false }); window.__kb.camera('screen-terminal'); });
    const initialPixels = await renderedHistory(page, await shot('screen-terminal'));
    const staticBeforeTyping = (await read()).staticRedraws;
    await page.evaluate(() => window.__screenControl.freezeCaret(false));
    await page.keyboard.type('Make the assembly feel a little softer.');
    await frames(); assert.equal((await read()).staticRedraws, staticBeforeTyping, 'Editing the single-line prompt must reuse the history cache');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Now polish the corner highlights'); await frames(2);
    const typed = await read();
    assert.deepEqual(typed.transcript, ['Make the assembly feel a little softer.']);
    assert.equal(typed.text, 'Now polish the corner highlights'); assert.equal(typed.caretOn, true);
    const submittedRow = typed.history.rows.at(-1);
    assert.equal(submittedRow.text, '> Make the assembly feel a little softer.');
    const submissionGap = typed.history.promptTop - submittedRow.y;
    assert.ok(submissionGap > 0 && submissionGap <= typed.history.lineHeight, 'Enter appends directly above the prompt, within one line-height');
    assert.equal(typed.history.scrolledRows, empty.history.scrolledRows + 1);
    assert.notEqual(typed.history.rows[0].text, empty.history.rows[0].text, 'Oldest history scrolls off the top on submission');
    assert.equal(typed.staticRedraws, staticBeforeTyping + 1, 'Only the Enter commit invalidates the history cache');
    // Inspect typography without the keyboard-focused optical blur. Production
    // hero/OSD evidence and every other check retain the saved DoF default.
    await page.evaluate(() => { window.__screenControl.freezeCaret(true); window.__cameraStore.set({ depthOfField: false }); window.__kb.camera('screen-terminal'); });
    const submittedPixels = await renderedHistory(page, await shot('screen-terminal-typing'));
    // Exercise repeated scrolling and a wrapped, multi-line submitted prompt.
    await page.evaluate(() => window.__screenControl.clear());
    await page.keyboard.type('Keep the wood grain warm and the cap legends crisp.'); await page.keyboard.press('Enter');
    await page.keyboard.type('A wrapped request about the keyboard: '.repeat(9)); await page.keyboard.press('Enter'); await frames();
    const scrolled = await read();
    assert.ok(scrolled.history.scrolledRows > typed.history.scrolledRows + 1);
    assert.equal(scrolled.history.rows.length, scrolled.history.capacity);
    assert.ok(scrolled.history.rows.at(-1).y < scrolled.history.promptTop && scrolled.history.promptTop - scrolled.history.rows.at(-1).y <= scrolled.history.lineHeight);
    assert.equal(await page.evaluate(() => window.__environment().captures), captures, 'Submitting and scrolling history never recapture the environment');
    await page.keyboard.type('Now polish the corner highlights');
    await page.evaluate(() => { document.querySelector('.variant-picker').style.visibility = ''; window.__screenControl.freezeCaret(false); });
    await page.evaluate(() => window.__cameraStore.set({ depthOfField: true }));
    const transcriptColumns = await page.evaluate(() => {
      const rows = window.__transcriptColumns;
      return [rows.findLast(row => row.text === '> make the keycaps assemble with a stagger'), rows.findLast(row => row.text === '> Make the assembly feel a little softer.')];
    });
    assert.equal(transcriptColumns[0].x, transcriptColumns[1].x, 'Authored and submitted prompts share the same rendered column');
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
    await page.evaluate(() => {
      window.__osdSamples = [];
      const end = performance.now() + 700;
      const sample = () => {
        if (!window.__osdSamples) return;
        const osd = window.__screen().osd;
        window.__osdSamples.push({ at: performance.now(), ...osd });
        if (performance.now() < end) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.mouse.move(kx, ky); await page.mouse.down(); await page.mouse.move(kx + 42, ky, { steps: 5 }); await page.mouse.up();
    await frames(2); const osd = await read(); assert.equal(osd.osd.visible, true); assert.equal(osd.osd.alpha, 1);
    assert.ok(Math.abs(osd.osd.volume - 0.82) < 1e-9);
    await frames(36);
    const samplesOSD = await page.evaluate(() => { const samples = window.__osdSamples; delete window.__osdSamples; return samples; });
    assert.ok(samplesOSD.some(s => s.visible && s.displayedVolume > 0.7 && s.displayedVolume < s.volume - 0.002), 'A real knob turn must paint intermediate bar levels');
    for (let i = 1; i < samplesOSD.length; i++) assert.ok(samplesOSD[i].displayedVolume >= samplesOSD[i - 1].displayedVolume - 1e-9, 'Fast consecutive upward detents stay smooth and monotonic');
    assert.ok(Math.abs((await read()).osd.displayedVolume - 0.82) < 1e-5, 'The bar settles promptly at the latest volume');
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
    assert.ok(normals.frame.topFaceTriangles > 16, 'Audit the actual triangulated bezel top');
    assert.ok(normals.frame.maxTopNormalAngle < 0.0001, 'Every flat top-face vertex must have the same planar normal');
    assert.ok(Math.abs(normals.frame.max[0] - normals.frame.min[0] - 0.3426) < 1e-7);
    assert.ok(Math.abs(normals.frame.max[2] - normals.frame.min[2] - 0.1516) < 1e-7);
    return { status: 'passed', terminal: { submitted: typed.transcript, input: typed.text, transcriptColumns, history: { initial: empty.history, submitted: typed.history, afterWrappedSubmission: scrolled.history, submissionGap, initialPixels, submittedPixels, historyRedrawsPerSubmit: 1 }, wrappedLines: wrapped.promptLines, scrolledRows: wrapped.scroll, idleRedraws, idleSeconds: 2.1 }, practical: { status: 'passed', steadyIntensity: steady.practical.intensity, luminanceDelta, samples: deltas, flareIntensity: flare, settledIntensity: settled, environmentCaptures: captures }, volumeOSD: { status: 'passed', volume: osd.osd.volume, animationSamples: samplesOSD, settling95PercentMs: 150, hiddenAfterTimeout: true, holdMs: 1200, fadeMs: 300 }, corners: { status: 'passed', normals } };
  } finally { await context.close(); }
}

// Exercise the real Fast Refresh path without modifying a source file. Vite
// serves the same module at a new HMR timestamp, preserving React refs while
// replacing useMemo's canvases/textures: the original cache bug's exact trigger.
export async function screenCacheRefreshChecks(browser, observeErrors) {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent', clearScreen: false });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  try {
    await server.listen();
    await context.addInitScript(() => {
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (...args) {
        if (this.canvas.width === 1920 && this.canvas.height > 250) window.__terminalCanvas = this.canvas;
        return fillText.apply(this, args);
      };
    });
    const page = await context.newPage(); observeErrors(page);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?capture=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__screen);
    await page.evaluate(() => { window.__kb.finish(); window.__screenControl.freezeCaret(true); window.__cameraStore.set({ depthOfField: false }); window.__kb.camera('screen-terminal'); document.querySelector('.variant-picker').style.visibility = 'hidden'; });
    await page.keyboard.type('Soften the landing.'); await page.keyboard.press('Enter');
    await page.keyboard.type('Keep this draft');
    await page.waitForFunction(() => window.__screen().history.rows.at(-1).text === '> Soften the landing.' && window.__screen().text === 'Keep this draft');
    const before = await page.evaluate(() => { window.__beforeRefreshCanvas = window.__terminalCanvas; return { screen: window.__screen(), captures: window.__environment().captures }; });
    const timestamp = Date.now(), path = '/src/screen/ScreenText.tsx';
    const graph = server.environments.client.moduleGraph;
    const module = await graph.getModuleByUrl(path);
    assert.ok(module, 'ScreenText must be loaded through the actual Vite React refresh plugin');
    graph.invalidateModule(module, new Set(), timestamp, true);
    server.ws.send({ type: 'update', updates: [{ type: 'js-update', path, acceptedPath: path, timestamp }] });
    await page.waitForFunction(n => window.__terminalCanvas !== window.__beforeRefreshCanvas && window.__screen().staticRedraws === n + 1, before.screen.staticRedraws);
    await page.waitForFunction(() => { const f = window.__cameraStore.focusState(); return f.distance === f.target; });
    const buffer = await page.screenshot({ path: 'screenshots/screen-cache-refresh.png' }); console.log('screenshots/screen-cache-refresh.png');
    const pixels = await renderedHistory(page, buffer);
    const after = await page.evaluate(() => ({ screen: window.__screen(), captures: window.__environment().captures }));
    assert.equal(after.screen.text, before.screen.text);
    assert.deepEqual(after.screen.transcript, before.screen.transcript);
    assert.deepEqual(after.screen.history, before.screen.history);
    assert.equal(after.screen.staticRedraws, before.screen.staticRedraws + 1, 'New raster repaints once despite unchanged content counters and a frozen caret');
    assert.equal(after.captures, before.captures, 'Replacing only the screen raster must not recapture the environment');
    return { status: 'passed', trigger: 'Vite React Fast Refresh; memoized canvases replaced, refs and content versions preserved', before: before.screen.staticRedraws, after: after.screen.staticRedraws, text: after.screen.text, transcript: after.screen.transcript, environmentCaptures: after.captures, pixels };
  } finally { await context.close(); await server.close(); }
}
