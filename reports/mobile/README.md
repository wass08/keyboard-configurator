# Mobile black screen — spec 13

The reproduced startup failure is a **WebKit JavaScript parser error**, before React mounts or a WebGL context is created. It occurs in both production and the original local production build on Playwright WebKit (iPhone 15 Pro and iPad Pro 11). The failing emitted dependency chunk includes a Stitches/Leva memoization arrow, moved by Oxc compression into a `for` initializer:

```js
for (var k = () => { return i in e ? 0 : 1 }; ; ) {}
// SyntaxError: Unexpected keyword 'in'. Expected a ';' following a return statement.
```

The same engine parses both a parenthesized `(i in e)` and the declaration outside the loop. Chromium parses all three. `node scripts/mobile-syntax-check.mjs` preserves this minimal reproduction. Production's error includes the emitted chunk URL in [before-production-webkit.json](before-production-webkit.json). [before-local.json](before-local.json) records the original iPhone, iPad, and Pixel runs. No GPU shader error or spontaneous context loss was observed: WebKit failed before any GPU allocation.

Oxc's `joinVars: false` alone did not stop this loop-initializer compression. The fix disables Oxc compression while retaining identifier/whitespace minification, tree shaking, and chunk splitting. The extra compressed transfer size is small; desktop rendering code and saved look fixtures are unchanged.

There were also confirmed resilience and resource problems:

- Production's Pixel portrait run used 215 programs, desktop high quality, DPR 2, 2K maps and four-sample HDR scene targets. Its conservative tracked allocation peak was **554.5 MiB**, above the mobile budget. [before-production-chromium.json](before-production-chromium.json) records it. Texture/FBO diagnostics alone identified **384.5 MiB**. This is evidence of memory pressure, not proof of an OS-triggered context eviction.
- Forced `WEBGL_lose_context` on production leaves no application fallback: [before-context-loss.json](before-context-loss.json). Three already prevents the default loss event internally; the application previously supplied no loss/restoration UI or way to rebuild cached captures.
- Portrait keyboard width was **181%** of the viewport, because the old 0.719 m orbit limit clamped its intended fit position.

## Implementation

The profile is selected before Canvas and textures exist for touch/coarse-pointer devices, a high-DPR small screen, or deviceMemory <= 4. It pins low quality, caps DPR at 1.25, disables default/scene/reflection MSAA, uses PCF shadows and a 1K shadow map, skips DoF and stage permutation prewarming, uses smaller bloom targets and a 128 px environment probe, removes the small direct area lights while retaining their environment/emissive sources, loads the seven new 1K WebP derivatives, and reduces the generated legend and terminal canvases to 1K. Desktop retains its original assets, camera, lights, postprocessing and samples (subject to the GPU's MAX_SAMPLES).

Scene/composer/bloom/reflection/precompile targets use half-float only with EXT_color_buffer_float or EXT_color_buffer_half_float; otherwise they use RGBA8. The no-float path skips Drei's internally half-float environment/PMREM targets and uses hemisphere fill. The installed Three revision uses WebGL2 and already selects LTC_HALF_1/2 when OES_texture_float_linear is absent (`WebGLLights.js`). WebGL1-only browsers receive the unavailable fallback.

Loss handlers call preventDefault and show “Tap to reload the studio”; restoration retains this explicit reload path so cached environment, floor and shadow captures are rebuilt together. The Canvas error boundary also shows that opening-style fallback for renderer/component failures. Shader and asynchronous preparation failures take the same path. The native canvas fallback has no interactive tab stop. The portrait camera now fits the whole keyboard while the desktop branch remains unchanged.

## Shader/material audit

| Program or patch | Findings and mobile treatment |
| --- | --- |
| Physical keycaps, clearcoat/sheen, case, coated props | No sampler/uniform violation observed. Original maximum across linked programs: 12 samplers, 124 uniform vectors (conservative vertex+fragment union). Mobile reduces small area lights; low-quality PCF replaces PCSS. |
| LTC area lights / guard | Two 64x64 lookup samplers; Three selects half-float data textures without OES_texture_float_linear. The guard adds no varying/sampler and has no loop. The masked-extension Pixel run exercises this branch. |
| Wood onBeforeCompile | Adds one float varying and three scalar uniforms; reuses existing UV/maps; no custom dynamic loop. Mobile uses 1K maps. |
| Wall onBeforeCompile | Adds one vec2 varying, two vec2 uniforms, a float and bool; no loop or extra sampler. Existing 512px paint textures remain. |
| Contact PCSS | Fixed 8/12-point loops, unrolled at compile time; noise loops have constant bounds. Mobile uses native PCF. |
| Depth-aware DoF | Two samplers, vec2 disk[16], fixed 8/16 iteration bounds with a uniform early break. CoC is calculated inline; this revision has no separate CoC FBO. Disabled on mobile. |
| Bloom | Five fixed mip pairs, five samplers in composite. Each target's type follows the renderability extension check; mobile downscales further. |
| Grading/output | One source sampler, fixed arithmetic; no new target or dynamic loop. Unchanged on desktop. |
| Dust / depth overlay | Two varyings (vec3 color and float depth), one depth sampler; no custom loop or extra target. Occlusion shares scene depth. |
| Floor contact | Cached RGBA8 512px targets, fixed blur loops and no high-precision float FBO dependency. |
| Monitor off-screen reflection | Smaller RGBA8/half-float target selected by capability, zero mobile samples; no recursive captures. |
| Terminal shader patch | Adds constant radiance only; no varying, sampler or loop. 1K generated canvases on mobile. |

Three negotiates fragment precision; both engines report highp precision 23. The source audit found no unbounded GLSL loop or custom varying expansion likely to exceed the mobile budget. The engine tests assert sampler <= 16 and a conservative combined uniform-vector upper bound <= 224. Capability masks exercise missing float-linear, missing timer queries, zero MSAA support and a 4096 texture/renderbuffer size limit. This is a desktop-GPU engine proxy, not physical iOS/Android hardware or a faithful simulation of every mobile driver. In particular, varying and fragment-uniform hardware limits cannot be changed by browser viewport emulation; program resource counts are checked separately.

## Verification

`npm run build` passed ([output](build-output.txt)). `REQUIRE_WEBKIT=1 npm run shots` passed every section ([output](shots-output.txt), [section summary](checks-summary.json)). All six existing desktop [look checks](look-checks.json) pass with unchanged fixtures and thresholds. A focused [retina desktop check](retina-desktop.json) on the final build confirms high quality, DPR 2, four-sample scene targets and original 2K texture URLs.

| Local production build / real engine | Native → capped DPR | Portrait CSS viewport | Tracked peak MiB | Scene/FBO subset MiB | Programs | Non-black cap pixels | Keyboard width |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| iPhone 15 Pro / WebKit | 3 → 1.25 | 393×659 | 170.1 | 88.9 | 63 | 27/27 | 90.6% |
| iPad Pro 11 / WebKit | 2 → 1.25 | 834×1194 | 202.4 | 121.3 | 63 | 27/27 | 91.4% |
| Pixel 7 / Chromium, mobile caps | 2.625 → 1.25 | 412×839 | 173.6 | 92.5 | 62 | 27/27 | 89.7% |
| Pixel 7 / Chromium, no float color targets | 2.625 → 1.25 | 412×839 | 141.1 | 86.1 | 58 | 27/27 | 89.7% |

Every run starts in decided low quality before entering, completes the real intro, has zero console/page/shader/rejection/network errors and GL_NO_ERROR, and allocates no MSAA targets. Mobile programs use <=11 samplers and <=99 combined uniform vectors. Maximum observed texture/storage dimension is 1509, below the masked 4096 cap; maximum non-multisampled renderbuffer dimension is 512. [Full mobile logs](after-local.json) include raw and emulated capabilities.

The iPhone measurement is at native DPR 3 with the up-front cap applied. The original Pixel renderer already capped native 2.625 to 2; its portrait scene/FBO estimate was 384.5 MiB, including 105.9 MiB in viewport-sized targets. A mathematical DPR-3 extrapolation (same assets, targets ×2.25, no old cap) is 516.8 MiB for the scene subset, or 686.9 MiB using the broader tracked baseline. These are projections, not additional engine allocations.

Screenshots: [mobile-ios-webkit.png](mobile-ios-webkit.png), [mobile-android-chromium.png](mobile-android-chromium.png), [forced context loss](mobile-context-lost.png), [WebGL unavailable](mobile-webgl-unavailable.png). The pixel check samples three 3×3 patches projected from known keycap tops, not the UI or background. Context loss is prevented, the fallback remains visible after a real restoration event, and the unavailable-WebGL test proves its reload button works.

The first full-suite attempt stopped early on an extra native-canvas fallback tab stop; that was fixed and desktop keyboard navigation plus unavailable-WebGL reload were rechecked before the successful full pass. The final phone-screen threshold was narrowed from 900 to 600 CSS px after that pass to protect retina laptops. That changes none of the screenshot suite's desktop (DPR 1/1.5) or touch-device profiles; the added final-build DPR-2 desktop check and the performance run exercise the affected classification.

Allocation accounting instruments live WebGL texture/storage, mipmap, renderbuffer and geometry-buffer allocations, including hidden environment/PMREM and shadow targets. It counts mip chains once and invalidates old handles on context loss. Estimates exclude unobservable driver/program caches and the default framebuffer; the latter is only a few additional MiB at the capped drawing-buffer sizes. `renderMetrics` is a narrower scene/FBO subset, so both figures are reported. The original first local probe double-counted repeated mipmap generation; its invalid allocation totals were removed, and the corrected production probe above supplies the baseline.
