import { create } from 'zustand';
import { SKIP_OPENING_SCREEN } from '../state/introGate';

/**
 * Opening-screen phases (mirrors the design's html[data-phase]):
 * loading → ready → (arming, if entered before ready) → revealing → live.
 */
export type OpeningPhase = 'loading' | 'ready' | 'arming' | 'revealing' | 'live';

interface UiState {
  phase: OpeningPhase;
  toast: { message: string; id: number } | null;
  setPhase: (phase: OpeningPhase) => void;
  showToast: (message: string) => void;
}
export const useUi = create<UiState>(set => ({
  phase: SKIP_OPENING_SCREEN ? 'live' : 'loading',
  toast: null,
  setPhase: phase => set({ phase }),
  showToast: message => set(state => ({ toast: { message, id: (state.toast?.id ?? 0) + 1 } })),
}));
