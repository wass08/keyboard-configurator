import { Environment, SoftShadows } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Matrix3, Object3D, Quaternion, Vector3 } from 'three';
import type { Mesh, SpotLight } from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useConfigurator } from '../state/store';
import { useLightingControls, xyz } from './lightingControls';
import type { Point } from './lightingControls';
import { DeskLamp, Monitor, Pendant, RIM_BAND_HEIGHT, RIM_BAND_Y, SCREEN_WIDTH } from './PracticalFixtures';

RectAreaLightUniformsLib.init();
function areaOrientation(position: Point, aim: Point) {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(aim.x - position.x, aim.y - position.y, aim.z - position.z).normalize());
}
export function Lighting() {
  const settings = useLightingControls();
  const requestedSolo = new URLSearchParams(location.search).get('solo');
  const solo = ['key', 'rim', 'fill'].includes(requestedSolo ?? '') ? requestedSolo : null;
  const key = !solo || solo === 'key', rim = !solo || solo === 'rim', fill = !solo || solo === 'fill';
  const target = useMemo(() => new Object3D(), []);
  const phase = useConfigurator(state => state.phase);
  const { gl, scene, camera } = useThree();
  const { keyPosition, keyAim, rimPosition, rimAim, fillPosition, fillAim } = settings;
  const screenOrientation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(rimAim.x - rimPosition.x, rimAim.y - rimPosition.y, rimAim.z - rimPosition.z).normalize());
  const rimOrientation = screenOrientation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
  const bandPosition = new Vector3(0, RIM_BAND_Y, 0.002).applyQuaternion(screenOrientation).add(new Vector3(...xyz(rimPosition)));
  target.position.set(...xyz(keyAim));
  useEffect(() => {
    // Cache assembled shadows; refresh throughout animation and after tuning.
    gl.shadowMap.autoUpdate = phase !== 'assembled';
    gl.shadowMap.needsUpdate = true;
  }, [gl, phase, keyPosition.x, keyPosition.y, keyPosition.z, keyAim.x, keyAim.y, keyAim.z,
    rimPosition.x, rimPosition.y, rimPosition.z, rimAim.x, rimAim.y, rimAim.z,
    fillPosition.x, fillPosition.y, fillPosition.z, fillAim.x, fillAim.y, fillAim.z]);
  useEffect(() => { gl.toneMappingExposure = settings.exposure; }, [gl, settings.exposure]);
  useEffect(() => {
    window.__lighting = () => {
      const lights: { type: string; intensity: number; castShadow: boolean; position: number[] }[] = [];
      scene.traverse(object => { if ('isLight' in object && 'intensity' in object) lights.push({ type: object.type, intensity: Number(object.intensity), castShadow: object.castShadow, position: object.position.toArray() }); });
      scene.updateMatrixWorld(true);
      const spot = scene.getObjectByName('lamp-key') as SpotLight;
      const diffuser = scene.getObjectByName('lamp-diffuser') as Mesh;
      const shadeAxis = new Vector3().fromBufferAttribute(diffuser.geometry.getAttribute('normal'), 0).applyNormalMatrix(new Matrix3().getNormalMatrix(diffuser.matrixWorld)).normalize();
      const spotlightDirection = spot.target.getWorldPosition(new Vector3()).sub(spot.getWorldPosition(new Vector3())).normalize();
      const toCamera = camera.getWorldPosition(new Vector3()).sub(diffuser.getWorldPosition(new Vector3())).normalize();
      const lampAlignment = { shadeAxis: shadeAxis.toArray(), spotlightDirection: spotlightDirection.toArray(), angleDegrees: shadeAxis.angleTo(spotlightDirection) * 180 / Math.PI, openingToCameraDot: shadeAxis.dot(toCamera) };
      const screen = scene.getObjectByName('monitor-screen') as Mesh;
      const corners = [-0.075, 0.075].flatMap(x => [-0.14, -0.08].map(y => screen.localToWorld(new Vector3(x, y, 0)).project(camera)));
      const screenRegion = { minX: Math.min(...corners.map(p => (p.x + 1) / 2)), maxX: Math.max(...corners.map(p => (p.x + 1) / 2)), minY: Math.min(...corners.map(p => (1 - p.y) / 2)), maxY: Math.max(...corners.map(p => (1 - p.y) / 2)) };
      return { solo, lights, lampAlignment, screenRegion, environment: scene.environmentIntensity, exposure: gl.toneMappingExposure, shadowAutoUpdate: gl.shadowMap.autoUpdate };
    };
    return () => { delete window.__lighting; };
  }, [gl, scene, camera, solo]);
  return <>
    <SoftShadows size={70} samples={16} />
    <Environment files="/hdri/studio_small_09_1k.hdr" environmentIntensity={solo ? 0.008 : settings.environment} environmentRotation={[0, 1.2, 0]} />
    {/* Very low diffuse bounce belongs to the ceiling fill and is disabled in
        other solos. It approximates the room's reflection of that fixture. */}
    <hemisphereLight color={settings.fillColor} groundColor="#c4cbd5" intensity={fill ? 0.38 * settings.fillIntensity / 9 : 0} />
    <DeskLamp settings={settings} enabled={key} />
    <Monitor settings={settings} enabled={rim} />
    <Pendant settings={settings} enabled={fill} />
    <primitive object={target} />
    <spotLight name="lamp-key" position={xyz(keyPosition)} target={target} intensity={key ? settings.keyIntensity : 0} color={settings.keyColor} angle={0.82} penumbra={0.7} decay={2} distance={2.5} castShadow={key} shadow-mapSize={[2048, 2048]} shadow-camera-near={0.08} shadow-camera-far={2.5} shadow-bias={-0.000025} shadow-normalBias={0.0001} />
    <rectAreaLight position={bandPosition} quaternion={rimOrientation} width={SCREEN_WIDTH} height={RIM_BAND_HEIGHT} intensity={rim ? settings.rimIntensity : 0} color={settings.rimColor} />
    <rectAreaLight position={xyz(fillPosition)} quaternion={areaOrientation(fillPosition, fillAim)} width={1.09} height={0.16} intensity={fill ? settings.fillIntensity : 0} color={settings.fillColor} />
  </>;
}
