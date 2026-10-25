import type { PropId, PropPose } from './state/layout';
import type { LightingValues } from './scene/lightingControls';
import type { Phase } from './state/store';
import type { ColorGroup } from './keyboard/layout';
import type { ResourceCount } from './resources/ownership';
import type { LensValues } from './scene/lens';
import type { IntroPhase, IntroState } from './scene/intro/sequence';
export type CameraView = 'default' | 'closeup' | 'desk' | 'desk-frame' | 'profile' | 'lighting-wide' | 'lighting-closeup' | 'props-wide' | 'props-streamdeck' | 'props-airpods' | 'deskmat-closeup' | 'desk-sheen' | 'desk-sheen-closeup' | 'wall-paint' | 'wall-mask-right' | 'wall-mask-left' | 'case-corner' | 'screen-terminal';

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
  capFaceSamples: () => { key: string; x: number; y: number }[];
  inspect: () => { intro: { phase: IntroPhase; preparation: { ready: boolean; compiled: boolean; firstFrameRendered: boolean; textures: number; uploadMs: number; compileMs: number; stageCompileMs: number; warmDrawMs: number }; mat: { progress: number; vertices: number; maxRestError: number; minY: number; maxY: number; normalError: number; thickness: number }; frameOffset: number; frameVisible: boolean; keysVisible: boolean }; capOffsets: number[]; knobOffset: number; meshes: number; geometries: number; calls: number; triangles: number; palette: Record<string, string>; keys: Record<string, { group: ColorGroup; cap: string; legend: string | null; labels: string[] }>; lightSamples: { key: string; x: number; y: number }[]; colorSamples: { key: string; group: ColorGroup; x: number; y: number }[]; framing: { keyboardWidthRatio: number; deskFrontEdgeNdcY: number; keyboardCenterFromEdge: number } };
}
declare global { interface Window {
  __build?: string;
  __layoutStore?: { set: (id: PropId, patch: Partial<PropPose>) => void; show: (value: boolean) => void };
  __layout?: () => { values: Record<string, PropPose & { y: number }>; dragging: PropId | null; orbitEnabled: boolean; visible: boolean; projected: Record<string, { x: number; y: number }>; handles: Record<string, { x: number; y: number }[]> };
  __props?: () => { headphones: { cups: { localPosition: number[]; up: number[]; inwardDot: number; stemGeometry: string }[]; aluminum: { color: string; metalness: number; roughness: number }; canopy: { alphaTest: number; hasAlphaMap: boolean; hasNormalMap: boolean; hasRoughnessMap: boolean; sheen: number } }; screenSamples: number[][]; matTop: number; feetBottom: number[]; bodyBottom: number; headrestOverlapMm: number[]; streamdeck: { keyCount: number; lcdRecessMm: number; keyProtrusionMm: number; emission: number; topRoughness: number; openingGapMm: number }; sheenSample: number[]; contactErrorMm: number; props: Record<string, { min: number[]; max: number[]; inFrame: boolean }>; wood: { type: string; clearcoat: number; clearcoatRoughness: number; envMapIntensity: number; explicitEnvironment: boolean; roughnessMin: number; roughnessScale: number; normalStrength: number; coatNormalStrength: number; coatRoughnessInfluence: number; sharedNormalMap: boolean; sharedRoughnessMap: boolean; standardCoatIBL: boolean } };
  __kb?: KeyboardHook;
  __camera?: () => CameraValues;
  __cameraStore?: { set: (lens: Partial<LensValues>) => void; focusOnKeyboard: () => void; reset: () => void; orbit: (pose: { distance?: number; polarDeg?: number; azimuthDeg?: number; target?: number[] }) => void; focusState: () => { distance: number; target: number; updates: number; range: number; rangeTarget: number; rangeUpdates: number; depthMin: number; depthMax: number; bounds: number[][]; center: number[] } };
  __environment?: () => { captures: number; frames: number; probeOrigin: number[]; hdriIntensity: number; hdriRotation: number; lightformers: Record<string, { position: number[]; size: number[]; quaternion: number[]; color: string; radiance: number[] }> };
  __lightingStore?: { set: (values: Record<string, unknown>) => void };
  __lighting?: () => { solo: string | null; lights: { name: string; type: string; intensity: number; color: string; castShadow: boolean; position: number[]; quaternion: number[]; size?: number[] }[]; keyFrustum: { outside: boolean; position: number[]; ndc: number[] }; areaFrusta: Record<string, { outside: boolean; position: number[]; corners: number[][] }>; values: LightingValues; monitor: { screenOn: boolean; material: string; hasWallpaper: boolean; color: string; emissiveIntensity: number; roughness: number; clearcoat: number; reflectionCaptures: number; position: number[]; quaternion: number[] }; screenRegion: { minX: number; maxX: number; minY: number; maxY: number }; environment: number; exposure: number; shadowAutoUpdate: boolean };
  __screen?: () => { redraws: number; staticRedraws: number; dynamicCanvas: number[]; text: string; transcript: string[]; caret: number; lines: string[]; canvas: number[]; fontPx: number; promptLines: number; scroll: number; history: { rows: { text: string; y: number }[]; totalRows: number; capacity: number; scrolledRows: number; lineHeight: number; top: number; promptTop: number; lastBaseline: number; column: number }; caretOn: boolean; osd: { visible: boolean; alpha: number; volume: number; displayedVolume: number; animating: boolean }; practical: { intensity: number; coverage: number } };
  __case?: () => Record<string, { sideFaces: number; adjacentPairs: number; maxFaceAngle: number; maxNormalSeam: number; topFaceTriangles: number; maxTopNormalAngle: number; min: number[]; max: number[] }>;
  __screenControl?: { freezeCaret: (freeze: boolean) => void; clear: () => void };
  __sfx?: () => { contexts: number; unlocked: boolean; ready: boolean; suppressed: number; muted: number; dropped: number; scheduled: number; stolen: number; coalesced: number; tickGap: number; byName: Record<string, number>; events: { name: string; at: number; wall: number; rate: number; gain: number; category: string; source: string }[]; errors: string[]; state: string; voices: number; maxVoices: number; enabled: boolean; master: number; sampleRate: number; buffers: Record<string, number>; character: Record<string, number>; recordedKeys: boolean;
    samples: { status: string; format: string; bytes: number; fetchMs: number; decodeMs: number; codecShiftMs: number; classes: Record<string, { press: number; release: number }> };
    precompute: { runs: number; buffers: number; samples: number; ms: number; workMs: number; longestSliceMs: number; slices: number; afterUnlockMs: number } };
  __sfxPlay?: (name: string, opts?: { gain?: number; rate?: number; delay?: number; pan?: number }) => boolean;
  __sfxDump?: () => { sampleRate: number; voices: Record<string, number[][]>; samples: Record<string, Record<string, number[][]>> | null; samplesRate: number };
  __interaction?: {
    state: () => { hovered: string | null; overKnob: boolean; cursor: string; pressed: string[]; active: number; offsets: Record<string, number>; stemOffsets: Record<string, number>; shiftLatch: boolean; capsLatch: boolean; knob: { detents: number; ticks: number; clicks: number; angleDeg: number; dip: number; dragging: boolean } };
    keyPoint: (id: string) => { x: number; y: number };
    knobPoint: () => { x: number; y: number };
    constants: { hoverDepth: number; pressDepth: number; knobDip: number; detentDeg: number; detentPx: number };
    codeMap: Record<string, string>;
  };
  __app?: { setMounted: (mounted: boolean) => void; resources: () => Record<string, ResourceCount> };
} }
