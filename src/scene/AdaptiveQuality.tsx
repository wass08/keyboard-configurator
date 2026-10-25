import { useProfiledFrame as useFrame } from './post/useProfiledFrame';
import { useEffect, useRef } from 'react';
import { useQuality } from './quality';
import { useThree } from '@react-three/fiber';

declare global { interface Window { __quality?: () => { enabled: boolean; dpr: number; nativeDpr: number; fps: number; changes: number; cooldownSeconds: number; mode: string; tier: string; decided: boolean; decisions: number } } }

/** Hysteresis over complete one-second windows, never per-frame React state.
 * Evidence pins native DPR so quality adaptation cannot hide a perf regression. */
export function AdaptiveQuality() {
  const { gl, setDpr } = useThree();
  const enabled = !['capture', 'perf'].some(key => new URLSearchParams(location.search).has(key));
  const state = useRef({ nativeDpr: Math.min(2, Math.max(1, gl.getPixelRatio())), seconds: 0, frames: 0, fps: 60, slow: 0, fast: 0, cooldown: 0, changes: 0, tierSeconds: 0, tierFrames: 0 });
  useFrame('adaptive', (_, delta) => {
    if (!enabled || document.hidden) return;
    const s = state.current;
    // Asset decode, shader preparation and the opening/intro are not steady
    // rendering samples. Do not bank slow/fast windows behind the loader.
    if(!window.__kb?.ready || !window.__kb.finished || window.__kb.introPhase!=='done') {
      s.seconds=0;s.frames=0;s.slow=0;s.fast=0;s.tierSeconds=0;s.tierFrames=0;return;
    }
    const quality=useQuality.getState();
    if(quality.mode==='auto'&&!quality.decided&&window.__kb?.finished&&window.__kb.introPhase==='done') {
      s.tierSeconds+=delta;s.tierFrames++;
      if(s.tierSeconds>=2.5) {
        const fps=s.tierFrames/s.tierSeconds;
        useQuality.setState({tier:fps<30?'low':fps<50?'medium':'high',decided:true,decisions:quality.decisions+1});
        s.tierSeconds=0;s.tierFrames=0;
      }
    }
    s.seconds += delta; s.frames++; s.cooldown = Math.max(0, s.cooldown - delta);
    if (s.seconds < 1) return;
    s.fps = s.frames / s.seconds; s.seconds = 0; s.frames = 0;
    s.slow = s.fps < 45 ? s.slow + 1 : 0; s.fast = s.fps > 58 ? s.fast + 1 : 0;
    if (s.cooldown) return;
    const current = gl.getPixelRatio();
    const next = s.slow >= 2 ? Math.max(1, current - 0.125) : s.fast >= 4 ? Math.min(s.nativeDpr, current + 0.125) : current;
    if (next !== current) { setDpr(next); s.changes++; s.cooldown = 5; s.slow = s.fast = 0; }
  });
  useEffect(() => {
    window.__quality = () => ({ enabled, dpr: gl.getPixelRatio(), nativeDpr: state.current.nativeDpr, fps: state.current.fps, changes: state.current.changes, cooldownSeconds: state.current.cooldown, ...useQuality.getState() });
    return () => { delete window.__quality; };
  }, [enabled, gl]);
  return null;
}
