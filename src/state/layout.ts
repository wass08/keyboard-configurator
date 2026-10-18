import { create } from 'zustand';
import { DESK_CENTER_Z, DESK_TOP, MAT_CENTER_Z, MAT_TOP } from '../scene/dimensions';

export type PropId = 'headphones' | 'monitor' | 'streamdeck';
export interface PropPose { x: number; z: number; rotationY: number }
export const DEFAULT_LAYOUT: Record<PropId, PropPose> = {
  headphones: { x: -0.315, z: -0.326, rotationY: -0.35 * 180 / Math.PI },
  monitor: { x: 0, z: -0.43, rotationY: 0 },
  streamdeck: { x: 0.298, z: -0.173, rotationY: -0.12 * 180 / Math.PI },
};
export const PROP_IDS = Object.keys(DEFAULT_LAYOUT) as PropId[];
export function footprint(id: PropId, rotationY: number) {
  const [w, d] = id === 'monitor' ? [0.307, 0.125] : id === 'headphones' ? [0.12, 0.062] : [0.059, 0.048];
  const a = rotationY * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { x: c * w + s * d, z: s * w + c * d };
}
export function supportHeight(id: PropId, p: PropPose) {
  const half = footprint(id, p.rotationY);
  if (id === 'monitor') {
    const a = p.rotationY * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    const x = p.x - Math.sin(a) * 0.025, z = p.z - Math.cos(a) * 0.025;
    return Math.abs(x) < 0.45 + c * 0.1175 + s * 0.087 && Math.abs(z - MAT_CENTER_Z) < 0.2 + s * 0.1175 + c * 0.087 ? MAT_TOP : DESK_TOP;
  }
  // A rigid deck rests on the highest surface touched by its feet, including
  // at a mat edge. The larger stands use their central support point.
  const ex = id === 'streamdeck' ? half.x : 0, ez = id === 'streamdeck' ? half.z : 0;
  return Math.abs(p.x) < 0.45 + ex && Math.abs(p.z - MAT_CENTER_Z) < 0.2 + ez ? MAT_TOP : DESK_TOP;
}
function constrain(id: PropId, p: PropPose): PropPose {
  const rotationY = ((p.rotationY + 180) % 360 + 360) % 360 - 180;
  const half = footprint(id, rotationY);
  return { x: Math.max(-0.8 + half.x, Math.min(0.8 - half.x, p.x)), z: Math.max(DESK_CENTER_Z - 0.375 + half.z, Math.min(DESK_CENTER_Z + 0.375 - half.z, p.z)), rotationY };
}
interface LayoutState {
  poses: Record<PropId, PropPose>; showGizmos: boolean; dragging: PropId | null;
  setPose: (id: PropId, patch: Partial<PropPose>) => void;
  setShowGizmos: (show: boolean) => void; setDragging: (id: PropId | null) => void;
}
export const useLayoutStore = create<LayoutState>((set) => ({
  poses: structuredClone(DEFAULT_LAYOUT), showGizmos: false, dragging: null,
  setPose: (id, patch) => set(state => {
    const next = constrain(id, { ...state.poses[id], ...patch });
    return Object.entries(next).every(([key, v]) => v === state.poses[id][key as keyof PropPose]) ? state : { poses: { ...state.poses, [id]: next } };
  }),
  setShowGizmos: showGizmos => set({ showGizmos }), setDragging: dragging => set({ dragging }),
}));
export const layoutValues = () => Object.fromEntries(PROP_IDS.map(id => [id, { ...useLayoutStore.getState().poses[id], y: supportHeight(id, useLayoutStore.getState().poses[id]) }]));
