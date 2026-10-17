# Spec 05 — Saved lighting, desk props, wood reflections

This builds on spec 04 and the follow-up (monitor toggle, rig-matched environment).

## 1. Save the user's lighting as the code defaults (exact values)

- **softbox**: RectAreaLight, intensity 0.75, color #fff7f0, 0.44 × 0.68 m, position (−0.67, 1.75, 0.8), aim (0, 0.79, −0.02)
- **spot** (shadows): intensity 6.235, color #fff7f0, angle 0.21, penumbra 0.78, shadowSoftness 147, shadowRadius 4.1, linked to the softbox, same position and aim
- **fill**: RectAreaLight, intensity 0.25, color #eee4ff, 1.8 × 1.5 m, position (1.4, 1.4, 0.4), aim (0, 0.79, −0.02)
- **monitor**: `screenOn` **true**. Rim intensity 0, color #8d2d2d, 0.598 × 0.028 m, position (0, 1.025, −0.43), aim (0, 0.99, 0). Wall glow intensity 23.3, color #8d2d2d, 0.5 × 0.26 m, local position (0, 0, −0.06).
- **environment**: lightformerIntensity 1.28, hdriIntensity 0.095, rotation −1.29
- **rendering**: exposure 1

Round-trip test: the "Copy lighting values" output at startup equals these values, within float noise. Update any screenshot-script assertions that depended on the old defaults.

## 2. Desk props (procedural, same quality bar as the keyboard)

References: `references/props-desk-mat.png`, `references/props-stream-deck.png`, `references/props-airpods-max-stand.png`. The desk now holds exactly the **keyboard, monitor, desk mat, Stream Deck and AirPods Max on its stand**, and nothing else.

### Desk mat
- A thick grey **felt** desk mat, like the reference: about 90 × 40 cm, 4 mm thick, softly rounded corners, a slightly rounded/compressed edge. Centered under the keyboard, extending left and right of it, parallel to the desk front edge.
- Material: a heathered charcoal-grey felt. Prefer a CC0 fabric/felt texture set (Poly Haven or ambientCG, 1k–2k) for the color, normal and roughness maps. Add a `sheen` (MeshPhysicalMaterial) for the fibrous grazing-light look, high roughness and no specular shine. Record it in `public/CREDITS.md`. If no suitable CC0 set exists, build it procedurally (multi-octave fiber noise for color, normal and roughness).
- The keyboard (case, feet, assembly animation, shadows) now sits **on** the mat: raise it by the mat thickness, with no intersection and no floating. The assembly animation's target heights must follow.

### Stream Deck (on the right, between the screen and the keyboard)
- A 15-key Stream Deck MK.2-style device: a matte black body (~118 × 84 × 21 mm) with softly radiused edges, on its detachable wedge stand at the reference's angle, facing the user. A 5 × 3 grid of recessed square LCD keys.
- The key faces are emissive canvas textures of **generic** icons in the reference's colors (play, chat, mic, music note, waveform, crown, toggles, etc.). **No third-party logos or wordmarks** (no YouTube/Twitch/Discord/Spotify/OBS/Elgato marks). Subtle emission, so it reads as lit screens, not as light sources.
- Place it on the desk to the right of the keyboard, toward the back, between the monitor and the keyboard, angled slightly toward the user. On the mat or on the wood, whichever composes better.

### AirPods Max on a stand (on the left)
- **Stand** like the reference: a walnut tray base (~22 × 12 cm, raised lip, rounded corners) using the same oak/walnut texture family as the desk, or a darker walnut variant. A black powder-coated flat metal upright (~25 cm), and a curved walnut headrest bar at the top.
- **AirPods Max** hung on the stand: space-grey anodized aluminum ear cups (rounded-rectangle, with soft chamfers), black knit-mesh cushions (a fabric normal or sheen), a black mesh canopy headband, stainless telescoping arms, and the digital crown plus noise-control button on the right cup. No Apple logos.
- Optional, as in the reference: a white AirPods Pro-style case in the tray. Generic, no logos.
- Place it on the left of the desk, toward the back, near where the lamp used to be.

### Common
- All props cast and receive shadows (spot). Share geometries and materials, dispose on unmount (add them to the disposal check), and keep ~60 fps.
- Props don't animate with the keyboard assembly.

## 3. Wood reflections

The user sees almost no reflection on the desk wood. Explain the cause in the report. Likely causes: effective roughness ~0.65–0.93 from the custom `roughnessmap_fragment` override in `Desk.tsx`, no clearcoat, and a mostly-black rig environment in the mirror direction. Then fix it:

- Turn the top into a **satin-lacquered / oiled hardwood finish**. Switch to MeshPhysicalMaterial with a clearcoat layer (clearcoat about 0.3–0.6, clearcoatRoughness about 0.2–0.35), so the softbox and the screen produce a soft, visible sheen on the desk, while the grain keeps its base roughness variation.
- Add a desk `envMapIntensity` control.
- A new leva **Desk** folder holds clearcoat, clearcoatRoughness, the roughness range/scale and envMapIntensity, and is included in "Copy lighting values". Pick tasteful defaults, and report them.
- Verify there's a visible but tasteful sheen in the hero, and a stronger one in a grazing-angle shot: the screen's and softbox's reflections should read on the desk surface. The keyboard stays the hero.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. `npm run shots`: update the hero shots (3 colorways) and add `props-wide.png` (all props visible), `props-streamdeck.png`, `props-airpods.png`, `deskmat-closeup.png` (felt texture visible) and `desk-sheen.png` (a grazing angle showing the wood reflection). All existing checks pass: hue, assembly, switching, loading, batching, disposal (including the props), the camera panel, the monitor toggle, the env Lightformer follow, and perf ~60 fps. Add a check that the keyboard bottom sits on the mat's top surface (within 0.5 mm), and the lighting round-trip check from section 1.
3. Inspect the shots yourself against the three prop references, and iterate.
4. Update the README and `public/CREDITS.md`. Do not commit. Do not edit `PROMPTS.md`, `references/` or the other files in `docs/`.
