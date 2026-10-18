import type { PropId, PropPose } from './state/layout';
import type { LightingValues } from './scene/lightingControls';
import type { Phase } from './state/store';
import type { ColorGroup } from './keyboard/layout';
import type { ResourceCount } from './resources/ownership';
import type { LensValues } from './scene/lens';
import type { IntroPhase, IntroState } from './scene/intro/sequence';
export type CameraView = 'default' | 'closeup' | 'desk' | 'desk-frame' | 'profile' | 'lighting-wide' | 'lighting-closeup' | 'props-wide' | 'props-streamdeck' | 'props-airpods' | 'deskmat-closeup' | 'desk-sheen' | 'desk-sheen-closeup' | 'wall-paint';

export interface CameraValues {
  minDistance: number; maxDistance: number; distance: number; polarDeg: number; azimuthDeg: number; position: number[]; target: number[];
  lens: LensValues;
}
export interface KeyboardHook {
  ready: boolean;
  generation: number;
  setVariant: (id: string) => void;
  seek: (seconds: number) => void;
  finish: () => void;
  play: () => void;
  replayIntro: () => void;
  camera: (view: CameraView) => void;
  readonly finished: boolean;
  readonly phase: Phase;
  readonly selectedId: string;
  readonly displayedId: string;
  readonly duration: number;
  readonly introPhase: IntroPhase;
  readonly introTimings: IntroState['timings'] | null;
  inspect: () => { intro: { phase: IntroPhase; mat: { progress: number; vertices: number; maxRestError: number; minY: number; maxY: number; normalError: number; thickness: number }; frameOffset: number; frameVisible: boolean; keysVisible: boolean }; capOffsets: number[]; knobOffset: number; meshes: number; geometries: number; calls: number; triangles: number; palette: Record<string, string>; keys: Record<string, { group: ColorGroup; cap: string; legend: string | null; labels: string[] }>; colorSamples: { key: string; group: ColorGroup; x: number; y: number }[]; framing: { keyboardWidthRatio: number; deskFrontEdgeNdcY: number; keyboardCenterFromEdge: number } };
}
declare global { interface Window {
  __layoutStore?: { set: (id: PropId, patch: Partial<PropPose>) => void; show: (value: boolean) => void };
  __layout?: () => { values: Record<string, PropPose & { y: number }>; dragging: PropId | null; orbitEnabled: boolean; visible: boolean; projected: Record<string, { x: number; y: number }>; handles: Record<string, { x: number; y: number }[]> };
  __props?: () => { headphones: { cups: { localPosition: number[]; up: number[]; inwardDot: number; stemGeometry: string }[]; aluminum: { color: string; metalness: number; roughness: number }; canopy: { alphaTest: number; hasAlphaMap: boolean; hasNormalMap: boolean; hasRoughnessMap: boolean; sheen: number } }; screenSamples: number[][]; matTop: number; feetBottom: number[]; bodyBottom: number; headrestOverlapMm: number[]; streamdeck: { keyCount: number; lcdRecessMm: number; keyProtrusionMm: number; emission: number; topRoughness: number; openingGapMm: number }; sheenSample: number[]; contactErrorMm: number; props: Record<string, { min: number[]; max: number[]; inFrame: boolean }>; wood: { type: string; clearcoat: number; clearcoatRoughness: number; envMapIntensity: number; explicitEnvironment: boolean; roughnessMin: number; roughnessScale: number; normalStrength: number; coatNormalStrength: number; coatRoughnessInfluence: number; sharedNormalMap: boolean; sharedRoughnessMap: boolean; standardCoatIBL: boolean } };
  __kb?: KeyboardHook;
  __camera?: () => CameraValues;
  __cameraStore?: { set: (lens: Partial<LensValues>) => void; focusOnKeyboard: () => void; reset: () => void };
  __environment?: () => { captures: number; frames: number; probeOrigin: number[]; hdriIntensity: number; hdriRotation: number; lightformers: Record<string, { position: number[]; size: number[]; quaternion: number[]; color: string; radiance: number[] }> };
  __lightingStore?: { set: (values: Record<string, unknown>) => void };
  __lighting?: () => { solo: string | null; lights: { name: string; type: string; intensity: number; color: string; castShadow: boolean; position: number[]; quaternion: number[]; size?: number[] }[]; keyFrustum: { outside: boolean; position: number[]; ndc: number[] }; areaFrusta: Record<string, { outside: boolean; position: number[]; corners: number[][] }>; values: LightingValues; monitor: { screenOn: boolean; material: string; hasWallpaper: boolean; color: string; emissiveIntensity: number; roughness: number; clearcoat: number; reflectionCaptures: number; position: number[]; quaternion: number[] }; screenRegion: { minX: number; maxX: number; minY: number; maxY: number }; environment: number; exposure: number; shadowAutoUpdate: boolean };
  __sfx?: () => { contexts: number; unlocked: boolean; ready: boolean; suppressed: number; muted: number; dropped: number; scheduled: number; stolen: number; byName: Record<string, number>; events: { name: string; at: number; wall: number; rate: number; gain: number; category: string }[]; errors: string[]; state: string; voices: number; maxVoices: number; enabled: boolean; master: number; sampleRate: number; clips: string[] };
  __screen?: () => { redraws: number; text: string; caret: number; lines: string[]; canvas: number[]; fontPx: number };
  __interaction?: {
    state: () => { hovered: string | null; overKnob: boolean; cursor: string; pressed: string[]; active: number; offsets: Record<string, number>; stemOffsets: Record<string, number>; shiftLatch: boolean; capsLatch: boolean; knob: { detents: number; ticks: number; clicks: number; angleDeg: number; dip: number; dragging: boolean } };
    keyPoint: (id: string) => { x: number; y: number };
    knobPoint: () => { x: number; y: number };
    constants: { hoverDepth: number; pressDepth: number; knobDip: number; detentDeg: number; detentPx: number };
    codeMap: Record<string, string>;
  };
  __app?: { setMounted: (mounted: boolean) => void; resources: () => Record<string, ResourceCount> };
} }
