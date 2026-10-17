# Prompts

Every prompt given during the development of this project, in order.

---

## 1 — Main staging (2026-10-16)

> We will build a professional keyboard configurator in threejs.
>
> Let's start by the main staging.
> - A standing desk with a lovely PBR wood on top.
> - The keyboard built procedurally and it's different variations (glacial blue, cool black, emerald, pink, overnight, white & blue & purple, white & brown).
> - on initial load and when changing the variant I want to have the animation of the keys and knob going into/going out their slot to make it like a keyboard assembly
> - nothing else on the desk than the keyboard
> - store all my prompts in an md file throughout the whole project development
>
> Use codex to assist you with the implementation.

Attached: 7 reference photos, one per variant, saved in [`references/`](references/).

---

## 2 — Reconnect (2026-10-16)

> I was disconnected maybe you need to resume something

---

## 3 — Confirmations (2026-10-16)

> 1. yes perfect
> 2. nope perfect
> is it running somewhere?

(Answers: the colorway-to-photo mapping is correct; keep React Three Fiber.)

---

## 4 — Lighting rig (2026-10-16)

> amazing.
> Now let's do some proper lighting rig:
> - a monitor acting as a rim light
> - a desk lamp  to act as a key light
> - ceiling light acting as fill light

---

## 5 — Reconnect (2026-10-17)

> sorry got network again, is the project running?

---

## 6 — Commit, black background, studio key light, camera distance controls (2026-10-17)

> Yes, you can commit locally.
> - turn the background to black and add a wall behind the desk.
> - remove the desk lamp instead we will use a nice studio key spot light (not on frame), remove the top light
> - give me controls so I can give you min/max camera distance

---

## 7 — Camera limits and key light values (2026-10-17)

> thanks let's use this as cam values {
>   "minDistance": 0.3166593512537758,
>   "maxDistance": 0.7194732194342892,
> }
>
> for studio key light :
> intensity 6.95
> position -0.67 1.75 0.80
>
> what type of light are you using for this?

---

## 8 — Pro studio key (area light + spot for shadows) and big dim fill (2026-10-17)

> make it a pro grade product studio light using a react area light but keep the spotlight for the shadows
>
> on the opposite side (right) use another rect area light, much bigger, much dimmer for the fill light

("react area light" = `RectAreaLight`.)

---

## 9 — Tuned lighting values, screen off, environment question (2026-10-17)

> ```json
> {
>   "lights": {
>     "softbox": { "type": "RectAreaLight", "intensity": 10.8, "color": "#fff7f0", "width": 0.6, "height": 0.9, "position": [-0.67, 1.75, 0.8], "aim": [0, 0.79, -0.02] },
>     "spot": { "type": "SpotLight", "intensity": 2.385, "color": "#fff7f0", "angle": 0.23, "penumbra": 0.8, "shadowSoftness": 147, "shadowRadius": 4.1, "linkedToSoftbox": true, "position": [-0.67, 1.75, 0.8], "aim": [0, 0.79, -0.02] },
>     "fill": { "type": "RectAreaLight", "intensity": 0.85, "color": "#eee4ff", "width": 1.8, "height": 1.5, "position": [1.4, 1.4, 0.4], "aim": [0, 0.79, -0.02] },
>     "monitor": { "type": "RectAreaLight", "intensity": 0, "color": "#be7cff", "width": 0.598, "height": 0.028, "position": [0, 1.025, -0.43], "aim": [0, 1, 0],
>       "wallGlow": { "intensity": 0, "color": "#be7cff", "width": 0.5, "height": 0.26, "localPosition": [0, 0, -0.06] } }
>   },
>   "rendering": { "environment": 0.26, "exposure": 1 }
> }
> ```
>
> for now please turn off the screen and wall glow.
>
> about the environment, what are you using? the same as our lighting setup?

(Answers: environment = rig-matched Lightformers + dim HDRI; mobile portrait cropping at the 0.719 m max distance = leave it for now, desktop first.)

---

## 10 — Dev server (2026-10-17)

> please run the dev server

---

## 11 — Save lighting, desk props, wood reflections (2026-10-17)

> awesome. save these lighting settings.
>
> ```json
> {
>   "lights": {
>     "softbox": { "type": "RectAreaLight", "intensity": 0.75, "color": "#fff7f0", "width": 0.44, "height": 0.68, "position": [-0.67, 1.75, 0.8], "aim": [0, 0.79, -0.02] },
>     "spot": { "type": "SpotLight", "intensity": 6.235, "color": "#fff7f0", "angle": 0.21, "penumbra": 0.78, "shadowSoftness": 147, "shadowRadius": 4.1, "linkedToSoftbox": true, "position": [-0.67, 1.75, 0.8], "aim": [0, 0.79, -0.02] },
>     "fill": { "type": "RectAreaLight", "intensity": 0.25, "color": "#eee4ff", "width": 1.8, "height": 1.5, "position": [1.4, 1.4, 0.4], "aim": [0, 0.79, -0.02] },
>     "monitor": { "screenOn": true, "type": "RectAreaLight", "intensity": 0, "color": "#8d2d2d", "width": 0.598, "height": 0.028, "position": [0, 1.025, -0.43], "aim": [0, 0.99, 0],
>       "wallGlow": { "intensity": 23.3, "color": "#8d2d2d", "width": 0.5, "height": 0.26, "localPosition": [0, 0, -0.06] } }
>   },
>   "environment": { "lightformerIntensity": 1.28, "hdriIntensity": 0.095, "rotation": -1.29 },
>   "rendering": { "exposure": 1 }
> }
> ```
>
> then I want you to:
> - add a desk mat with thith gray mat material
> - add a stream deck on the right  between the screen and keyboard
> -  add a airpods max on a stand on the left
>
> I don't see much reflections on the wood of the desk, why is that? could we make it a bit more impacted by the env?

Attached: 3 prop references, saved as `references/props-desk-mat.png`, `references/props-stream-deck.png`, `references/props-airpods-max-stand.png`.

---

## 12 — Status question (2026-10-17)

> what is it waiting?
