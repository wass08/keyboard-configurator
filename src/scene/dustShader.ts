// Dust motes in the key spotlight (spec 07a). All motion and lighting run in
// the vertex shader. `evaluateMote` mirrors it on the CPU for capture checks only.

export const DUST_MAX_COUNT = 600;
/** The volume starts this far along the light → aim axis, so it stays near the product. */
export const DUST_NEAR_FRACTION = 0.5;
/** Very slight convection and room drift (m/s, world space) at speed 1. */
export const DUST_DRIFT = [0.0011, 0.0024, -0.0007] as const;
/** Amplitude (m) of the Brownian-like wander around each drifting seed. */
export const DUST_WANDER = 0.006;
/** Henyey–Greenstein asymmetry: dust scatters slightly forward. */
export const DUST_SCATTER_G = 0.25;
/** Defocus blur, in CSS pixels, of a mote halfway between the lens and the focus plane. */
export const DUST_DEFOCUS = 7;
export const REDUCED_MOTION_SCALE = 0.2;
/** Keep a single mote, and a couple of overlapping ones, under the bloom threshold. */
export const DUST_BLOOM_HEADROOM = 0.5;

export interface DustUniformValues {
  time: number; boxCenter: number[]; boxBasis: number[]; drift: number[]; wander: number;
  lightPos: number[]; lightDir: number[]; coneCos: number; penumbraCos: number; cutoff: number; decay: number;
  lightColor: number[]; intensity: number; scatterG: number; size: number; scale: number;
  pointRange: number[]; nearFade: number[]; maxLuminance: number; cameraPosition: number[]; focus: number; defocus: number;
}

export const dustVertexShader = /* glsl */`
#include <common>
uniform float uTime;
uniform vec3 uBoxCenter;
uniform mat3 uBoxBasis;
uniform vec3 uDrift;
uniform float uWander;
uniform vec3 uLightPos;
uniform vec3 uLightDir;
uniform float uConeCos;
uniform float uPenumbraCos;
uniform float uCutoff;
uniform float uDecay;
uniform vec3 uLightColor;
uniform float uIntensity;
uniform float uScatterG;
uniform float uSize;
uniform float uScale;
uniform vec2 uPointRange;
uniform vec2 uNearFade;
uniform float uMaxLuminance;
uniform float uFocus;
uniform float uDefocus;
attribute vec4 aRandom;
varying vec3 vColor;

void main() {
  // Wrap in the unit box, then fade at its faces so wrapping never pops.
  vec3 local = fract(position + uDrift * uTime);
  vec3 edge = min(local, 1.0 - local);
  float edgeFade = smoothstep(0.0, 0.08, min(edge.x, min(edge.y, edge.z)));
  vec3 phase = 6.2831853 * fract(position.yzx * 3.7 + aRandom.x);
  vec3 f1 = 0.17 + 0.16 * fract(position.zxy * 5.3 + aRandom.w);
  vec3 f2 = 0.41 + 0.33 * fract(position * 9.1 + aRandom.y);
  vec3 wander = uWander * (0.7 * sin(uTime * f1 + phase) + 0.3 * sin(uTime * f2 + phase.yzx * 2.3));
  vec3 world = uBoxCenter + uBoxBasis * (local - 0.5) + wander;

  // Three's own spot cone and distance attenuation, from the live key light.
  vec3 toMote = world - uLightPos;
  float d = length(toMote);
  vec3 L = toMote / d;
  float spot = smoothstep(uConeCos, uPenumbraCos, dot(L, uLightDir));
  // Squared, so dust gathers in the core of the soft cone and reads as a beam.
  float beam = spot * spot;
  float falloff = 1.0 / max(pow(d, uDecay), 0.01);
  if (uCutoff > 0.0) falloff *= pow2(saturate(1.0 - pow4(d / uCutoff)));
  float g = uScatterG;
  float scatter = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * dot(L, normalize(cameraPosition - world)), 1.5);
  float s = 0.5 + 0.5 * sin(uTime * (0.7 + 1.3 * aRandom.w) + 6.2831853 * aRandom.x);
  float twinkle = 0.6 + 0.4 * s * s * s;

  vec4 mv = viewMatrix * vec4(world, 1.0);
  float depth = -mv.z;
  float nearFade = smoothstep(uNearFade.x, uNearFade.y, depth);
  vec3 color = uLightColor * (uIntensity * beam * falloff * scatter * twinkle * edgeFade * nearFade * aRandom.z);
  // Size attenuation in device pixels plus a soft lens defocus away from the
  // product. Larger (defocused or minimum-size) sprites keep their energy.
  float px = uScale * uSize * (0.4 + 1.3 * aRandom.y * aRandom.y * aRandom.y) * 2.5 / max(depth, 1e-4);
  float coc = uDefocus * abs(depth - uFocus) / max(depth, 1e-4);
  float size = clamp(sqrt(px * px + coc * coc), uPointRange.x, uPointRange.y);
  color *= min(1.0, (px * px) / (size * size));
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color *= min(1.0, uMaxLuminance / max(lum, 1e-6));
  vColor = color;
  gl_PointSize = size;
  gl_Position = projectionMatrix * mv;
  // Unlit motes cost no fragments.
  if (lum <= 0.0) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
}`;

export const dustFragmentShader = /* glsl */`
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-4.5 * r2) * (1.0 - r2), 1.0);
}`;

const fract = (x: number) => x - Math.floor(x);
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** CPU mirror of the vertex shader, for one mote. Capture/debug only. */
export function evaluateMote(seed: number[], r: number[], u: DustUniformValues, view: number[]) {
  const t = u.time;
  const local = [0, 1, 2].map(i => fract(seed[i] + u.drift[i] * t));
  const edgeFade = smoothstep(0, 0.08, Math.min(...local.map(v => Math.min(v, 1 - v))));
  const sw = (v: number[]) => [v[1], v[2], v[0]];
  const phase = sw(seed).map(v => 2 * Math.PI * fract(v * 3.7 + r[0]));
  const f1 = [seed[2], seed[0], seed[1]].map(v => 0.17 + 0.16 * fract(v * 5.3 + r[3]));
  const f2 = seed.map(v => 0.41 + 0.33 * fract(v * 9.1 + r[1]));
  const sp = sw(phase);
  const wander = [0, 1, 2].map(i => u.wander * (0.7 * Math.sin(t * f1[i] + phase[i]) + 0.3 * Math.sin(t * f2[i] + sp[i] * 2.3)));
  const b = u.boxBasis; // column-major mat3
  const o = local.map(v => v - 0.5);
  const world = [0, 1, 2].map(i => u.boxCenter[i] + b[i] * o[0] + b[3 + i] * o[1] + b[6 + i] * o[2] + wander[i]);
  const toMote = world.map((v, i) => v - u.lightPos[i]);
  const d = Math.hypot(...toMote);
  const L = toMote.map(v => v / d);
  const cosAngle = dot(L, u.lightDir);
  const spot = smoothstep(u.coneCos, u.penumbraCos, cosAngle);
  let falloff = 1 / Math.max(d ** u.decay, 0.01);
  if (u.cutoff > 0) falloff *= Math.min(1, Math.max(0, 1 - (d / u.cutoff) ** 4)) ** 2;
  const toCamera = u.cameraPosition.map((v, i) => v - world[i]);
  const len = Math.hypot(...toCamera);
  const g = u.scatterG;
  const scatter = (1 - g * g) / (1 + g * g - 2 * g * dot(L, toCamera.map(v => v / len))) ** 1.5;
  const s = 0.5 + 0.5 * Math.sin(t * (0.7 + 1.3 * r[3]) + 2 * Math.PI * r[0]);
  const twinkle = 0.6 + 0.4 * s ** 3;
  // view is a column-major view matrix.
  const depth = -(view[2] * world[0] + view[6] * world[1] + view[10] * world[2] + view[14]);
  const nearFade = smoothstep(u.nearFade[0], u.nearFade[1], depth);
  let color = u.lightColor.map(c => c * u.intensity * spot * spot * falloff * scatter * twinkle * edgeFade * nearFade * r[2]);
  const px = u.scale * u.size * (0.4 + 1.3 * r[1] * r[1] * r[1]) * 2.5 / Math.max(depth, 1e-4);
  const coc = u.defocus * Math.abs(depth - u.focus) / Math.max(depth, 1e-4);
  const size = Math.min(u.pointRange[1], Math.max(u.pointRange[0], Math.hypot(px, coc)));
  color = color.map(c => c * Math.min(1, (px * px) / (size * size)));
  let luminance = dot(color, [0.2126, 0.7152, 0.0722]);
  if (luminance > u.maxLuminance) { color = color.map(c => c * u.maxLuminance / luminance); luminance = u.maxLuminance; }
  return { world, cosAngle, insideCone: cosAngle > u.coneCos, spot, luminance, color, pointSize: luminance > 0 ? size : 0, depth };
}

/** Deterministic seeds: the same dust in every capture. */
export function dustSeeds(count = DUST_MAX_COUNT) {
  let state = 0x5eed1e5 >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const positions = new Float32Array(count * 3), randoms = new Float32Array(count * 4);
  for (let i = 0; i < count * 3; i++) positions[i] = random();
  for (let i = 0; i < count * 4; i++) randoms[i] = random();
  // Brightness: mostly dim specks, with a few brighter flakes.
  for (let i = 0; i < count; i++) randoms[i * 4 + 2] = 0.3 + 0.7 * randoms[i * 4 + 2] ** 1.6;
  return { positions, randoms };
}
