import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType, NoToneMapping, Vector2, WebGLRenderTarget } from 'three';
import type { PerspectiveCamera } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { observeManagedDisposal, useOwnedDisposal } from '../resources/ownership';
import type { LightingSettings } from './lightingControls';
import { DEFAULT_DOF, keyboardFocus, useDepthOfField } from './lens';
import { AnamorphicPass } from './post/AnamorphicPass';
import { FilmOutputPass } from './post/FilmOutputPass';
import { DustOverlayPass } from './post/DustOverlayPass';
import { PassProfiler } from './post/PassProfiler';

declare global { interface Window {
  __film?: () => { passes: { name: string; enabled: boolean }[]; rendererToneMapping: number; operator: string; outputColorSpace: string; toneMapStages: number; outputDefines: Record<string, unknown>; reference: boolean; gradingActive: boolean; gpu: ReturnType<PassProfiler['report']> };
  __filmControl?: { referenceOutput: (value: boolean) => void; profile: (value: boolean) => void; bloom: (value: boolean) => void };
} }

export function StudioPost({ settings }: { settings: LightingSettings }) {
  const { gl, scene, camera, size } = useThree();
  const dof = useDepthOfField();
  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(new Vector2(1, 1), settings.bloomStrength, 0.25, settings.bloomThreshold);
    const depth = new BokehPass(scene, camera, { focus: DEFAULT_DOF.focusDistance, aperture: 0.04, maxblur: 0.012 });
    // A sharp band in real meters keeps the whole keyboard readable. The
    // library shader otherwise has only one infinitely thin focal plane.
    depth.materialBokeh.uniforms.focalRange = { value: DEFAULT_DOF.focalRange };
    depth.materialBokeh.fragmentShader = depth.materialBokeh.fragmentShader
      .replace('uniform float focus;', 'uniform float focus;\nuniform float focalRange;')
      .replace('float factor = ( focus + viewZ );', 'float difference = focus + viewZ;\nfloat factor = sign(difference) * max(abs(difference) - focalRange * 0.5, 0.0);');
    const dust = new DustOverlayPass(scene, camera as PerspectiveCamera, depth);
    const anamorphic = new AnamorphicPass(), output = new FilmOutputPass(), profiler = new PassProfiler(gl);
    const stages = [['scene', render], ['bloom', bloom], ['depthOfField', depth], ['dustAfterDoF', dust], ['anamorphic', anamorphic], ['gradingAndOutput', output]] as const;
    for (const [name, pass] of stages) { composer.addPass(pass); profiler.wrap(name, pass); }
    return { composer, bloom, depth, dust, anamorphic, output, profiler, stages };
  }, [gl, scene, camera]);
  useEffect(() => { pipeline.composer.setPixelRatio(gl.getPixelRatio()); pipeline.composer.setSize(size.width, size.height); }, [pipeline, gl, size]);
  useOwnedDisposal('StudioPost.Anamorphic', pipeline.anamorphic.resources);
  useEffect(() => {
    // Observe the library owners' real dispose events. The shared fullscreen
    // triangle is Three's intentional cache, not a per-mount allocation.
    const { composer, bloom, depth, output } = pipeline;
    const hidden = bloom as unknown as { _basic: import('three').Material };
    [composer.renderTarget1, composer.renderTarget2, composer.copyPass.material,
      bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical,
      bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial, hidden._basic, output.material,
    ].forEach(resource => observeManagedDisposal('StudioPost', resource));
    const depthOwned = depth as unknown as { _renderTargetDepth: WebGLRenderTarget; _materialDepth: import('three').Material };
    [depthOwned._renderTargetDepth, depthOwned._materialDepth, depth.materialBokeh]
      .forEach(resource => observeManagedDisposal('StudioPost.DoF', resource));
    return () => {
      composer.dispose(); bloom.dispose();
      // UnrealBloomPass does not release its high-pass material itself.
      bloom.materialHighPassFilter.dispose(); depth.dispose(); output.dispose(); pipeline.profiler.dispose();
    };
  }, [pipeline]);
  useEffect(() => { const previous = gl.info.autoReset; gl.info.autoReset = false; return () => { gl.info.autoReset = previous; }; }, [gl]);
  useEffect(() => {
    const previous = gl.toneMapping; gl.toneMapping = NoToneMapping;
    return () => { gl.toneMapping = previous; };
  }, [gl]);
  pipeline.bloom.strength = settings.bloomStrength; pipeline.bloom.threshold = settings.bloomThreshold;
  pipeline.depth.enabled = dof.depthOfField;
  pipeline.depth.materialBokeh.uniforms.focalRange.value = dof.focalRange;
  pipeline.depth.materialBokeh.uniforms.aperture.value = 0.04 * dof.bokehScale;
  pipeline.depth.materialBokeh.uniforms.maxblur.value = 0.012 * dof.bokehScale;
  pipeline.anamorphic.configure(settings); pipeline.output.configure(settings);
  useEffect(() => {
    window.__film = () => ({
      passes: pipeline.stages.map(([name, pass]) => ({ name, enabled: pass.enabled })), rendererToneMapping: gl.toneMapping,
      operator: settings.toneOperator, outputColorSpace: gl.outputColorSpace, toneMapStages: pipeline.stages.filter(([, pass]) => pass.enabled && pass instanceof FilmOutputPass).length,
      outputDefines: { ...pipeline.output.material.defines }, reference: pipeline.output.reference, gradingActive: pipeline.output.uniforms.gradeEnabled.value, gpu: pipeline.profiler.report(),
    });
    window.__filmControl = { referenceOutput: value => pipeline.output.useReference(value), profile: value => { if (value) pipeline.profiler.start(); else pipeline.profiler.enabled = false; }, bloom: value => { pipeline.bloom.enabled = value; } };
    return () => { delete window.__film; delete window.__filmControl; };
  }, [pipeline, gl, settings]);
  // OutputPass uses the existing Neutral tone mapper and exposure exactly once.
  useFrame((_, delta) => {
    const lens = useDepthOfField.getState();
    const distance = lens.autoFocus ? keyboardFocus.distance : lens.focusDistance;
    const uniform = pipeline.depth.materialBokeh.uniforms.focus;
    if (uniform.value !== distance) uniform.value = distance;
    gl.info.reset(); pipeline.profiler.beginFrame();
    try { pipeline.composer.render(delta); }
    finally { pipeline.profiler.endFrame(); }
    pipeline.profiler.poll();
  }, 1);
  return null;
}
