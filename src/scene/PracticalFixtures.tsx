import { useMemo } from 'react';
import { CanvasTexture, Color, DoubleSide, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { RoundedBox } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { useOwnedDisposal } from '../resources/ownership';
import { DESK_TOP } from './dimensions';
import { xyz } from './lightingControls';
import type { LightingSettings, Point } from './lightingControls';

const graphite = '#303638', powder = '#444a48', pivot = '#727b79';
const up = new Vector3(0, 1, 0);
export const SCREEN_WIDTH = 0.598, SCREEN_HEIGHT = 0.336;
// The lower luminous screen band supplies the grazing rim. A full-height
// emitter averages too many high-angle rays into an even wash on the cap tops.
export const RIM_BAND_HEIGHT = 0.028;
export const RIM_BAND_Y = -SCREEN_HEIGHT / 2 + RIM_BAND_HEIGHT / 2;

// Declarative fixture geometry is R3F-owned. The generated wallpaper is
// explicitly disposed separately from the shared texture-loader caches.
function Bar({ a, b, radius = 0.009, color = powder }: { a: Point; b: Point; radius?: number; color?: string }) {
  const start = new Vector3(...xyz(a)), end = new Vector3(...xyz(b));
  const direction = end.clone().sub(start);
  return <mesh position={start.add(end).multiplyScalar(0.5)} quaternion={new Quaternion().setFromUnitVectors(up, direction.clone().normalize())} castShadow receiveShadow>
    <cylinderGeometry args={[radius, radius, direction.length(), 16]} />
    <meshStandardMaterial color={color} metalness={0.35} roughness={0.58} />
  </mesh>;
}
function Joint({ at, radius = 0.018 }: { at: Point; radius?: number }) {
  return <group position={xyz(at)}>
    <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[radius, radius, 0.035, 32]} /><meshStandardMaterial color={graphite} roughness={0.65} metalness={0.3} /></mesh>
    {[-1, 1].map(side => <mesh key={side} rotation={[0, 0, Math.PI / 2]} position={[side * 0.018, 0, 0]}><cylinderGeometry args={[radius * 0.45, radius * 0.45, 0.002, 24]} /><meshStandardMaterial color={pivot} roughness={0.4} metalness={0.65} /></mesh>)}
  </group>;
}
function wallpaper() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 432;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / (canvas.width - 1), v = y / (canvas.height - 1);
    // Smooth Gaussian color fields have no central gradient stop or join.
    // Sub-LSB deterministic dither prevents 8-bit quantization bands.
    const lavender = Math.exp(-((u - 0.2) ** 2 / 0.20 + (v - 0.82) ** 2 / 0.35));
    const mint = Math.exp(-((u - 0.83) ** 2 / 0.24 + (v - 0.18) ** 2 / 0.30));
    const horizon = (1 + Math.tanh((v - 0.94) * 18)) / 2;
    const noise = (((x * 1664525 ^ y * 1013904223) >>> 0) % 257) / 256 - 0.5;
    const i = (y * canvas.width + x) * 4;
    pixels.data[i] = 143 + lavender * 37 + mint * 9 + horizon * 30 + noise;
    pixels.data[i + 1] = 164 + lavender * 8 + mint * 27 + horizon * 25 + noise;
    pixels.data[i + 2] = 184 + lavender * 16 + mint * 13 + horizon * 21 + noise;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}
export function Monitor({ settings, enabled }: { settings: LightingSettings; enabled: boolean }) {
  const screen = useMemo(wallpaper, []);
  useOwnedDisposal('Monitor.Wallpaper', [screen]);
  const neckGeometry = useMemo(() => new RoundedBoxGeometry(0.036, 0.29, 0.027, 3, 0.004), []);
  useOwnedDisposal('Monitor.Neck', [neckGeometry]);
  const { rimPosition: p, rimAim: aim } = settings;
  const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(aim.x - p.x, aim.y - p.y, aim.z - p.z).normalize());
  return <>
    <RoundedBox args={[0.235, 0.009, 0.174]} radius={0.004} smoothness={3} position={[p.x, DESK_TOP + 0.005, p.z - 0.025]} castShadow receiveShadow><meshStandardMaterial color={graphite} roughness={0.57} metalness={0.45} /></RoundedBox>
    <mesh name="monitor-neck" geometry={neckGeometry} position={[p.x, DESK_TOP + 0.15, p.z - 0.04]} castShadow><meshStandardMaterial color={graphite} metalness={0.5} roughness={0.55} /></mesh>
    <group position={xyz(p)} quaternion={orientation}>
      <RoundedBox args={[0.614, 0.36, 0.018]} radius={0.006} smoothness={3} position={[0, 0, -0.011]} castShadow receiveShadow><meshStandardMaterial color="#242a2c" roughness={0.64} metalness={0.15} /></RoundedBox>
      <RoundedBox args={[0.265, 0.17, 0.029]} radius={0.012} smoothness={3} position={[0, -0.032, -0.033]} castShadow><meshStandardMaterial color={graphite} roughness={0.76} /></RoundedBox>
      {/* An emission-only surface: reflected HDRI/light streaks must not draw
          apparent seams through the wallpaper. The screen's area light still
          supplies the physical spill and rim contribution. */}
      <mesh name="monitor-screen" position={[0, 0.003, 0.0001]}><planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} /><meshBasicMaterial map={screen} color={new Color(settings.rimColor).multiplyScalar(enabled ? 1.35 : 0.008)} /></mesh>
      <mesh position={[0.28, -0.174, 0]}><sphereGeometry args={[0.0009, 8, 6]} /><meshBasicMaterial color={enabled ? '#b9d8da' : '#293638'} /></mesh>
    </group>
  </>;
}
export function DeskLamp({ settings, enabled }: { settings: LightingSettings; enabled: boolean }) {
  const base = { x: -0.34, y: DESK_TOP + 0.02, z: -0.39 };
  const lower = { x: -0.34, y: DESK_TOP + 0.045, z: -0.39 };
  const elbow = { x: -0.30, y: 0.96, z: -0.18 };
  const head = settings.keyPosition, aim = settings.keyAim;
  const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), new Vector3(aim.x - head.x, aim.y - head.y, aim.z - head.z).normalize());
  const mountVector = new Vector3(0, 0.07 * 0.65, 0).applyQuaternion(orientation).add(new Vector3(...xyz(head)));
  const headMount = { x: mountVector.x, y: mountVector.y, z: mountVector.z };
  return <>
    <mesh position={xyz(base)} castShadow receiveShadow><cylinderGeometry args={[0.05, 0.055, 0.03, 64]} /><meshStandardMaterial color={graphite} roughness={0.72} metalness={0.2} /></mesh>
    <mesh position={[base.x, DESK_TOP + 0.004, base.z]}><cylinderGeometry args={[0.051, 0.052, 0.006, 48]} /><meshStandardMaterial color="#1d2425" roughness={0.94} /></mesh>
    {[-0.012, 0.012].map(offset => <group key={offset}>
      <Bar a={{ ...lower, x: lower.x + offset }} b={{ ...elbow, x: elbow.x + offset }} radius={0.007} />
      <Bar a={{ ...elbow, x: elbow.x + offset }} b={{ ...headMount, x: headMount.x + offset }} radius={0.007} />
    </group>)}
    <Bar a={{ ...lower, z: lower.z + 0.027 }} b={{ ...elbow, z: elbow.z + 0.027 }} radius={0.0022} color={pivot} />
    <Bar a={{ ...elbow, y: elbow.y - 0.025 }} b={{ ...headMount, y: headMount.y - 0.025 }} radius={0.0022} color={pivot} />
    {[lower, elbow, headMount].map((point, i) => <Joint key={i} at={point} radius={i === 2 ? 0.012 : 0.015} />)}
    <group position={xyz(head)} quaternion={orientation} scale={0.65}>
      <mesh position={[0, 0.026, 0]} castShadow><cylinderGeometry args={[0.018, 0.062, 0.09, 48, 1, true]} /><meshStandardMaterial color={powder} metalness={0.3} roughness={0.65} side={DoubleSide} /></mesh>
      <mesh position={[0, 0.026, 0]}><cylinderGeometry args={[0.016, 0.059, 0.087, 48, 1, true]} /><meshStandardMaterial color="#e9e3ce" emissive={settings.keyColor} emissiveIntensity={enabled ? 0.18 : 0} roughness={0.8} side={DoubleSide} /></mesh>
      <mesh position={[0, 0.072, 0]} castShadow><cylinderGeometry args={[0.018, 0.018, 0.004, 32]} /><meshStandardMaterial color={graphite} roughness={0.7} /></mesh>
      <mesh position={[0, -0.0175, 0]} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[0.057, 0.063, 48]} /><meshStandardMaterial color="#d6d3c7" roughness={0.7} side={DoubleSide} /></mesh>
      <mesh name="lamp-diffuser" position={[0, -0.016, 0]} rotation={[Math.PI / 2, 0, 0]}><circleGeometry args={[0.056, 48]} /><meshStandardMaterial color="#e8e2cf" emissive={settings.keyColor} emissiveIntensity={enabled ? 2.5 : 0} side={DoubleSide} /></mesh>
    </group>
  </>;
}
export function Pendant({ settings, enabled }: { settings: LightingSettings; enabled: boolean }) {
  const p = settings.fillPosition, aim = settings.fillAim;
  const orientation = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), new Vector3(aim.x - p.x, aim.y - p.y, aim.z - p.z).normalize());
  return <>
    {[-0.43, 0.43].map(x => <Bar key={x} a={{ x: p.x + x, y: p.y + 0.01, z: p.z }} b={{ x: p.x + x, y: 4, z: p.z }} radius={0.0011} color="#3f4544" />)}
    <group position={xyz(p)} quaternion={orientation}>
      <RoundedBox args={[1.13, 0.027, 0.18]} radius={0.006} smoothness={3} position={[0, 0.009, 0]} castShadow><meshStandardMaterial color={graphite} metalness={0.4} roughness={0.6} /></RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}><planeGeometry args={[1.09, 0.16]} /><meshStandardMaterial color="#f6f1e7" emissive={settings.fillColor} emissiveIntensity={enabled ? 1.5 : 0} side={DoubleSide} /></mesh>
    </group>
  </>;
}
