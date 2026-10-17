# Spec 04 — Pro product-studio key and fill

This builds on spec 03. The monitor rim, black backdrop, wall and camera panel stay as they are.

## User-tuned values (already in code — keep them as the defaults)

- Camera `minDistance` 0.317 m, `maxDistance` 0.719 m (`src/scene/CameraRig.tsx`).
- Studio key spot: intensity 6.95, position (−0.67, 1.75, 0.80) (`src/scene/lightingControls.ts`).

## Key light = softbox (RectAreaLight) + spot (shadows)

- Add a **`RectAreaLight` softbox** as the key: a pro product-studio softbox (around 60 × 90 cm, or whatever size looks best; expose it as a control). Place it at the key position (−0.67, 1.75, 0.80), facing the keyboard. Its job is the soft wrap and the large, clean, softbox-shaped specular highlights on the keycaps, case and knob chrome: the look of a real product shot.
- **Keep the existing `SpotLight`** at the same position and aim. Its job is the **shadows** (RectAreaLight can't cast them) and a bit of directional shape. The two together must not double the exposure. Rebalance so the overall key brightness stays about where it is now with the user's 6.95 spot, but softer, with the softbox highlights clearly visible. Give the spot shadows a soft edge that matches a large source (`shadow.radius` / PCF soft settings, `blurSamples` if you switch shadow type). No hard, pin-sharp shadow edges.
- If the user's 6.95 value has to change because the softbox now carries part of the key, keep the spot's position as the user set it, and explain the new split (softbox vs spot intensity) in the report.

## Fill = big, dim RectAreaLight on the right

- Add a **second `RectAreaLight` on the opposite side (right)**, off frame. It is **much bigger** than the softbox (e.g. 1.5–2 m wide) and **much dimmer**: a large bounce/scrim fill that lifts the shadow side without flattening the shape, so there's clear key-to-fill contrast. Neutral color. Face it at the keyboard.
- It replaces the current 0.12 neutral bounce. Keep the environment low (reflections only).

## Controls (leva, `?debug`)

Organize the lighting into folders, below Camera:

- **Key · softbox**: intensity, color, width, height, position, aim
- **Key · spot (shadows)**: intensity, angle, penumbra, shadow softness/radius, position, aim (it may follow the softbox position by default, with a "link to softbox" toggle)
- **Fill · area**: intensity, color, width, height, position, aim
- **Monitor · rim**: as now
- A **"Copy lighting values"** button that copies JSON of every light's current values (same idea as "Copy camera values"), so the user can send tuned values back.
- `?solo=`: `key` (softbox + spot), `softbox`, `spot`, `fill`, `rim`, `env`.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. `npm run shots`: update the hero shots (Glacial Blue, Cool Black, Pink), `lighting-closeup.png` (the softbox highlights on the caps and knob must be visible) and the solo shots for every `?solo` mode. Keep all existing checks passing: hue/saturation, assembly, switching, loading, batching, disposal, perf ~60 fps, and the camera-panel checks with the 0.317/0.719 limits.
3. Add checks that both area lights are outside the default hero frustum, and that "Copy lighting values" returns JSON containing all four lights.
4. **Mobile**: the 0.719 m max distance is the user's choice, so don't override it. Report honestly how mobile portrait framing looks with that limit (attach `mobile.png`), and propose a fix if the keyboard no longer fits, but don't apply it.
5. Inspect the shots yourself and iterate until it reads as a pro product-studio setup: soft, directional key with a clean softbox reflection, gentle fill on the right, rim from the monitor, and color-accurate caps.
6. Update the README. Do not commit. Do not edit `PROMPTS.md`, `references/` or the other files in `docs/`.
