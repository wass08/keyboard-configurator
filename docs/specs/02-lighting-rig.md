# Spec 02 — Practical lighting rig

Goal: replace the current abstract light setup (directional key/fill/rim + hemisphere in `src/scene/Lighting.tsx`) with a **motivated, practical lighting rig**: every light in the scene comes from a real object you can see.

| Role | Source object | Light |
|---|---|---|
| **Rim** | A monitor on the desk, behind the keyboard | The lit screen |
| **Key** | A desk lamp on the desk | The lamp head |
| **Fill** | A ceiling light above the desk | Soft, broad, low-contrast |

This supersedes milestone 1's "nothing else on the desk" rule: the desk now holds **the keyboard, the monitor and the lamp — nothing else**.

## Objects (procedural, same quality bar as the desk and keyboard)

- **Monitor**: a modern ~27" 16:9 monitor (≈ 61 × 36 cm panel, thin bezels, slim back housing with a rear bulge), on a stand (a flat base plate + an upright neck), or a clamp arm if you think it composes better. Centered behind the keyboard, at a realistic distance (~55–70 cm from the user's edge of the desk), screen facing the user. Matte dark-grey plastic/aluminium materials.
  - The screen shows a calm, soft wallpaper (a blurred gradient, nothing busy, no text). Emissive, so it reads as glowing.
  - Nice-to-have: the wallpaper and rim-light color take a subtle tint from the current colorway's accent, crossfading during the variant change. Subtle: the rim stays mostly neutral-cool.
- **Desk lamp**: an articulated architect / task lamp (Anglepoise-like): weighted round base, two arm segments with joints (spring or tension-rod hints), a conical shade with an emissive bulb/diffuser visible inside. Placed on the back-left of the desk, head angled toward the keyboard from front-left/above. Matte powder-coat. Pick a color that suits all 7 colorways (e.g. warm off-white, graphite or black).
- **Ceiling light**: a modern fixture above the desk, e.g. a suspended linear LED pendant (long thin bar with an emissive diffuser underneath, hanging from two thin cables that go up out of frame). It isn't in the hero shot but shows in wide shots. Add no ceiling geometry beyond what reads well. The cables can simply run out of frame.

## Lights

- **Key (desk lamp)**: a `SpotLight` placed at the lamp head, aimed along the shade axis at the keyboard. Warm (~2700–3000 K), soft penumbra, physically sensible decay and distance. **It is now the main shadow caster**: keycaps cast into the case well, and the keyboard and monitor stand cast onto the desk. Shadow map size around 2048, with tight shadow-camera bounds. Bias tuned so there is no acne and no peter-panning.
- **Rim (monitor)**: a `RectAreaLight` (remember `RectAreaLightUniformsLib.init()`) matching the screen size, at the screen face and pointing toward the user. It should light the back edges of the keycaps, the top edges of the case and the knob's chrome, and separate the keyboard from the background. Cool-neutral (~6000–6500 K), plus the optional accent tint.
- **Fill (ceiling)**: a large, soft, downward `RectAreaLight` at the pendant, and/or a very low hemisphere. Neutral (~4000 K), low intensity. It lifts the shadows without flattening the image. No hard shadows from the fill.
- **Environment**: keep an HDRI for reflections only, at a low intensity. It must not compete with the three practical lights. The image should clearly read as lit *by* the lamp, monitor and ceiling light. The mood is a calm, premium workspace, not a dark or gloomy room. White cases must not blow out.
- Remove the old directional key, fill and rim lights. Keep the existing optimization of updating shadows only during animation, and keep it correct with the new caster(s).

## Composition

- Default hero camera: the keyboard stays the hero, at roughly 55–65% of the frame width on 16:10. The lower part of the monitor (bottom bezel, glow, stand) is visible behind it, and the lamp's head or arm enters the frame from the left/top, so the lighting is motivated on screen. Re-tune the camera target and limits if needed. It must still fit on mobile portrait.
- Light falloff should be visible: the desk gets darker away from the lamp pool, and the monitor glow spills onto the desk behind the keyboard.

## Tuning UI (dev only)

- Add a `leva` panel, hidden by default and shown with `?debug`. It exposes intensity, color/temperature and position/aim for the key, rim and fill lights, the environment intensity, and the exposure. The defaults in code are the tuned values.
- `?solo=key|rim|fill` renders with only that light (plus a minimal environment), for screenshots that prove each light's role.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. Extend `npm run shots` to add:
   - `lighting-hero.png`: default camera, Glacial Blue
   - `lighting-hero-cool-black.png` and `lighting-hero-pink.png`
   - `lighting-wide.png`: a wide shot showing the desk, monitor, lamp and ceiling pendant together
   - `solo-key.png`, `solo-rim.png`, `solo-fill.png`: same camera as the hero
   - `lighting-closeup.png`: close-up showing the rim highlights on the keycap back edges and the knob
   - keep all existing shots and checks passing (assembly, variant switching, loading, batching, disposal, mobile)
3. Look at the shots yourself and iterate until each solo shot clearly shows its role (key = directional warm shadows, rim = edge separation from behind, fill = soft lift), and the combined hero looks premium and balanced.
4. Re-check performance: report the fps you measure, and keep about 60 fps on the same machine.
5. Update `public/CREDITS.md` if you add assets, and update the README's architecture section.

Do not commit. Do not edit `PROMPTS.md`, `references/` or the other files in `docs/`.
