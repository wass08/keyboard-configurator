# Spec 07c — Key interaction, typing to the monitor, sound design

Assigned to: **Opus agent #2**, branch `feat/interaction-sfx`, in its own git worktree. In parallel:
- **Codex** (spec 07b, branch `feat/intro-sequence`) changes the initial-load sequence in `src/keyboard/assembly.ts`, the mat and the case landing.
- **Opus #1** (spec 07a, branch `feat/dust-motes`) adds `DustMotes.tsx` and a Dust folder.

To keep the merge clean: **don't restructure `assembly.ts` or the case/mat code.** Layer your interaction on top: an extra child transform inside each keycap's existing animated node, or an additive offset applied after the assembly transform. Read the code to find the cleanest seam. Put new screenshot checks in a delimited block in `scripts/screenshots.mjs` (`// --- interaction & sfx (spec 07c) ---`).

## 1. Hover and press

- **Hover**: when the pointer hovers a keycap, it sinks slightly (~0.6–0.8 mm), with a quick ease-in and a springy return on leave. The cursor becomes a pointer over keys. Hover works only when the keyboard is fully assembled (`phase === 'assembled'`), and is ignored while the keys animate.
- **Press**: pointer down on a keycap presses it to full travel (~3.5–4 mm, like an MX switch; the switch stem goes down too, if the stem is a separate mesh), and releases on pointer up. Clicking a key also **types** its character (see section 2).
- **Physical keyboard**: real `keydown`/`keyup` events press and release the matching 3D key (map `KeyboardEvent.code` to the layout ids in `src/keyboard/layout.ts`: Shift left/right, arrows, Backspace, Enter, Space, F-keys, etc.). Holding a key keeps it down, and auto-repeat doesn't re-trigger the press animation. Ignore keys while focus is in a text input such as the leva panel.
- Must stay cheap: no React re-render per keystroke for all 80 keys; animate the transforms in `useFrame` with refs. Raycasting stays fine: one hit test per pointer move against the keycaps only (use a bounding pre-check or the existing meshes; no per-frame raycast when the pointer hasn't moved).
- Interactions must not fight OrbitControls: a pointer down on a key or the knob must not start an orbit drag.

## 2. Typing to the monitor ("the desk screen")

- When the monitor's `screenOn` is true (the user's default), the screen shows a minimal, elegant text surface over the existing wallpaper gradient. Think of a calm notes or editor page: generous margins, a clean monospace or sans font, a blinking caret, and a soft line-wrap. No OS chrome, no brand names.
- Typed characters (from the physical keyboard **and** from clicking 3D keys) appear on it. Support letters, numbers, punctuation with Shift, Space, Enter (new line), Backspace, Tab (spaces) and the arrow keys (move the caret; simple is fine). When the text overflows, older lines scroll up.
- Placeholder when empty: e.g. a subtle "Start typing…" line.
- Render to a CanvasTexture. Redraw only when the text or the caret changes (the caret blinks at ~1 Hz, so at most ~2 redraws/s when idle), not every frame. **The screen's environment Lightformer and rim must not re-capture on every keystroke.**
- Keep the wallpaper's tuned brightness (radiance about 0.62). The text must be readable from the default camera (80 mm lens, 1.351 m), but not glaring.

## 3. Knob: click and drag to rotate

- Pointer down on the knob, then dragging (horizontally, or circularly around the knob's screen-space center; pick whichever feels best) rotates the knob around its axis. Use **detents** every ~15° (24 steps per turn), with a slight magnetic snap on release.
- Each detent plays a crisp **tick**, and pressing the knob (a click without a drag) plays a **click** and dips the knob by ~0.5 mm.
- Optional and nice: knob rotation adjusts the master SFX volume, with a small transient on-screen or HUD readout. If you do this, keep it subtle.

## 4. Sound design

- **Sources**, in this order of preference: (a) CC0 recorded samples you can download directly without an account (e.g. Kenney audio packs; check the license is CC0 and record it in `public/CREDITS.md`), or (b) high-quality synthesis with the Web Audio API (filtered noise bursts plus resonant body for a "thock"; it must sound pleasant, not 8-bit). Mixing both is fine. Keep the total audio payload small (< ~600 KB, compressed: ogg/webm with an mp3 fallback, or m4a).
- **Sounds**:
  - **hover**: a barely-there soft tick, very quiet, rate-limited (at most ~1 per 60 ms) so sweeping the mouse doesn't spam it
  - **key press/release**: a satisfying, thocky mechanical keyboard sound. Use 3–5 variations, with random pitch/gain jitter (±3–4%) so repeats don't sound robotic. The spacebar, Enter, Backspace and Shift get a deeper, stabilized variant, plus a slightly different release sound.
  - **key replacement animation** (variant change): soft clicks as the caps lift off and snap back in, in sync with the existing stagger. Thin it out (not 80 overlapping sounds): at most ~20 audible events across the wave, spread in time, quieter than typing.
  - **knob**: a crisp detent tick per step, and a click on press.
  - Also give the intro (spec 07b) a hook: export a small `sfx.play(name, opts)` API that the intro can call later. Don't wire the intro sounds yourself, since that code is being rewritten in parallel.
- **Audio engine**: a single `AudioContext`, unlocked on the first user gesture (browsers block autoplay; no sound before the first interaction, and never an error). Decode the buffers once. A master gain, and a small polyphony cap.
- **UI**: a minimal, elegant sound on/off toggle near the variant picker (a speaker icon), keyboard-accessible and remembered in `localStorage`. Default on, but silent until the first gesture. A `?debug` "Sound" folder holds master volume and per-category volumes (hover, typing, replacement, knob).
- Respect `prefers-reduced-motion` for the animation only (the sound is unaffected).

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. Run `SHOTS_PORT=4195 PERF_PORT=4196 npm run shots` (the ports are env-configurable; other agents run in parallel on other ports). Add:
   - `interaction-hover.png` (one key visibly sunk) and `interaction-press.png` (a key at full travel)
   - `screen-typing.png`: after typing a sentence through `page.keyboard`, the text is readable on the monitor and the matching 3D keys pressed during typing
   - `knob-rotate.png`
   - checks: hover only offsets when assembled; the press depth is within the spec; physical key codes map to the right layout ids (test the full map); typing appends the right text, including Shift and Backspace; the screen texture redraws at most N times during idle; no environment re-capture on keystrokes; knob detent count matches the drag; the sound engine creates at most 1 AudioContext, stays silent before a gesture, and has no errors (in a headless browser, assert scheduling calls via a test hook rather than audio output); the toggle persists. Everything is disposed. All existing checks still pass.
3. `PERF_PORT=4196 npm run perf`: fps while typing fast (simulate ~15 keys/s) and while idle, both ~60.
4. Listen-test proxy: describe each sound (source, envelope, filtering) in the report, since the user will judge by ear.
5. Commit on your branch `feat/interaction-sfx` with a clear message ending with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Do not edit `PROMPTS.md`, `references/` or `docs/`. Do not merge into main.
