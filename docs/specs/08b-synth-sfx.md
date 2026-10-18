# Spec 08b — Fully synthesized sound design

Assigned to: **an Opus agent**, branch `feat/synth-sfx`, in its own git worktree. In parallel, Codex works on `master` (the terminal screen, volume OSD, dust, the intro delay and the case corners). It reads `useSound` and calls `sfx.play`, but doesn't touch `src/audio/*`.

## Goal

The user doesn't like the current sample-based SFX (Kenney UI clicks; they don't sound like a premium mechanical keyboard). Replace them with a **fully synthesized** sound set: no audio files. Either use a highly rated, tiny UI-audio synthesis library, or write the Web Audio synthesis by hand. Whichever sounds better wins. Explain the choice.

- **Library option**: only if it's small, MIT/ISC-licensed and well regarded, e.g. ZzFX (a ~1 KB micro-synth). `node_modules` is a symlink to the main checkout, so **don't `npm install`**. If you use a library, vendor its single source file under `src/audio/vendor/`, with its license header kept intact, and credit it in `public/CREDITS.md`. Larger frameworks like Tone.js are out (bundle size).
- **Hand-written option** (likely better for realistic switches): physically inspired Web Audio synthesis with short filtered noise bursts (the stem click and the bottom-out), resonant band-pass/modal "body" partials (the keycap and plate resonance), a low thump for the case, and a tiny high "tick" for the top-out on release. Precompute the voices into `AudioBuffer`s once on unlock with `OfflineAudioContext` (cheap at play time), each with several micro-variations, then play them with ±3% pitch/gain jitter.

## Sound targets

They should feel premium, warm and satisfying, never harsh, never 8-bit.
- **Key press**: a deep, rounded **"thock"** (lubed linear switch, PBT caps, a dampened case), with energy around 150–500 Hz, a soft transient, and a ~40–70 ms decay. 4–6 variations.
- **Key release**: a lighter, shorter, slightly higher tick, about −8 to −10 dB.
- **Stabilized keys** (Space, Enter, Backspace, Shift): deeper and fuller, with a slight stabilizer "wire" rattle that is very faint, more like warmth than noise.
- **Hover**: an almost subliminal soft air tick, very quiet and rate-limited, as today.
- **Key replacement** (variant change): cap lift = a soft, muted plastic "pop"; cap seat = a small thock; thinned, as today.
- **Knob**: a crisp, tiny metallic **detent tick**, like a quality encoder (a short high band-passed click with a hint of ring), and a satisfying **click** on press.
- **Intro**: a `thud` for the frame landing (soft and weighty). Add a new `matUnroll` voice, a very soft felt swoosh (filtered noise with a slow envelope); add it to `SfxName`, but leave wiring it into the intro to the integration step, and mention it in the report.

## Constraints

- **Keep the public API stable**: `sfx.play(name, opts)`, `SfxName` (adding names is fine), `PlayOptions`, the categories, and the `useSound` store (master + per-category volumes, `localStorage` persistence, the toggle). Keep the single `AudioContext`, the unlock on first gesture, the polyphony cap and the limiter. All existing callers must keep working unchanged.
- **Remove** `public/audio/` and its `CREDITS.md` entries. Update any code that fetched those files.
- Add `?debug` "Sound" controls for the synthesis character, e.g. thock depth (body pitch), brightness (filter), decay. Include a **"Preview"** button per voice in the leva folder, so the user can audition each sound.
- Bundle/cost: precomputing all voices must take < ~150 ms on unlock and must not block a frame noticeably. Do it in chunks or idle time if needed.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. Run `SHOTS_PORT=4205 PERF_PORT=4206 npm run shots`. All checks pass; update the audio checks: no audio file requests, one AudioContext, silent before a gesture, voices precomputed after unlock, scheduling counts, and no errors.
3. Render each voice offline to a WAV file in `screenshots/audio/` (gitignored) and include a short analysis per voice: duration, peak/RMS, spectral centroid, and the energy split between low, mid and high bands. This gives objective evidence that the press energy sits in 150–500 Hz and nothing is harsh. The user will judge by ear, so also describe each voice's recipe.
4. Run `PERF_PORT=4206 npm run perf`: fps while typing fast is still ~60.
5. Commit on `feat/synth-sfx` with a clear message ending with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Do not merge. Do not edit `PROMPTS.md`, `references/` or `docs/`.
