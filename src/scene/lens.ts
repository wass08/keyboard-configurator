import { create } from 'zustand';

export interface DepthOfFieldValues {
  depthOfField: boolean;
  autoFocus: boolean;
  focusDistance: number;
  bokehScale: number;
  focalRange: number;
  autoFocalRange: boolean;
  minFocalRange: number;
  focalMargin: number;
  bokehDistanceScale: number;
}
export interface LensValues extends DepthOfFieldValues {
  focalLengthMm: number;
  verticalFovDeg: number;
  filmGaugeMm: number;
  near: number;
  far: number;
}
// 19.022 degrees was the copied readout at approximately 1.30:1 aspect.
// Focal length is the desktop default; Three derives FOV for the live sensor.
export const DEFAULT_FOCAL_LENGTH_MM = 80.343;
export const DEFAULT_PROJECTION = { filmGaugeMm: 35, near: 0.008, far: 25 };
export const DEFAULT_DOF: DepthOfFieldValues = { depthOfField: true, autoFocus: true, focusDistance: 0.719, bokehScale: 1, focalRange: 0.38, autoFocalRange: true, minFocalRange: 0.38, focalMargin: 0.025, bokehDistanceScale: 0.65 };
// Only optical edits update this store; no React state writes in the frame loop.
export const useDepthOfField = create<DepthOfFieldValues>(() => ({ ...DEFAULT_DOF }));
// The moving focus plane goes straight to the existing post pass, rather than
// sending camera damping through React/Leva on every frame.
export const keyboardFocus = { distance: DEFAULT_DOF.focusDistance, target: DEFAULT_DOF.focusDistance, updates: 0,
  range: DEFAULT_DOF.focalRange, rangeTarget: DEFAULT_DOF.focalRange, rangeUpdates: 0, depthMin: 0, depthMax: 0, bounds: [[0, 0, 0], [0, 0, 0]], center: [0, 0, 0] };
