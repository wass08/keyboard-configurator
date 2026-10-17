import { SoftShadows } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Frustum, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { Mesh, RectAreaLight, SpotLight } from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useConfigurator } from '../state/store';
import { lightingValues, useLightingControls, xyz } from './lightingControls';
import { levaStore } from 'leva';
import { RigEnvironment } from './RigEnvironment';
import { areaOrientation } from './lightTransforms';
import { Monitor, RIM_BAND_HEIGHT, RIM_BAND_Y, SCREEN_WIDTH } from './PracticalFixtures';

RectAreaLightUniformsLib.init();
export function Lighting() {
  const settings = useLightingControls();
  const requestedSolo = new URLSearchParams(location.search).get('solo');
  const solo = ['key', 'softbox', 'spot', 'fill', 'rim', 'env'].includes(requestedSolo ?? '') ? requestedSolo : null;
  const softbox = !solo || solo === 'key' || solo === 'softbox';
  const spot = !solo || solo === 'key' || solo === 'spot';
  const fill = !solo || solo === 'fill', rim = !solo || solo === 'rim', env = !solo || solo === 'env';
  const target = useMemo(() => new Object3D(), []);
  const phase = useConfigurator(state => state.phase);
  const { gl, scene, camera } = useThree();
  const { keyPosition, keyAim, rimPosition, rimAim } = settings;
  const spotPosition = settings.linkSpot ? keyPosition : settings.spotPosition;
  const spotAim = settings.linkSpot ? keyAim : settings.spotAim;
  const screenOrientation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(rimAim.x - rimPosition.x, rimAim.y - rimPosition.y, rimAim.z - rimPosition.z).normalize());
  const rimOrientation = screenOrientation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
  const bandPosition = new Vector3(0, RIM_BAND_Y, 0.002).applyQuaternion(screenOrientation).add(new Vector3(...xyz(rimPosition)));
  const backPosition = new Vector3(0, 0, -0.06).applyQuaternion(screenOrientation).add(new Vector3(...xyz(rimPosition)));
  target.position.set(...xyz(spotAim));
  useEffect(() => {
    gl.shadowMap.autoUpdate = phase !== 'assembled';
    gl.shadowMap.needsUpdate = true;
  }, [gl, phase, spotPosition.x, spotPosition.y, spotPosition.z, spotAim.x, spotAim.y, spotAim.z,
    settings.keyAngle, settings.keyPenumbra, settings.shadowSoftness, settings.shadowRadius,
    rimPosition.x, rimPosition.y, rimPosition.z, rimAim.x, rimAim.y, rimAim.z]);
  useEffect(() => { gl.toneMappingExposure = settings.exposure; }, [gl, settings.exposure]);
  useEffect(() => {
    window.__lightingStore = { set: values => levaStore.set(values, false) };
    window.__lighting = () => {
      scene.updateMatrixWorld(true);
      const lights: { name: string; type: string; intensity: number; color: string; castShadow: boolean; position: number[]; quaternion: number[]; size?: number[] }[] = [];
      scene.traverse(object => {
        if (!('isLight' in object && 'intensity' in object)) return;
        const light = object as RectAreaLight;
        lights.push({ name: light.name, type: light.type, intensity: light.intensity, color: `#${light.color.getHexString()}`, castShadow: light.castShadow, position: light.getWorldPosition(new Vector3()).toArray(), quaternion: light.getWorldQuaternion(new Quaternion()).toArray(), ...('isRectAreaLight' in light ? { size: [light.width, light.height] } : {}) });
      });
      camera.updateMatrixWorld(true);
      const spot = scene.getObjectByName('studio-key') as SpotLight;
      const keyWorld = spot.getWorldPosition(new Vector3());
      const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const keyFrustum = { outside: !frustum.containsPoint(keyWorld), position: keyWorld.toArray(), ndc: keyWorld.clone().project(camera).toArray() };
      const areaFrusta = Object.fromEntries(['key-softbox', 'studio-fill'].map(name => {
        const light = scene.getObjectByName(name) as RectAreaLight;
        const corners = [-1, 1].flatMap(x => [-1, 1].map(y => light.localToWorld(new Vector3(x * light.width / 2, y * light.height / 2, 0))));
        // A conservative world-space bounding box proves the entire source
        // lies outside the view, rather than testing only its center.
        return [name, { outside: !frustum.intersectsBox(new Box3().setFromPoints(corners)), position: light.getWorldPosition(new Vector3()).toArray(), corners: corners.map(p => p.toArray()) }];
      }));
      const screen = scene.getObjectByName('monitor-screen') as Mesh;
      const corners = [-0.075, 0.075].flatMap(x => [-0.14, -0.08].map(y => screen.localToWorld(new Vector3(x, y, 0)).project(camera)));
      const screenRegion = { minX: Math.min(...corners.map(p => (p.x + 1) / 2)), maxX: Math.max(...corners.map(p => (p.x + 1) / 2)), minY: Math.min(...corners.map(p => (1 - p.y) / 2)), maxY: Math.max(...corners.map(p => (1 - p.y) / 2)) };
      const panel = screen.material as import('three').MeshPhysicalMaterial;
      return { solo, lights, keyFrustum, areaFrusta, values: lightingValues(settings), monitor: { screenOn: settings.screenOn, material: panel.type, hasWallpaper: Boolean(panel.map), color: panel.color.getHexString(), emissiveIntensity: panel.emissiveIntensity ?? 0, roughness: panel.roughness ?? 0, clearcoat: panel.clearcoat ?? 0, reflectionCaptures: Number(scene.getObjectByName('monitor-scene-reflection')?.userData.captures ?? 0), position: screen.getWorldPosition(new Vector3()).toArray(), quaternion: screen.getWorldQuaternion(new Quaternion()).toArray() }, screenRegion, environment: scene.environmentIntensity, exposure: gl.toneMappingExposure, shadowAutoUpdate: gl.shadowMap.autoUpdate };
    };
    return () => { delete window.__lighting; delete window.__lightingStore; };
  }, [gl, scene, camera, solo, settings]);
  return <>
    <SoftShadows size={settings.shadowSoftness * settings.shadowRadius / 3} samples={24} />
    <RigEnvironment settings={settings} enabled={env} />
    <Monitor settings={settings} enabled={rim || env} />
    <primitive object={target} />
    <rectAreaLight name="key-softbox" position={xyz(keyPosition)} quaternion={areaOrientation(keyPosition, keyAim)} width={settings.softboxWidth} height={settings.softboxHeight} intensity={softbox ? settings.softboxIntensity : 0} color={settings.keyColor} />
    <spotLight name="studio-key" position={xyz(spotPosition)} target={target} intensity={spot ? settings.keyIntensity : 0} color={settings.keyColor} angle={settings.keyAngle} penumbra={settings.keyPenumbra} decay={2} distance={4} castShadow={spot} shadow-radius={settings.shadowRadius} shadow-mapSize={[2048, 2048]} shadow-camera-near={0.1} shadow-camera-far={4} shadow-bias={-0.000025} shadow-normalBias={0.0001} />
    <rectAreaLight name="studio-fill" position={xyz(settings.fillPosition)} quaternion={areaOrientation(settings.fillPosition, settings.fillAim)} width={settings.fillWidth} height={settings.fillHeight} intensity={fill ? settings.fillIntensity : 0} color={settings.fillColor} />
    <rectAreaLight name="screen-rim" position={bandPosition} quaternion={rimOrientation} width={SCREEN_WIDTH} height={RIM_BAND_HEIGHT} intensity={rim && settings.screenOn ? settings.rimIntensity : 0} color={settings.rimColor} />
    {/* Screen-motivated rear glow illuminates real plaster, not a backdrop
        texture or emissive decal. It follows the monitor's transform. */}
    <rectAreaLight name="screen-wall-glow" position={backPosition} quaternion={screenOrientation} width={0.5} height={0.26} intensity={rim && settings.screenOn ? settings.wallGlow : 0} color={settings.rimColor} />
  </>;
}
