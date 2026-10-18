import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const patch = (png, uv) => {
  const x = Math.round(uv[0] * png.width), y = Math.round(uv[1] * png.height), rgb = [];
  for (let c = 0; c < 3; c++) {
    const values = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) values.push(png.data[((y + dy) * png.width + x + dx) * 4 + c]);
    rgb.push(values.sort((a, b) => a - b)[4]);
  }
  return rgb;
};

export async function wallChecks(browser, url, observeErrors) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage(); observeErrors(page);
  const frames = () => page.evaluate(() => new Promise(resolve => { let n = 8; const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }));
  const set = async values => { await page.evaluate(values => window.__lightingStore.set(values), values); await frames(); };
  const sample = (points, margin = 0) => page.evaluate(({ points, margin }) => window.__wall().samples(points, margin), { points, margin });
  const image = async () => PNG.sync.read(await page.screenshot());
  try {
    await page.goto(`${url}/?capture=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__wall && window.__cameraStore);
    await page.evaluate(() => { window.__kb.finish(); window.__screenControl.freezeCaret(true); }); await frames();
    const initial = await page.evaluate(() => { const { samples, ...state } = window.__wall(); return state; });
    assert.equal(initial.compiled, true); assert.equal(initial.enabled, true);
    assert.deepEqual(initial.radius, [1.6, 0.8]); assert.equal(initial.feather, 0.35);
    const center = await page.evaluate(() => window.__environment().lightformers['reflection-wall-glow'].position);
    assert.deepEqual(initial.center, center.slice(0, 2), 'Mask and rear-glow projection initialize at the same world point');

    // Compare the actual halo to the pre-mask material in the identical hero.
    // Disable decorative dust only for repeatable wall-pixel measurements.
    await set({ 'Dust.dustEnabled': false });
    const haloGrid = Array.from({ length: 51 }, (_, i) => i * 0.04 - 1)
      .flatMap(x => Array.from({ length: 40 }, (_, j) => [x, 0.52 + j * 0.03]));
    const haloSamples = (await sample(haloGrid)).filter(p => p.visible && p.weight === 1);
    const on = await image(); await set({ 'Wall.wallMaskEnabled': false }); const off = await image();
    const halo = haloSamples.map(p => ({ ...p, before: patch(off, p.uv), after: patch(on, p.uv) }))
      .filter(p => p.before[2] > p.before[0] + 5 && Math.max(...p.before) > 15);
    assert.ok(halo.length >= 8, `Measure visible purple halo pixels on the actual wall, clear of the monitor: ${halo.length}/${haloSamples.length}`);
    const haloMaxDelta = Math.max(...halo.flatMap(p => p.before.map((v, c) => Math.abs(v - p.after[c]))));
    assert.ok(haloMaxDelta <= 2, `The full-strength halo interior must remain unchanged: ${haloMaxDelta}/255`);
    await set({ 'Wall.wallMaskEnabled': true });

    const grid = Array.from({ length: 81 }, (_, i) => -6 + i * 0.15)
      .flatMap(x => Array.from({ length: 33 }, (_, j) => [x, 0.01 + j * 0.125]));
    const orbits = [];
    for (const view of ['wall-mask-right', 'wall-mask-left']) {
      await page.evaluate(view => window.__kb.camera(view), view); await frames();
      const camera = await page.evaluate(() => window.__camera());
      assert.ok(Math.abs(Math.abs(camera.azimuthDeg) - 1.15 * 180 / Math.PI) < 1e-6);
      assert.ok(Math.abs(camera.polarDeg - 1.38 * 180 / Math.PI) < 1e-6);
      const outside = (await sample(grid, 0.06)).filter(p => p.visible &&
        Math.hypot((p.world[0] - initial.center[0]) / initial.radius[0], (p.world[1] - initial.center[1]) / initial.radius[1]) > 1.15);
      assert.ok(outside.length >= 8, 'The extreme low-elevation orbit must expose the far wall');
      const radiance = await page.evaluate(points => window.__filmControl.measure(points.map((p, i) => ({ key: `wall:${i}`, x: p.uv[0], y: p.uv[1] }))), outside);
      const maxLinearRadiance = Math.max(...radiance.scene.filter(p => p.key.startsWith('wall:')).flatMap(p => p.rgb));
      assert.equal(maxLinearRadiance, 0, 'Outside wall radiance must be exactly zero before bloom, DoF and the display transform');
      const rightOn = await image(); await set({ 'Wall.wallMaskEnabled': false }); const rightOff = await image();
      const points = outside.map(p => ({ ...p, before: patch(rightOff, p.uv), after: patch(rightOn, p.uv) }));
      const maxOutsideChannel = Math.max(...points.flatMap(p => p.after));
      assert.ok(maxOutsideChannel <= 3, `Far wall must be black with all direct lights and IBL active: ${maxOutsideChannel}/255, ${view}`);
      orbits.push({ view, camera, samples: points.length, maxLinearRadiance, maxChannel: maxOutsideChannel, unmaskedMaxChannel: Math.max(...points.flatMap(p => p.before)), originalSpillSamples: points.filter(p => Math.max(...p.before) > 10).length });
      await set({ 'Wall.wallMaskEnabled': true });
    }
    assert.ok(orbits.some(o => o.originalSpillSamples >= 8), 'Unmasked positive control must reveal the original fill/IBL spill');
    await set({ 'Wall.wallMaskEnabled': true, 'Dust.dustEnabled': true });
    // Negative azimuth exposes the far-right wall in the user's reference;
    // both orbit limits are checked above, including the positive maximum.
    await page.evaluate(() => window.__cameraStore.set({ focalLengthMm: 80.343 })); await frames();
    await page.screenshot({ path: 'screenshots/wall-mask-right.png' }); console.log('screenshots/wall-mask-right.png');

    // The entire physical lower edge is outside the ellipse, independently of
    // camera direction. Its radiance is zero, rather than a finite paint edge.
    const bottom = await sample(Array.from({ length: 81 }, (_, i) => [-6 + i * 0.15, 0]));
    assert.ok(initial.center[1] - initial.radius[1] > 0.2);
    assert.ok(bottom.every(p => p.weight === 0), 'Every point along the 12 m bottom edge must receive exactly zero radiance');

    const monitor = await page.evaluate(() => window.__layout().values.monitor);
    await page.evaluate(pose => window.__layoutStore.set('monitor', { ...pose, x: 0.15, z: -0.36, rotationY: 12 }), monitor);
    await frames();
    const moved = await page.evaluate(() => ({ mask: window.__wall().center, reflection: window.__environment().lightformers['reflection-wall-glow'].position }));
    assert.notDeepEqual(moved.mask, initial.center);
    assert.deepEqual(moved.mask, moved.reflection.slice(0, 2), 'Mask follows the live monitor gizmo, including its yaw projection');
    await page.evaluate(pose => window.__layoutStore.set('monitor', pose), monitor); await frames();
    return { status: 'passed', defaults: { enabled: initial.enabled, radiusX: initial.radius[0], radiusY: initial.radius[1], feather: initial.feather },
      center: initial.center, orbits, halo: { samples: halo.length, maxDelta: haloMaxDelta },
      bottom: { samples: bottom.length, maxWeight: 0, supportMinimumY: initial.center[1] - initial.radius[1] }, moved };
  } finally { await context.close(); }
}
