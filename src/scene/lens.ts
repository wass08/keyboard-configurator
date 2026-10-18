import { create } from 'zustand';

export interface DepthOfFieldValues {
  depthOfField: boolean;
  focusDistance: number;
  bokehScale: number;
  focalRange: number;
}
export interface LensValues extends DepthOfFieldValues {
  focalLengthMm: number;
  verticalFovDeg: number;
  filmGaugeMm: number;
  near: number;
  far: number;
}
export const DEFAULT_PROJECTION = { verticalFovDeg: 32, filmGaugeMm: 35, near: 0.008, far: 25 };
export const DEFAULT_DOF: DepthOfFieldValues = { depthOfField: false, focusDistance: 0.719, bokehScale: 1, focalRange: 0.1 };
// Only optical edits update this store; no React state writes in the frame loop.
export const useDepthOfField = create<DepthOfFieldValues>(() => ({ ...DEFAULT_DOF }));
