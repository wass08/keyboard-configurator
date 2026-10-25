import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Environment, Lightformer, useEnvironment } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Color, Euler, Quaternion, Vector3 } from 'three';
import type { CubeCamera, Mesh, MeshBasicMaterial, WebGLCubeRenderTarget } from 'three';
import type { LightingSettings } from './lightingControls';
import { xyz } from './lightingControls';
import { wallReflectionPosition, wallBounceVisible, screenOrientation as monitorOrientation } from './layoutTransforms';
import { areaOrientation } from './lightTransforms';
import { KEYBOARD_Y } from './dimensions';
import { SCREEN_HEIGHT, SCREEN_WIDTH, SCREEN_REFLECTION_COLOR, SCREEN_RADIANCE } from './PracticalFixtures';
import { observeManagedDisposal } from '../resources/ownership';
import { profileGpu, registerGpuWork } from './post/PassProfiler';
import { useStages } from '../stages/store';

// Diffuse wall return: approximate paint reflectance / PI and emitter
// solid angle. It follows the bias-light control, not the LCD white balance.
export const WALL_BOUNCE_GAIN = 0.035;
const PROBE_ORIGIN: [number, number, number] = [0, KEYBOARD_Y + 0.015, 0];
interface Audit { captures: number }

function Probe({ audit, revision }: { audit: Audit; revision: string }) {
  const {scene,gl} = useThree();
  useLayoutEffect(() => {
    // Drei's Environment portal owns this camera/FBO. All rig cards retain
    // literal world transforms; move the sampling origin to the keyboard.
    const camera = scene.children.find(object => object.type === 'CubeCamera') as CubeCamera;
    camera.position.set(...PROBE_ORIGIN);
    const update = camera.update;
    camera.update = function (...args) { audit.captures++; return profileGpu('environment.capture', () => update.apply(this, args)); };
    const unregister=registerGpuWork('environment.capture',()=>camera.update(gl,scene));
    observeManagedDisposal('Environment.Cubemap', camera.renderTarget as WebGLCubeRenderTarget);
    return () => { unregister(); camera.update = update; };
  }, [scene, gl, audit, revision]);
  useEffect(() => {
    window.__environment = () => {
      scene.updateMatrixWorld(true);
      const lightformers: Record<string, { position: number[]; size: number[]; quaternion: number[]; color: string; radiance: number[] }> = {};
      scene.traverse(object => {
        if (!object.name.startsWith('reflection-')) return;
        const mesh = object as Mesh;
        const material = mesh.material as MeshBasicMaterial;
        lightformers[object.name] = { position: object.getWorldPosition(new Vector3()).toArray(), size: object.scale.toArray().slice(0, 2), quaternion: object.getWorldQuaternion(new Quaternion()).toArray(), color: new Color(material.color).getHexString(), radiance: material.color.toArray() };
      });
      return { captures: audit.captures, probeOrigin: [...PROBE_ORIGIN], frames: 1, hdriIntensity: scene.backgroundIntensity, hdriRotation: scene.backgroundRotation.y, lightformers };
    };
    return () => { delete window.__environment; };
  }, [scene, audit]);
  return null;
}

export function RigEnvironment({ settings: s, enabled }: { settings: LightingSettings; enabled: boolean }) {
  const stage = useStages(state => state.stage);
  const hdri = useEnvironment({ files: '/hdri/studio_small_09_1k.hdr' });
  const audit = useRef<Audit>({ captures: 0 });
  // Only reflection-affecting controls enter this key. Assembly, orbit, picker,
  // debug readouts, spot changes and exposure never trigger another cube capture.
  const revision = JSON.stringify([stage, enabled, s.lightformerIntensity, s.hdriIntensity, s.environmentRotation,
    s.keyPosition, s.keyAim, s.softboxWidth, s.softboxHeight, s.softboxIntensity, s.keyColor,
    s.fillPosition, s.fillAim, s.fillWidth, s.fillHeight, s.fillIntensity, s.fillColor,
    s.screenOn, s.rimPosition, s.rimAim, s.rimColor, s.wallGlow]);
  const children = useMemo(() => {
    const screenOrientation = monitorOrientation(s);
    const screenPosition = new Vector3(0, 0.003, 0.0001).applyQuaternion(screenOrientation).add(new Vector3(...xyz(s.rimPosition)));
    return <>
      <Environment map={hdri} background="only" backgroundIntensity={enabled ? s.hdriIntensity : stage !== null && stage < 3 ? 0 : 0.008} backgroundRotation={[0, s.environmentRotation, 0]} />
      {enabled && <>
        <Lightformer name="reflection-softbox" form="rect" position={xyz(s.keyPosition)} rotation={new Euler().setFromQuaternion(areaOrientation(s.keyPosition, s.keyAim))} target={false} scale={[s.softboxWidth, s.softboxHeight, 1]} color={s.keyColor} intensity={s.softboxIntensity * s.lightformerIntensity} />
        <Lightformer name="reflection-fill" form="rect" position={xyz(s.fillPosition)} rotation={new Euler().setFromQuaternion(areaOrientation(s.fillPosition, s.fillAim))} target={false} scale={[s.fillWidth, s.fillHeight, 1]} color={s.fillColor} intensity={s.fillIntensity * s.lightformerIntensity} />
        {s.screenOn && <Lightformer name="reflection-screen" form="rect" position={screenPosition} rotation={new Euler().setFromQuaternion(screenOrientation)} target={false} scale={[SCREEN_WIDTH, SCREEN_HEIGHT, 1]} color={SCREEN_REFLECTION_COLOR} intensity={SCREEN_RADIANCE * s.lightformerIntensity} />}
      </>}
      {enabled && s.screenOn && <Lightformer name="reflection-wall-glow" form="rect" position={wallReflectionPosition(s)} rotation={[0, 0, 0]} target={false} scale={[0.5, 0.26, 1]} color={s.rimColor} intensity={s.wallGlow * WALL_BOUNCE_GAIN * s.lightformerIntensity * wallBounceVisible(s)} />}
      <Probe audit={audit.current} revision={revision} />
    </>;
    // revision contains every consumed setting; keep the portal children stable
    // across unrelated rerenders, so Environment's frames={1} really is cached.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, hdri]);
  return <Environment frames={1} resolution={256} near={0.01} far={30} environmentIntensity={1} environmentRotation={[0, 0, 0]}>{children}</Environment>;
}
