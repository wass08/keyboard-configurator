# Spec 11 — Debug "stages" for video explanations

The user wants to record a video that walks through how the scene is built, one layer at a time. Add **7 cumulative stages**. Each stage adds a layer on top of the previous ones, and stage 7 is exactly today's full experience.

## The stages

| Stage | Adds | Scene state |
|---|---|---|
| **1 — Bare** | — | **One simple `DirectionalLight`** (neutral white, from the key light's side, basic shadow), and nothing else: no softbox, spot, fill, rim, wall glow, typed-text light, Stream Deck spill, environment/HDRI or Lightformers. **Hidden:** the monitor screen content (powered off or not rendered; your call on keeping the monitor body, but the screen must be off), the Stream Deck, the headphones and stand, and the **desk mat** (the keyboard sits directly on the wood). **Off:** DoF, bloom, dust, tone mapping (`NoToneMapping` / linear output), color grading and vignette. **Lens:** the three.js default (`PerspectiveCamera` fov 50°, i.e. the "untouched" lens), at the same orbit target and distance limits. **Sound:** synthesized key press/release only (the synth stand-in keys still exist: the "Recorded keys" toggle off). No hover, knob, replacement or intro sounds. |
| **2 — Studio light** | key + fill | Replaces the directional light with the **studio key** (softbox + spot shadows) and the **fill**. Still no environment, no screen, no props, no post. |
| **3 — Practicals** | screen, Stream Deck | The monitor **screen on** (terminal, rim light, wall glow and the wall light mask, typed-text light), plus the **Stream Deck** with its LCD emission and spill. Bring in the environment/Lightformers here too, since the screen and wall glow reflections depend on them. Keep them in stage 7's configuration, minus anything listed later. |
| **4 — Desk dressing** | desk mat, headphones | The **felt mat** appears (the keyboard sits on it at the correct height) and the **headphones on their stand**. |
| **5 — Lens** | focal length, DoF | The user's **80.343 mm lens** and **depth of field** with auto focus and auto focal range, exactly as tuned. |
| **6 — Sound design** | full sound | **Recorded key samples** (round robin, spacebar, stabilized), knob click and detents, hover, replacement and intro sounds. |
| **7 — Final** | everything else | Everything else in the current defaults: ACES tone mapping, the color grade and vignette, bloom, dust, and every other tuned value. **Stage 7 must equal the app with no stage applied** (pixel-identical to the normal hero). |

## Behaviour

- **Stages are a runtime override layer.** They never modify the user's saved or tuned defaults. Leaving stage mode (or picking stage 7) restores everything exactly. The leva values keep showing the tuned values.
- **Selecting a stage:**
  - A **Stages** leva folder, first in the `?debug` panel, holds buttons 1–7 plus "Exit stages".
  - A URL param `?stage=N` opens straight into that stage. With `?stage`, skip the opening screen, the same way `?skipIntroScreen` does.
  - **Hotkeys** that don't conflict with typing on the 3D keyboard: **Alt/Option + 1…7** to jump, and **Alt + ←/→** for previous/next. Physical typing into the terminal must keep working. Make sure these combinations don't also type a character or press a 3D key.
- **Transitions** (so it looks good on camera): when changing stage, lights and post effects crossfade over ~0.6 s (intensities, DoF strength, tone-mapping exposure blend if feasible). Props appear or disappear with a short, tasteful fade or scale-settle (~0.5 s; e.g. the headphones and Stream Deck ease in). The desk mat can replay its **unroll** when stage 4 is entered (nice for the video), with the keyboard lifting onto it smoothly. Tone mapping can't be crossfaded per se: switch it at the midpoint of a brief exposure dip, or simply cut it. Make whichever looks cleaner.
- **Recording mode:** a "Hide debug panel" toggle (and hotkey **Alt + H**), so the stage hotkeys keep working while the leva panel is hidden for a clean recording. An optional tiny stage label (e.g. "Stage 3 — Practicals", bottom-left, in the studio card style). Default **off**, with a toggle and **Alt + L**.
- **"Replay intro"** stays available in every stage, and plays with that stage's state. In stage 1–3 there's no mat, so skip the unroll beat.
- **Performance:** hidden props must not render or cost anything (unmount, or `visible=false` with their lights at 0 and excluded from the shadow and env captures). Re-capture the environment once on stage change, not every frame.

## Evidence required

1. `npm run build` passes.
2. `npm run shots`: all existing checks pass (stage mode off by default, so nothing changes), plus:
   - shots `stage-1.png` … `stage-7.png` (same camera; stage 1 uses the fov-50 lens)
   - **checks**:
     - each stage's expected light set (types and count of active lights) and visible props
     - tone mapping and post state per stage
     - the lens per stage
     - the audio mode per stage (synth keys only in 1–5, full in 6–7; test hooks, not output)
     - stage 7 is pixel-identical to no-stage
     - leaving stages restores the tuned values exactly (lighting/camera round-trips)
     - Alt+digit switches the stage without typing into the terminal or pressing a 3D key
     - `?stage=3` loads directly into stage 3
     - "Hide debug panel" hides leva while the hotkeys still work
3. `npm run perf`: ~60 fps in stage 1 and stage 7. Stage transitions produce no hitches beyond one environment capture.
4. Look at all 7 shots side by side (a contact sheet `stages-sheet.png`), and make sure each step tells a clear visual story.
5. Update the README with a short "Recording stages" section.
6. Commit on `master` with the co-author trailer. Do not edit `PROMPTS.md`, `references/` or the other files in `docs/`.
