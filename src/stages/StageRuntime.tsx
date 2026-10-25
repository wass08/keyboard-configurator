import { useProfiledFrame as useFrame } from '../scene/post/useProfiledFrame';
import { useContext, useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { Light, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three';
import { DESK_TOP, KEYBOARD_Y, MAT_THICKNESS } from '../scene/dimensions';
import { stageMix, features, fullStageAudio, useStages } from './store';
import { typing } from '../screen/typing';
import { DeskSettings } from '../scene/Desk';

export function StageRuntime() {
  const { scene, camera, gl } = useThree();
  const settings = useContext(DeskSettings)!;
  const revision = useStages(s => s.revision);
  let settledRevision = -1;
  const envMaterials = useMemo(() => new Map<MeshStandardMaterial, number>(), []);
  useEffect(() => {
    window.__stages = () => {
      scene.updateMatrixWorld(true);
      const lights: { name: string; type: string; intensity: number }[] = [];
      scene.traverseVisible(o => { const l = o as Light & { intensity?: number }; if (l.isLight && l.intensity && l.intensity > 1e-7) lights.push({ name: l.name, type: l.type, intensity: l.intensity }); });
      const visible = (name: string) => { let o = scene.getObjectByName(name); if (!o) return false; while (o) { if (!o.visible) return false; o = o.parent ?? undefined; } return true; };
      const n = useStages.getState();
      return { stage: n.stage, transitioning: n.transitioning, panelHidden: n.panelHidden, label: n.label, mix: Object.fromEntries([...Object.keys(features(null)), 'matRoll'].map(key => [key, stageMix[key as keyof typeof stageMix]])) as typeof stageMix, lights,
        props: { mat: visible('desk-mat'), streamdeck: visible('prop-streamdeck'), headphones: visible('prop-headphones'), screen: Boolean(scene.getObjectByName('monitor-typing')) },
        environment: { intensity: scene.environmentIntensity, materialIntensities: [...envMaterials.keys()].map(m => m.envMapIntensity) },
        lens: { fov: (camera as PerspectiveCamera).fov, focalLength: (camera as PerspectiveCamera).getFocalLength() },
        audio: { mode: fullStageAudio() ? 'full' : 'synth-keys-only', recordedKeys: fullStageAudio() && Boolean(window.__sfx?.().recordedKeys) },
        typing: { text: typing.text, transcript: [...typing.transcript] },
        keyboardY: scene.getObjectByName('keyboard-assembly')?.getWorldPosition(camera.position.clone()).y,
        woodTop: DESK_TOP, supportedHeight: KEYBOARD_Y - MAT_THICKNESS * (1 - stageMix.dressing), calls: gl.info.render.calls };
    };
    window.__stageControl = { select: n => useStages.getState().select(n) };
    return () => { delete window.__stages; delete window.__stageControl; };
  }, [scene, camera, gl, envMaterials]);
  useEffect(() => { gl.shadowMap.needsUpdate = true; }, [gl, revision]);
  const update = () => {
    const state = useStages.getState();
    if (!state.transitioning && settledRevision === state.revision) return;
    if (state.stage === null && state.revision === 0) { settledRevision = 0; return; }
    const support = scene.getObjectByName('keyboard-stage-support');
    if (support) support.position.y = -MAT_THICKNESS * (1 - stageMix.dressing);
    const mat = scene.getObjectByName('desk-mat');
    if (mat) {
      mat.visible = stageMix.dressing > 0;
      if (window.__kb?.introPhase === 'done') mat.userData.deform(stageMix.matRoll);
    }
    for (const [name, amount] of [['prop-streamdeck', stageMix.practicals], ['prop-headphones', stageMix.dressing]] as const) {
      const prop = scene.getObjectByName(name);
      if (prop) { prop.visible = amount > 0; prop.scale.setScalar(Math.max(0.0001, amount)); }
    }
    gl.shadowMap.needsUpdate = true; // Include the exact final pose in the cached shadow.
    // Explicit cap/desk maps must obey the same fade as implicit scene IBL.
    // Keep cached cube textures mounted; only one capture per stage revision.
    if (stageMix.practicals !== 1 || envMaterials.size) {
      scene.environmentIntensity = stageMix.practicals;
      scene.traverse(o => {
        const mesh = o as Mesh;
        for (const m of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : []) {
          const mat = m as MeshStandardMaterial;
          if (!mat.isMeshStandardMaterial || !mat.envMap) continue;
          if (!envMaterials.has(mat)) envMaterials.set(mat, mat.envMapIntensity);
          // Desk controls remain live while stages are active.
          const original = mesh.name === 'desk-wood' ? settings.deskEnvMapIntensity : envMaterials.get(mat)!;
          mat.envMapIntensity = original * stageMix.practicals;
        }
      });
      if (stageMix.practicals === 1 && !state.transitioning) envMaterials.clear();
    }
    if (!state.transitioning) settledRevision = state.revision;
  };
  useLayoutEffect(update, []);
  useFrame('recordingStages', update, 0.6);
  // Key the optical/lighting React readers on selection, never on tween frames.
  return null;
}

declare global { interface Window {
  __stages?: () => { stage: number | null; transitioning: boolean; panelHidden: boolean; label: boolean; mix: typeof stageMix; lights: { name: string; type: string; intensity: number }[]; props: { mat: boolean; streamdeck: boolean; headphones: boolean; screen: boolean }; environment: { intensity: number; materialIntensities: number[] }; lens: { fov: number; focalLength: number }; audio: { mode: string; recordedKeys: boolean }; typing: { text: string; transcript: string[] }; keyboardY: number | undefined; woodTop: number; supportedHeight: number; calls: number };
  __stageControl?: { select: (n: number | null) => void };
} }
