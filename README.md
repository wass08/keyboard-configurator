# Keyboard — color study

A procedural 75% keyboard on a 160 × 75 cm electric standing desk. React,
TypeScript, Vite, Three.js, React Three Fiber, Drei, Zustand and GSAP.

## Run

```sh
npm install
npm run dev
```

Drag to orbit; scroll or pinch to zoom. Choose a swatch to disassemble, recolor,
and reassemble. The picker supports Tab, arrows, Home and End. Reduced-motion
preferences remove the stagger and shorten the assembly.

```sh
npm run build
npx playwright install chromium  # first time on a new machine
npm run shots
npm run perf                   # optional native GPU timing, preview on port 4176
```

`shots` serves **the existing production build** with Vite preview on port 4175,
launches headless Chromium with software WebGL, and closes both processes after
capture. Rebuild after source changes. The bundled local CC0 assets mean no
remote asset requests are needed at runtime. `npm run assets` downloads them again.

## Architecture

- `src/keyboard/layout.ts`: explicit key positions, dimensions, legends and default
  color groups, in 19.05 mm units. All scene dimensions are meters.
- `src/keyboard/variants.ts`: seven palettes, body/frame colors, knob finishes and
  per-key group overrides. Future per-key customization can extend this resolver.
- `src/keyboard/geometry/`: cached, width/row-specific keycap shells with rounded,
  tapered sides and a subdivided rectangular cylindrical dish grid with analytic
  smooth normals and six rounded edge strips. Stronger per-row height/tilt sculpt;
  rounded wedge, recessed frame, plate and horizontal case groove builders. The
  case front is approximately 22 mm high, rising to about 40 mm at the back, with
  approximately 3.2 mm clearance between the cap skirts and the well walls.
- `src/keyboard/legends.ts`: one lazily created 2048² transparent white glyph atlas;
  fixed physical text scale, curved legend surfaces and shared tint materials.
- `src/keyboard/materials.ts`: persistent PBR materials shared by color group.
- `src/keyboard/{Keyboard,Case,Keycap,Switches,Knob}.tsx`: assembly composition,
  instanced MX-style switches (dark bases, sloping milky top housings with stem
  openings and side latches, amber cross stems), stabilizer hints, fluted knob and chrome.
- `src/keyboard/assembly.ts`: GSAP lift/recolor/insertion timelines. A new selection
  kills the previous timeline and retargets from current transforms and colors;
  only the final timeline can finish. Initial assembly is about 2.15 seconds.
- `src/state/store.ts`: requested/displayed variant and animation phase. It separates
  selection from the palette currently being rendered during a transition.
- `src/scene/`: physically sized desk, rounded three-stage columns, tapered T-feet
  and levelers, rails/brackets, motor/control enclosure and front-right handset.
  Muted satin oak with real-world grain and mapped eased edges. The desktop
  holds only the keyboard and monitor. `PracticalFixtures.tsx` builds the 27-inch
  monitor, its off-panel reflections, and smooth generated wallpaper. Its owned rounded-box
  neck avoids extruded-edge raster fragments through the wallpaper in software
  WebGL; a projected pixel check guards against their return.
  `StudioWall.tsx` places a real charcoal plaster wall 30 cm behind the desk,
  with 1K CC0 normal/roughness/diffuse maps tiled at 75 cm. The background is
  black, without fog. A dark floor grounds the desk in wide views.
  `Lighting.tsx` uses the user's exact tuned defaults: a **60 × 90 cm**
  RectAreaLight softbox at **(-0.67, 1.75, 0.80)** m, aimed at **(0, 0.79, -0.02)**,
  luminance **10.8**, color **#fff7f0**; a linked shadow spot at **2.385**,
  angle **0.23**, penumbra **0.8**, softness **147**, radius **4.1**. The right
  **1.8 × 1.5 m** area fill is **0.85**, **#eee4ff**, at **(1.4, 1.4, 0.4)**,
  aimed at the same target. Monitor rim and wall glow default to **0**, **#be7cff**;
  exposure is **1**. RectAreaLight LTC uniforms are initialized once. The
  2048px spot map is cached while assembled and invalidated by animation/source/
  shape changes. A 24-sample PCSS filter scales shadow softness with radius.
  `FloorContact.tsx` owns its cached floor occlusion resources.
  `RigEnvironment.tsx` blends rig-matched Drei Lightformers with the existing
  Poly Haven HDRI. Defaults: **lightformerIntensity 2**, **hdriIntensity 0.09**,
  **HDRI rotation 1.2 rad**. Each card uses its actual source's world position,
  plane orientation, size and linear color × luminance × Lightformer multiplier.
  The probe samples at the keyboard, rather than at the world origin. HDRI
  rotation affects only the HDRI, keeping the cards aligned with the rig.
  The outer Environment captures at 256² per face with **frames={1}**; stable
  memoized children prevent rebakes during assembly, orbit or idle frames.
  Changing a reflection-affecting control captures again. The main background
  remains black. Caps use a satin dielectric response (IOR 1.54, roughness 0.6,
  modest rough clearcoat) so dark plastic picks up neutral panel reflections
  while retaining its palette, with the monitor light removed.
  The monitor defaults to **Screen on = false**: near-black non-emissive coated
  glass plus a dim planar reflection of the actual desk and keyboard. Its 768 ×
  432 reflection is cached while stationary, refreshed for camera/light changes,
  and throttled to 30 Hz during assembly. Its geometry, material and target have
  explicit owner disposal. Turning **Screen on** back on restores the generated
  emission-only wallpaper and adds a screen-shaped environment card. The
  existing lower-band rim and rear wall light are retained, gated by Screen on;
  their intensity controls remain at zero until deliberately raised.
  Below Camera, Leva groups **Key · softbox**, **Key · spot (shadows)**,
  **Fill · area**, **Monitor · rim**, **Environment**, and **Rendering**. All
  transforms, source sizes/colors/intensities and shadow parameters are live.
  The spot follows the softbox by default; disabling **Link to softbox** exposes
  independent controls. **Copy lighting values** exports
  `{ lights: { softbox, spot, fill, monitor }, environment, rendering }`, including
  Screen on, wall spill, linkage, both environment weights and HDRI rotation.
  `?solo=key|softbox|spot|fill|rim|env` isolates each role. Key includes both key
  emitters; env has only the two reflection cards plus dim HDRI. Other solos
  retain 0.008 HDRI and no Lightformers. Solo rim is intentionally dark with
  the user's default monitor-off/zero-intensity values. Khronos PBR Neutral
  tone mapping preserves palette hues.
  `CameraRig.tsx` puts **Camera first** in the `?debug` panel. It shows distance
  in meters (3 decimals) and polar/azimuth angles, refreshed at 10 Hz only in
  debug mode. `minDistance` / `maxDistance` sliders cover 0.10–6.00 m and apply
  live. **Set min = current**, **Set max = current**, **Copy camera values**, and
  **Reset camera** support exploration. Copy writes clipboard JSON with
  `{ minDistance, maxDistance, distance, polarDeg, azimuthDeg, position, target }`.
  Reset restores the hero view and original bounds. The user's chosen defaults are **0.317 m /
  0.719 m** and remain enforced on every viewport and capture preset.
  `dimensions.ts` places the keyboard center 19 cm behind the front edge.
- `src/ui/VariantPicker.tsx`: accessible radio-group picker with roving focus.
- `src/debug.ts`: typed capture/inspection interface for deterministic evidence.
- `scripts/screenshots.mjs`: production screenshots and meaningful assertions for
  partial assembly, every final transform, palette, repeated interruption, real-time
  animation, keyboard selection, reduced motion, mobile overflow and browser errors.
  Also checks the projected hero width (55–65% at 16:10), visible desk front edge,
  and records portrait crop honestly under the user's 0.719 m maximum. Mobile
  tests still enforce reduced motion, seated assembly, no DOM overflow, and the
  exact camera bounds. Studio checks assert entire softbox/fill bounds outside
  the hero frustum, the sole shadow caster, cached shadows, all six solo modes,
  live linking/unlinking, full default/edited lighting clipboard JSON, camera
  limits/current-distance buttons, camera clipboard/reset, and
  exact tuned defaults, screen-off and screen-on paths, wallpaper continuity,
  matching actual reflection-card transforms/radiance, debug-store movement,
  idle cubemap/planar caching, and owned wallpaper/reflection/cubemap/plaster/floor
  resource disposal on two unmounts. The shared HDRI loader cache remains separate.
  `scripts/color-fidelity.mjs` samples 3×3 median patches from blank top-face
  points on H, Caps Lock and Enter in the
  actual Glacial Blue, Cool Black and Pink hero PNGs. Checks enforce hue error
  ≤10° for chromatic targets (HSV saturation ≥12%), saturation error ≤12 percentage
  points for every sample, and rendered white saturation ≤5%. Near-neutral hue
  deltas are recorded but not gated because their hue is unstable at low chroma.
- `scripts/performance.mjs`: separate native-GPU production timing while assembled
  and during a colorway change; records the renderer and measured frame times.

## Assets

Poly Haven **Oak Veneer 01**, 2K diffuse, OpenGL normal, roughness and AO;
**Studio Small 09**, 1K HDR; **Plastered Wall 04**, 1K diffuse, OpenGL normal and roughness. CC0 1.0. Full names, source pages, exact download URLs,
license links and the earlier evaluated wood set are in `public/CREDITS.md`.
No downloaded models, fonts or images of keyboards are used in the app.
The monitor geometry and screen wallpaper are procedural.

## Evidence and capture hook

`screenshots/` contains `assembly-mid.png`, the seven `<variant-id>.png` renders,
`closeup.png`, `switch-mid.png`, plus `dark-closeup.png`, `profile.png`,
`desk-wide.png`, `desk-frame.png`, `mobile.png`, `checks.json`,
the captured build output in `build.txt`, and hardware timing in `performance.json`.
Studio evidence includes `lighting-hero.png`, `lighting-hero-cool-black.png`,
`lighting-hero-pink.png`, `lighting-wide.png`, `lighting-closeup.png`,
`solo-key.png`, `solo-softbox.png`, `solo-spot.png`, `solo-fill.png`,
`solo-rim.png`, `solo-env.png`, `monitor-off.png`, `monitor-on.png`, and `debug-camera.png`.
The solo views share the default hero camera; the debug view exposes Camera.
`lighting-closeup.png` uses Cool Black so the broad cap-edge and chrome highlights
are easier to inspect. The separate `closeup.png` retains Glacial Blue.
The extra views verify the smooth dark dishes, row sculpt and case step, complete
desk, under-desk construction and responsive framing. The picker has no status dot.

With `?capture=1`, timelines start paused. Once `window.__kb.ready` is true:

```js
window.__kb.setVariant('emerald');
// Wait for generation to increase after a selection.
window.__kb.seek(0.88);       // pause at a reproducible timeline time
window.__kb.finish();        // run all finalization callbacks
window.__kb.play();          // resume real-time animation
window.__kb.camera('closeup'); // also 'default', 'profile', 'desk', 'desk-frame',
                              // 'lighting-wide', 'lighting-closeup'
window.__kb.finished;        // assembled, last requested palette
window.__kb.inspect();      // offsets, palette, draw calls, geometry counts, framing
window.__camera();          // actual orbit limits, distance, angles, position and target
window.__lighting();        // roles, actual emitters, panel state, frusta and tuning values
window.__environment();     // actual reflection cards, HDRI weights/rotation, capture count
window.__lightingStore.set({ // same live Leva store used by the debug panel
  'Key · softbox.keyPosition': { x: -0.75, y: 1.75, z: 0.8 },
});
```

## Scope and limitations

- **Spec inconsistency:** the heading says 82 keys, but its explicit rows total
  **80** (13 + 15 + 15 + 14 + 14 + 9), matching the supplied reference photos.
  This implementation follows those rows exactly and has 80 keys plus the knob.
- Shapes and colors are procedural visual approximations of the photographs,
  rather than manufacturing CAD or color-calibrated scans. Switch interiors,
  cap undersides and stabilizers are simplified. No RGB underglow is included.
- This is deliberately a black product studio. The desktop hero keeps the
  keyboard at about 56% of frame width. When enabled, the rear monitor glow is
  an area-light approximation. The environment is sampled once at the keyboard;
  reflection parallax is approximate away from that point, as with any cubemap. Area lights do not cast shadows; the co-located spot supplies
  soft contact shadows. The broad dim right fill preserves contrast.
- **Portrait framing at the chosen limit:** at 390 × 844, the full keyboard
  projects to approximately **192% of viewport width** at the enforced 0.719 m
  maximum, so the keyboard is cropped, particularly on the right. This is recorded in `checks.json` and
  `mobile.png`; the camera distance is never overridden. A proposed next change
  is a portrait-only vertical FOV around **63°**, with the target centered on the
  keyboard, keeping the same distance limits. This proposal is **not applied**.
  Existing wide-view capture directions also obey the chosen maximum, so their
  names no longer imply that the complete desk fits. The Camera panel can still
  be used to explore other bounds deliberately.
- DPR is clamped to 1–2. Switches are instanced; cap geometries and materials are
  shared. Screenshot evidence uses SwiftShader. A separate hardware Metal run on
  Apple M5 Max measured approximately 60 fps both assembled and during a variant
  change in the production build at 1440 × 900, DPR 1.5; this is one
  machine, rather than a cross-device guarantee. See `screenshots/performance.json`.
  Render counts are recorded in `screenshots/checks.json`.
- The Three.js runtime is a substantial vendor chunk; Vite reports its size.
  Separate vendor chunks keep the app's own bundle small and cacheable.
- Later milestones (per-key editing, switch options, sound, case options and
  export) are intentionally outside this milestone.

No commit was created. This milestone does not alter `docs/`, `references/` or
`PROMPTS.md`; pre-existing working-tree changes are preserved.
