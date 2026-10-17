# Spec 01 — Main staging

Goal: the first milestone of a **professional 3D keyboard configurator** on the web. This milestone delivers the staging only: a standing desk with a PBR wood top, a procedurally built 75% keyboard in 7 colorways, and an "assembly" animation of keycaps + knob going into / out of their slots on first load and every time the colorway changes.

Reference photos (one per colorway) are in `references/`. Study them closely — the keyboard must read as *that* keyboard.

## Stack

- Vite + React + TypeScript + `three` + `@react-three/fiber` + `@react-three/drei`. `zustand` for app state. `gsap` (or an equivalent you prefer) for animation timelines.
- npm (pnpm is not installed). Strict TypeScript. No lint warnings that matter.
- Structure the code so later milestones (custom per-key colors, switches, case options, sound, export) can plug in. Data-driven: layout and colorways live in plain data modules, not in components.

Suggested layout (adjust if you have a better one):

```
src/
  main.tsx, App.tsx
  state/store.ts                 # current variant, animation phase
  keyboard/layout.ts             # 75% key list (id, label(s), x, y, w, row, colorGroup)
  keyboard/variants.ts           # 7 colorways
  keyboard/geometry/*.ts         # keycap, case, plate, switch, knob builders (cached)
  keyboard/legends.ts            # legend atlas
  keyboard/Keyboard.tsx, Keycap.tsx, Knob.tsx, Case.tsx ...
  keyboard/assembly.ts           # assembly/disassembly animation
  scene/Desk.tsx, Lighting.tsx, Stage.tsx, CameraRig.tsx
  ui/VariantPicker.tsx
public/textures/..., public/hdri/...
```

## Units & scale

Real-world meters. 1u = 19.05 mm key pitch. Keyboard ≈ 33 × 14 cm footprint, ~3–4 cm tall at the back. Desk top 160 × 75 cm, ~2.5 cm thick, top surface at ~0.75 m (standing desks are adjustable — pick a sitting height, it just has to look right).

## Keyboard

### Layout (75%, 82 keys + knob) — units in u, x = left edge, y = row top

- Row 0 (F-row, y=0): Esc @0; F1–F4 @1.75, 2.75, 3.75, 4.75; F5–F8 @6.375…; F9–F12 @11… (F12 right edge at 15). Knob centered at x=15.75 on this row. A thin vertical light slot (LED bar) sits in the Esc→F1 gap, like the photos.
- Rows 1–5 sit at y = 1.25, 2.25, 3.25, 4.25, 5.25 (0.25u gap under the F-row).
- Row 1: \` 1 2 3 4 5 6 7 8 9 0 - = (1u each, 0→13), Backspace 2u (13→15), Delete @15.25.
- Row 2: Tab 1.5u, Q W E R T Y U I O P [ ] (1u), \\ 1.5u (ends 15), PgUp @15.25.
- Row 3: Caps Lock 1.75u, A … ' (11 × 1u), Enter 2.25u (ends 15), PgDn @15.25.
- Row 4: Shift 2.25u, Z … / (10 × 1u), Shift 1.75u (ends 14), ↑ @14.25, End @15.25.
- Row 5: Ctrl 1.25, Win 1.25, Alt 1.25, Space 6.25 (ends 10), Fn 1, Ctrl 1 (ends 12), then ← ↓ → @13.25, 14.25, 15.25.
- The case has the small notch/step between the right Ctrl and ← (visible in every photo).

### Color groups (drives colorways)

- `alpha`: letters, numbers, punctuation, F1–F4, F9–F12, \\ (and Space for the pink variant — see below)
- `mod`: Tab, Caps, both Shifts, Ctrl/Win/Alt/Fn/Ctrl, Backspace, Delete, PgUp, PgDn, End, F5–F8
- `accent`: Esc, Enter, Space, arrows (↑ ← ↓ →)

Allow a variant to override the group of individual keys.

### Colorways (eyeball the references; these hexes are starting points, tune against the photos)

| id | name | ref | case | alpha cap / legend | mod cap / legend | accent cap / legend | knob |
|---|---|---|---|---|---|---|---|
| glacial-blue | Glacial Blue | 01 | white | white / dark navy | light blue `#a9c3d9` / dark navy | navy `#23263a` / white | white top, chrome ring |
| cool-black | Cool Black | 02 | black `#1d1e21` | dark navy `#2b3040` / yellow | black / yellow | yellow `#e3b232` / black | black, dark gunmetal ring |
| emerald | Emerald | 03 | slate-blue body `#8c97b3`, cream top frame | cream-peach `#f1e2d6` / dark grey | slate blue `#7f8bad` / white | sage green `#6f8f72` / white | cream top, chrome ring |
| pink | Pink | 04 | pink `#f0b9c4` | cream `#f3e9dc` / pink | pink `#eeaab8` / white | pink / white | pink top, chrome ring |
| overnight | Overnight | 05 | light blue body `#bcd3e8`, white top frame | white / light blue | light blue / white | periwinkle `#7f9fd6` / white | white top, chrome ring |
| white-blue-purple | White & Blue & Purple | 06 | white | white / sky blue | sky blue `#8fbcec` / white | lavender `#8f8ee6` / white | white top, chrome ring |
| white-brown | White & Brown | 07 | taupe brown `#8a7468` | warm white / black | tan `#c9b49a` / black-brown | dark brown `#6e564b` / white | brown top, chrome ring |

Some cases are two-tone (body vs. top frame) — support `caseBody` and `caseFrame` colors per variant.

### Geometry (all procedural, no external models)

- **Case**: matches the photos — a wedge profile (taller at the back, typing angle ~6–8°), softly rounded vertical edges, a horizontal step/groove line running around the front and sides separating the top frame from the lower body, a recessed well where the plate sits with a bezel around it, the notch next to the arrow cluster. Plastic material (slight clearcoat, roughness ~0.45). Rubber feet underneath.
- **Plate + switches**: a plate inside the well and one simple switch per key (housing + cross stem) so that when caps are lifted out you see the switches — this is what sells the "assembly". Stabilizer hints for 2u+ keys are a nice-to-have.
- **Keycaps**: sculpted Cherry/OEM-like profile — tapered sides, rounded corners, a slightly concave (cylindrical) top dish, per-row height/tilt sculpt. Width-dependent. Cache geometry per (width, row) — do not build 82 unique geometries. Spacebar is the low row-5 profile.
- **Legends**: crisp, placed top-left like the photos (two-symbol keys stacked, modifiers with small text like "Caps Lock", arrows as glyphs, Enter/Backspace/Shift with their small icons). Use one canvas-generated glyph atlas (white-on-transparent mask) shared by all keys, tinted per color group via material color, so switching colorways never re-rasterizes. Good anisotropy, no blurry text at the default camera distance.
- **Knob**: cylinder with knurled/fluted side, top cap in the variant knob color, polished chrome (metalness 1, low roughness) ring at the base; sits in a round recess.
- **Materials**: PBR (`MeshPhysicalMaterial` / `MeshStandardMaterial`). Keycaps PBT-like: matte-ish (roughness ~0.55–0.65), tiny sheen. Keep materials shared per color group; on variant change, animate/swap material colors rather than rebuilding meshes.
- No RGB underglow for this milestone.

## Assembly animation

- **Initial load**: the case and plate/switches are on the desk; keycaps start hovering above their slots (out of position / invisible) and drop into their slots in a staggered wave (e.g. diagonal sweep from the top-left), each with a small settle/overshoot (a cap clicking onto its stem). The knob comes in last: descends and rotates (screwing in) into its recess. Total ≈ 2–2.5 s, feels premium, not bouncy-cartoony.
- **Variant change**: keycaps + knob are pulled out of their slots (lift up, staggered, reverse feel), the case color transitions, the caps take the new colors while they're out of the slots, then they go back in with the same assembly animation.
- Robust to rapid clicks: changing variant mid-animation must never leave keys stuck in mid-air or with mixed colors. Queue or retarget — your call — but the final state must always be the last selected variant fully assembled.
- Respect `prefers-reduced-motion` (shorter / no stagger).

## Staging

- **Standing desk**: real-looking electric standing desk — the wood top with slightly rounded/eased edges, a metal frame: two telescoping rectangular leg columns (2–3 stages), T-feet with levelers, a crossbar/rail under the top, side brackets, and a small control panel with buttons under the front edge (right side). Powder-coated matte black or graphite metal.
- **Wood top**: lovely PBR wood — download a CC0 wood texture set from Poly Haven (e.g. via `https://api.polyhaven.com/files/<asset_id>`; candidates: a light oak/walnut table or veneer asset) at 2k: diffuse, normal (GL), roughness (+AO/ARM if available). Save under `public/textures/wood/`. Correct color spaces (diffuse sRGB, others linear), sensible repeat so grain scale looks real for a 160 cm top, high anisotropy. Wood edges should be textured too, not stretched.
- **Nothing else on the desk** besides the keyboard.
- **Lighting & look**: a soft indoor/studio HDRI from Poly Haven (1k–2k .hdr, saved under `public/hdri/`) for reflections/ambient; a main directional or spot key light with soft shadows (keyboard → desk contact shadow is important; caps cast shadows into the case well); ACES or AgX tone mapping; proper sRGB output. Background: a calm, slightly out-of-focus environment or a soft studio gradient — the desk and keyboard are the hero, not the room. Optional subtle post (SMAA, very light bloom only on the chrome/LED, slight vignette) if it stays performant.
- Record every downloaded asset (name, URL, license) in `public/CREDITS.md`.
- **Camera**: framed on the keyboard from a front ¾ elevated angle (like a product shot) with a slice of the desk visible. OrbitControls with damping, constrained (min/max distance, no going under the desk, limited azimuth), target the keyboard center.
- **UI**: a minimal, elegant variant picker overlay (bottom center): a swatch per colorway (show 2–3 of its colors, e.g. split circle) + the colorway name of the selected one. Keyboard-accessible. Clean typography (system font stack or a single Google font is fine). No other UI for now.

## Performance

60 fps on a recent laptop. Shared geometries and materials; draw calls reasonable (instancing or merging where it helps — your call). DPR clamp [1, 2].

## Evidence required (do all of this before reporting done)

1. `npm run build` passes with no TypeScript errors. Paste the tail of the output.
2. Add a `scripts/screenshots.mjs` (Playwright, devDependency, headless Chromium with WebGL enabled — e.g. `--use-angle=swiftshader --enable-unsafe-swiftshader` if needed) and an npm script `shots` that serves the build (vite preview) and writes to `screenshots/`:
   - `assembly-mid.png` — mid initial-load animation (caps partly dropped)
   - `<variant-id>.png` for all 7 variants, fully assembled, default camera
   - `closeup.png` — a closer view showing legends, knob and the wood grain
   - `switch-mid.png` — mid variant-change (caps out, switches visible)
   The script should expose a small dev hook (e.g. `window.__kb` with `setVariant(id)` and an "animation finished" signal) so screenshots are deterministic.
3. Run it and list the generated files. Look at your own screenshots and fix anything that obviously doesn't match the references (wrong colors, legends missing/blurry, keys floating or intersecting the case, wood looking stretched, black/blown-out lighting) before reporting.
4. Final message: summary of the architecture (files + responsibilities), the asset credits, known gaps/limitations, and the exact commands to run it (`npm install`, `npm run dev`, `npm run shots`).

Do not edit `PROMPTS.md`, `references/`, or `docs/`.
