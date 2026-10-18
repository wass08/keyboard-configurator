# Spec 10 — Performance pass, and depth of field that works at every distance

Assigned to **Codex**, on `master`, after the terminal-transcript task.

## 1. Depth of field: robust at every camera distance

Reference: `references/issue-dof-close-edges.png`. This is a close-up near min distance, Pink colorway. The user likes **focal range 0.38** at the normal hero distance. But when zoomed in, the **edges of the farther keys blur "weirdly"**: horizontal smeared streaks along the keycap silhouettes (Esc, F1–F4) and along the monitor bezel, and halos where sharp foreground edges meet the blurred background.

- **Diagnose** the artifact first. Candidates: CoC bleeding between the in-focus foreground and the blurred background (no near/far separation, or no depth-aware gather), a too-low sample count or a resolution scale, a horizontal-only blur stage, autofocus jitter, or the DoF running at a resolution that mismatches the depth buffer. Explain the cause in the report.
- **Fix the edge quality.** Out-of-focus background must not bleed over in-focus foreground silhouettes. Foreground (near) blur may overlap the background softly, as in a real lens. Use depth-aware gathering, or pmndrs' DoF with correct near/far CoC handling, or a better custom CoC gather if needed. There must be no streaks or ringing.
- **Make it work in all situations.** A fixed world-space focal range doesn't behave consistently across the orbit distances (0.317–1.351 m) or angles. Implement **auto focal range**:
  - Compute the keyboard's depth extent along the view direction from its bounding box each time the camera moves (it's cheap: 8 corners).
  - Focus on the keyboard's depth center.
  - Set the focal range so the **whole keyboard stays acceptably sharp**, at minimum the user's **0.38**, so the hero look is unchanged at default distance.
  - Let the background (monitor, wall, Stream Deck) and any near foreground blur naturally.
  - Smooth it like the autofocus (~120 ms).
  - Bokeh scale may scale gently with distance, so very close views don't explode the blur. Expose the curve.
- Controls: in Camera → Lens, add an **Auto focal range** toggle (default on), a min focal range (default 0.38), a margin, and a bokeh distance-scaling amount. Include them in Copy camera values. Manual mode still works.
- Checks:
  - At min distance, default distance and max distance, plus two orbit angles, the keyboard's sharpness stays above a threshold (e.g. edge contrast at a few cap edges vs a DoF-off reference), and the background is blurred.
  - A silhouette-bleed check: at the reference close-up angle, the in-focus cap edge against the blurred background shows no smear band wider than N px.
  - Shots: `dof-close.png` (matching the reference), `dof-default.png` and `dof-far.png`.

## 2. Performance pass

Profile first (GPU timer queries via `EXT_disjoint_timer_query_webgl2` where available, `renderer.info`, and Chrome tracing in Playwright if useful). Then optimize the real hotspots without changing the look. Likely targets, to verify rather than assume:
- **RectAreaLights**: there are about 6 (softbox, fill, monitor rim, wall glow, typed-text light, Stream Deck spill), and each costs LTC math per fragment on every Standard or Physical material. Consider culling lights per material where they have no visible effect (e.g. the wall-glow light only matters for the wall and desk, and the Stream Deck spill only nearby). In WebGL that means separate materials or layers, or folding tiny contributions into the environment or emissive terms. Measure before and after, and keep the look identical (pixel delta thresholds).
- **Draw calls**: currently ~236–463 with DoF. Instance or merge the keycaps (80 caps plus legends; keep per-key animation via instance matrices or a per-instance offset attribute), the switches (already instanced?) and static props and desk parts. Use `matrixAutoUpdate = false` for static objects.
- **Shadows**: one spot shadow map, updated only while animating (existing). Verify it's not re-rendered every frame by DoF, dust or interaction.
- **Post chain**: DoF, bloom, grading and vignette. Merge compatible effects into one pass, size the internal buffers sensibly (bloom/DoF at half resolution where invisible), and avoid duplicate depth/normal passes.
- **Environment probe**: confirm it only re-captures on change.
- **Adaptive quality**: add a drei `PerformanceMonitor`-style adaptive DPR (clamped between [1, 2], with hysteresis, never flickering). Optionally, an idle mode that drops to a lower frame rate when nothing moves and the dust is off-screen. Only do this if it's invisible: the dust and the caret blink must still animate smoothly.
- **Main thread**: no per-frame allocations (check the `useFrame` callbacks), no React re-renders per frame, and leva updates don't re-render the whole scene.
- **Load time**: bundle split (the three chunk is >500 kB: lazy-load leva/debug, postprocessing if possible, the audio), texture sizes and formats (KTX2/Basis if it's worth it), and shader precompile (exists). Report the time to first frame and the time to intro start.

Report a before/after table: GPU ms per frame (with each major contributor), CPU ms per frame, draw calls, triangles, programs, texture memory, bundle sizes, time to first frame, and fps at 1440×900 DPR 1.5. Also report a throttled run (Playwright CPU throttling 4×, plus a smaller GPU budget if possible) to show the headroom.

## Evidence required

1. `npm run build` passes, with the bundle-size table.
2. `npm run shots` passes all checks, plus the new DoF checks, and the pixel-delta checks proving the perf changes kept the look (hero ×3 colorways, closeup, terminal).
3. `npm run perf`: the before/after table above.
4. Commit on `master` (one or a few focused commits) with the co-author trailer:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Do not edit `PROMPTS.md`, `references/` or `docs/`.
