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
launches headless Chromium with Metal on macOS (SwiftShader elsewhere), and closes both processes after
capture. Set `SHOTS_RENDERER=swiftshader` to force software WebGL. Rebuild after source changes. The bundled local CC0 assets mean no
remote asset requests are needed at runtime. `npm run assets` downloads them again.

`?debug` → **Camera → Lens** edits the live perspective camera: linked focal
length (12–200 mm) and vertical FOV, film gauge, and near/far clipping. Sensor
edits retain focal length; resizing retains vertical FOV and recalculates its
equivalent focal length. Defaults are 32° vertical, 35 mm film gauge, 0.008–25 m
clipping (38.1436 mm at 16:10). Existing orbit limits remain 0.317–0.719 m.
**Copy camera values** includes all nine lens parameters; **Reset camera** restores
the lens, pose and orbit bounds. The optional depth-of-field controls default off,
with focus distance 0.719 m, bokeh scale 1 and a 0.1 m sharp focal range.
**Focus on keyboard** measures from the current camera to the case's world-space
center. DoF uses a disabled-by-default BokehPass after selective HDR bloom and
before tone mapping; its depth draw and blur are skipped when off. Per-mount
depth targets/materials are disposed with the existing composer.
`npm run shots` also checks lens conversion, sensor/FOV linking, copy/reset,
portrait resizing and DoF pixels/disposal; captures `lens-85mm.png` (same pose)
and `lens-dof.png`. `npm run perf` reports DoF off and on separately.

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
  holds exactly the keyboard, monitor, felt mat, 15-key control pad and headphones
  on their walnut stand. `PracticalFixtures.tsx` builds the 27-inch
  monitor, its off-panel reflections, and smooth generated wallpaper. Its owned rounded-box
  neck avoids extruded-edge raster fragments through the wallpaper in software
  WebGL; a projected pixel check guards against their return.
  `StudioWall.tsx` places a real charcoal satin-painted wall 30 cm behind the desk. It uses generated,
  non-repeating 512² roller/orange-peel normal and roughness fields; the
  plaster scans are removed. Paint defaults are **#2a2b2e**, roughness **0.55**,
  normal strength **0.035**. An explicit environment response of 3.5 keeps
  charcoal visible in the dim studio while the physical softbox and rear
  monitor glow supply the falloff and sheen. The background is
  black, without fog. A dark floor grounds the desk in wide views.
  `Lighting.tsx` saves the spec 05 user-tuned rig exactly: **44 × 68 cm**
  softbox at **(-0.67, 1.75, 0.80)** m, aimed at **(0, 0.79, -0.02)**,
  intensity **0.75**, **#fff7f0**; linked spot **6.235**, angle **0.21 rad**,
  penumbra **0.78**, softness **147**, radius **4.1**. The right **1.8 × 1.5 m**
  fill is **0.25**, **#eee4ff**, at **(1.4, 1.4, 0.4)**, with the same aim.
  Monitor **Screen on** defaults true; rim **0**, rear wall glow **23.3**, both
  **#8d2d2d**. Exposure is **1**. RectAreaLight LTC uniforms are initialized once;
  the 2048px spot map is cached while assembled and uses 24-sample PCSS edges.
  `RigEnvironment.tsx` uses **lightformerIntensity 1.28**, **hdriIntensity 0.095**,
  **HDRI rotation −1.29 rad**. Cards match the real source positions, sizes,
  plane orientations and radiance. The probe is at the keyboard; the HDRI rotates
  independently. Stable memoized portal children and **frames={1}** at 256²
  capture only when a reflection-affecting setting changes, never for assembly,
  orbit or idle frames. The main background remains black.
  The monitor's wallpaper is independent of its red rear bias light. Its screen
  card uses the generated wallpaper's measured mean in linear light, preserving
  neutral plastic reflections while the wall stays red. Caps retain their palette
  hexes and satin finish, with explicit environment response **1.45**. Turning
  Screen on off restores near-black coated glass and a dim planar reflection of
  the actual desk and keyboard. That pass is cached while stationary and limited
  to 30 Hz during assembly. All of its allocated resources are owned/disposed.
  `Desk.tsx` uses MeshPhysicalMaterial for satin-lacquered oak. The **Desk** Leva
  folder defaults to **normal strength 0.45**, **coat normal strength 0.18**,
  **clearcoat 0.24**, **coat roughness 0.22**, **coat roughness map influence 0.32**,
  base grain roughness **0.30 + 0.32 × map**, and **envMapIntensity 0.9**.
  Both layers share the veneer normal and roughness textures, with the lacquer's
  weaker normal response representing partly filled pores. Coat roughness is
  `clamp(0.22 + 0.32 × (map − 0.5), 0.0525, 1)`; zero influence makes it uniform.
  Every value is live and included in **Copy lighting values**. Uniform changes
  do not rebuild geometry or recapture the environment.
  The former 0.055 base normal was too weak, the coat had neither map, and an
  analytic panel replacement suppressed standard coat IBL to 8%. The result
  could not show convincing grain in the lacquer reflections. That replacement,
  its panel uniforms, and its duplicate layout-follow wiring have been removed.
  Both layers now use Three's standard per-pixel normal/roughness-dependent IBL
  and direct specular, with full coat IBL from the shared rig environment.
  The base's lower roughness adds soft grain-modulated specular even uncoated.
  The material explicitly binds the existing environment so its own intensity
  works. It retains the warm base texture, 88% chroma and existing eased-edge UVs.
  The keyboard-centered cubemap remains an approximation for nearby parallax;
  it is shared and captured only when reflection-source controls/layout change.
  No reflection-specific rectangles, extra render passes, or textures are added.
  The wall reflection card represents diffuse paint return (0.035 gain),
  following the saved 23.3 / #8d2d2d bias light and gating with screenOn.
  The LCD uses 0.62 radiance and a subdued continuous mint/lavender gradient;
  its environment card uses the same radiance and linear average color. The front-left softbox
  catches the eased front edge; the rear screen is seen in the horizontal top
  at grazing angles. The felt masks the central reflection, as a real mat would.
  `props/DeskMat.tsx` builds a **90 × 40 cm**, **4 mm** felt pad with 14 mm plan
  corners and a compressed 0.6 mm edge. ambientCG Fabric 034 supplies 2K color,
  normal and roughness at 22 cm tile scale, tinted heathered charcoal with sheen
  and very low dielectric shine. Edge UVs use thickness rather than stretching
  the top texture vertically. Keyboard feet are seated on the measured mat top:
  `KEYBOARD_Y` accounts for the case tilt and half the rubber-foot thickness.
  Root placement carries every assembly target, switch, cap and shadow upward.
  `props/StreamDeck.tsx` builds a 118 × 84 × 21 mm black control pad on an open
  wedge stand. Fifteen clear rounded key tops protrude **3 mm** above the faceplate,
  with **0.3 mm** opening gaps; LCD faces sit **0.6 mm** below the tops.
  Tops and bezels are instanced, LCDs share one merged generic icon atlas.
  A dark icon on the white key preserves contrast. **Stream Deck** controls
  default to emission **2.4**, bloom strength **0.16**, threshold **1.25**,
  and spill intensity **0.8**. One **10 × 1.8 cm** RectAreaLight, colored from
  the atlas's measured linear average, aims down across the plate and nearby support surface.
  The area source avoids a point-like specular pinprick on wood. It follows the deck
  and is disabled in all isolated-light captures. No logos or wordmarks.
  `StudioPost.tsx` uses Three's HDR EffectComposer, UnrealBloomPass and OutputPass.
  The high luminance threshold blooms bright LCD content while leaving the
  monitor gradient and ordinary paint/caps alone. Neutral tone mapping/exposure
  run once at output. MSAA preserves edges; all per-mount targets and materials
  are released on unmount (including the bloom library's high-pass material).
  `props/Headphones.tsx` builds smooth superellipsoid aluminum cups, rounded knit
  cushions and baffles, solid normal/roughness-mapped knit canopy with sheen,
  thin stainless headband rails and straight polished telescoping stems. Both
  vertical cups face inward symmetrically, with top-center hinges. Space-grey
  anodized aluminum uses #5d5f63, metalness 0.9 and roughness 0.34; crown/button
  sit atop the right cup. Its rounded walnut tray and curved headrest
  reuse the desk's wood family with a darker finish. Props stay static during
  keyboard assembly, cast/receive shadows, share geometry/materials, and explicitly
  dispose owned geometry, materials and cloned/generated textures. Shared loader
  textures and the environment remain separate owners.
  `PropLayout.tsx` and `state/layout.ts` provide constrained **Layout** controls
  below Camera: X/Z position and Y rotation in degrees for the headphone stand,
  monitor and Stream Deck. **Show gizmos** is off by default and only renders
  drei PivotControls in `?debug`. The handles have X/Z arrows, an XZ plane and a
  Y arc; no height, scaling or other rotation handles. Orbit pauses for the entire
  real pointer drag. Numeric fields and handles share one store. Rotated footprints
  clamp to the desk; the deck sits on the highest surface its support touches,
  following the felt's 4 mm height as it moves on/off it.
  **Copy layout values** exports `{ headphones, monitor, streamdeck }`, each with
  `{ x, y, z, rotationY }`. Default X/Z/Y-rotation values are headphones
  `(-0.5380, -0.3517, 0.0°)`, monitor `(0, -0.3840, 0.0°)`, and Stream Deck
  `(0.2810, -0.3350, -24.6°)`; all three resolve to wood height **0.75 m**.
  The copied headphone angle −0.019° rounds to 0.0°. Position fields preserve four
  decimals and rotation fields show degrees to one decimal. The Stream Deck is
  fully behind the mat at startup; moving onto felt still raises it to 0.754 m.
  Monitor geometry and the saved light rig retain their original calibration
  frame, transformed by Layout from first mount. Moving the
  monitor carries its complete stand, screen, rim/bias lights and reflection card.
  The rear glow projects back onto the wall. Wood follows the same cached rig
  environment through standard IBL, with no separate desk-coat transform wiring.
  Cubemaps stay frozen during a pointer drag and refresh once on release;
  numeric/debug-store edits refresh once, with no idle captures. Prop moves also
  invalidate the spot's cached shadows.
  Below Layout, Leva groups **Key · softbox**, **Key · spot (shadows)**,
  **Fill · area**, **Monitor · rim**, **Desk**, **Environment**, **Stream Deck**, **Wall**, and **Rendering**.
  Copy lighting values exports
  `{ lights: { softbox, spot, fill, monitor }, desk, environment, streamDeck, wall, rendering }`.
  The spot follows the softbox by default and can be unlinked.
  `?solo=key|softbox|spot|fill|rim|env` isolates each role. Key includes both key
  emitters; rim now shows only the saved red wall glow (screen rim is zero).
  Env has four reflection cards plus dim HDRI. Other solos keep 0.008 HDRI
  and no Lightformers. Khronos PBR Neutral tone mapping preserves palette hues.
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
  idle cubemap/planar caching, and owned wallpaper/reflection/cubemap/paint/floor
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
**Studio Small 09**, 1K HDR. The wall uses procedural paint maps.
ambientCG **Fabric 034**, 2K color, OpenGL normal and roughness, for felt and
cushions. All CC0 1.0. `npm run assets` requires the standard `unzip` utility
for the ambientCG archive. Full names, source pages, exact download URLs,
license links and the earlier evaluated wood set are in `public/CREDITS.md`.
No downloaded models, fonts, logos or images of keyboards/props are used in the app.
The monitor geometry and screen wallpaper are procedural.

## Evidence and capture hook

`screenshots/` contains `assembly-mid.png`, the seven `<variant-id>.png` renders,
`closeup.png`, `switch-mid.png`, plus `dark-closeup.png`, `profile.png`,
`desk-wide.png`, `desk-frame.png`, `mobile.png`, `checks.json`,
the captured build output in `build.log`, and hardware timing in `performance.json`.
Studio evidence includes `lighting-hero.png`, `lighting-hero-cool-black.png`,
`lighting-hero-pink.png`, `lighting-wide.png`, `lighting-closeup.png`,
`solo-key.png`, `solo-softbox.png`, `solo-spot.png`, `solo-fill.png`,
`solo-rim.png`, `solo-env.png`, `monitor-off.png`, `monitor-on.png`, and `debug-camera.png`.
The solo views share the default hero camera; the debug view exposes Camera.
`lighting-closeup.png` uses Cool Black so the broad cap-edge and chrome highlights
are easier to inspect. The separate `closeup.png` retains Glacial Blue.
Spec 06 adds `wall-paint.png`, `gizmos-debug.png` and `layout-moved.png`.
The latter moves all three props through the debug store with their attached
lights and reflection cards. Checks exercise real gizmo pointer drags, orbit
locking/release, one cubemap recapture, numeric/store/clipboard round-trips,
clamps and mat support.
Spec 05 adds `props-wide.png`, `props-streamdeck.png`, `props-airpods.png`,
`deskmat-closeup.png`, `desk-sheen.png`, and `desk-sheen-uncoated.png`.
These product detail captures hide the picker to leave the objects unobscured;
hero, mobile and debug captures keep the actual UI. The wide preset uses a 64°
lens while retaining the user's orbit bounds, fitting all five desk objects.
The grazing preset exposes the bare wood beside the mat. A paired 9×9-pixel
wood sample checks that clearcoat adds visible reflected light. The wood follow-up
adds `desk-sheen-closeup.png` plus paired smooth-finish, smooth-coat and disabled-
Lightformer captures. Fixed bare-wood pixels verify directional grain breakup in
lighting response, the coat's own map response, and actual rig-IBL contribution,
replacing the former finite-panel spatial-localization assertion. Tests also
measure actual world-space foot/mat contact within 0.5 mm, case clearance,
static prop bounds during assembly, all-prop wide framing, startup lighting
clipboard round-trip, live desk material/uniform controls, and prop disposal.
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
                              // 'lighting-wide', 'lighting-closeup', 'props-wide',
                              // 'props-streamdeck', 'props-airpods', 'deskmat-closeup', 'desk-sheen', 'wall-paint'
window.__kb.finished;        // assembled, last requested palette
window.__kb.inspect();      // offsets, palette, draw calls, geometry counts, framing
window.__camera();          // actual orbit limits, distance, angles, position and target
window.__lighting();        // roles, actual emitters, panel state, frusta and tuning values
window.__environment();     // actual reflection cards, HDRI weights/rotation, capture count
window.__props();           // measured contact, prop bounds, actual desk finish and wood sample
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
