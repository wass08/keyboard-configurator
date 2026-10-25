import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';

const phase = process.argv.includes('--before') ? 'before' : 'after';
const remote = process.env.HUNT_URL;
const port = Number(process.env.HUNT_PORT ?? 4192);
const server = remote ? null : await preview({ configFile: 'vite.config.ts', build: { outDir: process.env.HUNT_DIST ?? 'dist' }, preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'silent' });
const url = remote ?? `http://127.0.0.1:${port}`;
const frames = (page, n) => page.evaluate(n => new Promise(resolve => { const tick = () => --n ? requestAnimationFrame(tick) : resolve(); requestAnimationFrame(tick); }), n);
const output = `screenshots/perf-hunt-${process.env.HUNT_TAG ?? (remote ? 'production' : phase)}`;
await mkdir(output, { recursive: true });
const errors = [], report = { methodology: '300+ directly bracketed samples/pass. Metal multiple queries/frame are cumulative: isolate each selected real pass, preserving its inputs. Whole-frame driver counter includes encoder scheduling; isolated scopes need not sum to it. CPU/FPS are sampled with queries off. 3840x2160 is a fill-rate proxy, not an emulated GPU clock.', phase, url, loadBefore: loadavg(), runs: [] };
let browser;
async function ready(page) {
  await page.goto(`${url}/?capture=1&perf=1${process.env.HUNT_QUERY??''}`);
  await page.waitForFunction(() => window.__kb?.ready && window.__film, null, { timeout: 120000 });
  if(remote&&process.env.HUNT_EXPECT_SHA)assert.equal(await page.evaluate(()=>window.__build),process.env.HUNT_EXPECT_SHA,'Production must serve the new commit');
  await page.evaluate(() => window.__kb.finish()); await frames(page, 2);
  await page.waitForFunction(() => { const f = window.__cameraStore.focusState(); return f.distance === f.target && f.range === f.rangeTarget; });
}
try {
  // GPU elapsed time is independent of the vsync-limited RAF rate. Never
  // infer pass costs from 60 fps or enabled/disabled frame differences.
  browser = await chromium.launch({ headless: true, args: [`--use-angle=${process.env.HUNT_BACKEND??'metal'}`] });
  for (const dpr of (process.env.HUNT_DPRS?.split(',').map(Number) ?? (remote ? [1.5] : [1.5, 2, 2.5]))) {
    const context = await browser.newContext({ viewport: process.env.HUNT_WIDTH ? {width:Number(process.env.HUNT_WIDTH),height:Number(process.env.HUNT_HEIGHT)} : dpr === 2.5 ? {width:1920,height:1080} : { width: 1440, height: 900 }, deviceScaleFactor: Math.min(2,dpr) });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await cdp.send('Performance.enable');
    await ready(page); console.log('Ready', dpr); await frames(page, 30);
    const before = await page.evaluate(() => ({ env: window.__environment().captures, dust: window.__dust(), screen: window.__screen(), monitor: window.__lighting().monitor }));
    const cpu0 = await cdp.send('Performance.getMetrics');
    const pacing = await page.evaluate(async sampleCount => { let last = performance.now(); const times = []; await new Promise(resolve => { const tick = now => { times.push(now-last); last=now; if(times.length<sampleCount)requestAnimationFrame(tick);else resolve(); }; requestAnimationFrame(tick); }); const sorted=[...times].sort((a,b)=>a-b); return {frames:times.length,fps:1000/(times.reduce((a,b)=>a+b,0)/times.length),medianMs:sorted[Math.floor(times.length*.5)],p95Ms:sorted[Math.floor(times.length*.95)]}; }, Number(process.env.HUNT_PACING_FRAMES)||320);
    const cpu1 = await cdp.send('Performance.getMetrics');
    const idleAfter=await page.evaluate(()=>({env:window.__environment().captures,monitor:window.__lighting().monitor,dust:window.__dust(),screen:window.__screen()}));
    const measured = {};
    for (const label of (process.env.HUNT_LABELS?.split(',') ?? ['frame','mainScene','shadowMap','environment.capture','scene.resolve','scene.withResolve','depthOfField','bloom.threshold',...Array.from({length:5},(_,i)=>[`bloom.mip${i}.x`,`bloom.mip${i}.y`]).flat(),'bloom.composite','bloom.blend','dustAfterDoF','gradingAndOutput'])) {
      await page.evaluate(label => window.__filmControl.profile(true,label),label); await frames(page, 340);
      await page.evaluate(() => window.__filmControl.profile(false)); await frames(page, 10);
      const value=await page.evaluate(()=>window.__film().gpu);
      if(label==='all'){Object.assign(measured,value.gpu);assert.ok(value.gpu.frame?.samples>=300);}else{assert.ok(value.gpu[label]?.samples>=300,`${label}: 300+ GPU samples: ${JSON.stringify(value)}`);measured[label]=value.gpu[label];}
      console.log(dpr,label,JSON.stringify(measured[label]));
    }
    const details = await page.evaluate(() => ({ ...window.__film(), env: window.__environment().captures, dust: window.__dust(), screen: window.__screen(), monitor: window.__lighting().monitor, quality: window.__quality() }));
    const metric = (m, key) => m.metrics.find(m => m.name === key)?.value ?? 0;
    report.runs.push({ requestedScenario: dpr, dpr: details.metrics.pixelRatio, proxy: dpr === 2.5 ? '3840×2160 framebuffer, 8.29 MP: honest fill-rate proxy, not GPU clock emulation' : 'native', pacing,
      mainThreadMs: (metric(cpu1,'TaskDuration')-metric(cpu0,'TaskDuration'))*1000/pacing.frames,
      gpu: {...details.gpu,gpu:measured}, metrics: details.metrics, startup: details.startup, preparation: await page.evaluate(()=>window.__kb.inspect().intro.preparation),
      idle: { environmentCaptures: idleAfter.env-before.env, reflectionCaptures: idleAfter.monitor.reflectionCaptures-before.monitor.reflectionCaptures,
        shadowUpdates: idleAfter.dust.shadowUpdates-before.dust.shadowUpdates, staticScreenUploads: idleAfter.screen.staticRedraws-before.screen.staticRedraws, footerUploads: idleAfter.screen.redraws-before.screen.redraws }, quality: details.quality });

    await writeFile(`${output}.json`,JSON.stringify(report,null,2));
    if (dpr === 1.5 && !remote && !process.env.HUNT_NO_CPU_TRACE) {
      await page.evaluate(()=>window.__filmControl.profile(true,'cpu'));
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.gc', transferMode: 'ReturnAsStream' });
      await frames(page, 100); await page.keyboard.type('profile the terminal and audio scheduling', { delay: 65 }); await page.keyboard.press('Enter'); await frames(page, 100);
      const profile = (await cdp.send('Profiler.stop')).profile;
      await page.evaluate(()=>window.__filmControl.profile(false));
      report.callbacks=await page.evaluate(()=>window.__film().gpu.cpu);
      const ended = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve)); await cdp.send('Tracing.end');
      const { stream } = await ended; let data = '';
      while (true) { const r = await cdp.send('IO.read', { handle: stream }); data += r.data; if (r.eof) break; } await cdp.send('IO.close', { handle: stream });
      await writeFile(`${output}/cpu-trace.json`, data); await writeFile(`${output}/cpu-profile.json`, JSON.stringify(profile));
      const trace = JSON.parse(data).traceEvents;
      const totals = {};
      for (const event of trace) if(event.ph==='X' && event.dur) { const row=totals[event.name]??={count:0,totalMs:0,maxMs:0};row.count++; row.totalMs+=event.dur/1000;row.maxMs=Math.max(row.maxMs,event.dur/1000); }
      report.cpuTrace = { events: Object.fromEntries(Object.entries(totals).sort((a,b)=>b[1].totalMs-a[1].totalMs).slice(0,30)), profileSamples: profile.samples?.length };
      // Exact runtime state and images are captured separately by look-checks.
    }
    await context.close();
  }
  if (!remote) {
    report.bundles = await Promise.all((await readdir(`${process.env.HUNT_DIST ?? 'dist'}/assets`)).filter(n=>/\.(js|css)$/.test(n)).map(async name=> { const b=await readFile(`${process.env.HUNT_DIST ?? 'dist'}/assets/${name}`);return {name,bytes:b.length,gzipBytes:gzipSync(b).length}; }));
  }
  if (!process.env.HUNT_SKIP_PRODUCTION) {
  // Cold production load, including asset decode/upload and compile readiness.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const productionUrl = remote ?? 'https://keyboard.wawasensei.dev';
  const started = Date.now(); await page.goto(productionUrl);
  await page.waitForFunction(() => window.__kb?.ready, null, { timeout: 120000 });
  report.productionLoad = await page.evaluate(() => ({ readyMs: performance.now(), navigation: performance.getEntriesByType('navigation').map(n=>({ttfb:n.responseStart,domContentLoaded:n.domContentLoadedEventEnd,transferSize:n.transferSize})), assets:performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop(),duration:r.duration,transferBytes:r.transferSize,decodedBytes:r.decodedBodySize})), programs:window.__film().metrics.programs, startup:window.__film().startup, quality:window.__quality(), preparation:window.__kb.inspect().intro.preparation, build:window.__build }));
  report.productionLoad.wallClockMs = Date.now()-started;
  await page.getByRole('button',{name:'Build mine',exact:true}).click();
  await page.waitForFunction(()=>window.__opening().phase==='live' && window.__kb.finished);
  report.productionLoad.settledIntroMs=await page.evaluate(()=>performance.now());
  report.productionLoad.decodes=await page.evaluate(async()=>{
    const urls=performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/textures\/.*\.(jpg|webp)$/.test(n));
    const result=[];
    for(const url of [...new Set(urls)]) {
      const bytes=await fetch(url).then(r=>r.arrayBuffer()),times=[];
      for(let i=0;i<3;i++){const start=performance.now();const bitmap=await createImageBitmap(new Blob([bytes]));times.push(performance.now()-start);bitmap.close();}
      result.push({name:url.split('/').pop(),bytes:bytes.byteLength,decodeMs:times.sort((a,b)=>a-b)[1]});
    }
    return result;
  });
  await page.screenshot({path:`${output}/production.png`}); await context.close();
  }
  report.loadAfter=loadavg(); report.errors=errors;
  await writeFile(`${output}.json`,JSON.stringify(report,null,2));
  console.log(`Saved ${output}.json`); assert.deepEqual(errors,[]);
} finally {await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));}
