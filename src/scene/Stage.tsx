import { DPR_CAP, MOBILE_PROFILE } from './deviceProfile';
import { Suspense, useMemo, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { NeutralToneMapping, DataTexture, PCFShadowMap, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three';
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
function ContextEvents({ onFailure }: { onFailure: () => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onFailure(); };
    // Cached captures and precompiled materials need a fresh scene after restore.
    const restored = () => onFailure();
    window.addEventListener('studioerror', onFailure);
    const shaderError = gl.debug.onShaderError;
    gl.debug.onShaderError = (context, program, vertex, fragment) => {
      console.error('Studio shader failed', context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment));
      onFailure();
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    gl.domElement.addEventListener('webglcontextrestored', restored);
    return () => {
      gl.debug.onShaderError = shaderError;
      window.removeEventListener('studioerror', onFailure);
      gl.domElement.removeEventListener('webglcontextlost', lost);
      gl.domElement.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, onFailure]);
  return null;
}
export function Stage({ onFailure }: { onFailure: () => void }) {
  return <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, DPR_CAP]} fallback={<p className="scene-fallback">WebGL is unavailable. Reload to try again.</p>} camera={{ position: HERO_POSITION, fov: PORTRAIT_FOV, near: DEFAULT_PROJECTION.near, far: DEFAULT_PROJECTION.far }} gl={{ antialias: !MOBILE_PROFILE, powerPreference: 'high-performance', toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }} onCreated={({ gl, camera, size }) => {
    gl.toneMappingExposure = 1;
    const lens = camera as PerspectiveCamera; lens.filmGauge = DEFAULT_PROJECTION.filmGaugeMm;
    if (size.width / size.height >= 0.75) lens.setFocalLength(DEFAULT_FOCAL_LENGTH_MM);
  }}>
    <color attach="background" args={['#000000']} />
    <ContextEvents onFailure={onFailure} />
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
