# Spec 03 — Black studio backdrop, off-frame key light, camera distance tuning

This builds on spec 02 and changes it as follows.

## 1. Background and wall

- The scene background becomes **black**. Replace the grey void, cyclorama and fog gradient with black. Anything the lights don't reach falls off to black.
- Add a **wall behind the desk**: a real wall plane, a few tens of cm behind the back edge of the desk, wide and tall enough to fill the hero background behind the monitor. Give it a premium PBR finish, e.g. a subtle painted plaster or microcement in a neutral mid/dark grey. A CC0 Poly Haven texture at 1k–2k is fine; record it in `public/CREDITS.md`.
  - The wall should visibly receive light: the key spot's falloff, and the monitor's glow spilling onto it behind the screen. It should fade to black toward its edges, not look like a flat backdrop card.
- Keep a floor only if it helps in wide shots. It must be dark and fade into the black.

## 2. Lighting

- **Remove the desk lamp** (object and light) and **remove the ceiling pendant** (object and light). The desk now holds **only the keyboard and the monitor**.
- **New key light**: a studio spotlight **off frame** (front-left and above, like a softbox or Fresnel spot in a product shoot). Soft penumbra, warm-neutral (~4000–4500 K), and the main shadow caster. It gives a pleasant, directional pool on the keyboard and desk that falls off toward the edges. No visible fixture.
- **Rim**: the monitor stays the rim light, unchanged in role. Improve the edge highlights if you can do it cheaply.
- **No new fill fixture**. Lift the shadows only with the low environment/reflection intensity. If the shadows go too crushed for the colorways to read, add at most a very subtle off-frame bounce, and say so in the report.
- The mood is a moody, premium product shot on black, but the keyboard must stay clearly readable and color-accurate. **The existing hue/saturation checks must still pass.**
- Update the `?solo=` modes to match the new rig (`key`, `rim`, `env`). Update the leva lighting controls accordingly.
- Remove the checks that no longer apply (lamp/shade alignment). Add a check that the key light's position is outside the default camera frustum.

## 3. Camera distance controls (for the user to pick min/max)

The user will explore the scene and report back the min/max orbit distances they want. Add this to the leva panel, as the **first** folder ("Camera"), shown with `?debug`:

- **Live readout** of the current camera distance to the orbit target, in meters with 3 decimals. Also show the current polar and azimuth angles in degrees.
- **`minDistance` and `maxDistance` sliders** applied live to OrbitControls. The slider range must be wide enough to explore freely, e.g. 0.10–6.00 m.
- Buttons: **"Set min = current"**, **"Set max = current"**, and **"Copy camera values"**. The copy button copies JSON to the clipboard: `{ minDistance, maxDistance, distance, polarDeg, azimuthDeg, position, target }`.
- **"Reset camera"** returns to the default hero view.
- The code defaults stay at the current values until the user sends theirs.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. `npm run shots`: update the hero shots (Glacial Blue, Cool Black, Pink), `lighting-wide.png`, `lighting-closeup.png` and `solo-key.png` / `solo-rim.png` / `solo-env.png`. Add a `debug-camera.png` of the hero with `?debug`, showing the Camera folder. All existing checks pass: hue, assembly, switching, loading, batching, disposal, mobile and perf (~60 fps).
3. Add an automated check that the Camera sliders change the OrbitControls limits, and that "Set min = current" works.
4. Inspect the shots yourself and iterate: the wall must read as a real wall, the falloff to black must look intentional, and nothing may be crushed.
5. Update the README. Do not commit. Do not edit `PROMPTS.md`, `references/` or the other files in `docs/`.
