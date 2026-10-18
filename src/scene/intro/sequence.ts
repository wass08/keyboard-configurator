import gsap from 'gsap';
import type { Group, Object3D } from 'three';
import { KEYBOARD_Y } from '../dimensions';
import { createAssembly, type AssemblyHandle } from '../../keyboard/assembly';
import type { KeyboardMaterials } from '../../keyboard/materials';
import { useConfigurator } from '../../state/store';
import { sfx } from '../../audio/sfx';

export type IntroPhase = 'mat' | 'frame' | 'keys' | 'done';
export interface IntroDurations { mat: number; frame: number; keys: number }
export const INTRO_DURATIONS: IntroDurations = { mat: 2, frame: 0.8, keys: 2.15 };
export interface IntroState {
  phase: IntroPhase;
  timings: { matEnd: number; frameAt: number; frameEnd: number; keysAt: number; end: number };
  reduced: boolean;
}

export function createIntro(root: Group, keys: Group, mat: Object3D, caps: Group[], knob: Group, materials: KeyboardMaterials, id: string, reduced: boolean, durations: IntroDurations): AssemblyHandle {
  const assembly = createAssembly(caps, knob, materials, id, true, reduced);
  assembly.timeline.pause();
  const matEnd = reduced ? 0 : durations.mat;
  // The roll is already past the keyboard footprint before the case appears.
  const frameAt = reduced ? 0 : matEnd * 0.94;
  const frameEnd = frameAt + (reduced ? 0 : durations.frame);
  const keysAt = reduced ? 0 : frameAt + durations.frame * 0.81;
  if (!reduced) assembly.timeline.timeScale(assembly.timeline.duration() / durations.keys);
  const end = keysAt + assembly.timeline.totalDuration() / assembly.timeline.timeScale();
  const intro: IntroState = { phase: reduced ? 'keys' : 'mat', timings: { matEnd, frameAt, frameEnd, keysAt, end }, reduced };
  const roll = { progress: reduced ? 1 : 0 };
  // Animate an offset rather than an absolute world height: GSAP rounds tween
  // values to micrometers, which could otherwise put the feet below the felt.
  const drop = { y: reduced ? 0 : 0.065 };
  const update = () => {
    const time = timeline.time();
    intro.phase = time >= end - 1e-7 ? 'done' : time >= keysAt ? 'keys' : time >= frameAt ? 'frame' : 'mat';
    root.visible = reduced || time >= frameAt;
    root.position.y = KEYBOARD_Y + Math.max(0, drop.y);
    keys.visible = reduced || time >= keysAt;
    mat.userData.deform(roll.progress);
    // Also handles a deterministic seek backwards after finishing/replaying.
    const phase = intro.phase === 'done' ? 'assembled' : 'assembling';
    if (useConfigurator.getState().phase !== phase) useConfigurator.setState({ phase });
  };
  const timeline = gsap.timeline({ onUpdate: update });
  if (!reduced) {
    timeline.to(roll, { progress: 1, duration: matEnd, ease: 'power2.out' }, 0);
    const landing = durations.frame * 0.81;
    timeline.to(drop, { y: 0, duration: landing, ease: 'power2.in' }, frameAt);
    timeline.to(drop, { y: 0.0008, duration: durations.frame * 0.07, ease: 'power2.out' }, frameAt + landing);
    timeline.to(drop, { y: 0, duration: durations.frame * 0.12, ease: 'sine.inOut' }, frameAt + landing + durations.frame * 0.07);
  }
  timeline.add(assembly.timeline.play(), keysAt);
  // play() never creates/unlocks an AudioContext: first-load playback stays
  // silent; a Replay after a real gesture uses the already-unlocked engine.
  if (!reduced) timeline.call(() => { sfx.play('thud', { category: 'intro', gain: 0.65 }); }, [], keysAt);
  // Read actual cap landing times from the nested timeline, so these cues follow
  // its stagger and the user's Keys duration. At most twelve soft contacts.
  const seats = caps.map((cap, i) => ({ i, at: keysAt + assembly.timeline.getTweensOf(cap.position)[0].endTime() / assembly.timeline.timeScale() })).sort((a, b) => a.at - b.at);
  let lastSeat = -Infinity, seatCount = 0;
  for (const seat of seats) {
    if (seat.at - lastSeat < 0.085 || seatCount >= 12) continue;
    timeline.call(() => { sfx.play('capSeat', { category: 'intro', gain: 0.35, pan: (seat.i / caps.length - 0.5) * 0.4 }); }, [], seat.at);
    lastSeat = seat.at; seatCount++;
  }
  update();
  return { timeline, kind: 'initial', intro };
}
