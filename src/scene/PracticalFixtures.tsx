import { useMemo } from 'react';
import { CanvasTexture, Color, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { RoundedBox } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { useOwnedDisposal } from '../resources/ownership';
import { DESK_TOP } from './dimensions';
import { MovableProp } from './PropLayout';
import type { LightingSettings } from './lightingControls';
import { OffScreenReflection } from './OffScreenReflection';
import { ScreenText } from '../screen/ScreenText';

const graphite = '#303638';
export const SCREEN_RADIANCE = 0.62;
export const SCREEN_WIDTH = 0.598, SCREEN_HEIGHT = 0.336;
// LCD content has its own radiance; the user's rim/bias-light color controls
// the luminaires, not the wallpaper's white balance.
function wallpaperRGB(u: number, v: number) {
  const lavender = Math.exp(-((u - 0.2) ** 2 / 0.20 + (v - 0.82) ** 2 / 0.35));
  const mint = Math.exp(-((u - 0.83) ** 2 / 0.24 + (v - 0.18) ** 2 / 0.30));
  const horizon = (1 + Math.tanh((v - 0.94) * 18)) / 2;
  return [152 + lavender * 20 + horizon * 18, 152 + lavender * 7 + mint * 32 + horizon * 18, 153 + lavender * 27 + mint * 18 + horizon * 18];
}
// Average the wallpaper in linear light. The reflection card matches actual
// LCD content, independently of the red rear bias-light control.
export const SCREEN_REFLECTION_COLOR = (() => {
  const mean = new Color(0, 0, 0), sample = new Color();
  for (let y = 0; y < 24; y++) for (let x = 0; x < 40; x++) {
    const rgb = wallpaperRGB((x + 0.5) / 40, (y + 0.5) / 24);
    mean.add(sample.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace));
  }
  return mean.multiplyScalar(1 / (40 * 24));
})();
// The lower luminous screen band supplies the grazing rim. A full-height
// emitter averages too many high-angle rays into an even wash on the cap tops.
export const RIM_BAND_HEIGHT = 0.028;
export const RIM_BAND_Y = -SCREEN_HEIGHT / 2 + RIM_BAND_HEIGHT / 2;

function wallpaper() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 432;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const u = x / (canvas.width - 1), v = y / (canvas.height - 1);
    // Smooth Gaussian color fields have no central gradient stop or join.
    // Sub-LSB deterministic dither prevents 8-bit quantization bands.
    const rgb = wallpaperRGB(u, v);
    const noise = (((x * 1664525 ^ y * 1013904223) >>> 0) % 257) / 256 - 0.5;
    const i = (y * canvas.width + x) * 4;
    pixels.data[i] = rgb[0] + noise;
    pixels.data[i + 1] = rgb[1] + noise;
    pixels.data[i + 2] = rgb[2] + noise;
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
  const powered = settings.screenOn && enabled;
  return <MovableProp id="monitor">
    <RoundedBox args={[0.235, 0.009, 0.174]} radius={0.004} smoothness={3} position={[p.x, 0.005, p.z + 0.43 - 0.025]} castShadow receiveShadow><meshStandardMaterial color={graphite} roughness={0.57} metalness={0.45} /></RoundedBox>
    <mesh name="monitor-neck" geometry={neckGeometry} position={[p.x, 0.15, p.z + 0.43 - 0.04]} castShadow><meshStandardMaterial color={graphite} metalness={0.5} roughness={0.55} /></mesh>
    <group position={[p.x, p.y - DESK_TOP, p.z + 0.43]} quaternion={orientation}>
      <RoundedBox args={[0.614, 0.36, 0.018]} radius={0.006} smoothness={3} position={[0, 0, -0.011]} castShadow receiveShadow><meshStandardMaterial color="#242a2c" roughness={0.64} metalness={0.15} /></RoundedBox>
      <RoundedBox args={[0.265, 0.17, 0.029]} radius={0.012} smoothness={3} position={[0, -0.032, -0.033]} castShadow><meshStandardMaterial color={graphite} roughness={0.76} /></RoundedBox>
      {/* Keep the powered-on wallpaper emission-only to avoid reflected seams.
          The off panel combines coated-glass studio reflections with a dim,
          cached planar reflection of the actual keyboard and desktop. */}
      <mesh name="monitor-screen" position={[0, 0.003, 0.0001]}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        {powered
          ? <meshBasicMaterial key="on" map={screen} color={new Color('#ffffff').multiplyScalar(SCREEN_RADIANCE)} />
          : <meshPhysicalMaterial key="off" color="#030405" emissiveIntensity={0} roughness={0.22} metalness={0.08} clearcoat={1} clearcoatRoughness={0.12} />}
      </mesh>
      {/* Typed text: a transparent overlay above the wallpaper, outside the environment portal. */}
      {powered && <ScreenText width={SCREEN_WIDTH} height={SCREEN_HEIGHT} radiance={SCREEN_RADIANCE} />}
      {!powered && <OffScreenReflection width={SCREEN_WIDTH} height={SCREEN_HEIGHT} revision={JSON.stringify(settings)} />}
      <mesh position={[0.28, -0.174, 0]}><sphereGeometry args={[0.0009, 8, 6]} /><meshBasicMaterial color={powered ? '#b9d8da' : '#050606'} /></mesh>
    </group>
  </MovableProp>;
}
