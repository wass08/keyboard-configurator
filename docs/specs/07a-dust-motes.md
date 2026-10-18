# Spec 07a — Dust motes in the key light

Assigned to: **Opus agent**, branch `feat/dust-motes`, in its own git worktree. A parallel Codex agent is building the intro animation (spec 07b) on another branch. Stay inside the files listed here, so the merge stays clean.

## Goal

A few dust motes drift slowly through the studio key light. They give the static product shot some life. They must be **very lightweight**: one draw call, no per-frame allocations, and a negligible GPU cost.

## Behaviour

- **Count**: about 120–250 motes by default (expose it as a control). They're tiny (sub-millimeter to ~1 mm), soft and round.
- **Visible only inside the key light cone**: the mote brightness is modulated in the shader by the spotlight's cone (angle + penumbra) and distance falloff, using the **live** key light parameters. The key spot lives in `src/scene/Lighting.tsx`, with controls in `src/scene/lightingControls.ts` (`keyPosition`, `keyAim`, `keyAngle`, `keyPenumbra` or similar; read the code for the exact names). Motes outside the cone are invisible, so it reads as dust catching a light beam. Moving the key light in `?debug` moves the lit region.
- **Motion**: slow and organic. Gentle Brownian/curl-noise drift plus a very slight upward convection, computed **in the vertex shader** from time and a per-mote seed. No CPU update loop over the particles. Motes wrap inside a bounding volume around the beam, between the light and the keyboard/desk, so the density stays constant.
- **Look**: additive or premultiplied soft sprite (a radial falloff in the fragment shader, no texture needed). Warm-neutral, tinted by the key color. Slight twinkle as motes turn (a per-mote phase). Size attenuation with distance, clamped so motes close to the camera never become big blobs. Fade near the camera's near plane. `depthWrite: false`, and depth test on, so the keyboard and props occlude them. Keep them below the bloom threshold by default, so they don't bloom (see the Stream Deck bloom setup).
- **Must not**: cast or receive shadows, trigger shadow-map updates (the app only updates shadows during animation, so check `gl.shadowMap.autoUpdate` logic stays intact), invalidate the environment probe, or be included in the environment capture.
- `prefers-reduced-motion`: motes stay but move ~5× slower.

## Controls (`?debug`)

A **Dust** folder: enabled (default on), count, size, intensity, speed, volume padding. Include these values in "Copy lighting values" (look at how the existing folders are wired into that JSON).

## Files

- New: `src/scene/DustMotes.tsx` (and a small shader module if you prefer).
- Mount it from the scene, where the other scene components are mounted (likely `src/scene/Stage.tsx` or `Lighting.tsx`). Keep the mount change to a single line if possible.
- `src/scene/lightingControls.ts`, for the Dust folder and the copy JSON.
- `scripts/screenshots.mjs`: add new shots and checks in a **new, clearly delimited block** (e.g. `// --- dust motes (spec 07a) ---`), so the merge with the intro-animation branch is easy.
- README: a short section.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. Run `SHOTS_PORT=4185 PERF_PORT=4186 npm run shots` (the ports are env-configurable; another agent uses the defaults in parallel). Add:
   - `dust-hero.png` (the default camera; the motes are visible in the beam, subtle)
   - `dust-closeup.png`
   - checks: dust is a single draw call (`renderer.info` before/after toggling), and the motes outside the cone render at ~0 brightness (e.g. a shader-equivalent CPU evaluation on sampled seeds, or a pixel test against a dark region). Dust adds no shadow-map updates when assembled. Its resources are disposed (add them to the existing disposal check).
   - All existing checks still pass.
3. Run perf with `PERF_PORT=4186 npm run perf`, and report the fps with dust on vs off.
4. Look at the shots yourself and iterate. It should feel like a premium product film, and not like snow or a particle demo.
5. Commit on your branch `feat/dust-motes` with a clear message ending with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Do not edit `PROMPTS.md`, `references/` or `docs/`. Do not merge into main.
