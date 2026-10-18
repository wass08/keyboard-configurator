# Spec 08a — Claude Code terminal screen, volume OSD, subtler dust, intro delay, smooth case corners

Assigned to: **Codex**, on `master` in the main checkout. In parallel, an **Opus agent** is rewriting the sound engine (spec 08b) on branch `feat/synth-sfx` in its own worktree. It replaces `src/audio/sfx.ts` internals and `public/audio/`, but keeps the public API (`sfx.play(name, opts)`, `SfxName`, `PlayOptions`, and the `useSound` store in `src/audio/soundStore.ts`, including the master volume) unchanged. **Don't edit `src/audio/*` or `public/audio/`.** Read the master volume from `useSound`, as the knob already does.

## 1. Monitor screen → dark-mode Claude Code terminal

Replace the current wallpaper and notes overlay (`src/screen/ScreenText.tsx`, `src/screen/typing.ts` and the wallpaper in `src/scene/PracticalFixtures.tsx`) with a **dark terminal running a Claude Code session**:

- **Look**: a near-black terminal background (e.g. #0d0d0f to #141416, never pure black, with a very subtle vignette). Bright white / off-white monospace text, plus Claude Code's warm orange accent (around #d97757) used sparingly, for the prompt marker and the header. Muted grey for secondary text. Crisp at the default camera (80 mm, 1.351 m; note the camera sees mostly the **lower part** of the screen).
- **Top part**: static fake session text, as in a real Claude Code terminal session: a small welcome/header box ("✻ Welcome to Claude Code" style, plus the cwd `~/keyboard-configurator`), followed by a short, plausible exchange (a user request like "make the keycaps assemble with a stagger", then a few assistant lines: a ⏺ bullet, a short tool-call line such as `Update(src/keyboard/assembly.ts)`, and a tiny diff summary in muted green/red). Keep it tasteful and legible; don't cram the screen.
- **Bottom part**: a **prompt input box**, as in Claude Code: a rounded-border box spanning the width, with `>` and the **typed text plus a blinking block/bar cursor** inside. A one-line muted hint under it (e.g. `? for shortcuts`). Typing (physical keys and clicked 3D keys, through the existing typing pipeline) goes **into this box**, so it feels natural to type at the bottom of the screen. When the input exceeds one line, the box grows upward by up to ~3 lines, then the text scrolls inside it. Enter "submits": the line moves up into the transcript above as a user message (`> your text`), and the box clears. Older transcript lines scroll off the top. Backspace, arrows and Shift work as today.
- Redraw only when the content or the caret changes, as today. **No environment re-capture on keystrokes.**

## 2. Typed text as a subtle practical light

- The screen is now dark, so its light contribution changes. Retune the screen's environment Lightformer and rim to the dark terminal level. It's static, so it doesn't recapture on keystrokes.
- Add a **subtle practical light from the text**: a small RectAreaLight at the screen face, covering the prompt-box region, cool-white (matching the text color). Its intensity follows how much bright text is lit in that region (a cheap estimate, e.g. from the character count in the box and the lit glyph coverage when you redraw), plus a tiny soft flare on each keystroke that decays over ~150 ms. The effect: as you type, a faint, believable glow spills onto the keyboard's top edges and the desk. **Subtle**: you should only just notice it. Add a toggle and intensity controls in a `?debug` "Screen" folder (in Copy lighting values). It follows the monitor gizmo, like the other screen lights.
- Keep the user's wall glow (23.3, #8d2d2d) unchanged.

## 3. Volume OSD on the monitor (bottom right)

- When the knob changes the master volume, show a **macOS-style volume OSD** in the **bottom-right corner of the monitor screen**: a small rounded translucent pill with a speaker glyph and a level bar (show a muted glyph at 0). It appears on change, stays ~1.2 s after the last change, and fades out over ~300 ms. It isn't permanently visible. Redraw the canvas only while it's visible or fading.
- **Remove** the existing DOM volume readout next to the speaker toggle; the monitor OSD replaces it. Keep the speaker toggle itself.

## 4. Dust: super subtle

Retune the dust defaults (`src/scene/DustMotes.tsx`, `src/scene/dustShader.ts`, `lightingControls.ts`) so it reads as **real dust: smaller, fainter, sparse**:
- Make the motes clearly smaller: roughly 0.3–0.5 mm, with a lower pixel clamp so they never read as dots.
- Make them much dimmer: visible mainly in the brightest core of the beam, and against dark backgrounds.
- Use fewer of them (~100–140).
- Make the twinkle slower and gentler.

You should almost have to look for them. Update the dust checks for the new defaults (the cone and draw-call invariants still hold).

## 5. Intro: delay the start

- The mat unroll is currently easy to miss on load. Start the intro only once the scene is truly ready: textures decoded, shaders compiled (use `gl.compile` / precompile so the first frames don't hitch) and the first frame rendered. Then **hold ~0.9 s** on the rolled mat before it starts unrolling. Expose this as a "Start delay" control in the Intro folder. `prefers-reduced-motion` skips the hold.
- Make sure the delay doesn't break the selection-during-loading and intro checks. Adapt their timing.

## 6. Smooth case corners

- Reference: `references/issue-case-corner-faceting.png`. The case's rounded vertical corners show flat facet bands on both the top frame and the lower body. Fix the case geometry (`src/keyboard/geometry/case.ts`): add enough corner segments, and give it **smooth normals across the rounded corners**, while keeping hard edges where they belong (the top face to the side walls, and the step/groove). For example, use separately smoothed side-wall normals, or merge vertices along the curved sides, then `computeVertexNormals`, with crease-angle handling. No shading seams, and no change to the case's dimensions or silhouette.
- Check the other rounded parts (the plate opening, the knob recess, the stand/feet) for the same issue, and fix them if they're cheap.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. `npm run shots`: all checks pass (update the ones affected by the screen redesign, the dust defaults and the intro delay). Add:
   - `screen-terminal.png` (the hero, showing the terminal and the prompt box at the bottom)
   - `screen-terminal-typing.png` (after typing and submitting one line, plus a partly typed second line with a visible cursor)
   - `screen-volume-osd.png` (the OSD visible after a knob drag) and a check that it disappears after the timeout
   - `typed-light-on/off.png`: same frame, with the practical light toggled, plus a numeric luminance delta on the keyboard top edges, small but non-zero
   - `case-corner.png`: a close-up matching the reference angle, plus a normals-continuity check across the corner (adjacent face normals within a few degrees along the curved region)
   - `dust-hero.png` refreshed
   - `intro-hold.png`: the rolled mat during the hold
3. `npm run perf`: ~60 fps idle, typing and during the intro.
4. Inspect the shots yourself and iterate. The terminal should read as a believable Claude Code session.
5. Commit on `master` with a clear message ending with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Do not edit `PROMPTS.md`, `references/` or `docs/`.
