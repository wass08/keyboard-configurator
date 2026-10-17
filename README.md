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
  Muted satin oak with smaller grain and world-sized edge UVs on a seamless floor.
  `PracticalFixtures.tsx` builds a 27-inch monitor with generated gradient wallpaper,
  an articulated task lamp with forked arms/tension rods, and a suspended LED pendant.
  `Lighting.tsx` attaches the warm shadow-casting spot to the shade axis, a cool
  rectangular rim to the screen's 28mm lower luminous band, and a broad rectangular
  fill to the pendant. The low screen band grazes the rear cap fillets and case
  edges instead of washing the entire top surface. The compact lamp sits fully
  on the back-left with its articulated head reaching forward to aim down and
  back at the keys. The head exterior faces the hero camera; its arm mounts to
  the rear of the shade. The screen uses a smooth Gaussian wallpaper and an
  emission-only material. The monitor neck uses owned rounded-box geometry;
  this avoids extruded-edge raster fragments that pierced the wallpaper in
  software WebGL. A projected screen pixel check guards against their return.
  RectAreaLight LTC uniforms are initialized once. A very low hemisphere approximates
  the ceiling fixture's room bounce; the HDRI stays at low intensity for reflections.
  The 2048px spot shadow map is reused while assembled and invalidated by animation
  or fixture movement. `FloorContact.tsx` caches a single floor contact occlusion
  pass and explicitly disposes its render targets, geometry and filter materials.
  `lightingControls.ts` holds the tuned defaults and Leva position/aim, color and
  intensity controls; `?debug` reveals the otherwise hidden panel, including exposure
  and environment intensity. A warm-neutral key, cooler neutral fill and Khronos
  PBR Neutral tone mapping preserve colorway hues; cap dielectric reflectance
  avoids excessive white specular wash on navy plastic. `?solo=key|rim|fill` isolates one source (fill includes
  its low room bounce), dims the other emissive surfaces, and uses minimal IBL.
  The monitor wallpaper is owned and disposed per mount; fixture meshes/materials
  remain declarative R3F resources. `dimensions.ts` places the keyboard
  center 19 cm behind the desk's front edge (about 11 cm of wrist clearance).
- `src/ui/VariantPicker.tsx`: accessible radio-group picker with roving focus.
- `src/debug.ts`: typed capture/inspection interface for deterministic evidence.
- `scripts/screenshots.mjs`: production screenshots and meaningful assertions for
  partial assembly, every final transform, palette, repeated interruption, real-time
  animation, keyboard selection, reduced motion, mobile overflow and browser errors.
  Also checks the projected hero width (55–65% at 16:10), visible desk front edge,
  and complete keyboard fit in portrait. Practical-light checks assert the caster,
  cached assembled shadows, solo isolation, live Leva edits, and wallpaper/floor
  resource disposal on two unmounts. World-space checks compare the diffuser
  geometry normal with the spotlight-to-target vector (≤3°) and require the
  opening to face away from the hero camera. Alignment is checked again after
  a live head-position edit. `scripts/color-fidelity.mjs` samples 3×3
  median patches from blank top-face points on H, Caps Lock and Enter in the
  actual Glacial Blue, Cool Black and Pink hero PNGs. Checks enforce hue error
  ≤10° for chromatic targets (HSV saturation ≥12%), saturation error ≤12 percentage
  points for every sample, and rendered white saturation ≤5%. Near-neutral hue
  deltas are recorded but not gated because their hue is unstable at low chroma.
- `scripts/performance.mjs`: separate native-GPU production timing while assembled
  and during a colorway change; records the renderer and measured frame times.

## Assets

Poly Haven **Oak Veneer 01**, 2K diffuse, OpenGL normal, roughness and AO;
**Studio Small 09**, 1K HDR. CC0 1.0. Full names, source pages, exact download URLs,
license links and the earlier evaluated wood set are in `public/CREDITS.md`.
No downloaded models, fonts or images of keyboards are used in the app.
The lighting fixtures and screen wallpaper are procedural; milestone 2 adds no assets.

## Evidence and capture hook

`screenshots/` contains `assembly-mid.png`, the seven `<variant-id>.png` renders,
`closeup.png`, `switch-mid.png`, plus `dark-closeup.png`, `profile.png`,
`desk-wide.png`, `desk-frame.png`, `mobile.png`, `checks.json`,
the captured build output in `build.txt`, and hardware timing in `performance.json`.
Milestone 2 adds `lighting-hero.png`, `lighting-hero-cool-black.png`,
`lighting-hero-pink.png`, `lighting-wide.png`, `lighting-closeup.png`,
`solo-key.png`, `solo-rim.png`, and `solo-fill.png`. The wide view includes all
three practical fixtures; the solo views share the default hero camera.
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
```

## Scope and limitations

- **Spec inconsistency:** the heading says 82 keys, but its explicit rows total
  **80** (13 + 15 + 15 + 14 + 14 + 9), matching the supplied reference photos.
  This implementation follows those rows exactly and has 80 keys plus the knob.
- Shapes and colors are procedural visual approximations of the photographs,
  rather than manufacturing CAD or color-calibrated scans. Switch interiors,
  cap undersides and stabilizers are simplified. No RGB underglow is included.
- The studio is intentionally a plain neutral environment. The hero camera shows
  the lower monitor and lamp while keeping the keyboard at about 60% of frame width;
  zoom out to inspect the complete desk and pendant. Area lights do not cast shadows;
  the task-lamp spot supplies the real-time contact shadows.
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

No commit was created. `docs/`, `references/` and `PROMPTS.md` are unchanged.
