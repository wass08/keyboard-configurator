import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { NeutralToneMapping, DataTexture, PCFSoftShadowMap, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three';
import { Desk } from './Desk';
import { Lighting } from './Lighting';
import { CameraRig } from './CameraRig';
import { Keyboard } from '../keyboard/Keyboard';
import { useOwnedDisposal } from '../resources/ownership';
import { LayoutControls } from './PropLayout';
import { FloorContact } from './FloorContact';
import { DeskProps } from './props/DeskProps';
import { HERO_POSITION, PORTRAIT_FOV } from './cameraDefaults';
import { DEFAULT_FOCAL_LENGTH_MM, DEFAULT_PROJECTION } from './lens';
import type { PerspectiveCamera } from 'three';
import './ltcGuard';
import { AdaptiveQuality } from './AdaptiveQuality';
import { StageRuntime } from '../stages/StageRuntime';

function StudioFloor() {
  const roughness = useMemo(() => {
    const data = new Uint8Array(128 * 128 * 4);
    let seed = 17;
    for (let i = 0; i < data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = data[i + 1] = data[i + 2] = 225 + seed % 25; data[i + 3] = 255;
    }
    const texture = new DataTexture(data, 128, 128, RGBAFormat); texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(70, 70); texture.needsUpdate = true; return texture;
  }, []);
  useOwnedDisposal('StudioFloor', [roughness]);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
    <planeGeometry args={[80, 80]} /><meshStandardMaterial color="#292b2f" roughness={0.96} roughnessMap={roughness} />
  </mesh>;
}
export function Stage() {
  return <Canvas shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ position: HERO_POSITION, fov: PORTRAIT_FOV, near: DEFAULT_PROJECTION.near, far: DEFAULT_PROJECTION.far }} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }} onCreated={({ gl, camera, size }) => {
    gl.toneMappingExposure = 1;
    const lens = camera as PerspectiveCamera; lens.filmGauge = DEFAULT_PROJECTION.filmGaugeMm;
    if (size.width / size.height >= 0.75) lens.setFocalLength(DEFAULT_FOCAL_LENGTH_MM);
  }}>
    <color attach="background" args={['#000000']} />
    <AdaptiveQuality />
    <Suspense fallback={null}>
      <LayoutControls />
      <Lighting><Desk /><DeskProps /><StageRuntime /></Lighting>
      <group name="keyboard-stage-support"><Keyboard /></group>
      <CameraRig />
      <StudioFloor />
      {/* Static floor contact is a cached occlusion pass, not another emitter.
          The moving caps are above its capture range. */}
      <FloorContact />
    </Suspense>
  </Canvas>;
}
