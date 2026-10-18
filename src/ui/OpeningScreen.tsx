import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { sfx } from '../audio/sfx';
import { useSound } from '../audio/soundStore';
import { VARIANTS, getVariant } from '../keyboard/variants';
import { useConfigurator } from '../state/store';
import { openIntroGate, useIntroGate } from '../state/introGate';
import { useUi } from './uiStore';
import type { OpeningPhase } from './uiStore';
import './opening.css';

declare global { interface Window {
  /** Opening-screen state for scripts/screenshots.mjs. */
  __opening?: () => { phase: OpeningPhase; progress: number; gateOpen: boolean; gateOpenedAt: number; sceneReady: boolean; dismissedAt: number; withSound: boolean | null };
} }

const REVEAL_MS = 1400, REVEAL_REDUCED_MS = 260, KEY_HOLD_MS = 140;
const LEGENDS: Record<string, string> = { ' ': '␣', Enter: '↵', Backspace: '⌫', Delete: 'Del', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins' };
const legendFor = (key: string) => LEGENDS[key] ?? (key.length === 1 ? key.toUpperCase() : key.slice(0, 4));
// Any physical key enters, except navigation/system keys (Tab must keep moving focus).
const IGNORED = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'ContextMenu', 'OS', 'Fn', 'NumLock', 'ScrollLock', 'Unidentified', 'Dead', 'Process']);
const isEditable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || Boolean(target.closest('#studio-controls')));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function SpeakerIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>;
}
function HeadphonesIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="7" rx="1.5" /><rect x="17" y="14" width="4" height="7" rx="1.5" />
  </svg>;
}

/** Real loading progress: drei's loader manager for assets (to 90%), then the Keyboard's compile + first frame. */
function useSceneProgress(sceneReady: boolean) {
  const { progress, total } = useProgress();
  const shown = useRef(0);
  const assets = total > 0 ? progress : 0;
  shown.current = sceneReady ? 100 : Math.max(shown.current, Math.min(90, Math.round(assets * 0.9)));
  return shown.current;
}

/**
 * The opening screen ("Hear it before you build it."), over the live canvas.
 * It doubles as the loading screen; entering opens the intro gate (the 3D intro
 * starts then), and the entering gesture also unlocks audio.
 */
export function OpeningScreen() {
  const phase = useUi(state => state.phase);
  const setPhase = useUi(state => state.setPhase);
  const sceneReady = useIntroGate(state => state.sceneReady);
  const selectedId = useConfigurator(state => state.selectedId);
  const progress = useSceneProgress(sceneReady);
  const [legend, setLegend] = useState('↵');
  const [down, setDown] = useState(false);
  const [entered, setEntered] = useState<boolean | null>(null);
  const started = useRef<boolean | null>(null);
  const dismissedAt = useRef(0);
  const cap = useRef<HTMLButtonElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const pressTimer = useRef(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const live = phase === 'live';

  // Mirror the phase on <html> (the scene layer and HUD read it), as the design does.
  useLayoutEffect(() => {
    if (live) { delete document.documentElement.dataset.opening; return; }
    document.documentElement.dataset.opening = phase;
  }, [phase, live]);

  useEffect(() => {
    if (sceneReady && phase === 'loading') setPhase('ready');
  }, [sceneReady, phase, setPhase]);

  useEffect(() => {
    window.__opening = () => ({ phase: useUi.getState().phase, progress: progressRef.current, gateOpen: useIntroGate.getState().open, gateOpenedAt: useIntroGate.getState().openedAt, sceneReady: useIntroGate.getState().sceneReady, dismissedAt: dismissedAt.current, withSound: started.current });
    return () => { delete window.__opening; };
  }, []);

  useLayoutEffect(() => { if (!live) cap.current?.focus({ preventScroll: true }); }, [live]);

  const pressDown = useCallback((key?: string) => {
    if (key) setLegend(legendFor(key));
    setDown(true);
    sfx.unlock(); // already unlocked by the engine's own gesture listener when sound is on
    sfx.play('keyDownSpace', { category: 'typing' });
  }, []);
  const pressUp = useCallback(() => {
    setDown(false);
    sfx.play('keyUpSpace', { category: 'typing' });
  }, []);

  const begin = useCallback((withSound: boolean) => {
    if (started.current !== null) return;
    started.current = withSound;
    setEntered(withSound);
    dismissedAt.current = performance.now();
    const sound = useSound.getState();
    // The keycap is the "with sound" path; this gesture is the audio unlock.
    if (sound.enabled !== withSound) sound.setEnabled(withSound);
    if (withSound) sfx.unlock();
    if (!useIntroGate.getState().sceneReady) setPhase('arming');
  }, [setPhase]);

  // Reveal once entered and the scene is ready: open the gate, fade the screen.
  useEffect(() => {
    if (entered === null || !sceneReady) return;
    setPhase('revealing');
    openIntroGate();
    const timer = window.setTimeout(() => {
      setPhase('live');
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
      useUi.getState().showToast(entered ? 'You’re in. Type on your keyboard to hear the switches.' : 'Sound is off. Turn it on anytime with the sound button.');
    }, reducedMotion() ? REVEAL_REDUCED_MS : REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [entered, sceneReady, setPhase]);

  // Any key enters (captured before the scene's typing listeners).
  useEffect(() => {
    if (live) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (started.current !== null || event.repeat) return;
      if (IGNORED.has(event.key) || /^F\d{1,2}$/.test(event.key) || event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
      const mute = event.target instanceof HTMLElement && event.target.classList.contains('opening-mute');
      if (mute && (event.key === 'Enter' || event.key === ' ')) return; // the focused link-button owns it
      event.preventDefault(); event.stopPropagation();
      pressDown(event.key);
      window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => { pressUp(); begin(true); }, KEY_HOLD_MS);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => { window.removeEventListener('keydown', onKeyDown, { capture: true }); window.clearTimeout(pressTimer.current); };
  }, [live, pressDown, pressUp, begin]);

  // The keycap leans toward the pointer a little (hover devices, motion allowed).
  useEffect(() => {
    if (live || reducedMotion() || !window.matchMedia('(hover: hover)').matches) return;
    let raf = 0, nx = 0, ny = 0;
    const onMove = (event: PointerEvent) => {
      if (started.current !== null) return;
      nx = event.clientX / innerWidth - 0.5; ny = event.clientY / innerHeight - 0.5;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        tilt.current?.style.setProperty('--ry', `${(nx * 16).toFixed(2)}deg`);
        tilt.current?.style.setProperty('--rx', `${(12 - ny * 10).toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, [live]);

  if (live) return null;
  const index = VARIANTS.findIndex(v => v.id === selectedId);
  const ready = phase !== 'loading' && phase !== 'arming';
  const status = phase === 'arming' ? 'Warming up the studio' : ready ? 'Scene ready' : 'Loading scene';
  return <>
    {/* Not wrapped: a stacking-context parent would become the blur's backdrop root and hide the canvas from it. */}
    <div className="opening-layer opening-dim" aria-hidden="true" />
    <div className="opening-layer opening-night" aria-hidden="true" />
    <div className="opening-layer opening-sweep" aria-hidden="true" />
    <section className="opening" aria-labelledby="opening-title" inert={phase === 'revealing'}>
      <header className="opening-topbar">
        <span className="opening-brand-space" aria-hidden="true" />
        <div className="opening-hint"><SpeakerIcon /><span>Sound starts on your first press</span></div>
      </header>

      <div className="opening-main">
        <div className="opening-col">
          <p className="opening-eyebrow">Keyboard configurator</p>
          <h1 className="opening-headline" id="opening-title">Hear it <em>before</em> you build it.</h1>
          <p className="opening-lede">This studio is built to be heard. Turn your sound up, then step inside.</p>

          <div className="cap-stage">
            <div className="cap-glow" aria-hidden="true" />
            <div className="cap-tilt" ref={tilt}>
              <button ref={cap} className={`cap${down ? ' is-down' : ''}`} type="button" aria-describedby="opening-status opening-hint"
                onPointerDown={event => { if (started.current === null && event.button <= 0) pressDown(); }}
                onPointerUp={() => { if (down) pressUp(); }}
                onPointerLeave={() => { if (down) pressUp(); }}
                onPointerCancel={() => setDown(false)}
                onClick={() => begin(true)}>
                <span className="cap-shadow" aria-hidden="true" />
                <span className="cap-wall" aria-hidden="true" />
                <span className="cap-body">
                  <span className="cap-dish">
                    <span className="cap-legend" aria-hidden="true">{legend}</span>
                    <span className="cap-label">Configure my keyboard</span>
                  </span>
                  <span className="cap-underlight" aria-hidden="true" />
                </span>
              </button>
            </div>
          </div>

          <div className="opening-status">
            <div className="opening-load">
              {ready
                ? <span className="ready-dot" aria-hidden="true" />
                : <span className="bar" role="progressbar" aria-label="Loading the 3D scene" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span className="bar-fill" style={{ transform: `scaleX(${progress / 100})` }} /></span>}
              <span className="nowrap" id="opening-status" aria-live="polite">{status}</span>
              {!ready && <span className="pct nowrap" aria-hidden="true">{progress}%</span>}
            </div>
            <span className="sep" aria-hidden="true">·</span>
            <span className="hint nowrap" id="opening-hint">or press <kbd>any key</kbd></span>
          </div>

          <button className="opening-mute" type="button" onClick={() => begin(false)}>Continue without sound</button>
        </div>
      </div>

      <footer className="opening-foot">
        <div className="foot-item">Colorway {String(index + 1).padStart(2, '0')} / {String(VARIANTS.length).padStart(2, '0')} — {getVariant(selectedId).name}</div>
        <div className="foot-item"><HeadphonesIcon /><span>Best with headphones</span></div>
      </footer>
    </section>
  </>;
}
