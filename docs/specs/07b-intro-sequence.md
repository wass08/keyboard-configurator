# Spec 07b — Intro sequence: mat unrolls → keyboard frame → keys

Assigned to: **Codex agent**, branch `feat/intro-sequence`, in its own git worktree. A parallel Opus agent is adding dust motes (spec 07a) on another branch, which touches `DustMotes.tsx`, `lightingControls.ts` (Dust folder), one mount line, and a delimited block in `scripts/screenshots.mjs`. Avoid touching those areas, so the merge stays clean.

## Goal

On **initial load only**, the scene assembles in three beats:

1. **The desk mat unrolls** onto the desk: a rolled felt mat lies at one end, and it unrolls across the desk into its final flat position. The rolled part is a true spiral or cylinder of the 4 mm felt (visible thickness and layers at the roll's ends). The unrolled part lies perfectly flat, and the transition between them is a smooth bend. A premium, physical feel: it decelerates as it finishes and settles with a tiny flatten. The roll direction is your call (e.g. it rolls out from the left, or from back to front toward the user, whichever reads best from the default camera, which is now at 80 mm / 1.351 m, see `src/scene/CameraRig.tsx`). Implement it as a deformation of a subdivided mat geometry (in the vertex shader, or as an efficient CPU update only during the intro). Its normals must stay correct, so the felt shading and the sheen look right while it rolls. The felt material and textures stay the same.
2. **The keyboard frame arrives**: the case (with the plate and switches inside) comes in after the mat is down. For example it lowers into place from slightly above, with a soft, weighted landing onto the mat, a subtle settle and a hint of contact shadow tightening as it lands. It must not intersect the mat during or after the landing.
3. **The keys assemble**: the existing keycap wave and knob screw-in from `src/keyboard/assembly.ts`, unchanged in feel.

Total about 4–5 s, with slight overlaps between beats so it flows. Props (monitor, Stream Deck, headphones) stay static.

## Rules

- **Variant changes after the intro**: unchanged (keys and knob out → recolor → back in; the frame and mat stay put).
- **Variant chosen during the intro**: the intro continues, and the keys come in with the **latest selected** variant. The case color also ends on that variant. The existing robustness guarantees must hold (no stuck phase, no mixed colors). The existing checks for selection-during-loading and batched A→B→A must still pass, adapted to the longer intro.
- `prefers-reduced-motion`: skip the unroll and the frame drop (show them in place), and keep the short key assembly, as it works today.
- Shadows: keep the existing "update the shadow map only while animating" optimization correct across all three beats.
- Add `window.__kb.replayIntro()` and a "Replay intro" button in `?debug` (in an Intro folder, with per-beat duration controls). Replaying from any state must end fully assembled.
- `window.__kb` must expose the intro phase (`'mat' | 'frame' | 'keys' | 'done'`), so the screenshots are deterministic.

## Evidence required

1. `npm run build` passes. Paste the build tail.
2. `npm run shots` (default ports 4175/4176; the other agent uses other ports via `SHOTS_PORT`/`PERF_PORT`). Add:
   - `intro-mat-mid.png` (the mat half unrolled, the roll visible)
   - `intro-frame-mid.png` (the frame landing)
   - `intro-keys-mid.png` (the keycaps dropping)
   - checks: the phase order is mat → frame → keys → done; the mat is perfectly flat at the end (vertex/plane check); the existing keyboard-on-mat contact check holds at the end of the intro; there's no case-mat interpenetration at any sampled time during the frame landing; `replayIntro()` ends assembled; variant selection during each beat ends on the latest variant. All existing checks pass.
3. `npm run perf`: fps during the intro and when assembled (~60).
4. Look at the shots and at a frame-by-frame sample of the unroll yourself, and iterate until the unroll looks physical (no stretching or popping, a visible roll thickness).
5. Commit on your branch `feat/intro-sequence` with a clear message ending with:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   Do not edit `PROMPTS.md`, `references/` or `docs/`. Do not merge into main.
