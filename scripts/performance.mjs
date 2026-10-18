// Hardware timing is separate from the portable SwiftShader screenshot run.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const url = `http://127.0.0.1:${process.env.PERF_PORT ?? 4176}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(process.env.PERF_PORT ?? 4176), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Performance preview could not start on port ${process.env.PERF_PORT ?? 4176}`);
    try { if ((await fetch(url)).ok) break; } catch { /* starting */ }
    if (attempt === 99) throw new Error('Preview startup timed out');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__kb?.finished);
  const result = await page.evaluate(async () => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const summarize = intervals => {
      const sample = [...intervals].sort((a, b) => a - b);
      return { frames: sample.length, medianFrameMs: sample[Math.floor(sample.length / 2)], p95FrameMs: sample[Math.floor(sample.length * 0.95)], averageFps: 1000 / (sample.reduce((a, b) => a + b, 0) / sample.length) };
    };
    async function measure(frames, discard) {
      const intervals = []; let last = performance.now();
      await new Promise(resolve => {
        const frame = time => { intervals.push(time - last); last = time; if (intervals.length < frames) requestAnimationFrame(frame); else resolve(); };
        requestAnimationFrame(frame);
      });
      return summarize(intervals.slice(discard));
    }
    const assembled = await measure(180, 30);
    window.__kb.replayIntro();
    const beats = { mat: [], frame: [], keys: [] };
    let last = performance.now(), previousPhase = window.__kb.introPhase;
    await new Promise((resolve, reject) => {
      const frame = time => {
        beats[previousPhase].push(time - last); last = time;
        previousPhase = window.__kb.introPhase;
        if (previousPhase === 'done') resolve();
        else if (Object.values(beats).flat().length > 1200) reject(new Error('Intro timing timed out'));
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const intro = { ...summarize(Object.values(beats).flat()), beats: Object.fromEntries(Object.entries(beats).map(([beat, intervals]) => [beat, summarize(intervals)])) };
    if (!window.__kb.finished || window.__kb.introPhase !== 'done') throw new Error('Intro did not finish during timing sample');
    window.__kb.setVariant('cool-black');
    const variantChange = await measure(210, 0);
    const render = window.__kb.inspect();
    window.__cameraStore.set({ depthOfField: true });
    window.__cameraStore.focusOnKeyboard();
    const depthOfField = await measure(180, 30);
    const depthOfFieldRender = window.__kb.inspect();
    const lens = window.__camera().lens;
    window.__cameraStore.set({ depthOfField: false });
    return { build: 'production', renderer, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, assembled, intro, variantChange, depthOfField, lens, finished: window.__kb.finished, render, depthOfFieldRender: { calls: depthOfFieldRender.calls, triangles: depthOfFieldRender.triangles } };
  });
  if (errors.length) throw new Error(errors.join('\n'));
  if (!result.finished) throw new Error('The variant did not finish during the timing sample');
  await mkdir('screenshots', { recursive: true });
  await writeFile('screenshots/performance.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, render: { calls: result.render.calls, triangles: result.render.triangles } }, null, 2));
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
