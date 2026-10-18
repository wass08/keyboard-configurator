// Opening screen ("Hear it before you build it.") and the intro gate.
// These pages load without ?capture: the opening screen is the real first view.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const designFile = fileURLToPath(new URL('../references/opening-screen/index.html', import.meta.url));

// Count real AudioContext constructions (as interactionChecks does).
const audioProbe = () => {
  const Native = window.AudioContext; let contexts = 0;
  window.AudioContext = class extends Native { constructor(...args) { super(...args); contexts++; } };
  window.__audioProbe = () => ({ contexts });
};
const frames = (page, count = 4) => page.evaluate(count => new Promise(resolve => { const tick = () => --count <= 0 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), count);
const state = page => page.evaluate(() => {
  const intro = window.__kb.inspect().intro, sfx = window.__sfx(), active = document.activeElement;
  return {
    opening: window.__opening?.() ?? null, dataOpening: document.documentElement.dataset.opening ?? null,
    gateInDom: Boolean(document.querySelector('.opening')), hudInert: document.querySelector('.hud').inert,
    pickerOpacity: Number(getComputedStyle(document.querySelector('.variant-picker')).opacity),
    introPhase: window.__kb.introPhase, mat: intro.mat.progress, frameVisible: intro.frameVisible, keysVisible: intro.keysVisible,
    unlocked: sfx.unlocked, audioState: sfx.state, contexts: window.__audioProbe().contexts, enabled: sfx.enabled, thuds: sfx.byName.thud ?? 0,
    active: active === document.body ? 'body' : `${active.tagName.toLowerCase()}${active.className ? `.${String(active.className).split(' ')[0]}` : ''}`,
    activeName: active.getAttribute('aria-label') ?? active.textContent.trim().slice(0, 40),
  };
});
const waitIntroDone = page => page.waitForFunction(() => window.__kb.finished && window.__kb.introPhase === 'done', null, { timeout: 30000 });
const waitLive = page => page.waitForFunction(() => window.__opening().phase === 'live' && !document.querySelector('.opening') && getComputedStyle(document.querySelector('.variant-picker')).opacity === '1', null, { timeout: 15000 });

function assertGated(s, label) {
  assert.equal(s.opening.gateOpen, false, `${label}: the intro gate is closed`);
  assert.equal(s.introPhase, 'hold', `${label}: the intro must not start behind the opening screen`);
  assert.equal(s.mat, 0, `${label}: the mat is still rolled`); assert.equal(s.frameVisible, false); assert.equal(s.keysVisible, false);
  assert.equal(s.hudInert, true, `${label}: studio controls are inert behind the opening screen`);
  assert.equal(s.pickerOpacity, 0);
}
function assertLive(s, label) {
  assert.equal(s.gateInDom, false, `${label}: the opening screen leaves the DOM`); assert.equal(s.dataOpening, null);
  assert.equal(s.hudInert, false); assert.equal(s.pickerOpacity, 1);
  assert.equal(s.active, 'main', `${label}: focus moves to the studio`);
}

export async function openingChecks(browser, url, observeErrors) {
  const result = {};

  // 0. The design itself, rendered statically (its script is not executed) at the same viewport.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`file://${designFile}`);
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/design-reference.png' }); console.log('screenshots/design-reference.png');
    await context.close();
  }

  // 1. Desktop, pointer: visible on load, real progress, gated intro, CTA enters + unlocks audio.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await context.addInitScript(audioProbe);
    const page = await context.newPage(); observeErrors(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__opening && window.__kb);
    const onLoad = await state(page);
    assert.ok(['loading', 'ready'].includes(onLoad.opening.phase));
    assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Hear it before you build it.');
    const cta = page.getByRole('button', { name: 'Configure my keyboard', exact: true });
    assert.ok(await cta.isVisible(), 'Opening screen and its keycap CTA are visible on load');
    assert.equal(onLoad.active, 'button.cap', 'The keycap CTA has focus on load');
    assert.equal(onLoad.unlocked, false); assert.equal(onLoad.contexts, 0, 'No AudioContext before a gesture');
    const progress = [];
    while (!(await page.evaluate(() => window.__opening().sceneReady))) { progress.push(await page.evaluate(() => window.__opening().progress)); await page.waitForTimeout(150); }
    assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]), 'Loading progress is monotonic');
    await page.waitForFunction(() => window.__opening().phase === 'ready' && window.__opening().progress === 100);
    assert.equal(await page.locator('#opening-status').textContent(), 'Scene ready');
    // Held: the scene is ready, but the intro waits for the visitor.
    await page.waitForTimeout(1500); await frames(page);
    const held = await state(page); assertGated(held, 'ready, not entered');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: 'screenshots/opening-screen.png' }); console.log('screenshots/opening-screen.png');
    await cta.click();
    const clicked = await state(page);
    assert.equal(clicked.unlocked, true, 'The CTA click is the audio-unlocking gesture'); assert.equal(clicked.contexts, 1); assert.equal(clicked.enabled, true);
    assert.equal(clicked.opening.withSound, true);
    assert.equal(clicked.opening.gateOpen, true); assert.ok(clicked.opening.gateOpenedAt >= clicked.opening.dismissedAt);
    assert.equal(clicked.opening.phase, 'revealing');
    // Mid-transition: the gate has faded, the dim is lifting, the mat has begun to unroll.
    await page.waitForFunction(() => performance.now() - window.__opening().gateOpenedAt >= 1000);
    await page.screenshot({ path: 'screenshots/opening-to-intro.png' }); console.log('screenshots/opening-to-intro.png');
    const mid = await state(page);
    await page.waitForFunction(() => window.__kb.introPhase !== 'hold', null, { timeout: 15000 });
    const started = await page.evaluate(() => ({ phase: window.__kb.introPhase, at: performance.now(), openedAt: window.__opening?.()?.gateOpenedAt }));
    await waitLive(page); await frames(page);
    const live = await state(page); assertLive(live, 'CTA');
    assert.equal(await page.locator('.toast').textContent(), 'You’re in. Type on your keyboard to hear the switches.');
    await waitIntroDone(page);
    const done = await state(page);
    assert.ok(done.thuds >= 1, 'The intro is heard: its frame thud plays through the unlocked engine');
    assert.equal(done.audioState, 'running'); assert.equal(done.contexts, 1);
    await page.waitForFunction(() => !document.querySelector('.toast.is-shown'), null, { timeout: 8000 });
    await page.waitForTimeout(350); await frames(page, 8);
    await page.screenshot({ path: 'screenshots/ui-hero.png' }); console.log('screenshots/ui-hero.png');
    // Picker: still keyboard-navigable from the studio (Escape, then Tab, leaves typing).
    await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Glacial Blue');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__kb.selectedId === 'cool-black');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Cool Black');
    await page.keyboard.press('End'); await page.waitForFunction(() => window.__kb.selectedId === 'white-brown');
    await page.keyboard.press('Home'); await page.waitForFunction(() => window.__kb.selectedId === 'glacial-blue');
    assert.equal(await page.getByRole('radio', { name: 'Glacial Blue', exact: true }).getAttribute('aria-checked'), 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Sound on');
    assert.equal(await page.getByRole('button', { name: 'Sound', exact: true }).getAttribute('aria-pressed'), 'true');
    result.pointer = { status: 'passed', progressSamples: progress, held: { introPhase: held.introPhase, mat: held.mat, gateOpen: held.opening.gateOpen }, unlockedOnClick: clicked.unlocked, contexts: clicked.contexts, midTransition: { opening: mid.opening.phase, introPhase: mid.introPhase }, introStart: { firstPhase: started.phase, msAfterGate: started.at - started.openedAt }, introThuds: done.thuds, pickerKeyboard: 'ArrowRight, End, Home', focusAfterEnter: live.active };
    await context.close();
  }

  // 2. Keyboard: Tab/Shift+Tab never enter; Enter while still loading arms, and the gate opens only once ready.
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    await context.addInitScript(audioProbe);
    const page = await context.newPage(); observeErrors(page);
    let release;
    const hdr = new Promise(resolve => { release = resolve; });
    await page.route('**/hdri/*.hdr', async route => { await hdr; await route.continue(); });
    const requested = page.waitForRequest(request => request.url().endsWith('.hdr'));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await requested;
      await page.waitForFunction(() => window.__opening && document.activeElement?.classList.contains('cap'));
      // Real progress: with the HDRI held back, the scene cannot report ready.
      await page.waitForTimeout(500);
      const loading = await page.evaluate(() => ({ ...window.__opening(), bar: Number(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')), status: document.querySelector('#opening-status').textContent }));
      assert.equal(loading.sceneReady, false); assert.equal(loading.status, 'Loading scene');
      assert.ok(loading.progress < 100 && loading.bar === loading.progress, 'The bar reports real, incomplete progress while an asset is pending');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Continue without sound');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cap')), true);
      assert.equal(await page.evaluate(() => window.__opening().phase), 'loading', 'Tab only moves focus');
      const transcript = await page.evaluate(() => window.__screen?.().transcript.length ?? 0);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__opening().phase === 'arming');
      assert.equal(await page.locator('#opening-status').textContent(), 'Warming up the studio');
      const armed = await page.evaluate(() => ({ gateOpen: window.__opening().gateOpen, ready: window.__kb?.ready ?? false, unlocked: window.__sfx().unlocked, contexts: window.__audioProbe().contexts }));
      assert.deepEqual(armed, { gateOpen: false, ready: false, unlocked: true, contexts: 1 }, 'Entered before ready: audio unlocked, gate still closed');
      release();
      await page.waitForFunction(() => window.__opening?.().gateOpen, null, { timeout: 30000 });
      await waitLive(page); await frames(page);
      const live = await state(page); assertLive(live, 'Enter');
      await waitIntroDone(page);
      const after = await page.evaluate(() => ({ transcript: window.__screen().transcript.length, text: window.__screen().text }));
      assert.equal(after.transcript, transcript, 'The entering key is not typed into the monitor'); assert.equal(after.text, '');
      result.keyboard = { status: 'passed', progressWhileHdriPending: loading.progress, tabMovesFocusOnly: true, armedBeforeReady: armed, focusAfterEnter: live.active };
    } finally { release(); await context.close(); }
  }

  // 3. "Continue without sound": enters with sound off, persisted, toggle reflects it.
  {
    const context = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); observeErrors(page);
    await page.goto(url);
    await page.waitForFunction(() => window.__opening?.().sceneReady);
    await page.getByRole('button', { name: 'Continue without sound', exact: true }).click();
    await waitLive(page);
    const muted = await page.evaluate(() => ({ stored: localStorage.getItem('kc.sound'), enabled: window.__sfx().enabled, withSound: window.__opening().withSound, toast: document.querySelector('.toast').textContent }));
    assert.equal(muted.withSound, false);
    assert.equal(muted.stored, 'off'); assert.equal(muted.enabled, false);
    assert.equal(await page.getByRole('button', { name: 'Sound', exact: true }).getAttribute('aria-pressed'), 'false');
    await waitIntroDone(page);
    result.withoutSound = { status: 'passed', ...muted };
    await context.close();
  }

  // 4. ?skipIntroScreen (like ?capture) never shows it; the intro autoplays as before.
  {
    const context = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); observeErrors(page);
    await page.goto(`${url}/?skipIntroScreen`);
    await page.waitForFunction(() => window.__kb?.ready);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.opening')) || 'opening' in document.documentElement.dataset), false);
    await waitIntroDone(page);
    result.skip = { status: 'passed' };
    await context.close();
  }
  return result;
}
