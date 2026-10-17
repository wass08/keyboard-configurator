import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { Box3, Vector3 } from 'three';
import { KEY_LAYOUT, TILT } from './layout';
import { colorGroupFor, getVariant } from './variants';
import { createKeyboardMaterials } from './materials';
import { Case } from './Case';
import { Switches } from './Switches';
import { Keycap } from './Keycap';
import { Knob } from './Knob';
import { createAssembly } from './assembly';
import type { AssemblyHandle } from './assembly';
import { useConfigurator } from '../state/store';
import type { KeyboardHook } from '../debug';
import { DESK_FRONT_Z, DESK_TOP, KEYBOARD_Y } from '../scene/dimensions';
import { useOwnedDisposal } from '../resources/ownership';
import { capHeight } from './geometry/keycap';

export function Keyboard() {
  const caps = useRef<Group[]>([]);
  const knob = useRef<Group>(null);
  const root = useRef<Group>(null);
  const handle = useRef<AssemblyHandle | null>(null);
  const started = useRef(false);
  const generation = useRef(0);
  // One material set per mount; variant transitions mutate its colors.
  const materials = useMemo(() => createKeyboardMaterials(getVariant(useConfigurator.getState().selectedId)), []);
  useOwnedDisposal('Keyboard', [materials.body, materials.frame, materials.knob, materials.ring, ...Object.values(materials.caps), ...Object.values(materials.legends)]);
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const selectedId = useConfigurator(state => state.selectedId);
  const displayedId = useConfigurator(state => state.displayedId);
  const variant = getVariant(started.current ? displayedId : selectedId);

  useEffect(() => {
    // Keep plastic's reflection response independent of the lacquered desk.
    for (const material of Object.values(materials.caps)) { material.envMap = scene.environment; material.needsUpdate = true; }
  }, [materials, scene]);

  useEffect(() => {
    const hook: KeyboardHook = {
      ready: true,
      generation: 0,
      setVariant: useConfigurator.getState().setVariant,
      seek: seconds => { handle.current?.timeline.pause().time(seconds, false); },
      finish: () => { const timeline = handle.current?.timeline; if (timeline) timeline.pause().progress(1, false); },
      play: () => { handle.current?.timeline.play(); },
      camera: () => {},
      get finished() { const state = useConfigurator.getState(); return state.phase === 'assembled' && state.selectedId === state.displayedId; },
      get phase() { return useConfigurator.getState().phase; },
      get selectedId() { return useConfigurator.getState().selectedId; },
      get displayedId() { return useConfigurator.getState().displayedId; },
      get duration() { return handle.current?.timeline.duration() ?? 0; },
      inspect: () => {
        let meshes = 0; scene.traverse(object => { if ('isMesh' in object) meshes++; });
        const bounds = new Box3().setFromObject(root.current!);
        const corners = [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.y, bounds.max.y].flatMap(y => [bounds.min.z, bounds.max.z].map(z => new Vector3(x, y, z).project(camera))));
        const keyboardWidthRatio = (Math.max(...corners.map(c => c.x)) - Math.min(...corners.map(c => c.x))) / 2;
        return { capOffsets: caps.current.map(cap => cap.position.y), knobOffset: knob.current!.position.y, meshes, geometries: gl.info.memory.geometries, calls: gl.info.render.calls, triangles: gl.info.render.triangles,
          framing: { keyboardWidthRatio, deskFrontEdgeNdcY: new Vector3(0, DESK_TOP, DESK_FRONT_Z).project(camera).y, keyboardCenterFromEdge: DESK_FRONT_Z },
          palette: {
            body: materials.body.color.getHexString(), frame: materials.frame.color.getHexString(), knob: materials.knob.color.getHexString(), ring: materials.ring.color.getHexString(),
            alpha: materials.caps.alpha.color.getHexString(), mod: materials.caps.mod.color.getHexString(), accent: materials.caps.accent.color.getHexString(),
            alphaLegend: materials.legends.alpha.color.getHexString(), modLegend: materials.legends.mod.color.getHexString(), accentLegend: materials.legends.accent.color.getHexString(),
          },
          keys: Object.fromEntries(KEY_LAYOUT.map((key, i) => {
            const cap = caps.current[i].children[0] as Mesh;
            const legend = caps.current[i].children[1] as Mesh | undefined;
            const group = (['alpha', 'mod', 'accent'] as const).find(group => materials.caps[group] === cap.material)!;
            return [key.id, { group, cap: (cap.material as MeshStandardMaterial).color.getHexString(), legend: legend ? (legend.material as MeshStandardMaterial).color.getHexString() : null, labels: key.labels }];
          })),
          // Blank top-face locations, projected through the actual mesh and
          // active camera. The capture script samples pixels, not materials.
          colorSamples: ['H', 'caps', 'enter'].map(id => {
            const index = KEY_LAYOUT.findIndex(key => key.id === id), key = KEY_LAYOUT[index];
            const mesh = caps.current[index].children[0] as Mesh;
            const point = mesh.localToWorld(new Vector3(0.003, capHeight(key.row, 0.0025), 0.0025)).project(camera);
            return { key: id, group: colorGroupFor(key, getVariant(useConfigurator.getState().displayedId)), x: (point.x + 1) / 2, y: (1 - point.y) / 2 };
          }),
        };
      },
    };
    window.__kb = hook;
    return () => { delete window.__kb; };
  }, [gl, materials, scene, camera]);

  useEffect(() => {
    handle.current?.timeline.kill();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    handle.current = createAssembly(caps.current, knob.current!, materials, selectedId, !started.current, reduced);
    started.current = true;
    generation.current++;
    if (window.__kb) window.__kb.generation = generation.current;
    if (new URLSearchParams(location.search).has('capture')) handle.current.timeline.pause(0);
    return () => { handle.current?.timeline.kill(); };
  }, [selectedId, materials]);

  return <group ref={root} position={[0, KEYBOARD_Y, 0]} rotation={[TILT, 0, 0]}>
    <Case materials={materials} />
    <Switches />
    {KEY_LAYOUT.map((definition, i) => <Keycap key={definition.id} definition={definition} group={colorGroupFor(definition, variant)} materials={materials} ref={element => { if (element) caps.current[i] = element; }} />)}
    <Knob ref={knob} materials={materials} />
  </group>;
}
