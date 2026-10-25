import { useProfiledFrame as useFrame } from './post/useProfiledFrame';
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { HalfFloatType, NoToneMapping, Vector2, Vector3, WebGLRenderTarget } from 'three';
import type { PerspectiveCamera } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { DepthAwareDoFPass } from './post/DepthAwareDoFPass';
import { SceneResolvePass } from './post/SceneResolvePass';
import { observeManagedDisposal } from '../resources/ownership';
import type { LightingSettings } from './lightingControls';
import { keyboardFocus, useDepthOfField } from './lens';
import { FilmOutputPass } from './post/FilmOutputPass';
import { DustOverlayPass } from './post/DustOverlayPass';
import { PassProfiler } from './post/PassProfiler';
import { HighlightAudit } from './post/HighlightAudit';
import type { FacePoint, LinearSample } from './post/HighlightAudit';
import { renderMetrics } from './renderMetrics';
import { useQuality } from './quality';
import { features, stageMix, useStages } from '../stages/store';

declare global { interface Window {
  __film?: () => { passes: { name: string; enabled: boolean }[]; rendererToneMapping: number; operator: string; outputColorSpace: string; toneMapStages: number; outputDefines: Record<string, unknown>; reference: boolean; gradingActive: boolean; gpu: ReturnType<PassProfiler['report']>; metrics: ReturnType<typeof renderMetrics>; quality: { tier: string; gatherSamples: number; shadowType: number }; startup: { firstSceneFrameMs: number; introReadyMs: number } };
  __filmControl?: { referenceOutput: (value: boolean) => void; profile: (value: boolean, target?: string) => void; bloom: (value: boolean) => void; silhouetteProbe: () => Promise<unknown>; measure: (points: FacePoint[]) => Promise<Record<string, LinearSample[]>> };
} }

export function StudioPost({ settings }: { settings: LightingSettings }) {
  const { gl, scene, camera, size, viewport: { dpr } } = useThree();
  const dof = useDepthOfField();
  const tier = useQuality(s=>s.tier);
  const stage = useStages(s => s.stage);
  const enabled = features(stage);
  const startup = useRef({ firstSceneFrameMs: 0, introReadyMs: 0 });
  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false, samples: new URLSearchParams(location.search).has('postReference') ? 4 : 0 });
    const composer = new EffectComposer(gl, target);
    const render = new SceneResolvePass(scene, camera);
    const bloom = new UnrealBloomPass(new Vector2(1, 1), settings.bloomStrength, 0.25, settings.bloomThreshold);
    if (!new URLSearchParams(location.search).has('postReference')) {
      const resizeBloom = bloom.setSize.bind(bloom);
      // Preserve the original half-resolution HDR seed so tiny LCD/chrome
      // sources survive thresholding; blur the sparse seed at quarter size.
      // Keep its physical kernel footprint instead of doubling glow radius.
      bloom.setSize = (width, height) => {
        resizeBloom(Math.max(2, width / 2), Math.max(2, height / 2));
        bloom.renderTargetBright.setSize(Math.round(width / 2), Math.round(height / 2));
        for (const material of bloom.separableBlurMaterials) material.uniforms.invSize.value.multiplyScalar(0.5);
      };
    }
    const depth = new DepthAwareDoFPass(camera as PerspectiveCamera);
    depth.depthTexture = render.target.depthTexture;
    const dust = new DustOverlayPass(scene, camera as PerspectiveCamera, depth);
    const output = new FilmOutputPass(), profiler = new PassProfiler(gl);
    profiler.material('scene.resolve', render.material);
    profiler.material('bloom.threshold', bloom.materialHighPassFilter);
    bloom.separableBlurMaterials.forEach((material, i) => profiler.material(`bloom.mip${i}`, material));
    profiler.material('bloom.composite', bloom.compositeMaterial);
    profiler.material('bloom.blend', bloom.blendMaterial);
    const audit = new HighlightAudit();
    const renderScene = render.render.bind(render), renderBloom = bloom.render.bind(bloom), renderDepth = depth.render.bind(depth);
    render.render = (...args) => { renderScene(...args); audit.capture('scene', args[0], args[2]); };
    bloom.render = (...args) => { renderBloom(...args); audit.capture('bloomSeed', args[0], bloom.renderTargetBright); audit.capture('bloomHalo', args[0], bloom.renderTargetsHorizontal[0]); };
    depth.render = (...args) => { audit.capture('lensInput', args[0], args[2]); renderDepth(...args); audit.capture('depthOfField', args[0], args[1]); };
    const stages = [['scene', render], ['bloom', bloom], ['depthOfField', depth], ['dustAfterDoF', dust], ['gradingAndOutput', output]] as const;
    for (const [name, pass] of stages) { composer.addPass(pass); profiler.wrap(name, pass); }
    return { composer, render, bloom, depth, dust, output, profiler, stages, audit };
  }, [gl, scene, camera]);
  useEffect(() => {
    // Renderer drawing buffers truncate fractional CSS × DPR dimensions. Use
    // those same integral texels for color, depth, CoC and dust at every DPR.
    pipeline.composer.setPixelRatio(1);
    pipeline.composer.setSize(Math.floor(size.width * dpr), Math.floor(size.height * dpr));
  }, [pipeline, dpr, size]);
  useEffect(() => {
    // Observe the library owners' real dispose events. The shared fullscreen
    // triangle is Three's intentional cache, not a per-mount allocation.
    const { composer, bloom, depth, output } = pipeline;
    const hidden = bloom as unknown as { _basic: import('three').Material };
    [composer.renderTarget1, composer.renderTarget2, composer.copyPass.material,
      bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical,
      bloom.materialHighPassFilter, ...bloom.separableBlurMaterials, bloom.compositeMaterial, bloom.blendMaterial, hidden._basic, output.material,
    ].forEach(resource => observeManagedDisposal('StudioPost', resource));
    observeManagedDisposal('StudioPost.DoF', depth.material);
    observeManagedDisposal('StudioPost', pipeline.render.target);
    observeManagedDisposal('StudioPost', pipeline.render.material);
    return () => {
      composer.dispose(); bloom.dispose();
      // UnrealBloomPass does not release its high-pass material itself.
      bloom.materialHighPassFilter.dispose(); depth.dispose(); pipeline.render.dispose(); output.dispose(); pipeline.profiler.dispose();
    };
  }, [pipeline]);
  useEffect(() => { const previous = gl.info.autoReset; gl.info.autoReset = false; return () => { gl.info.autoReset = previous; }; }, [gl]);
  useEffect(() => {
    const previous = gl.toneMapping; gl.toneMapping = NoToneMapping;
    return () => { gl.toneMapping = previous; };
  }, [gl]);
  useEffect(() => { if (stage === null || stage === 7) pipeline.bloom.enabled = true; }, [stage, pipeline]);
  pipeline.depth.setQuality(tier);
  pipeline.bloom.strength = settings.bloomStrength; pipeline.bloom.threshold = settings.bloomThreshold;
  pipeline.depth.enabled = dof.depthOfField && tier!=='low' && Boolean(enabled.lens);
  const outputSettings = enabled.final ? settings : { ...settings, toneOperator: 'None', gradeEnabled: false, vignetteAmount: 0 };
  pipeline.output.configure(outputSettings);
  useEffect(() => {
    window.__film = () => ({
      passes: pipeline.stages.map(([name, pass]) => ({ name, enabled: pass.enabled })), rendererToneMapping: gl.toneMapping,
      operator: outputSettings.toneOperator, outputColorSpace: gl.outputColorSpace, toneMapStages: pipeline.output.operator === NoToneMapping ? 0 : pipeline.stages.filter(([, pass]) => pass.enabled && pass instanceof FilmOutputPass).length,
      outputDefines: { ...pipeline.output.material.defines }, reference: pipeline.output.reference, gradingActive: pipeline.output.uniforms.gradeEnabled.value, gpu: pipeline.profiler.report(),
      quality: {tier:useQuality.getState().tier,gatherSamples:pipeline.depth.material.uniforms.gatherCount.value,shadowType:gl.shadowMap.type},
      metrics: renderMetrics(gl, scene, [pipeline.composer.renderTarget1, pipeline.composer.renderTarget2, pipeline.bloom.renderTargetBright, ...pipeline.bloom.renderTargetsHorizontal, ...pipeline.bloom.renderTargetsVertical, pipeline.render.target]), startup: { ...startup.current },
    });
    window.__filmControl = {
      referenceOutput: value => pipeline.output.useReference(value),
      profile: (value, target) => { if (value) pipeline.profiler.start(target); else pipeline.profiler.enabled = false; },
      bloom: value => { pipeline.bloom.enabled = value; },
      silhouetteProbe: async () => (await import('./post/dofProbe')).probeSilhouette(gl, camera as PerspectiveCamera),
      measure: points => {
        // Actual LCD triangle centroids provide a positive emissive control.
        const lcd = scene.getObjectByName('streamdeck-lcd-keys') as import('three').Mesh;
        const p = lcd.geometry.getAttribute('position'), indices = lcd.geometry.index;
        const sources: FacePoint[] = [], v = new Vector3(), vertex = new Vector3();
        for (let i = 0; i < (indices?.count ?? p.count); i += 3) {
          v.set(0, 0, 0);
          for (let j = 0; j < 3; j++) v.add(vertex.fromBufferAttribute(p, indices ? indices.getX(i + j) : i + j));
          lcd.localToWorld(v.divideScalar(3)).project(camera);
          if (Math.abs(v.x) < 1 && Math.abs(v.y) < 1) sources.push({ key: 'source:streamdeck', x: (v.x + 1) / 2, y: (1 - v.y) / 2 });
        }
        return pipeline.audit.request([...points, ...sources]);
      },
    };
    return () => { delete window.__film; delete window.__filmControl; };
  }, [pipeline, gl, settings, stage]);
  // The final output pass applies the selected tone mapper and exposure once.
  useFrame('composer', (_, delta) => {
    const lens = useDepthOfField.getState();
    pipeline.dust.enabled = settings.dustEnabled && stageMix.final > 0;
    if (stage !== null || useStages.getState().transitioning) {
      const mix = stageMix.final;
      // A clean midpoint cut for the tone operator; all continuous film
      // controls, bloom and DoF fade in both directions around that cut.
      pipeline.output.configure({ ...settings, toneOperator: mix < 0.5 ? 'None' : settings.toneOperator,
        gradeEnabled: settings.gradeEnabled && mix > 0,
        contrast: 1 + (settings.contrast - 1) * mix, saturation: 1 + (settings.saturation - 1) * mix,
        vibrance: settings.vibrance * mix, temperature: settings.temperature * mix, tint: settings.tint * mix,
        lift: { x: settings.lift.x * mix, y: settings.lift.y * mix, z: settings.lift.z * mix },
        gamma: { x: 1 + (settings.gamma.x - 1) * mix, y: 1 + (settings.gamma.y - 1) * mix, z: 1 + (settings.gamma.z - 1) * mix },
        gain: { x: 1 + (settings.gain.x - 1) * mix, y: 1 + (settings.gain.y - 1) * mix, z: 1 + (settings.gain.z - 1) * mix },
        vignetteAmount: settings.vignetteAmount * mix,
      });
      pipeline.bloom.enabled = mix > 0;
      pipeline.bloom.strength = settings.bloomStrength * mix;
      pipeline.depth.enabled = lens.depthOfField && tier!=='low' && stageMix.lens > 0;
    }
    const distance = lens.autoFocus ? keyboardFocus.distance : lens.focusDistance;
    const uniform = pipeline.depth.material.uniforms.focus;
    if (uniform.value !== distance) uniform.value = distance;
    pipeline.depth.material.uniforms.focalRange.value = lens.autoFocalRange ? keyboardFocus.range : lens.focalRange;
    pipeline.depth.material.uniforms.bokehScale.value = stageMix.lens * lens.bokehScale * (1 - lens.bokehDistanceScale + lens.bokehDistanceScale * Math.min(1.3, Math.max(0.35, distance / 1.35)));
    gl.info.reset(); pipeline.profiler.beginFrame();
    // Diagnostic offscreen frame submits the same chain without presentation
    // to separate Metal scheduling/presentation from shader/resolve work.
    const present = pipeline.composer.renderToScreen;
    if (pipeline.profiler.offscreenFrame) pipeline.composer.renderToScreen = false;
    try { pipeline.profiler.renderFrame(() => pipeline.composer.render(delta)); }
    finally { pipeline.composer.renderToScreen = present; pipeline.profiler.endFrame(); }
    pipeline.audit.finish();
    pipeline.profiler.poll();
    if (!startup.current.firstSceneFrameMs) startup.current.firstSceneFrameMs = performance.now();
    if (!startup.current.introReadyMs && window.__kb?.ready) startup.current.introReadyMs = performance.now();
  }, 1);
  return null;
}
