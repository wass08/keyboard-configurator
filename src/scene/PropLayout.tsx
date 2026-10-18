import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { PivotControls } from '@react-three/drei';
import { button, folder, useControls } from 'leva';
import { Matrix4, Quaternion, Vector3, Euler } from 'three';
import type { ReactNode } from 'react';
import type { PropId } from '../state/layout';
import { DEFAULT_LAYOUT, layoutValues, PROP_IDS, supportHeight, useLayoutStore } from '../state/layout';

export function LayoutControls() {
  const [, set] = useControls(() => ({ Layout: folder({
    showGizmos: { value: false, label: 'Show gizmos', onChange: (v: boolean) => useLayoutStore.getState().setShowGizmos(v) },
    ...Object.fromEntries(PROP_IDS.map(id => [id, folder({
      [`${id}Position`]: { value: { x: DEFAULT_LAYOUT[id].x, z: DEFAULT_LAYOUT[id].z }, step: 0.0001, pad: 4, label: 'Position (m)', onChange: (p: { x: number; z: number }) => useLayoutStore.getState().setPose(id, p) },
      [`${id}Rotation`]: { value: DEFAULT_LAYOUT[id].rotationY, step: 0.1, pad: 1, label: 'Rotation Y (°)', onChange: (rotationY: number) => useLayoutStore.getState().setPose(id, { rotationY }) },
    }, { collapsed: false })])),
    'Copy layout values': button(() => { void navigator.clipboard.writeText(JSON.stringify(layoutValues(), null, 2)); }),
  }, { collapsed: true, order: -90 }) }));
  const controls = useThree(state => state.controls) as unknown as { enabled: boolean } | null;
  const { scene, camera } = useThree();
  useEffect(() => useLayoutStore.subscribe(state => {
    set(Object.fromEntries(PROP_IDS.flatMap<[string, unknown]>(id => [[`${id}Position`, { x: state.poses[id].x, z: state.poses[id].z }], [`${id}Rotation`, state.poses[id].rotationY]]).concat([['showGizmos', state.showGizmos]])));
  }), [set]);
  useEffect(() => {
    const pause = () => { if (controls) controls.enabled = !useLayoutStore.getState().dragging; };
    pause(); return useLayoutStore.subscribe(pause);
  }, [controls]);
  useEffect(() => {
    window.__layoutStore = { set: (id, patch) => useLayoutStore.getState().setPose(id, patch), show: value => useLayoutStore.getState().setShowGizmos(value) };
    window.__layout = () => {
      scene.updateMatrixWorld(true);
      const state = useLayoutStore.getState();
      const projected = Object.fromEntries(PROP_IDS.map(id => {
        const root = scene.getObjectByName(`gizmo-${id}`);
        const p = root ? root.getWorldPosition(new Vector3()).project(camera) : new Vector3();
        return [id, { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }];
      }));
      const handles = Object.fromEntries(PROP_IDS.map(id => {
        const root = scene.getObjectByName(`gizmo-${id}`), points: { x: number; y: number }[] = [];
        root?.traverse(object => {
          const mesh = object as import('three').Mesh;
          // The invisible cylinders are PivotControls' actual arrow hit areas.
          if (mesh.geometry?.type !== 'CylinderGeometry' || mesh.visible) return;
          const p = mesh.getWorldPosition(new Vector3()).project(camera);
          points.push({ x: (p.x + 1) / 2, y: (1 - p.y) / 2 });
        });
        return [id, points];
      }));
      return { handles, values: layoutValues(), dragging: state.dragging, orbitEnabled: controls?.enabled ?? true, visible: new URLSearchParams(location.search).has('debug') && state.showGizmos, projected };
    };
    return () => { delete window.__layout; delete window.__layoutStore; useLayoutStore.getState().setDragging(null); };
  }, [scene, camera, controls]);
  return null;
}

export function MovableProp({ id, children }: { id: PropId; children: ReactNode }) {
  const pose = useLayoutStore(state => state.poses[id]);
  const show = useLayoutStore(state => state.showGizmos);
  const y = supportHeight(id, pose), angle = pose.rotationY * Math.PI / 180;
  const height = id === 'monitor' ? 0.18 : id === 'headphones' ? 0.14 : 0.07;
  const matrix = useMemo(() => new Matrix4().compose(new Vector3(pose.x, y + height, pose.z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle), new Vector3(1, 1, 1)), [pose, y, height, angle]);
  const debug = new URLSearchParams(location.search).has('debug');
  useEffect(() => () => { if (useLayoutStore.getState().dragging === id) useLayoutStore.getState().setDragging(null); }, [id, show]);
  return <>
    <group name={`layout-${id}`} position={[pose.x, y, pose.z]} rotation={[0, angle, 0]}>{children}</group>
    {debug && show && <PivotControls ref={group => { if (group) group.name = `gizmo-${id}`; }} userData={{ prop: id }} matrix={matrix} autoTransform={false} fixed scale={65} lineWidth={2} depthTest={false} activeAxes={[true, false, true]} disableScaling
      onDragStart={() => useLayoutStore.getState().setDragging(id)}
      onDrag={m => { const p = new Vector3(), q = new Quaternion(), scale = new Vector3(); m.decompose(p, q, scale); useLayoutStore.getState().setPose(id, { x: p.x, z: p.z, rotationY: new Euler().setFromQuaternion(q, 'YXZ').y * 180 / Math.PI }); }}
      onDragEnd={() => useLayoutStore.getState().setDragging(null)} />}
  </>;
}
