# Spec 12 — Performance hunt: find what is killing performance, and fix it

The app now runs in production at https://keyboard.wawasensei.dev (Vite build on Vercel). The user reports that performance is bad. Previous passes reported "~60 fps", but only on an Apple M5 Max, where the frame rate is capped by vsync. That **hides the real cost**. This pass must measure **uncapped GPU time** and target weaker hardware.

## 1. Measure properly (before changing anything)

- Use `EXT_disjoint_timer_query_webgl2` to get per-pass GPU timings: shadow map, main scene, DoF (CoC and gather), bloom (each mip level), grading/output, dust, environment captures. Measure each pass by bracketing it, not by A/B toggling (previous A/B numbers were noisy). Run 300+ frames, and report the median and p95.
- Do it at **1440×900 at DPR 1.5 and DPR 2**, plus a **simulated weak GPU**. For example: render at 4K-equivalent pixel counts to expose fill-rate costs, and run in Chrome with `--use-angle=swiftshader` for relative costs, or use any honest proxy you can justify. The goal is to find what scales badly.
- Also profile the **CPU side** (Chrome trace in Playwright): `useFrame` callbacks, React renders, GC, leva, the audio scheduling, and the terminal canvas redraws.
- Check the **load path**: bundle sizes, texture decode time (2k JPGs: wood, felt, wall), shader compile time (how many programs?), and the time to interactive in production. Use a Lighthouse-style run against the production URL if possible.

## 2. Known suspects (verify each with numbers, don't assume)

1. **Bloom ≈ 7 ms GPU** (from the last report: nearly half of a 16.7 ms frame), only for the Stream Deck glow. Consider a half- or quarter-resolution bloom with fewer mip levels, a selective bloom limited to the few emissive meshes, or replacing it with a cheap baked glow sprite or halo on the Stream Deck keys.
2. **drei `<SoftShadows>` (PCSS)**: `size ≈ 201`, `samples = 24`, and it patches **every** shadow-receiving material, with a blocker search plus a PCF loop per fragment. That's extremely expensive on a full-screen desk and wall, and it also causes visible grain. Consider plain `PCFSoftShadowMap` with a tuned `shadow.radius`, VSM, or a cheaper PCSS (fewer samples, a smaller search), applied only to the materials that need contact softness. Match the look.
3. **Six `RectAreaLight`s**: the LTC evaluation runs per fragment for every light on every Standard or Physical material. Check that the earlier culling actually happened. Fold tiny contributions (the Stream Deck spill, the typed-text light) into emissive or a cheap point light, or restrict them by layers or materials.
4. **`MeshPhysicalMaterial` on the 80 keycaps**: clearcoat, sheen, and `envMapIntensity` 3.6 make heavy shader paths. With the DoF and normal passes, check how many times the caps get shaded per frame.
5. **DoF**: depth-aware gather cost at full resolution. Downsample it, and adapt the sample count to the CoC.
6. **Extra full-scene renders**: depth or normal prepasses, the monitor reflection capture, environment probe recaptures, shadow updates. Confirm none of them run every frame when idle.
7. **Adaptive DPR**: check that `AdaptiveQuality` actually lowers the DPR under load in production, and doesn't oscillate.
8. **Dust, the terminal canvas texture, the Stream Deck canvas textures**: per-frame texture uploads (`needsUpdate` every frame?).

## 3. Fix

Fix the top offenders, in order of measured cost. **The look must stay the same**: use pixel-delta checks against the current hero (3 colorways), the close-up, the terminal and stage 7, with tight thresholds. If a cheaper technique changes the look slightly, keep the change only if the delta is small, and show a before/after crop in the report. Keep the user's tuned values.

Also add a **quality tier** system if it helps: auto-select a tier from the measured frame time during the first seconds (e.g. high = current; medium = half-resolution bloom and DoF with fewer shadow samples; low = no DoF and PCF shadows), with a `?quality=` override and a Rendering → Quality control in debug. Default to auto. Never flicker between tiers: decide once, with an optional slow re-evaluation.

## Evidence required

1. A before/after table with GPU ms per pass (median/p95) at DPR 1.5 and 2, plus total GPU ms, CPU ms, draw calls, programs, and texture memory. Also the time to interactive and the bundle sizes.
2. Name the **#1 cause** of the bad performance, with numbers.
3. `npm run build` and `npm run shots` (all checks pass, including the new pixel-delta look checks) and `npm run perf`.
4. Commit on `master` with the co-author trailer, and **push** to `origin master`. That triggers the Vercel production deploy. After the deploy, sanity-check https://keyboard.wawasensei.dev, for example with a Playwright load that confirms there are no console errors and reports the GPU timings in production.
5. Do not edit `PROMPTS.md`, `references/` or the other files in `docs/`.
