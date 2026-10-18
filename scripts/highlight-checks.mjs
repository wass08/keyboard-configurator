import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { measureCapColors } from './color-fidelity.mjs';

const hotspotKeys = ['esc', 'f1', 'f2', 'f3', 'f4', 'num1', 'num2', 'num3', 'num4', 'Q', 'W', 'E', 'A', 'S'];
const whiteKeys = hotspotKeys.filter(k => k !== 'esc');
const maxHue = result => Math.max(...result.samples.filter(s => s.colored).map(s => s.hueDeltaDegrees));
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function hull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = values => { const out = []; for (const p of values) { while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p); } return out.slice(0, -1); };
  return [...half(sorted), ...half(sorted.reverse())];
}
/** Only pixels inside the projected top face; exclude the surrounding well,
 * side walls and other caps when checking white clipping and legend contrast. */
function inspectFaces(buffer, points) {
  const png = PNG.sync.read(buffer), results = {};
  for (const key of whiteKeys) {
    const polygon = hull(points.filter(p => p.key === key).map(p => ({ x: p.x * png.width, y: p.y * png.height })));
    if (!polygon.length) continue;
    let maxChannel = 0, litPixels = 0, minLit = 255, maxLit = 0;
    const values = [], litValues = [];
    for (let y = Math.ceil(Math.min(...polygon.map(p => p.y))); y <= Math.floor(Math.max(...polygon.map(p => p.y))); y++)
      for (let x = Math.ceil(Math.min(...polygon.map(p => p.x))); x <= Math.floor(Math.max(...polygon.map(p => p.x))); x++) {
        if (!polygon.every((p, i) => cross(p, polygon[(i + 1) % polygon.length], { x: x + 0.5, y: y + 0.5 }) >= 0)) continue;
        const i = (y * png.width + x) * 4, rgb = [0, 1, 2].map(c => png.data[i + c]);
        maxChannel = Math.max(maxChannel, ...rgb);
        const value = (rgb[0] + rgb[1] + rgb[2]) / 3;
        values.push(value);
        if (value > 175) { litValues.push(value); litPixels++; minLit = Math.min(minLit, value); maxLit = Math.max(maxLit, value); }
      }
    const paper = litValues.sort((a, b) => a - b)[Math.floor(litValues.length / 2)];
    results[key] = { maxChannel, legendPixels: values.filter(v => v < paper - 35).length, legendContrast: paper - Math.min(...values), litPixels, shadingRange: maxLit - minLit };
  }
  return results;
}

export async function highlightChecks(browser, url, observeErrors, palettes) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage(); observeErrors(page);
  const frames = (n = 8) => page.evaluate(n => new Promise(resolve => { const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }), n);
  const set = async values => { await page.evaluate(v => window.__lightingStore.set(v), values); await frames(); };
  const change = async id => { await page.evaluate(id => window.__kb.setVariant(id), id); await frames(2); await page.evaluate(() => window.__kb.finish()); await frames(35); };
  const capture = () => page.evaluate(async hotspotKeys => {
    const targets = await window.__filmControl.measure(window.__kb.capFaceSamples());
    const peak = samples => { const p = samples.reduce((a, b) => a.luminance > b.luminance ? a : b); return { luminance: p.luminance, key: p.key, rgb: p.rgb }; };
    return Object.fromEntries(Object.entries(targets).map(([stage, samples]) => [stage, {
      allCaps: peak(samples.filter(p => !p.key.startsWith('source:'))),
      hotspot: peak(samples.filter(p => hotspotKeys.includes(p.key))),
      emissive: peak(samples.filter(p => p.key.startsWith('source:'))),
    }]));
  }, hotspotKeys);
  try {
    await page.goto(`${url}/?capture=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__filmControl);
    await page.evaluate(() => { window.__kb.finish(); window.__screenControl.freezeCaret(true); document.querySelector('.variant-picker').style.visibility = 'hidden'; });
    await frames(40);
    const defaults = await page.evaluate(() => window.__lighting().values);
    const fullRig = {}, buffers = {};
    let displayFaces, invariance;
    for (const id of Object.keys(palettes)) {
      await change(id);
      const buffer = await page.screenshot();
      const points = await page.evaluate(() => window.__kb.inspect().colorSamples);
      const measured = measureCapColors(buffer, points, palettes[id]);
      fullRig[id] = { status: 'measured', maxColoredHueDegrees: maxHue(measured), samples: measured.samples.map(({ status, ...sample }) => sample) };
      buffers[id] = await capture();
      const measuredScene = buffers[id].scene.allCaps.luminance;
      assert.ok(defaults.streamDeck.bloomThreshold > measuredScene * 1.15 && defaults.film.anamorphic.threshold > measuredScene * 1.15, 'Thresholds must exceed the brightest sampled cap top, including a safety margin');
      assert.equal(buffers[id].bloomSeed.allCaps.luminance, 0, 'No cap top can seed bloom');
      assert.equal(buffers[id].anamorphicSeed.allCaps.luminance, 0, 'No cap top can seed a streak');
      assert.ok(buffers[id].bloomHalo.hotspot.luminance < 0.001, 'Bloom buffer must be approximately black over the hotspot caps');
      assert.ok(buffers[id].anamorphicStreaks.hotspot.luminance < 0.001, 'Streak buffer must be approximately black over the hotspot caps');
      assert.ok(buffers[id].bloomSeed.emissive.luminance > 0.1 && buffers[id].anamorphicSeed.emissive.luminance > 0.01, 'LCDs must still seed both effects');
      if (id === 'glacial-blue') {
        displayFaces = inspectFaces(buffer, await page.evaluate(() => window.__kb.capFaceSamples()));
        assert.ok(Math.max(...Object.values(displayFaces).map(p => p.maxChannel)) < 250, 'Brightest white cap faces must remain below 250/255');
        for (const key of ['f1', 'f2', 'f3', 'f4']) {
          assert.ok(displayFaces[key].legendPixels > 2, `${key}: dark legends must remain readable: ${JSON.stringify(displayFaces[key])}`);
          assert.ok(displayFaces[key].shadingRange > 5 && displayFaces[key].litPixels > 20, `${key}: preserve visible surface gradation`);
        }
        await set({ 'Film.exposure': 0.65, 'Film.toneOperator': 'AgX' });
        const changedOutput = await capture();
        assert.deepEqual(changedOutput.scene, buffers[id].scene, 'Exposure/operator must not affect scene-referred radiance');
        assert.deepEqual(changedOutput.bloomSeed, buffers[id].bloomSeed);
        assert.deepEqual(changedOutput.anamorphicSeed, buffers[id].anamorphicSeed);
        invariance = { status: 'passed', exposure: 0.65, operator: 'AgX' };
        await set({ 'Film.exposure': 1, 'Film.toneOperator': 'Neutral' });
      }
    }
    // Isolate the key's direct illumination while retaining the neutral studio
    // reflection cards/HDRI. No colored fill, rim, wall, text light or deck spill.
    await set({ 'Monitor · rim.rimIntensity': 0, 'Monitor · rim.wallGlow': 0, 'Fill · area.fillIntensity': 0, 'Screen.textLightEnabled': false, 'Stream Deck.deckSpill': 0 });
    const keyLightColorFidelity = {};
    for (const id of Object.keys(palettes)) {
      await change(id);
      const buffer = await page.screenshot({ path: `screenshots/color-key-only-${id}.png` });
      // Approximately five degrees; a half-degree allowance covers 8-bit
      // quantization of dark caps (one channel step can move hue by 2–3°).
      const measured = measureCapColors(buffer, await page.evaluate(() => window.__kb.inspect().colorSamples), palettes[id], 5.5);
      assert.equal(measured.status, 'passed', `${id}: isolated key hue/saturation (max ${maxHue(measured)}°)`);
      keyLightColorFidelity[id] = { ...measured, lighting: 'Key softbox + shadow spot; neutral IBL retained; other direct lights off', maxColoredHueDegrees: maxHue(measured) };
    }
    return { status: 'passed', thresholdSpace: 'scene-linear, before bloom/DoF/tone mapping', thresholds: { bloom: defaults.streamDeck.bloomThreshold, anamorphic: defaults.film.anamorphic.threshold }, buffers, displayFaces, invariance, fullRig, keyLightColorFidelity };
  } finally { await context.close(); }
}
