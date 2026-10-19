import { useEffect, useState } from 'react';
import { SoundToggle } from './SoundToggle';
import { VariantPicker } from './VariantPicker';
import { useUi } from './uiStore';

/** Wawa Sensei mark, top-left (the design's topbar brand). Persistent from the opening screen into the studio. */
export function Brand() {
  return <div className="brand"><img src="/brand/wawasensei-logo-white.svg" width={512} height={268} alt="Wawa Sensei" decoding="async" /></div>;
}

function Toast() {
  const toast = useUi(state => state.toast);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!toast) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = window.setTimeout(() => setShown(false), 4200);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
  }, [toast]);
  return <div className={`toast studio-card${shown ? ' is-shown' : ''}`} role="status" aria-live="polite">{toast?.message ?? ''}</div>;
}

/** Studio controls: hidden and inert behind the opening screen, revealed when the visitor enters. */
export function Hud() {
  const live = useUi(state => state.phase === 'live');
  return <div className={`hud${live ? ' is-live' : ''}`} inert={!live}>
    <VariantPicker />
    <div className="hud-sound"><SoundToggle /></div>
    <Toast />
  </div>;
}
