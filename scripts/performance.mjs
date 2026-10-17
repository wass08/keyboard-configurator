// Hardware timing is separate from the portable SwiftShader screenshot run.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const url = 'http://127.0.0.1:4176';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4176', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Performance preview could not start on port 4176');
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
    async function measure(frames, discard) {
      const intervals = []; let last = performance.now();
      await new Promise(resolve => {
        const frame = time => { intervals.push(time - last); last = time; if (intervals.length < frames) requestAnimationFrame(frame); else resolve(); };
        requestAnimationFrame(frame);
      });
      const sample = intervals.slice(discard).sort((a, b) => a - b);
      return { frames: sample.length, medianFrameMs: sample[Math.floor(sample.length / 2)], p95FrameMs: sample[Math.floor(sample.length * 0.95)], averageFps: 1000 / (sample.reduce((a, b) => a + b, 0) / sample.length) };
    }
    const assembled = await measure(180, 30);
    window.__kb.setVariant('cool-black');
    const variantChange = await measure(210, 0);
    return { build: 'production', renderer, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, assembled, variantChange, finished: window.__kb.finished, render: window.__kb.inspect() };
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
