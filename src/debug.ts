import type { LightingValues } from './scene/lightingControls';
import type { Phase } from './state/store';
import type { ColorGroup } from './keyboard/layout';
import type { ResourceCount } from './resources/ownership';
export type CameraView = 'default' | 'closeup' | 'desk' | 'desk-frame' | 'profile' | 'lighting-wide' | 'lighting-closeup';

export interface CameraValues {
  minDistance: number; maxDistance: number; distance: number; polarDeg: number; azimuthDeg: number; position: number[]; target: number[];
}
export interface KeyboardHook {
  ready: boolean;
  generation: number;
  setVariant: (id: string) => void;
  seek: (seconds: number) => void;
  finish: () => void;
  play: () => void;
  camera: (view: CameraView) => void;
  readonly finished: boolean;
  readonly phase: Phase;
  readonly selectedId: string;
  readonly displayedId: string;
  readonly duration: number;
  inspect: () => { capOffsets: number[]; knobOffset: number; meshes: number; geometries: number; calls: number; triangles: number; palette: Record<string, string>; keys: Record<string, { group: ColorGroup; cap: string; legend: string | null; labels: string[] }>; colorSamples: { key: string; group: ColorGroup; x: number; y: number }[]; framing: { keyboardWidthRatio: number; deskFrontEdgeNdcY: number; keyboardCenterFromEdge: number } };
}
declare global { interface Window {
  __kb?: KeyboardHook;
  __camera?: () => CameraValues;
  __environment?: () => { captures: number; frames: number; probeOrigin: number[]; hdriIntensity: number; hdriRotation: number; lightformers: Record<string, { position: number[]; size: number[]; quaternion: number[]; color: string; radiance: number[] }> };
  __lightingStore?: { set: (values: Record<string, unknown>) => void };
  __lighting?: () => { solo: string | null; lights: { name: string; type: string; intensity: number; color: string; castShadow: boolean; position: number[]; quaternion: number[]; size?: number[] }[]; keyFrustum: { outside: boolean; position: number[]; ndc: number[] }; areaFrusta: Record<string, { outside: boolean; position: number[]; corners: number[][] }>; values: LightingValues; monitor: { screenOn: boolean; material: string; hasWallpaper: boolean; color: string; emissiveIntensity: number; roughness: number; clearcoat: number; reflectionCaptures: number; position: number[]; quaternion: number[] }; screenRegion: { minX: number; maxX: number; minY: number; maxY: number }; environment: number; exposure: number; shadowAutoUpdate: boolean };
  __app?: { setMounted: (mounted: boolean) => void; resources: () => Record<string, ResourceCount> };
} }
