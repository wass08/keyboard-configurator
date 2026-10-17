import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { PlaneGeometry, type ShaderMaterial } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { useConfigurator } from '../state/store';
import { useOwnedDisposal } from '../resources/ownership';

/** A dim reflection of the actual desk/keyboard, layered over the off panel's
 * coated glass. Cache while stationary; refresh moving reflections at 30 Hz.
 * This pass is independent of the once-per-light-change environment capture. */
export function OffScreenReflection({ width, height, revision }: { width: number; height: number; revision: string }) {
  const camera = useThree(state => state.camera);
  const phase = useConfigurator(state => state.phase);
  const selected = useConfigurator(state => state.selectedId);
  const state = useRef({ phase, revision, selected });
  state.current = { phase, revision, selected };
  const reflector = useMemo(() => {
    const object = new Reflector(new PlaneGeometry(width, height), {
      textureWidth: 768, textureHeight: 432, multisample: 2, clipBias: 0.0001,
    });
    const material = object.material as ShaderMaterial;
    material.fragmentShader = material.fragmentShader.replace(
      'gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
      'gl_FragColor = vec4( base.rgb * 0.055, 0.65 );');
    object.name = 'monitor-scene-reflection';
    material.transparent = true;
    material.depthWrite = false;
    object.renderOrder = 1;
    const render = object.onBeforeRender;
    let previous = '', lastCapture = -Infinity, captures = 0;
    object.onBeforeRender = function (...args) {
      if (args[2] !== camera) return; // No recursive floor/auxiliary captures.
      const { phase, revision, selected } = state.current;
      const signature = JSON.stringify([camera.matrixWorld.elements, camera.projectionMatrix.elements, object.matrixWorld.elements, phase, revision, selected]);
      const now = performance.now();
      if (signature === previous && (phase === 'assembled' || now - lastCapture < 1000 / 30)) return;
      render.apply(this, args);
      previous = signature; lastCapture = now;
      object.userData.captures = ++captures;
    };
    return object;
  }, [width, height, camera]);
  // primitive objects are not recursively disposed by R3F. Release each owned
  // allocation directly, including the reflector's internal render target.
  useOwnedDisposal('Monitor.Reflection', [reflector.geometry, reflector.material as ShaderMaterial, reflector.getRenderTarget()]);
  return <primitive object={reflector} position={[0, 0.003, 0.00011]} dispose={null} />;
}
