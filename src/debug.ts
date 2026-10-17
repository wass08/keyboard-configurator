import type { Phase } from './state/store';
import type { ColorGroup } from './keyboard/layout';
import type { ResourceCount } from './resources/ownership';
export type CameraView = 'default' | 'closeup' | 'desk' | 'desk-frame' | 'profile' | 'lighting-wide' | 'lighting-closeup';

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
  __lighting?: () => { solo: string | null; lights: { type: string; intensity: number; castShadow: boolean; position: number[] }[]; lampAlignment: { shadeAxis: number[]; spotlightDirection: number[]; angleDegrees: number; openingToCameraDot: number }; screenRegion: { minX: number; maxX: number; minY: number; maxY: number }; environment: number; exposure: number; shadowAutoUpdate: boolean };
  __app?: { setMounted: (mounted: boolean) => void; resources: () => Record<string, ResourceCount> };
} }
