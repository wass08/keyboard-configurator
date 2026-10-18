import { create } from 'zustand';

export type SfxCategory = 'hover' | 'typing' | 'replacement' | 'knob' | 'intro';
export const SFX_CATEGORIES: readonly SfxCategory[] = ['hover', 'typing', 'replacement', 'knob', 'intro'];
const ENABLED_KEY = 'kc.sound', VOLUME_KEY = 'kc.sound.volume';
export const DEFAULT_MASTER = 0.7;

function read<T>(key: string, parse: (value: string | null) => T): T {
  try { return parse(localStorage.getItem(key)); } catch { return parse(null); }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable: keep the session value */ }
}

interface SoundState {
  enabled: boolean;
  master: number;
  volumes: Record<SfxCategory, number>;
  /** performance.now() of the last knob volume change, for the transient readout. */
  levelChangedAt: number;
  setEnabled: (enabled: boolean) => void;
  setMaster: (master: number, fromKnob?: boolean) => void;
  setVolume: (category: SfxCategory, value: number) => void;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
// Default on, but the engine stays silent until the first user gesture.
export const useSound = create<SoundState>(set => ({
  enabled: read(ENABLED_KEY, v => v !== 'off'),
  master: read(VOLUME_KEY, v => { const n = v === null ? NaN : Number(v); return Number.isFinite(n) ? clamp(n) : DEFAULT_MASTER; }),
  volumes: { hover: 1, typing: 1, replacement: 1, knob: 1, intro: 1 },
  levelChangedAt: 0,
  setEnabled: enabled => { write(ENABLED_KEY, enabled ? 'on' : 'off'); set({ enabled }); },
  setMaster: (value, fromKnob = false) => set(state => {
    const master = Math.round(clamp(value) * 100) / 100;
    if (master === state.master && !fromKnob) return state;
    write(VOLUME_KEY, String(master));
    return { master, ...(fromKnob ? { levelChangedAt: performance.now() } : {}) };
  }),
  setVolume: (category, value) => set(state => state.volumes[category] === clamp(value) ? state : { volumes: { ...state.volumes, [category]: clamp(value) } }),
}));
