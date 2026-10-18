import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';

export function pixelDelta(aBuffer, bBuffer) {
  const a = PNG.sync.read(aBuffer), b = PNG.sync.read(bBuffer);
  let changed = 0, total = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(...[0, 1, 2].map(c => Math.abs(a.data[i + c] - b.data[i + c])));
    total += d; max = Math.max(max, d); if (d > 1) changed++;
  }
  return { changedPixels: changed, totalDelta: total, meanDelta: total / (a.width * a.height), maxDelta: max };
}

export async function filmChecks(browser, url, observeErrors) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage(); observeErrors(page);
  const frames = (count = 5) => page.evaluate(count => new Promise(resolve => { const tick = () => --count <= 0 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), count);
  const set = async values => { await page.evaluate(values => window.__lightingStore.set(values), values); await frames(); };
  const shot = async name => { await frames(); const buffer = await page.screenshot({ path: `screenshots/${name}.png` }); console.log(`screenshots/${name}.png`); return buffer; };
  try {
    await page.goto(`${url}/?capture=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__film && window.__headphones);
    await page.evaluate(() => { window.__kb.finish(); window.__screenControl.freezeCaret(true); });
    await frames(35);
    const defaults = await page.evaluate(() => window.__lighting().values);
    assert.equal(defaults.lights.monitor.intensity, 7.1); assert.equal(defaults.lights.monitor.color, '#8f77ff');
    assert.equal(defaults.lights.monitor.wallGlow.intensity, 27.2);
    assert.deepEqual(defaults.film, {
      toneMapping: 'ACES Filmic', exposure: 1,
      grade: { enabled: true, contrast: 1.11, saturation: 1, vibrance: 0.19, temperature: 0.28, tint: 0.22, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1] },
      vignette: { amount: 0.52, softness: 0.48 },
    });
    assert.deepEqual(defaults.dust, { enabled: true, count: 84, size: 0.71, intensity: 0.17, speed: 1.85, padding: 0.07 });
    const graph = await page.evaluate(() => window.__film());
    assert.equal(graph.rendererToneMapping, 0, 'Scene renderer stays linear while the composer is active');
    assert.equal(graph.toneMapStages, 1); assert.equal(graph.outputColorSpace, 'srgb');
    assert.deepEqual(Object.keys(graph.outputDefines).sort(), ['ACES_FILMIC_TONE_MAPPING', 'SRGB_TRANSFER']);
    assert.ok(graph.passes.findIndex(p => p.name === 'dustAfterDoF') > graph.passes.findIndex(p => p.name === 'depthOfField'));
    await page.evaluate(() => { document.querySelector('.variant-picker').style.visibility = 'hidden'; });
    assert.equal(graph.gradingActive, true, 'The user grade runs by default');
    const gradedDefault = await shot('grade-example');
    await set({ 'Film.toneOperator': 'Neutral', 'Film.gradeEnabled': false });
    assert.deepEqual(Object.keys((await page.evaluate(() => window.__film())).outputDefines).sort(), ['NEUTRAL_TONE_MAPPING', 'SRGB_TRANSFER']);
    const neutral = await shot('tonemap-neutral');
    await page.evaluate(() => window.__filmControl.referenceOutput(true));
    const reference = await page.screenshot();
    const identity = pixelDelta(neutral, reference);
    assert.ok(identity.maxDelta <= 1, `Neutral grade must match Three's official single OutputPass: ${JSON.stringify(identity)}`);
    await page.evaluate(() => window.__filmControl.referenceOutput(false));
    await frames();
    await set({ 'Film.toneOperator': 'ACES Filmic' });
    const acesBuffer = await shot('tonemap-aces');
    const aces = pixelDelta(acesBuffer, neutral);
    assert.ok(aces.changedPixels > 1000);
    const example = pixelDelta(gradedDefault, acesBuffer);
    assert.ok(example.changedPixels > 1000, 'The user grade must visibly change ACES output');
    await set({ 'Film.toneOperator': 'AgX' });
    const agx = pixelDelta(await shot('tonemap-agx'), neutral);
    assert.ok(agx.changedPixels > 1000);
    await set({ 'Film.toneOperator': 'ACES Filmic', 'Film.gradeEnabled': true });
    assert.deepEqual(await page.evaluate(() => window.__lighting().values.film), defaults.film, 'Restore the exact user grade for dust evidence');
    assert.equal(await page.evaluate(() => window.__camera().lens.depthOfField), true);
    const dustDefault = await shot('dust-default-dof');
    await set({ 'Dust.dustEnabled': false }); const dustOff = await page.screenshot();
    const defaultDelta = pixelDelta(dustDefault, dustOff);
    await set({ 'Dust.dustEnabled': true, 'Dust.dustIntensity': 12 });
    const maxDelta = pixelDelta(await shot('dust-max-dof'), dustOff);
    assert.ok(defaultDelta.changedPixels > 20 && defaultDelta.changedPixels < 3000, 'A few faint default motes must survive DoF');
    assert.ok(maxDelta.totalDelta > defaultDelta.totalDelta * 2 && maxDelta.changedPixels > defaultDelta.changedPixels, 'Max intensity must be visibly stronger than default');
    const dustState = await page.evaluate(() => { const d = window.__dust(); const points = d.evaluate(); return { insideCone: points.filter(p => p.insideCone).length, litInFrame: points.filter(p => p.luminance > 0 && Math.abs(p.ndc[0]) < 1 && Math.abs(p.ndc[1]) < 1).length, cap: d.uniforms.maxLuminance }; });
    const before = await readFile('screenshots/dust-diagnosis-before.json', 'utf8').then(JSON.parse).catch(() => null);
    await set({ 'Dust.dustIntensity': defaults.dust.intensity });
    // Reference-angle prop evidence; the keyboard focal plane is deliberately
    // disabled only for this geometric inspection of a different subject.
    await page.setViewportSize({ width: 900, height: 1200 });
    await frames(8); // CameraRig installs the portrait defaults on resize first.
    await page.evaluate(() => { window.__cameraStore.set({ depthOfField: false }); window.__kb.camera('props-airpods'); }); await frames(35);
    const clearance = await page.evaluate(() => window.__headphones());
    assert.ok(clearance.samples > 1000);
    assert.ok(clearance.canopyClearanceMm >= 0.5 && clearance.canopyClearanceMm < 2, `Canopy must rest just above the walnut: ${clearance.canopyClearanceMm} mm`);
    assert.ok(clearance.frameClearanceMm >= 0.5, `Steel rails must clear the entire bar: ${clearance.frameClearanceMm} mm`);
    await shot('headphones-fixed');
    return { status: 'passed', defaults: defaults.film, graph, neutralReference: identity, toneMaps: { aces, agx }, grade: { values: defaults.film, delta: example }, dust: { defaults: defaults.dust, before, defaultDelta, maxDelta, ...dustState, compositeAfterDoF: true }, headphones: clearance };
  } finally { await context.close(); }
}
