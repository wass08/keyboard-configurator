# Spec 13 — Mobile shows a black screen

**Report from the user:** "it doesn't work on mobile? black screen." Production is https://keyboard.wawasensei.dev (Vercel; deployed commit `679d502` or later). The device and browser are unknown, so assume **iOS Safari** (the most likely) **and** Android Chrome.

There is no handling for `webglcontextlost` anywhere in `src/`, so any context loss leaves a permanently black canvas.

## 1. Reproduce with real engines

- **WebKit**: install Playwright's WebKit (`npx playwright install webkit`, a devDependency browser download only) and load production plus a local preview with `devices['iPhone 15 Pro']` (and an iPad). Playwright WebKit on macOS is the closest available proxy for iOS Safari. Capture all console errors, `webglcontextlost` events, shader compile/link errors (patch `WebGLRenderingContext`/`WebGL2` `getShaderInfoLog`/`getProgramInfoLog` in an init script), unhandled promise rejections, and failed network requests.
- **Chromium mobile emulation** (Pixel 7, touch, DPR 2.625–3) with **realistic GPU limits**. Query `gl.getParameter` for `MAX_TEXTURE_IMAGE_UNITS`, `MAX_FRAGMENT_UNIFORM_VECTORS`, `MAX_VARYING_VECTORS`, `MAX_RENDERBUFFER_SIZE`, `MAX_SAMPLES` and float render-target support. Compare them against typical mobile caps (iOS: 16 texture units, 1024 fragment uniform vectors, no `EXT_disjoint_timer_query`; many Android devices: 16 units, ~224–256 fragment uniform vectors, `OES_texture_float_linear` missing, `EXT_color_buffer_float`/`EXT_color_buffer_half_float` varying).
- **Static audit** of every custom or patched shader and material (keycaps `MeshPhysicalMaterial` with clearcoat, sheen and 6 `RectAreaLight`s + PCSS, the wood and wall `onBeforeCompile` patches, DoF, bloom, grading, dust, contact shadows) for:
  - mobile limit violations: sampler count per program, uniform vectors (6 RectAreaLights + spot + PCSS + env), loops with non-constant bounds, `highp` availability in the fragment shader
  - float/half-float render targets without the extension check (the HDR composer targets, the DoF CoC target, the bloom mips, the LTC textures: `RectAreaLightUniformsLib` must use the half-float path on WebGL1/iOS if needed)
  - MSAA sample counts above `MAX_SAMPLES`
  - texture sizes above `MAX_TEXTURE_SIZE`
- **Memory**: the earlier perf report estimated **~500–900 MiB** of texture/FBO memory at DPR 1.5–2, plus 215 programs. That's far beyond what iOS Safari tolerates; it kills the WebGL context (black screen, often with the page reloading). Measure the estimate at a mobile DPR (3) and a portrait viewport.

**Name the actual root cause(s), with evidence.** If you can't reproduce it in WebKit or Chromium, say so, and fix the most likely causes defensively.

## 2. Fix

- **Context-loss resilience**: handle `webglcontextlost` (call `preventDefault`) and `webglcontextrestored` (rebuild or recover, or show a graceful "Tap to reload the studio" fallback). Never leave a silent black screen. Add an error boundary around the Canvas, and a WebGL-unavailable fallback message in the opening screen's style.
- **Mobile quality profile**, selected up front (not after 2.5 s of frames), for touch/coarse-pointer devices, `devicePixelRatio ≥ 2` with a small screen, or low `deviceMemory`:
  - DPR cap ~1.25–1.5
  - HDR targets at half-float only when renderable, else 8-bit
  - no MSAA, or capped to `MAX_SAMPLES`
  - quality tier `low` or `medium` (PCF shadows, no or cheap DoF, cheap bloom)
  - 1k textures, or downscaled WebP derivatives, for mobile (generate `_1k.webp` with the existing optimize script)
  - fewer RectAreaLights on mobile (fold the small ones into the environment or emissive)
  - drop the env probe resolution
  - skip prewarming stage permutations on mobile
  - keep total GPU memory well under ~250 MiB, and report the estimate
- Make sure the mobile **portrait layout** works too (the camera framing was a known crop issue that the user deferred; keep the keyboard visible and don't cut it off badly, but desktop framing stays identical).
- Desktop **must stay pixel-identical**: the existing look checks pass unchanged.

## 3. Evidence

1. The root cause, with logs (shader errors, context-lost events, the memory estimate).
2. Playwright **WebKit iPhone** and **Chromium Pixel** runs against a local production build: the scene renders (a non-black pixel check on the keyboard region), no console errors, and the intro completes. Screenshots `mobile-ios-webkit.png` and `mobile-android-chromium.png`. Add these as checks in `npm run shots` (WebKit can be optional if it isn't installed, but run it here).
3. A forced context-loss test (`WEBGL_lose_context`) shows the fallback or recovery, not a black screen.
4. `npm run build`, `npm run shots` (all pass) and `npm run perf` (no desktop regression).
5. Commit on master with the co-author trailer, push (Vercel deploys), and verify production in WebKit iPhone emulation.
6. Don't edit `PROMPTS.md`, `references/` or the other files in `docs/`.
