import { useEffect, useState } from 'react';
import { button, folder, useControls } from 'leva';
import { useSound } from '../audio/soundStore';
import type { SfxCategory } from '../audio/soundStore';
import { sfx } from '../audio/sfx';
import type { Character, SfxName } from '../audio/sfx';

const READOUT_MS = 1200;
const CATEGORY_LABELS: [SfxCategory, string][] = [['hover', 'Hover'], ['typing', 'Typing'], ['replacement', 'Replacement'], ['knob', 'Knob'], ['intro', 'Intro']];
const PREVIEWS: [string, SfxName][] = [
  ['Key press', 'keyDown'], ['Key release', 'keyUp'], ['Stab press', 'keyDownStab'], ['Stab release', 'keyUpStab'], ['Hover tick', 'hover'],
  ['Cap lift', 'capLift'], ['Cap seat', 'capSeat'], ['Knob seat', 'knobSeat'], ['Knob tick', 'knobTick'], ['Knob click', 'knobClick'],
  ['Frame thud', 'thud'], ['Soft click', 'softClick'], ['Mat unroll', 'matUnroll'],
];
const CHARACTER: [keyof Character, string, number, number][] = [['pitch', 'Body pitch', 0.7, 1.4], ['brightness', 'Brightness', 0, 1], ['decay', 'Decay', 0.5, 2], ['wire', 'Stab wire', 0, 1]];

/** A preview click is itself the unlocking gesture; play() queues until the voice is rendered. */
function preview(name: SfxName) { sfx.unlock(); sfx.play(name); }
/** A short human-timed phrase: presses, releases, a stabilized Space. */
function typingDemo() {
  sfx.unlock();
  let t = 0;
  for (let i = 0; i < 12; i++) {
    const stab = i === 5 || i === 11, dwell = 0.06 + Math.random() * 0.03;
    const pan = (Math.random() - 0.5) * 0.4;
    // Timers, not scheduled delays: the polyphony cap would steal future voices.
    setTimeout(() => sfx.play(stab ? 'keyDownStab' : 'keyDown', { pan }), t * 1000);
    setTimeout(() => sfx.play(stab ? 'keyUpStab' : 'keyUp', { pan }), (t + dwell) * 1000);
    t += 0.1 + Math.random() * 0.07;
  }
}
function knobSweep() { sfx.unlock(); for (let i = 0; i < 6; i++) sfx.play('knobTick', { delay: i * 0.07, pan: 0.33 }); }
/** 24 detents in ~0.4 s, as a fast flick delivers them; the engine coalesces to the tick gap. */
function knobSpin() { sfx.unlock(); for (let i = 0; i < 24; i++) setTimeout(() => sfx.play('knobTick', { pan: 0.33 }), i * 16); }

/** `?debug` → Sound: master and per-category volumes (two-way synced with the knob), synthesis character, previews. */
function useSoundControls() {
  const [, set] = useControls(() => ({
    Sound: folder({
      masterVolume: { value: useSound.getState().master, min: 0, max: 1, step: 0.01, label: 'Master', onChange: (v: number) => useSound.getState().setMaster(v) },
      ...Object.fromEntries(CATEGORY_LABELS.map(([category, label]) => [`${category}Volume`, { value: useSound.getState().volumes[category], min: 0, max: 1.5, step: 0.01, label, onChange: (v: number) => useSound.getState().setVolume(category, v) }])),
      tickGap: { value: sfx.tickGap * 1000, min: 0, max: 120, step: 1, label: 'Tick gap ms', onChange: (v: number) => sfx.setTickGap(v / 1000) },
      Synthesis: folder(Object.fromEntries(CHARACTER.map(([key, label, min, max]) => [`synth${key[0].toUpperCase()}${key.slice(1)}`, { value: sfx.character[key], min, max, step: 0.01, label, onChange: (v: number) => sfx.setCharacter({ [key]: v }) }])), { collapsed: true }),
      Preview: folder({
        ...Object.fromEntries(PREVIEWS.map(([label, name]) => [label, button(() => preview(name))])),
        'Typing phrase': button(typingDemo),
        'Knob sweep': button(knobSweep),
        'Fast knob spin': button(knobSpin),
      }, { collapsed: true }),
    }, { collapsed: true, order: 100 }),
  }));
  useEffect(() => useSound.subscribe((state, previous) => { if (state.master !== previous.master) (set as (values: Record<string, unknown>) => void)({ masterVolume: state.master }); }), [set]);
}

function Speaker({ on }: { on: boolean }) {
  return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M3.5 7.6h2.6L10 4.4v11.2l-3.9-3.2H3.5z" fill="currentColor" />
    {on
      ? <><path d="M12.6 7.4a3.6 3.6 0 0 1 0 5.2" /><path d="M14.7 5.3a6.6 6.6 0 0 1 0 9.4" /></>
      : <path d="M13 7.6l4.4 4.8M17.4 7.6L13 12.4" />}
  </svg>;
}

export function SoundToggle() {
  useSoundControls();
  const enabled = useSound(state => state.enabled);
  const master = useSound(state => state.master);
  const changedAt = useSound(state => state.levelChangedAt);
  const [showLevel, setShowLevel] = useState(false);
  useEffect(() => {
    if (!changedAt) return;
    setShowLevel(true);
    const timer = setTimeout(() => setShowLevel(false), READOUT_MS);
    return () => clearTimeout(timer);
  }, [changedAt]);
  return <div className="sound-control">
    <span className={`sound-level${showLevel ? ' visible' : ''}`} aria-hidden={!showLevel}>{Math.round(master * 100)}%</span>
    <button type="button" className="sound-toggle" aria-pressed={enabled} aria-label="Sound" title={enabled ? 'Sound on' : 'Sound off'} onClick={() => useSound.getState().setEnabled(!enabled)}>
      <Speaker on={enabled} />
    </button>
  </div>;
}
