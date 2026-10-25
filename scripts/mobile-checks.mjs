import { chromium, webkit, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

// Install before Three creates a context: retain driver errors and account for
// live GPU allocations, including hidden environment/PMREM and shadow targets.
export function mobileDiagnostics({ limited = false, noFloat = false, unavailable = false } = {}) {
  const data = window.__mobileDiagnostics = { contextLost: [], contextRestored: [], shaderLogs: [], rejections: [], capabilities: [], programs: [], peakBytes: 0, liveBytes: 0, bufferBytes: 0, maxTextureDimension: 0, maxRenderbufferDimension: 0, maxSamples: 0, renderTargetFormats: [] };
  addEventListener('unhandledrejection', event => data.rejections.push(String(event.reason)));
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
    if (unavailable && /webgl/.test(kind)) return null;
    const gl = originalGetContext.call(this, kind, ...args);
    if (!gl || !/webgl/.test(kind) || gl.__diagnosed) return gl;
    gl.__diagnosed = true;
    this.addEventListener('webglcontextlost', event => queueMicrotask(() => data.contextLost.push({ time: performance.now(), prevented: event.defaultPrevented })));
    this.addEventListener('webglcontextrestored', () => data.contextRestored.push(performance.now()));
    const caps = {};
    for (const name of ['MAX_TEXTURE_IMAGE_UNITS', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_VARYING_VECTORS', 'MAX_RENDERBUFFER_SIZE', 'MAX_TEXTURE_SIZE', 'MAX_SAMPLES']) caps[name] = gl.getParameter(gl[name]);
    caps.fragmentHighp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision;
    caps.extensions = gl.getSupportedExtensions();
    caps.emulatedLimits = limited ? { textureUnits: 16, fragmentUniformVectors: 224, varyingVectors: 15, maxSize: 4096, maxSamples: 0, floatLinear: false, hdrRenderable: !noFloat } : null;
    data.capabilities.push(caps);
    if (limited) {
      const get = gl.getParameter.bind(gl);
      gl.getParameter = key => key === gl.MAX_TEXTURE_IMAGE_UNITS ? 16 : key === gl.MAX_FRAGMENT_UNIFORM_VECTORS ? 224 : key === gl.MAX_VARYING_VECTORS ? 15 : key === gl.MAX_SAMPLES ? 0 : key === gl.MAX_TEXTURE_SIZE || key === gl.MAX_RENDERBUFFER_SIZE ? Math.min(4096, get(key)) : get(key);
    }
    if (limited || noFloat) {
      const ext = gl.getExtension.bind(gl);
      gl.getExtension = name => /disjoint_timer|OES_texture_float_linear/.test(name) || (noFloat && /color_buffer_(half_)?float/.test(name)) ? null : ext(name);
    }
    for (const name of ['getShaderInfoLog', 'getProgramInfoLog']) {
      const get = gl[name].bind(gl);
      gl[name] = (...params) => { const log = get(...params); if (log) data.shaderLogs.push({ name, log }); return log; };
    }
    const linked = gl.linkProgram.bind(gl);
    gl.linkProgram = program => {
      linked(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      let samplers = 0, vectors = 0;
      const samplersTypes = [gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY];
      for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
        const u = gl.getActiveUniform(program, i);
        if (samplersTypes.includes(u.type)) samplers += u.size;
        vectors += u.size * (u.type === gl.FLOAT_MAT4 ? 4 : u.type === gl.FLOAT_MAT3 ? 3 : 1);
      }
      data.programs.push({ samplers, uniformVectorsUpperBound: vectors });
    };
    const allocations = new Map(), buffers = new Map(), bound = new Map(), mipmapped = new Set();
    this.addEventListener('webglcontextlost', () => {
      // A lost context invalidates every handle. Restored allocations replace
      // those resources; they do not coexist with the old GPU objects.
      allocations.clear(); buffers.clear(); bound.clear(); mipmapped.clear();
      data.liveBytes = data.bufferBytes = 0;
    });
    let renderbuffer = null, buffer = null;
    const update = () => {
      data.liveBytes = [...allocations.values()].reduce((a,b) => a+b,0);
      data.bufferBytes = [...buffers.values()].reduce((a,b) => a+b,0);
      data.peakBytes = Math.max(data.peakBytes, data.liveBytes + data.bufferBytes);
    };
    const patch = (name, observe) => { const original = gl[name]?.bind(gl); if (original) gl[name] = (...args) => { const result = original(...args); observe(...args); return result; }; };
    const bytes = (format, type) => {
      if ([gl.RGBA16F, gl.RG16F, gl.R16F].includes(format)) return format === gl.RGBA16F ? 8 : format === gl.RG16F ? 4 : 2;
      if ([gl.RGBA32F, gl.RG32F, gl.R32F].includes(format)) return format === gl.RGBA32F ? 16 : format === gl.RG32F ? 8 : 4;
      if ([gl.DEPTH_COMPONENT16].includes(format)) return 2;
      if ([gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT32F, gl.DEPTH24_STENCIL8].includes(format)) return 4;
      const channels = format === gl.RED ? 1 : format === gl.RG ? 2 : format === gl.RGB ? 3 : 4;
      return channels * (type === gl.FLOAT ? 4 : type === gl.HALF_FLOAT || type === gl.UNSIGNED_SHORT ? 2 : 1);
    };
    patch('bindTexture', (target, texture) => bound.set(target, texture));
    const textureFor = target => bound.get(target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? gl.TEXTURE_CUBE_MAP : target);
    patch('texImage2D', (...a) => {
      if (a[1] !== 0) return;
      const width = a.length >= 9 ? a[3] : a[5]?.width ?? 0, height = a.length >= 9 ? a[4] : a[5]?.height ?? 0;
      data.maxTextureDimension = Math.max(data.maxTextureDimension, width, height);
      const b = width * height * bytes(a[2], a.length >= 9 ? a[7] : a[4]) * (a[0] >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && a[0] <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z ? 6 : 1);
      const key = textureFor(a[0]); mipmapped.delete(key); allocations.set(key, b); update();
    });
    patch('texStorage2D', (target, levels, format, width, height) => { data.maxTextureDimension = Math.max(data.maxTextureDimension, width, height); data.renderTargetFormats.push(format); const key = textureFor(target); if (levels > 1) mipmapped.add(key); else mipmapped.delete(key); allocations.set(key, width*height*bytes(format)* (levels > 1 ? 4/3 : 1) * (target === gl.TEXTURE_CUBE_MAP ? 6 : 1)); update(); });
    patch('generateMipmap', target => { const key = textureFor(target); if (!mipmapped.has(key)) { allocations.set(key, (allocations.get(key) ?? 0)*4/3); mipmapped.add(key); update(); } });
    patch('bindRenderbuffer', (_target, value) => { renderbuffer = value; });
    patch('renderbufferStorage', (_target, format, width, height) => { data.maxRenderbufferDimension = Math.max(data.maxRenderbufferDimension, width, height); allocations.set(renderbuffer, width*height*bytes(format)); update(); });
    patch('renderbufferStorageMultisample', (_target, samples, format, width, height) => { data.maxSamples = Math.max(data.maxSamples, samples); data.maxRenderbufferDimension = Math.max(data.maxRenderbufferDimension, width, height); allocations.set(renderbuffer, width*height*bytes(format)*samples); update(); });
    patch('bindBuffer', (_target, value) => { buffer = value; });
    patch('bufferData', (_target, value) => { buffers.set(buffer, typeof value === 'number' ? value : value?.byteLength ?? 0); update(); });
    for (const name of ['deleteTexture', 'deleteRenderbuffer']) patch(name, value => { allocations.delete(value); mipmapped.delete(value); update(); });
    patch('deleteBuffer', value => { buffers.delete(value); update(); });
    return gl;
  };
}

export async function mobileChecks(url, { baseline = false, production = false, only = null } = {}) {
  await mkdir('screenshots', { recursive: true });
  const results = [];
  const profiles = [
    { name: 'ios-webkit', engine: webkit, device: 'iPhone 15 Pro' },
    { name: 'ios-crios-webkit', engine: webkit, device: 'iPhone 15 Pro', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1' },
    { name: 'ipad-webkit', engine: webkit, device: 'iPad Pro 11' },
    { name: 'android-chromium', engine: chromium, device: 'Pixel 7', limited: true },
    ...(!baseline && !production ? [{ name: 'android-ldr', engine: chromium, device: 'Pixel 7', limited: true, noFloat: true }] : []),
  ].filter(p => !only || only.split(',').includes(p.name));
  for (const profile of profiles) {
    if (!baseline && !production && profile.engine === webkit && !process.env.REQUIRE_WEBKIT) {
      const { existsSync } = await import('node:fs');
      if (!existsSync(webkit.executablePath())) { results.push({ name: profile.name, skipped: 'WebKit is not installed' }); continue; }
    }
    const browser = await profile.engine.launch({ headless: true, ...(profile.engine === chromium && process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {}) });
    const page = await browser.newPage({ ...devices[profile.device], ...(profile.userAgent ? { userAgent: profile.userAgent } : {}) });
    page.setDefaultTimeout(8000);
    const result = { name: profile.name, url, device: profile.device, userAgent: await page.evaluate(() => navigator.userAgent), errors: [], failedRequests: [] };
    page.on('console', message => { if (message.type() === 'error') result.errors.push(message.text()); });
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('requestfailed', request => result.failedRequests.push({ url: request.url(), failure: request.failure() }));
    await page.addInitScript(mobileDiagnostics, profile);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (result.errors.length) throw new Error(result.errors.join('\n'));
      await page.waitForFunction(() => window.__kb?.ready, null, { timeout: 20000 });
      result.initialQuality = await page.evaluate(() => window.__quality?.());
      if (!baseline) {
        assert.equal(result.initialQuality.tier, 'low');
        assert.equal(result.initialQuality.decided, true);
        assert(result.initialQuality.dpr <= 1.5);
      }
      await page.getByRole('button', { name: 'Continue without sound', exact: true }).tap();
      await page.waitForFunction(() => window.__kb?.introPhase === 'done' && window.__kb.finished && window.__opening?.().phase === 'live', null, { timeout: 20000 });
      result.introComplete = true;
      result.scene = await page.evaluate(() => ({ quality: window.__quality?.(), film: window.__film?.(), framing: window.__kb.inspect().framing, samples: window.__kb.inspect().colorSamples, opening: window.__opening?.(), glError: document.querySelector('canvas').getContext('webgl2').getError(), build: window.__build, requestedDpr: devicePixelRatio, viewport: [innerWidth, innerHeight] }));
      result.startupPeakBytes = await page.evaluate(() => window.__mobileDiagnostics.peakBytes);
      const file = `screenshots/${baseline ? 'before-' : production ? 'production-' : 'mobile-'}${profile.name}.png`;
      const pixels = PNG.sync.read(await page.screenshot({ path: file }));
      const sample = result.scene.samples.filter(s => s.x > 0.02 && s.x < 0.98 && s.y > 0.02 && s.y < 0.98);
      const values = sample.flatMap(s => [-1,0,1].flatMap(dy => [-1,0,1].map(dx => { const i = ((Math.floor(s.y*pixels.height)+dy)*pixels.width + Math.floor(s.x*pixels.width)+dx)*4; return Math.max(...pixels.data.subarray(i,i+3)); })));
      result.keyboardPixels = { visibleSamples: values.length, nonBlack: values.filter(v => v > 20).length, max: Math.max(0,...values) };
      if (!baseline) {
        if (process.env.MOBILE_EXPECT_SHA) assert.equal(result.scene.build, process.env.MOBILE_EXPECT_SHA, 'Production must serve the pushed commit');
        assert.equal(result.scene.glError, 0);
        assert(result.keyboardPixels.nonBlack >= 20, 'Keyboard region must render, not black');
        assert.equal(result.scene.quality.tier, 'low');
        assert(result.scene.quality.dpr <= 1.5);
        assert(result.scene.film.metrics.targetSizes.every(t => t.samples === 0));
        assert(result.scene.film.metrics.identifiedBytesEstimate < 250*1024*1024);
        assert(result.scene.framing.keyboardWidthRatio < 0.98, 'Portrait keyboard should fit');
      }
      if (profile.name === 'ios-webkit') {
        await page.evaluate(() => { window.__forcedContextExtension = document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__forcedContextExtension.loseContext(); });
        if (!baseline) {
          await page.getByRole('button', { name: 'Tap to reload the studio', exact: true }).waitFor({ timeout: 5000 });
          await page.screenshot({ path: `screenshots/${production ? 'production-' : ''}mobile-context-lost.png` });
          result.contextFallback = true;
          await page.evaluate(() => window.__forcedContextExtension.restoreContext());
          await page.waitForFunction(() => window.__mobileDiagnostics.contextRestored.length > 0, null, { timeout: 5000 });
          assert(await page.getByRole('button', { name: 'Tap to reload the studio', exact: true }).isVisible());
          result.restoredFallback = true;
        } else await page.waitForTimeout(250);
      }
    } catch (error) { result.failure = error.message; }
    result.diagnostics = await page.evaluate(() => window.__mobileDiagnostics).catch(() => null);
    if (result.diagnostics) result.diagnostics.renderTargetFormats = [...new Set(result.diagnostics.renderTargetFormats)];
    await browser.close();
    results.push(result);
    console.log(`${profile.name}: ${result.failure ?? `intro completed, ${result.keyboardPixels.nonBlack} non-black keyboard pixels`}; errors=${result.errors.length}; peak=${((result.diagnostics?.peakBytes ?? 0)/1048576).toFixed(1)} MiB`);
  }
  const report = process.env.MOBILE_REPORT ?? `screenshots/mobile-${baseline ? 'before' : production ? 'production' : 'local'}.json`;
  await writeFile(report, JSON.stringify(results, null, 2));
  if (!baseline) for (const result of results.filter(r => !r.skipped)) {
    assert(!result.failure, `${result.name}: ${result.failure}`);
    assert.deepEqual(result.errors, [], `${result.name}: console errors`);
    assert.deepEqual(result.failedRequests, [], `${result.name}: failed requests`);
    assert.deepEqual(result.diagnostics.rejections, []);
    assert.deepEqual(result.diagnostics.shaderLogs, []);
    assert(result.diagnostics.peakBytes < 250*1024*1024, `${result.name}: startup GPU budget`);
    assert.equal(result.diagnostics.maxSamples, 0, 'No mobile MSAA allocations');
    assert(result.diagnostics.maxTextureDimension <= 4096);
    assert(result.diagnostics.maxRenderbufferDimension <= 4096);
    assert(Math.max(...result.diagnostics.programs.map(p => p.samplers)) <= 16);
    assert(Math.max(...result.diagnostics.programs.map(p => p.uniformVectorsUpperBound)) <= 224);
    if (result.contextFallback) assert(result.diagnostics.contextLost.every(e => e.prevented));
  }
  return results;
}
if (process.argv[1]?.endsWith('/mobile-checks.mjs')) await mobileChecks(process.env.MOBILE_URL ?? 'http://127.0.0.1:4173', { baseline: process.argv.includes('--baseline'), production: process.argv.includes('--production'), only: process.env.MOBILE_ONLY });
