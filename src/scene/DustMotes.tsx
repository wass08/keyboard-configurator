import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AddEquation, BufferAttribute, BufferGeometry, Color, CustomBlending, Matrix3, OneFactor, Points, ShaderMaterial, Vector2, Vector3, ZeroFactor } from 'three';
import type { SpotLight } from 'three';
import type { LightingSettings } from './lightingControls';
import { useOwnedDisposal } from '../resources/ownership';
import { DUST_BLOOM_HEADROOM, DUST_DEFOCUS, DUST_DRIFT, DUST_MAX_COUNT, DUST_NEAR_FRACTION, DUST_SCATTER_G, DUST_WANDER, REDUCED_MOTION_SCALE, dustFragmentShader, dustSeeds, dustVertexShader, evaluateMote } from './dustShader';
import type { DustUniformValues } from './dustShader';

type DustSample = ReturnType<typeof evaluateMote> & { index: number; ndc: number[] };
declare global { interface Window {
  __dust?: () => { enabled: boolean; visible: boolean; count: number; drawCount: number; maxCount: number; time: number; frozen: boolean; motionScale: number; speed: number;
    castShadow: boolean; receiveShadow: boolean; frustumCulled: boolean; raycastDisabled: boolean; depthWrite: boolean; depthTest: boolean; transparent: boolean; additive: boolean; shadowUpdates: number;
    bloomThreshold: number; uniforms: DustUniformValues; evaluate: () => DustSample[] };
  __dustControl?: { setTime: (seconds: number) => void };
} }

const UP = new Vector3(0, 1, 0);
const ignoreRaycast: Points['raycast'] = () => {};
const capture = new URLSearchParams(location.search).has('capture');

/** One Points draw call. Visible only inside the live key spotlight's cone. */
export function DustMotes({ settings: s }: { settings: LightingSettings }) {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const resources = useMemo(() => {
    const { positions, randoms } = dustSeeds(DUST_MAX_COUNT);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aRandom', new BufferAttribute(randoms, 4));
    const material = new ShaderMaterial({
      vertexShader: dustVertexShader, fragmentShader: dustFragmentShader,
      uniforms: {
        uTime: { value: 0 }, uBoxCenter: { value: new Vector3() }, uBoxBasis: { value: new Matrix3() }, uDrift: { value: new Vector3() }, uWander: { value: DUST_WANDER },
        uLightPos: { value: new Vector3() }, uLightDir: { value: new Vector3(0, -1, 0) }, uConeCos: { value: 1 }, uPenumbraCos: { value: 1 }, uCutoff: { value: 0 }, uDecay: { value: 2 },
        uLightColor: { value: new Color() }, uIntensity: { value: 0 }, uScatterG: { value: DUST_SCATTER_G }, uSize: { value: 0.0007 }, uScale: { value: 1 },
        uPointRange: { value: new Vector2(1, 10) }, uNearFade: { value: new Vector2(0.03, 0.1) }, uMaxLuminance: { value: 0.6 }, uFocus: { value: 1 }, uDefocus: { value: 0 },
      },
      // Premultiplied additive color; destination alpha is left untouched.
      transparent: true, depthWrite: false, depthTest: true,
      blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
      toneMapped: false, fog: false,
    });
    const points = new Points(geometry, material);
    points.name = 'dust-motes';
    points.raycast = ignoreRaycast;
    // Positions live in the shader; the CPU bounds would be meaningless.
    points.frustumCulled = false; points.castShadow = false; points.receiveShadow = false;
    points.renderOrder = 2;
    // Depth-only override passes (floor contact capture, DoF depth) draw nothing.
    let count = 0;
    points.onBeforeRender = (_renderer, renderScene) => {
      if (renderScene.overrideMaterial) { if (geometry.drawRange.count !== 0) { count = geometry.drawRange.count; geometry.setDrawRange(0, 0); } }
      else if (geometry.drawRange.count === 0 && count) { geometry.setDrawRange(0, count); count = 0; }
    };
    points.onAfterRender = () => { if (count) { geometry.setDrawRange(0, count); count = 0; } };
    return { geometry, material, points };
  }, []);
  useOwnedDisposal('DustMotes', [resources.geometry, resources.material]);

  const motion = useRef({ time: 0, scale: 1, frozen: capture, shadowUpdates: 0 });
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { motion.current.scale = query.matches ? REDUCED_MOTION_SCALE : 1; };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const count = Math.max(0, Math.min(DUST_MAX_COUNT, Math.round(s.dustCount)));
  resources.geometry.setDrawRange(0, count);
  resources.points.visible = s.dustEnabled && count > 0;
  const u = resources.material.uniforms;
  u.uIntensity.value = s.dustIntensity; u.uSize.value = s.dustSize / 1000;
  u.uMaxLuminance.value = s.bloomThreshold * DUST_BLOOM_HEADROOM;

  const spot = useRef<SpotLight | null>(null);
  const scratch = useMemo(() => ({ aim: new Vector3(), axis: new Vector3(), right: new Vector3(), up: new Vector3(), drift: new Vector3(...DUST_DRIFT), buffer: new Vector2() }), []);
  useFrame((state, delta) => {
    const m = motion.current;
    if (!m.frozen) m.time += Math.min(delta, 0.1) * s.dustSpeed * m.scale;
    u.uTime.value = m.time;
    if (!resources.points.visible) return;
    if (!spot.current?.parent) spot.current = scene.getObjectByName('studio-key') as SpotLight | null;
    const light = spot.current;
    if (!light) { u.uIntensity.value = 0; return; }
    // Live key light: last frame's world matrices, without allocations.
    const { aim, axis, right, up, drift } = scratch;
    const lightPos = u.uLightPos.value as Vector3;
    lightPos.setFromMatrixPosition(light.matrixWorld);
    aim.setFromMatrixPosition(light.target.matrixWorld);
    axis.subVectors(aim, lightPos);
    const distance = axis.length();
    axis.divideScalar(distance || 1);
    (u.uLightDir.value as Vector3).copy(axis);
    u.uConeCos.value = Math.cos(light.angle);
    u.uPenumbraCos.value = Math.cos(light.angle * (1 - light.penumbra));
    u.uCutoff.value = light.distance; u.uDecay.value = light.decay;
    (u.uLightColor.value as Color).copy(light.color).multiplyScalar(light.intensity);
    u.uIntensity.value = s.dustIntensity;
    // An oriented box enclosing the cone between mid-beam and the aim point.
    const near = distance * DUST_NEAR_FRACTION - s.dustPadding, far = distance + s.dustPadding;
    const radius = Math.tan(light.angle) * distance + s.dustPadding;
    right.crossVectors(axis, UP); if (right.lengthSq() < 1e-8) right.set(1, 0, 0); right.normalize();
    up.crossVectors(right, axis);
    (u.uBoxCenter.value as Vector3).copy(lightPos).addScaledVector(axis, (near + far) / 2);
    const length = far - near, width = 2 * radius;
    (u.uBoxBasis.value as Matrix3).set(
      right.x * width, up.x * width, axis.x * length,
      right.y * width, up.y * width, axis.y * length,
      right.z * width, up.z * width, axis.z * length);
    (u.uDrift.value as Vector3).set(drift.dot(right) / width, drift.dot(up) / width, drift.dot(axis) / length);
    // Pixels per meter at unit depth, in the render target's device pixels.
    const height = state.gl.getDrawingBufferSize(scratch.buffer).y;
    u.uScale.value = height * state.camera.projectionMatrix.elements[5] / 2;
    const dpr = state.gl.getPixelRatio();
    (u.uPointRange.value as Vector2).set(0.55 * dpr, 4 * dpr);
    (u.uNearFade.value as Vector2).set(state.camera.near + 0.02, state.camera.near + 0.1);
    // Focus on the lit product: the camera's distance to the key light's aim.
    u.uFocus.value = state.camera.position.distanceTo(aim);
    u.uDefocus.value = DUST_DEFOCUS * dpr;
  });

  useEffect(() => {
    // Capture-only instrumentation: count real shadow-map renders.
    const shadowMap = gl.shadowMap, render = shadowMap.render;
    if (capture) shadowMap.render = function (...args) {
      if (shadowMap.enabled && (shadowMap.autoUpdate || shadowMap.needsUpdate)) motion.current.shadowUpdates++;
      return render.apply(this, args);
    };
    window.__dustControl = { setTime: seconds => { motion.current.time = seconds; } };
    window.__dust = () => {
      const { material, points, geometry } = resources;
      const uniforms = material.uniforms;
      const v = (key: string) => (uniforms[key].value as Vector3 | Color | Vector2).toArray() as number[];
      const values: DustUniformValues = {
        time: motion.current.time, boxCenter: v('uBoxCenter'), boxBasis: [...(uniforms.uBoxBasis.value as Matrix3).elements], drift: v('uDrift'), wander: uniforms.uWander.value,
        lightPos: v('uLightPos'), lightDir: v('uLightDir'), coneCos: uniforms.uConeCos.value, penumbraCos: uniforms.uPenumbraCos.value, cutoff: uniforms.uCutoff.value, decay: uniforms.uDecay.value,
        lightColor: v('uLightColor'), intensity: uniforms.uIntensity.value, scatterG: uniforms.uScatterG.value, size: uniforms.uSize.value, scale: uniforms.uScale.value,
        pointRange: v('uPointRange'), nearFade: v('uNearFade'), maxLuminance: uniforms.uMaxLuminance.value, cameraPosition: camera.getWorldPosition(new Vector3()).toArray(), focus: uniforms.uFocus.value, defocus: uniforms.uDefocus.value,
      };
      const positions = geometry.getAttribute('position'), randoms = geometry.getAttribute('aRandom');
      return {
        enabled: points.visible, visible: points.visible && Boolean(points.parent), count: geometry.drawRange.count, drawCount: points.visible ? geometry.drawRange.count : 0, maxCount: DUST_MAX_COUNT,
        time: motion.current.time, frozen: motion.current.frozen, motionScale: motion.current.scale, speed: s.dustSpeed,
        castShadow: points.castShadow, receiveShadow: points.receiveShadow, frustumCulled: points.frustumCulled, raycastDisabled: points.raycast === ignoreRaycast, depthWrite: material.depthWrite, depthTest: material.depthTest, transparent: material.transparent,
        additive: material.blending === CustomBlending && material.blendSrc === OneFactor && material.blendDst === OneFactor, shadowUpdates: motion.current.shadowUpdates,
        bloomThreshold: s.bloomThreshold, uniforms: values,
        evaluate: () => {
          camera.updateMatrixWorld();
          const view = camera.matrixWorldInverse.elements;
          return Array.from({ length: geometry.drawRange.count }, (_, i) => {
            const sample = evaluateMote([positions.getX(i), positions.getY(i), positions.getZ(i)], [randoms.getX(i), randoms.getY(i), randoms.getZ(i), randoms.getW(i)], values, [...view]);
            return { index: i, ...sample, ndc: new Vector3(...sample.world).project(camera).toArray() };
          });
        },
      };
    };
    return () => { shadowMap.render = render; delete window.__dust; delete window.__dustControl; };
  }, [gl, camera, resources, s.dustSpeed, s.bloomThreshold]);

  return <primitive object={resources.points} dispose={null} />;
}
