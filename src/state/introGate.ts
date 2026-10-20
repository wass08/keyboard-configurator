import { create } from 'zustand';
import { INITIAL_STAGE } from '../stages/store';

/**
 * Intro gate: the opening screen holds the 3D intro (mat → frame → keys) until
 * the visitor enters. The scene still loads and compiles behind the screen;
 * only the timeline's start waits for `open`.
 *
 * `?capture` (deterministic screenshot runs) and `?skipIntroScreen` start with
 * the gate open and never show the opening screen.
 */
const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
export const SKIP_OPENING_SCREEN = params.has('capture') || params.has('skipIntroScreen') || INITIAL_STAGE !== null;

interface IntroGateState {
  /** The intro timeline may play. */
  open: boolean;
  /** performance.now() when the gate opened (0 while closed, or when skipped). */
  openedAt: number;
  /** Assets loaded, shaders compiled and the first frame rendered (the Keyboard's preparation). */
  sceneReady: boolean;
}
export const useIntroGate = create<IntroGateState>(() => ({ open: SKIP_OPENING_SCREEN, openedAt: 0, sceneReady: false }));

export function openIntroGate() {
  if (!useIntroGate.getState().open) useIntroGate.setState({ open: true, openedAt: performance.now() });
}
export function setSceneReady(sceneReady: boolean) {
  if (useIntroGate.getState().sceneReady !== sceneReady) useIntroGate.setState({ sceneReady });
}
/** Runs `start` now if the gate is open, otherwise once it opens. Returns a cancel function. */
export function whenIntroGateOpen(start: () => void): () => void {
  if (useIntroGate.getState().open) { start(); return () => {}; }
  const unsubscribe = useIntroGate.subscribe(state => { if (state.open) { unsubscribe(); start(); } });
  return unsubscribe;
}
