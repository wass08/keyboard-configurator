import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { NeutralToneMapping, DataTexture, PCFSoftShadowMap, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three';
import { Desk } from './Desk';
import { Lighting } from './Lighting';
import { CameraRig } from './CameraRig';
import { Keyboard } from '../keyboard/Keyboard';
import { useOwnedDisposal } from '../resources/ownership';
import { StudioWall } from './StudioWall';
import { FloorContact } from './FloorContact';
import { DeskProps } from './props/DeskProps';

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
  return <Canvas shadows={{ type: PCFSoftShadowMap }} dpr={[1, 2]} camera={{ position: [-0.073, 1.125, 0.570], fov: 32, near: 0.008, far: 25 }} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }} onCreated={({ gl }) => { gl.toneMappingExposure = 1; }}>
    <color attach="background" args={['#000000']} />
    <Suspense fallback={null}>
      <Lighting><Desk /><DeskProps /></Lighting>
      <Keyboard />
      <CameraRig />
      <StudioFloor />
      <StudioWall />
      {/* Static floor contact is a cached occlusion pass, not another emitter.
          The moving caps are above its capture range. */}
      <FloorContact />
    </Suspense>
  </Canvas>;
}
