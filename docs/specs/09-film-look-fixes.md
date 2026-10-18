# Spec 09 — Monitor rim values, headphone stand fix, anamorphic pass, tone mapping / grading, dust visibility

Assigned to **Codex**, on `master` in the main checkout. In parallel, the **Opus sound agent** works in `../kc-sfx` (branch `feat/synth-sfx`, fast-forwarded to master) on `src/audio/*`, `public/audio/*` and `scripts/extract-samples.mjs`. **Don't touch those.**

## 1. Lighting defaults (user's "Copy lighting values")

Apply these as the code defaults (everything else in their JSON already equals the current defaults):
- **monitor rim**: `screenOn` true, intensity **7.1**, color **#8f77ff**, 0.598 × 0.028, position (0, 1.025, −0.43), aim (0, 0.99, 0)
- **wall glow**: intensity **27.2**, color **#8f77ff**, 0.5 × 0.26, local position (0, 0, −0.06)
- **screen text light**: enabled, textIntensity **12**, textFlare **0.32**
- Dust: see section 5. Don't just copy their intensity 0.06; recalibrate instead.

Update the lighting round-trip check.

## 2. Headphone stand intersection

Reference: `references/issue-headphone-stand-intersection.png`. The walnut headrest bar pokes **through** the stainless headband frame / the rounded top of the AirPods Max. Fix the geometry or placement so the headband (frame and canopy) **rests on** the walnut bar: the canopy sits on the bar's top, the stainless frame arc clears the bar's ends and sides with a small visible gap, and nothing interpenetrates from any angle. Keep the cups hanging symmetrically. Add an automated interpenetration check: sample the bar's bounding geometry against the headband meshes, or use a few raycasts/SDF samples, and assert a clearance of ≥ 0.5 mm.

## 3. Anamorphic pass (film look)

- The user pointed at three.js' `webgpu_postprocessing_anamorphic.html`. That example is **WebGPU/TSL-only**, and this app renders with `WebGLRenderer` + `@react-three/postprocessing`, so **port the technique** as a custom postprocessing `Effect`/pass: threshold the bright areas, build long **horizontal** streaks with a downsampled multi-tap horizontal blur (a few iterations, cheap), tint them (the classic blue-cyan anamorphic flare, configurable), and add the result back. Match the example's look and parameters where it makes sense (threshold, scale/length, intensity, samples, resolution scale).
- Bright sources that should streak subtly: the Stream Deck keys, the monitor screen edges or text when bright, the knob's chrome highlights, and the dust only if it's genuinely bright. Keep it **tasteful**: off-screen-bright highlights only, never a smeared image.
- Put the pass in the existing composer, after bloom and before or with tone mapping (see section 4). Order it correctly relative to depth of field.
- Add a `?debug` **"Film"** folder holding: anamorphic enabled, threshold, intensity, streak length, tint color and resolution. Default **on**, but subtle. Include them in "Copy lighting values".

## 4. Tone mapping and color grading controls

- Add tone mapping operator selection to the Film folder: **ACES Filmic, AgX, Neutral (current default), Reinhard, Cineon, Linear**, plus exposure. With the EffectComposer the renderer's own tone mapping doesn't apply to the final output. Make sure tone mapping happens **exactly once**, in the right place in the chain (a `ToneMappingEffect` at the end, or the renderer's toneMapping when no composer runs), and that the output colorspace stays correct. **The default must stay visually identical to today (Neutral, exposure 1)**, so the existing hue/color checks keep passing.
- Color grading: contrast, saturation, vibrance, temperature/tint (white balance), lift/gamma/gain (simple per-channel or luminance, your call), and a vignette (amount, softness). A single custom grading `Effect` is preferred (one fullscreen pass). Defaults are neutral (no change).
- Include everything in "Copy lighting values" (a `film` section).
- Add checks: switching to ACES/AgX changes the output (pixel delta > 0); Neutral defaults keep the hue checks passing; tone mapping isn't applied twice (compare against a reference single-pass render, or inspect the composer's effect list and `renderer.toneMapping` while the composer is active).

## 5. Dust: invisible even at max

The user can't see any dust, even with every dust control at max. Diagnose this before tuning. Likely culprits:
- **Depth of field is now on by default**, with autofocus on the keyboard and focal range 0.285. The motes float between the light and the keyboard, so they're out of focus and get blurred into nothing. If so, render the dust **after** DoF in a separate pass, or composite it with a soft bokeh-like enlargement driven by its circle of confusion (sprite size and alpha grow while staying faint), so out-of-focus dust reads as soft, gentle specks, like real out-of-focus dust in a beam.
- The cap at half the bloom threshold, combined with the new low defaults, may have left the slider ranges too low to ever be visible. Raise the ranges so max is clearly visible.
- The narrow spot (angle 0.21) shrinks the lit volume; check that the dust volume still overlaps the cone in the default view.

Then recalibrate: the **default** shows a few faint motes catching the light, noticeable on a second look (between the previous "too prominent" and today's "invisible"). Max makes them obvious. Add a check that dust contributes a small but non-zero pixel delta in the **default hero with DoF on**, and that the delta at max dust intensity is clearly larger.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. `npm run shots`: all checks pass. Add:
   - `headphones-fixed.png`, matching the reference angle
   - `film-anamorphic-on.png` and `film-anamorphic-off.png`
   - `tonemap-aces.png`, `tonemap-agx.png` and `tonemap-neutral.png`
   - `grade-example.png`, a tasteful example grade showing the controls work (not the default)
   - `dust-default-dof.png` and `dust-max-dof.png`
   - the refreshed hero, with the purple monitor rim and wall glow
3. `npm run perf`: ~60 fps with DoF, bloom, anamorphic and grading all on. Report the cost of each.
4. Inspect the shots yourself and iterate. The film look must stay subtle and premium.
5. Commit on `master` with a clear message ending with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Do not edit `PROMPTS.md`, `references/` or `docs/`.
