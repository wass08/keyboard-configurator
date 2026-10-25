import { useProfiledFrame as useFrame } from './post/useProfiledFrame';
import { ContactShadows } from './ContactShadows';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { DeskSettings } from './Desk';
import { useThree } from '@react-three/fiber';
import { stageMix, features, useStages } from '../stages/store';

// Stage 1 has no environment or fill, so a unit-intensity sun reads almost black.
const STAGE_BARE_INTENSITY = 2.6;
import { Box3, Frustum, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import type { Mesh, RectAreaLight, SpotLight } from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { useConfigurator } from '../state/store';
import { lightingValues, useLightingControls, xyz } from './lightingControls';
import { levaStore } from 'leva';
import { RigEnvironment } from './RigEnvironment';
import { areaOrientation } from './lightTransforms';
import { monitorSettings, screenOrientation as monitorOrientation } from './layoutTransforms';
import { useLayoutStore } from '../state/layout';
import { StudioWall } from './StudioWall';
import { StudioPost } from './StudioPost';
import { DustMotes } from './DustMotes';
import { Monitor, RIM_BAND_HEIGHT, RIM_BAND_Y, SCREEN_WIDTH } from './PracticalFixtures';

RectAreaLightUniformsLib.init();
export function Lighting({ children }: { children: ReactNode }) {
  const rawSettings = useLightingControls();
  const stage = useStages(s => s.stage), previous = useStages(s => s.previous), transitioning = useStages(s => s.transitioning);
  const enabled = features(stage);
  const monitorPose = useLayoutStore(state => state.poses.monitor);
  const poses = useLayoutStore(state => state.poses);
  const dragging = useLayoutStore(state => state.dragging);
  const transformed = useMemo(() => monitorSettings(rawSettings, monitorPose), [rawSettings, monitorPose]);
  const settings = useMemo(() => enabled.practicals ? transformed : { ...transformed, screenOn: false, deckSpill: 0 }, [transformed, enabled.practicals]);
  const requestedSolo = new URLSearchParams(location.search).get('solo');
  const solo = ['key', 'softbox', 'spot', 'fill', 'rim', 'env'].includes(requestedSolo ?? '') ? requestedSolo : null;
  const softbox = !solo || solo === 'key' || solo === 'softbox';
  const spot = !solo || solo === 'key' || solo === 'spot';
  const fill = !solo || solo === 'fill', rim = !solo || solo === 'rim', env = !solo || solo === 'env';
  const monitorRaw = useMemo(() => enabled.practicals ? rawSettings : { ...rawSettings, screenOn: false }, [rawSettings, enabled.practicals]);
  const environmentSettings = useRef(settings);
  if (!dragging) environmentSettings.current = settings;
  const target = useMemo(() => new Object3D(), []);
  const phase = useConfigurator(state => state.phase);
  const { gl, scene, camera } = useThree();
  const { keyPosition, keyAim, rimPosition, rimAim } = settings;
  const spotPosition = settings.linkSpot ? keyPosition : settings.spotPosition;
  const spotAim = settings.linkSpot ? keyAim : settings.spotAim;
  const screenOrientation = monitorOrientation(settings);
  const rimOrientation = screenOrientation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
  const bandPosition = new Vector3(0, RIM_BAND_Y, 0.002).applyQuaternion(screenOrientation).add(new Vector3(...xyz(rimPosition)));
  const backPosition = new Vector3(0, 0, -0.06).applyQuaternion(screenOrientation).add(new Vector3(...xyz(rimPosition)));
  target.position.set(...xyz(spotAim));
  useFrame('lighting', () => {
    for (const [name, intensity] of [
      ['stage-bare', STAGE_BARE_INTENSITY * stageMix.bare], ['key-softbox', softbox ? settings.softboxIntensity * stageMix.studio : 0],
      ['studio-key', spot ? settings.keyIntensity * stageMix.studio : 0], ['studio-fill', fill ? settings.fillIntensity * stageMix.studio : 0],
      ['screen-rim', rim && settings.screenOn ? settings.rimIntensity * stageMix.practicals : 0],
      ['screen-wall-glow', rim && settings.screenOn ? settings.wallGlow * stageMix.practicals : 0],
      ['streamdeck-spill', solo ? 0 : rawSettings.deckSpill * stageMix.practicals],
    ] as const) {
      const light = scene.getObjectByName(name) as RectAreaLight | undefined;
      if (light) light.intensity = intensity;
    }
    const text = scene.getObjectByName('screen-text-light') as RectAreaLight | undefined;
    if (text) { text.intensity *= stageMix.practicals; text.visible = text.intensity > 0; }
  }, 0.4);
  useEffect(() => {
    gl.shadowMap.autoUpdate = phase !== 'assembled';
    gl.shadowMap.needsUpdate = true;
  }, [gl, phase, spotPosition.x, spotPosition.y, spotPosition.z, spotAim.x, spotAim.y, spotAim.z,
    settings.keyAngle, settings.keyPenumbra, settings.shadowSoftness, settings.shadowRadius,
    rimPosition.x, rimPosition.y, rimPosition.z, rimAim.x, rimAim.y, rimAim.z]);
  useEffect(() => { gl.shadowMap.needsUpdate = true; }, [gl, poses]);
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
      // Blank right-hand prompt patch, away from text/borders and the OSD.
      const corners = [0.21, 0.23].flatMap(x => [-0.153, -0.147].map(y => screen.localToWorld(new Vector3(x, y, 0)).project(camera)));
      const screenRegion = { minX: Math.min(...corners.map(p => (p.x + 1) / 2)), maxX: Math.max(...corners.map(p => (p.x + 1) / 2)), minY: Math.min(...corners.map(p => (1 - p.y) / 2)), maxY: Math.max(...corners.map(p => (1 - p.y) / 2)) };
      const panel = screen.material as import('three').MeshPhysicalMaterial;
      return { solo, lights, keyFrustum, areaFrusta, values: lightingValues(rawSettings), monitor: { screenOn: settings.screenOn, material: panel.type, hasWallpaper: Boolean(panel.map), color: panel.color.getHexString(), emissiveIntensity: panel.emissiveIntensity ?? 0, roughness: panel.roughness ?? 0, clearcoat: panel.clearcoat ?? 0, reflectionCaptures: Number(scene.getObjectByName('monitor-scene-reflection')?.userData.captures ?? 0), position: screen.getWorldPosition(new Vector3()).toArray(), quaternion: screen.getWorldQuaternion(new Quaternion()).toArray() }, screenRegion, environment: scene.environmentIntensity, exposure: gl.toneMappingExposure, shadowAutoUpdate: gl.shadowMap.autoUpdate };
    };
    return () => { delete window.__lighting; delete window.__lightingStore; };
  }, [gl, scene, camera, solo, settings, rawSettings]);
  return <DeskSettings.Provider value={settings}>
    <ContactShadows size={settings.shadowSoftness * settings.shadowRadius / 3} />
    <RigEnvironment settings={environmentSettings.current} enabled={env && Boolean(enabled.practicals)} />
    <Monitor settings={monitorRaw} enabled={rim || env} lightEnabled={rim} />
    <primitive object={target} />
    {(stage === 1 || (transitioning && previous === 1)) && <directionalLight name="stage-bare" position={xyz(keyPosition)} target={target} color="#ffffff" intensity={STAGE_BARE_INTENSITY * stageMix.bare} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-1} shadow-camera-right={1} shadow-camera-top={1} shadow-camera-bottom={-1} shadow-camera-near={0.1} shadow-camera-far={4} shadow-bias={-0.0001} />}
    <rectAreaLight name="key-softbox" position={xyz(keyPosition)} quaternion={areaOrientation(keyPosition, keyAim)} width={settings.softboxWidth} height={settings.softboxHeight} intensity={softbox ? settings.softboxIntensity : 0} color={settings.keyColor} />
    <spotLight name="studio-key" position={xyz(spotPosition)} target={target} intensity={spot ? settings.keyIntensity : 0} color={settings.keyColor} angle={settings.keyAngle} penumbra={settings.keyPenumbra} decay={2} distance={4} castShadow={spot && Boolean(enabled.studio)} shadow-radius={settings.shadowRadius} shadow-mapSize={[2048, 2048]} shadow-camera-near={0.1} shadow-camera-far={4} shadow-bias={-0.000025} shadow-normalBias={0.0001} />
    <rectAreaLight name="studio-fill" position={xyz(settings.fillPosition)} quaternion={areaOrientation(settings.fillPosition, settings.fillAim)} width={settings.fillWidth} height={settings.fillHeight} intensity={fill ? settings.fillIntensity : 0} color={settings.fillColor} />
    <rectAreaLight name="screen-rim" position={bandPosition} quaternion={rimOrientation} width={SCREEN_WIDTH} height={RIM_BAND_HEIGHT} intensity={rim && settings.screenOn ? settings.rimIntensity : 0} color={settings.rimColor} />
    {/* Screen-motivated rear glow illuminates real painted wall, not a backdrop
        texture or emissive decal. It follows the monitor's transform. */}
    <rectAreaLight name="screen-wall-glow" position={backPosition} quaternion={screenOrientation} width={0.5} height={0.26} intensity={rim && settings.screenOn ? settings.wallGlow : 0} color={settings.rimColor} />
    {children}
    <StudioWall settings={settings} />
    <StudioPost settings={settings} />
    <DustMotes settings={settings} />
  </DeskSettings.Provider>;
}
