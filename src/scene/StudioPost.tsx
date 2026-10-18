import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType, Vector2, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { observeManagedDisposal } from '../resources/ownership';
import type { LightingSettings } from './lightingControls';

export function StudioPost({ settings }: { settings: LightingSettings }) {
  const { gl, scene, camera, size } = useThree();
  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new Vector2(1, 1), settings.bloomStrength, 0.25, settings.bloomThreshold);
    const output = new OutputPass();
    composer.addPass(render); composer.addPass(bloom); composer.addPass(output);
    return { composer, bloom, output };
  }, [gl, scene, camera]);
  useEffect(() => { pipeline.composer.setPixelRatio(gl.getPixelRatio()); pipeline.composer.setSize(size.width, size.height); }, [pipeline, gl, size]);
  useEffect(() => {
    // Observe the library owners' real dispose events. The shared fullscreen
    // triangle is Three's intentional cache, not a per-mount allocation.
    const { composer, bloom, output } = pipeline;
    const hidden = bloom as unknown as { _basic: import('three').Material };
    [composer.renderTarget1, composer.renderTarget2, composer.copyPass.material,
      bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical,
      bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial, hidden._basic, output.material,
    ].forEach(resource => observeManagedDisposal('StudioPost', resource));
    return () => {
      composer.dispose(); bloom.dispose();
      // UnrealBloomPass does not release its high-pass material itself.
      bloom.materialHighPassFilter.dispose(); output.dispose();
    };
  }, [pipeline]);
  useEffect(() => { const previous = gl.info.autoReset; gl.info.autoReset = false; return () => { gl.info.autoReset = previous; }; }, [gl]);
  pipeline.bloom.strength = settings.bloomStrength; pipeline.bloom.threshold = settings.bloomThreshold;
  // OutputPass uses the existing Neutral tone mapper and exposure exactly once.
  useFrame((_, delta) => { gl.info.reset(); pipeline.composer.render(delta); }, 1);
  return null;
}
