# Spec 06 — Prop gizmos, lit Stream Deck keys, charcoal painted wall

This builds on spec 05 (commit ca53312). **Do not change the desk wood material in this milestone.** The user asked for an explanation first; a separate decision will follow.

## 1. Position gizmos for the headphone stand, the monitor and the Stream Deck

- In `?debug` mode, add drei transform gizmos (`PivotControls` or `TransformControls`, whichever gives the cleaner UX) on three props: **the headphone stand** (with the headphones attached), **the monitor** (with its stand) and **the Stream Deck** (with its wedge stand).
- Each gizmo **translates on the desk plane (X/Z)** and **rotates around Y**. Lock Y, so props always rest on their support surface. If the Stream Deck moves on or off the felt mat, its height follows the mat's top or the wood's top. Clamp positions to the desk bounds.
- OrbitControls must pause while you drag a gizmo, and resume afterwards.
- A leva **Layout** folder holds numeric position (x, z) and rotation (Y, degrees) for each prop, kept in two-way sync with the gizmos. It also has a "Show gizmos" toggle and a **"Copy layout values"** button that copies JSON, in the same style as the camera and lighting copy buttons. The current positions stay as the code defaults.
- **Moving the monitor must carry everything tied to it**: the screen rim RectAreaLight, the wall glow (which keeps its local offset, and its projection on the wall stays sensible), the screen and wall-glow Lightformers in the rig environment (trigger a single environment recapture on change, not one per frame), and the desk-coat analytic reflection panels (the `uCoat*` uniforms in `Desk.tsx`; update the uniforms only, without changing the shader logic). Moving the Stream Deck carries its key glow light (see section 2).
- Gizmos are never visible without `?debug`, and never in screenshots unless a shot asks for them.

## 2. Stream Deck keys: real buttons that emit light

Reference: `references/props-stream-deck-lit.png` (plus the earlier `props-stream-deck.png`).

- Each of the 15 keys becomes a **physical key**: a square keycap with softly rounded edges, protruding about 3 mm above the faceplate through its recessed opening, with a visible gap and shadow around it. The keycap is a glossy, clear top layer (low roughness, high transmission look, or clearcoat), with the LCD image visible underneath. The LCD can sit slightly below the clear top, for a little parallax and depth.
- The LCD images must **glow**: properly emissive, bright enough to read as lit screens (`toneMapped` handling and an emissive intensity that survives the tone mapping), with a soft glow halo. Add a restrained selective bloom (e.g. `@react-three/postprocessing` Bloom with a high luminance threshold, so only the deck keys and other genuinely bright emissives bloom; the monitor wallpaper must not bloom into a blob). Keep the bloom subtle and premium.
- **Light spill**: the keys should faintly light the faceplate around them, and the desk or mat just in front of the deck. One small, dim RectAreaLight (or similar) at the key face, colored from the average of the icon colors, is enough. Don't add 15 lights. It follows the deck when moved with the gizmo.
- Keep the icons generic (no third-party logos or wordmarks). Aim for a richer, more varied palette, like the reference (reds, blues, purples, greens, a white key).
- Add debug controls in a "Stream Deck" folder: key emissive intensity, bloom strength/threshold, spill intensity. Include them in "Copy lighting values".

## 3. Wall: charcoal painted wall

- **Remove the plaster/brick texture** from the wall. Delete its files from `public/` and its entry from `public/CREDITS.md`.
- The wall becomes **smooth charcoal / dark-grey paint** (around #2a2b2e; tune it so it reads charcoal, not black). Use a satin paint finish: roughness about 0.45–0.65, a very subtle procedural low-frequency roller / orange-peel normal and roughness variation, and no visible pattern or tiling at hero distance. It must **visibly show light**: the key's falloff, the red wall glow behind the monitor, and soft specular sheen from the softbox. It still fades to black toward its edges.
- Add wall controls (color, roughness, normal strength) in a "Wall" folder, and include them in "Copy lighting values".

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. `npm run shots`: update the hero shots (3 colorways), `props-wide.png`, `props-streamdeck.png` (keys must read as raised, lit buttons with glow), and add:
   - `wall-paint.png`, showing the light and glow on the charcoal wall
   - `gizmos-debug.png`, the `?debug` view with the gizmos visible
   - `layout-moved.png`, the monitor, stand and deck moved via the debug store, proving the lights, glow and reflections followed
3. Keep all existing checks passing: the lighting round-trip with the user's values, hue, assembly, switching, loading, batching, disposal (including the new lights and post), mat contact, camera, monitor toggle, env follow, and perf ~60 fps. Add checks for:
   - moving the monitor moves the rim light, the wall glow and the env Lightformers
   - "Copy layout values" round-trips
   - OrbitControls are disabled while a gizmo drag is active
4. Inspect the shots against the references, and iterate.
5. Update the README. Do not commit. Do not edit `PROMPTS.md`, `references/` or the other files in `docs/`.
