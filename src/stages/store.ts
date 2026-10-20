import { create } from 'zustand';
import gsap from 'gsap';

export const STAGE_NAMES = ['Bare', 'Studio light', 'Practicals', 'Desk dressing', 'Lens', 'Sound design', 'Final'] as const;
const requested = Number(new URLSearchParams(location.search).get('stage'));
export const INITIAL_STAGE = Number.isInteger(requested) && requested >= 1 && requested <= 7 ? requested : null;
export const features = (stage: number | null) => {
  const n = stage ?? 7;
  return { bare: n === 1 ? 1 : 0, studio: n >= 2 ? 1 : 0, practicals: n >= 3 ? 1 : 0, dressing: n >= 4 ? 1 : 0, lens: n >= 5 ? 1 : 0, final: n >= 7 ? 1 : 0 };
};
// Mutable animation values go directly to Three; Leva and the tuned stores are
// never rewritten, and no React state is updated for individual tween frames.
export const stageMix = { ...features(INITIAL_STAGE), matRoll: 1 };
let tween: gsap.core.Tween | null = null;
interface StageState {
  stage: number | null; previous: number | null; transitioning: boolean; revision: number;
  panelHidden: boolean; label: boolean;
  select: (stage: number | null) => void;
}
export const useStages = create<StageState>((set, get) => ({
  stage: INITIAL_STAGE, previous: INITIAL_STAGE, transitioning: false, revision: 0, panelHidden: false, label: false,
  select: stage => {
    if (stage !== null && (!Number.isInteger(stage) || stage < 1 || stage > 7)) return;
    const previous = get().stage;
    if (stage === previous) return;
    tween?.kill();
    const next = features(stage);
    if (!features(previous).dressing && next.dressing) stageMix.matRoll = 0;
    set({ stage, previous, transitioning: true, revision: get().revision + 1 });
    tween = gsap.to(stageMix, { ...next, matRoll: 1, duration: 0.6, ease: 'power2.inOut', onComplete: () => { Object.assign(stageMix, next, { matRoll: 1 }); set({ transitioning: false }); } });
  },
}));
export const fullStageAudio = () => (useStages.getState().stage ?? 7) >= 6;
export const isStageHotkey = (event: KeyboardEvent) => event.altKey && !event.ctrlKey && !event.metaKey && (/^Digit[1-7]$/.test(event.code) || ['ArrowLeft', 'ArrowRight', 'KeyH', 'KeyL'].includes(event.code));
