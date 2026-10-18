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
// 19.022 degrees was the copied readout at approximately 1.30:1 aspect.
// Focal length is the desktop default; Three derives FOV for the live sensor.
export const DEFAULT_FOCAL_LENGTH_MM = 80.343;
export const DEFAULT_PROJECTION = { filmGaugeMm: 35, near: 0.008, far: 25 };
export const DEFAULT_DOF: DepthOfFieldValues = { depthOfField: false, focusDistance: 0.719, bokehScale: 1, focalRange: 0.1 };
// Only optical edits update this store; no React state writes in the frame loop.
export const useDepthOfField = create<DepthOfFieldValues>(() => ({ ...DEFAULT_DOF }));
