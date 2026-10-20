import { useMemo } from 'react';
import { CanvasTexture, Color, Quaternion, SRGBColorSpace, Vector3 } from 'three';
import { RoundedBox } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { useOwnedDisposal } from '../resources/ownership';
import { DESK_TOP } from './dimensions';
import { MovableProp } from './PropLayout';
import type { LightingSettings } from './lightingControls';
import { OffScreenReflection } from './OffScreenReflection';
import { useStages } from '../stages/store';
import { ScreenText } from '../screen/ScreenText';
import { TERMINAL_RADIANCE, terminalBackground } from '../screen/terminalTheme';

const graphite = '#303638';
export const SCREEN_RADIANCE = TERMINAL_RADIANCE;
export const SCREEN_WIDTH = 0.598, SCREEN_HEIGHT = 0.336;
// Static average luminance of a dark terminal with sparse off-white glyphs.
// The live prompt has its own emitter; it never enters the reflection probe.
// Include the LCD's calibrated linear black floor plus sparse glyph coverage;
// this is still several times dimmer than the former full bright wallpaper.
export const SCREEN_REFLECTION_COLOR = new Color('#3c3d42');
// The lower luminous screen band supplies the grazing rim. A full-height
// emitter averages too many high-angle rays into an even wash on the cap tops.
export const RIM_BAND_HEIGHT = 0.028;
export const RIM_BAND_Y = -SCREEN_HEIGHT / 2 + RIM_BAND_HEIGHT / 2;

function terminalPanel() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 432;
  terminalBackground(canvas.getContext('2d')!, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}
export function Monitor({ settings, enabled, lightEnabled }: { settings: LightingSettings; enabled: boolean; lightEnabled: boolean }) {
  const stage = useStages(s => s.stage);
  const screen = useMemo(terminalPanel, []);
  useOwnedDisposal('Monitor.Background', [screen]);
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
      {/* Keep the powered-on terminal emission-only to avoid reflected seams.
          The off panel combines coated-glass studio reflections with a dim,
          cached planar reflection of the actual keyboard and desktop. */}
      <mesh name="monitor-screen" position={[0, 0.003, 0.0001]}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        {powered
          ? <meshBasicMaterial key="on" map={screen} color={new Color('#ffffff').multiplyScalar(SCREEN_RADIANCE)} />
          : <meshPhysicalMaterial key="off" color="#030405" emissiveIntensity={0} roughness={0.22} metalness={0.08} clearcoat={1} clearcoatRoughness={0.12} />}
      </mesh>
      {/* The terminal canvas and its practical light stay outside the environment portal. */}
      {powered && <ScreenText width={SCREEN_WIDTH} height={SCREEN_HEIGHT} radiance={SCREEN_RADIANCE} settings={settings} lightEnabled={lightEnabled} />}
      {!powered && (stage === null || stage >= 3) && <OffScreenReflection width={SCREEN_WIDTH} height={SCREEN_HEIGHT} revision={JSON.stringify(settings)} />}
      <mesh position={[0.28, -0.174, 0]}><sphereGeometry args={[0.0009, 8, 6]} /><meshBasicMaterial color={powered ? '#b9d8da' : '#050606'} /></mesh>
    </group>
  </MovableProp>;
}
