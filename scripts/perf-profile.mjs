import { chromium } from 'playwright';
import { preview } from 'vite';
import { loadavg } from 'node:os';
import { writeFile, readFile, stat, mkdir } from 'node:fs/promises';

await mkdir('screenshots', { recursive: true });
const before = process.argv.includes('--before');
const baselineDist = process.env.PERF_BASELINE_DIST;
if (before && !baselineDist) throw new Error('Set PERF_BASELINE_DIST to a preserved, instrumented production build for --before');
const outDir = before ? baselineDist : 'dist';
const port = Number(process.env.PROFILE_PORT ?? 4190);
const server = await preview({ configFile: 'vite.config.ts', build: { outDir }, preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'silent' });
let browser;
try {
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  const runs = [];
  for (const throttle of [1, 4]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: throttle === 4 ? 2 : 1.5 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); await cdp.send('Performance.enable');
    await page.goto(`http://127.0.0.1:${port}/?perf=1`);
    await page.waitForFunction(() => window.__kb?.ready && window.__film);
    const enter = page.getByRole('button', { name: 'Build mine', exact: true });
    if (await enter.count()) {
      // Profile the live studio, not the opening overlay and its backdrop blur.
      await enter.click();
      await page.waitForFunction(() => window.__opening().phase === 'live' && window.__kb.finished && window.__kb.introPhase === 'done');
    } else await page.evaluate(() => window.__kb.finish()); // preserved pre-opening baseline builds
    const loadBefore = loadavg();
    const sample = async () => {
      await page.evaluate(() => new Promise(resolve => { let n = 24; const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }));
      // Frame pacing and main-thread tasks are measured WITHOUT timer queries.
      // Driver query polling can otherwise dominate the CPU figure on Metal.
      const cpu0 = await cdp.send('Performance.getMetrics');
      const pacing = await page.evaluate(async () => {
        const intervals = []; let last = performance.now();
        await new Promise(resolve => { const tick = now => { intervals.push(now-last); last=now; if(intervals.length<90)requestAnimationFrame(tick);else resolve(); };requestAnimationFrame(tick); });
        const sorted=[...intervals].sort((a,b)=>a-b);
        return {fps:1000/(intervals.reduce((a,b)=>a+b,0)/intervals.length),frames:intervals.length,medianMs:sorted[45],p95Ms:sorted[85]};
      });
      const cpu1 = await cdp.send('Performance.getMetrics');
      const detail = await page.evaluate(async () => {
        const frames = n => new Promise(resolve=>{const tick=()=>--n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);});
        window.__filmControl.profile(true); await frames(90);
        window.__filmControl.profile(false); await frames(12);
        const f=window.__film();
        return {gpu:f.gpu,metrics:f.metrics,startup:f.startup,environmentCaptures:window.__environment().captures,shadowAutoUpdate:window.__lighting().shadowAutoUpdate,lens:window.__camera().lens};
      });
      const task = metrics => metrics.metrics.find(m=>m.name==='TaskDuration')?.value ?? 0;
      return {...pacing,...detail,mainThreadTaskMsPerFrame:(task(cpu1)-task(cpu0))*1000/pacing.frames};
    };
    const all = await sample(), ab = {}, paired = {};
    if (throttle === 1) {
      for (const role of ['grade', 'bloom', 'dof', 'dust']) {
        const localBefore = await sample();
        await page.evaluate(role => { if (role === 'bloom') window.__filmControl.bloom(false); else if (role === 'dof') window.__cameraStore.set({ depthOfField: false }); else window.__lightingStore.set({ [role === 'grade' ? 'Film.gradeEnabled' : 'Dust.dustEnabled']: false }); }, role);
        ab[role] = await sample();
        await page.evaluate(role => { if (role === 'bloom') window.__filmControl.bloom(true); else if (role === 'dof') window.__cameraStore.set({ depthOfField: true }); else window.__lightingStore.set({ [role === 'grade' ? 'Film.gradeEnabled' : 'Dust.dustEnabled']: true }); }, role);
        const localAfter = await sample();
        const gpu = r => r.gpu.gpu.frame?.medianMs ?? null;
        paired[role] = { allBeforeMs: gpu(localBefore), offMs: gpu(ab[role]), allAfterMs: gpu(localAfter), deltaMs: (gpu(localBefore)+gpu(localAfter))/2-gpu(ab[role]), anchorDriftMs: Math.abs(gpu(localBefore)-gpu(localAfter)) };
      }
    }
    const end = throttle === 1 ? await sample() : all;
    let isolated = null;
    if (throttle === 1) {
      // Separate small contributors from the large bloom command-buffer cost.
      // These are diagnostic differences over scene+output, not additive
      // estimates of the full default chain (there are bandwidth interactions).
      await page.evaluate(() => { window.__filmControl.bloom(false); window.__cameraStore.set({depthOfField:false}); window.__lightingStore.set({'Film.gradeEnabled':false,'Dust.dustEnabled':false}); });
      const sceneOnly = await sample(), contributions = {};
      for (const role of ['dof','grade','dust']) {
        await page.evaluate(role => { if(role==='dof') window.__cameraStore.set({depthOfField:true}); else window.__lightingStore.set({[role==='grade'?'Film.gradeEnabled':'Dust.dustEnabled']:true}); },role);
        contributions[role] = await sample();
        await page.evaluate(role => { if(role==='dof') window.__cameraStore.set({depthOfField:false}); else window.__lightingStore.set({[role==='grade'?'Film.gradeEnabled':'Dust.dustEnabled']:false}); },role);
      }
      const sceneAfter = await sample(), gpu = r=>r.gpu.gpu.frame?.medianMs ?? null;
      isolated = {method:'Each small effect over scene+output only; bloom disabled to reduce command-buffer timing noise. Not additive.',sceneAndOutputMs:(gpu(sceneOnly)+gpu(sceneAfter))/2,anchorDriftMs:Math.abs(gpu(sceneOnly)-gpu(sceneAfter)), contributions:Object.fromEntries(Object.entries(contributions).map(([k,r])=>[k,{totalMs:gpu(r),incrementMs:gpu(r)-(gpu(sceneOnly)+gpu(sceneAfter))/2}]))};
      await page.evaluate(() => {window.__filmControl.bloom(true);window.__cameraStore.set({depthOfField:true});window.__lightingStore.set({'Film.gradeEnabled':true,'Dust.dustEnabled':true});});
    }
    runs.push({ throttle, dpr: throttle === 4 ? 2 : 1.5, gpuStress: throttle === 4 ? '1.78× pixel work; GPU clock throttling is unavailable in CDP' : 'native', loadBefore, loadAfter: loadavg(), all, end,
      effectGpuMs: Object.fromEntries(Object.entries(paired).map(([key, r]) => [key, r.deltaMs])), paired, isolated, without: ab });
    await context.close();
  }
  // Follow the entry graph, excluding stale chunks in a preserved baseline dir.
  const html = await readFile(`${outDir}/index.html`, 'utf8');
  const entries = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map(m=>m[1]));
  const reachable = new Set(entries), queue = [...entries];
  for (let i=0;i<queue.length;i++) {
    const source = await readFile(`${outDir}/assets/${queue[i]}`,'utf8');
    for (const match of source.matchAll(/["'`]\.\/([^"'`]+\.js)["'`]/g)) if (!reachable.has(match[1])) { reachable.add(match[1]); queue.push(match[1]); }
  }
  const bundles = await Promise.all([...reachable].map(async name => ({ name, bytes: (await stat(`${outDir}/assets/${name}`)).size, initial: entries.has(name) })));
  const report = { viewport: [1440, 900], method: 'Fixed DPR. FPS/Chrome TaskDuration sampled with queries off; separate asynchronous whole-frame GPU query A/Bs. Small GPU deltas below anchor drift are unresolved, sometimes negative.', runs, bundles };
  await writeFile(`screenshots/perf-profile-${before ? 'before' : 'after'}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!before) {
    const baseline = await readFile('screenshots/perf-profile-before.json','utf8').then(JSON.parse).catch(()=>null);
    const row = r => ({ fps: r.all.fps.toFixed(1), GPUms: r.all.gpu.gpu.frame?.medianMs.toFixed(2), CPUms: r.all.mainThreadTaskMsPerFrame.toFixed(2), calls:r.all.metrics.calls, triangles:r.all.metrics.triangles, programs:r.all.metrics.programs, textureMiB:(r.all.metrics.identifiedBytesEstimate/1048576).toFixed(1), firstFrameMs:r.all.startup.firstSceneFrameMs.toFixed(0), introMs:r.all.startup.introReadyMs.toFixed(0) });
    console.table(Object.fromEntries([...(baseline?baseline.runs.map(r=>[`before CPU${r.throttle} DPR${r.dpr}`,row(r)]):[]),...runs.map(r=>[`after CPU${r.throttle} DPR${r.dpr}`,row(r)])]));
    console.log('GPU A/B contributors (ms; anchor drift is measurement uncertainty):', JSON.stringify(runs[0].paired));
  }
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
