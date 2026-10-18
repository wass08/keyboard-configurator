import { useEffect, useState } from 'react';
import { folder, useControls } from 'leva';
import { useSound } from '../audio/soundStore';
import type { SfxCategory } from '../audio/soundStore';
import '../audio/sfx';

const READOUT_MS = 1200;
const CATEGORY_LABELS: [SfxCategory, string][] = [['hover', 'Hover'], ['typing', 'Typing'], ['replacement', 'Replacement'], ['knob', 'Knob'], ['intro', 'Intro']];

/** `?debug` → Sound: master and per-category volumes, two-way synced with the knob. */
function useSoundControls() {
  const [, set] = useControls(() => ({
    Sound: folder({
      masterVolume: { value: useSound.getState().master, min: 0, max: 1, step: 0.01, label: 'Master', onChange: (v: number) => useSound.getState().setMaster(v) },
      ...Object.fromEntries(CATEGORY_LABELS.map(([category, label]) => [`${category}Volume`, { value: useSound.getState().volumes[category], min: 0, max: 1.5, step: 0.01, label, onChange: (v: number) => useSound.getState().setVolume(category, v) }])),
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
