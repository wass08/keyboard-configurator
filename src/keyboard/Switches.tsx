import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, ExtrudeGeometry, InstancedMesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Path, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { KEY_LAYOUT, keyPosition } from './layout';
import { useOwnedDisposal } from '../resources/ownership';

function milkyHousing() {
  const s = 0.0133 / 2, r = 0.00065;
  const shape = new Shape();
  shape.moveTo(-s + r, -s); shape.lineTo(s - r, -s); shape.quadraticCurveTo(s, -s, s, -s + r);
  shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s); shape.lineTo(-s + r, s);
  shape.quadraticCurveTo(-s, s, -s, s - r); shape.lineTo(-s, -s + r); shape.quadraticCurveTo(-s, -s, -s + r, -s);
  const hole = new Path(); hole.moveTo(-0.0023, -0.0023); hole.lineTo(-0.0023, 0.0023); hole.lineTo(0.0023, 0.0023); hole.lineTo(0.0023, -0.0023); hole.closePath(); shape.holes.push(hole);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelSize: 0.00025, bevelThickness: 0.00025, bevelSegments: 2, curveSegments: 4 });
  geometry.rotateX(Math.PI / 2); geometry.translate(0, 0.0028, 0);
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const scale = 1 - 0.23 * (positions.getY(i) + 0.0012) / 0.004;
    positions.setX(i, positions.getX(i) * scale); positions.setZ(i, positions.getZ(i) * scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}
export function Switches() {
  const bottom = useRef<InstancedMesh>(null), housing = useRef<InstancedMesh>(null);
  const stemA = useRef<InstancedMesh>(null), stemB = useRef<InstancedMesh>(null), latches = useRef<InstancedMesh>(null);
  const resources = useMemo(() => ({
    bottom: new RoundedBoxGeometry(0.0141, 0.0021, 0.0141, 2, 0.0005),
    housing: milkyHousing(),
    crossA: new BoxGeometry(0.004, 0.0031, 0.00125),
    crossB: new BoxGeometry(0.00125, 0.0031, 0.004),
    latch: new RoundedBoxGeometry(0.0015, 0.002, 0.004, 2, 0.0002),
    base: new MeshStandardMaterial({ color: '#373d3d', roughness: 0.57 }),
    shell: new MeshPhysicalMaterial({ color: '#e8e8db', roughness: 0.36, transparent: true, opacity: 0.84, depthWrite: false, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    stem: new MeshStandardMaterial({ color: '#deb35b', roughness: 0.42 }),
  }), []);
  useOwnedDisposal('Switches', Object.values(resources));
  useLayoutEffect(() => {
    const dummy = new Object3D();
    KEY_LAYOUT.forEach((key, i) => {
      const [x, , z] = keyPosition(key);
      dummy.position.set(x, -0.0018, z); dummy.updateMatrix(); bottom.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0; dummy.updateMatrix(); housing.current!.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.0038; dummy.updateMatrix();
      stemA.current!.setMatrixAt(i, dummy.matrix); stemB.current!.setMatrixAt(i, dummy.matrix);
      for (let side = 0; side < 2; side++) {
        dummy.position.set(x + (side === 0 ? -1 : 1) * 0.0062, -0.0001, z); dummy.updateMatrix(); latches.current!.setMatrixAt(i * 2 + side, dummy.matrix);
      }
    });
    for (const ref of [bottom, housing, stemA, stemB, latches]) ref.current!.instanceMatrix.needsUpdate = true;
  }, []);
  return <>
    <instancedMesh ref={bottom} args={[resources.bottom, resources.base, KEY_LAYOUT.length]} castShadow receiveShadow />
    <instancedMesh ref={housing} args={[resources.housing, resources.shell, KEY_LAYOUT.length]} receiveShadow />
    <instancedMesh ref={latches} args={[resources.latch, resources.base, KEY_LAYOUT.length * 2]} castShadow />
    <instancedMesh ref={stemA} args={[resources.crossA, resources.stem, KEY_LAYOUT.length]} castShadow />
    <instancedMesh ref={stemB} args={[resources.crossB, resources.stem, KEY_LAYOUT.length]} castShadow />
    {KEY_LAYOUT.filter(k => k.w >= 2).map(key => {
      const [x, , z] = keyPosition(key);
      const offset = key.w * 0.01905 / 2 - 0.006;
      return <group key={key.id}>
        <mesh position={[x, -0.001, z + 0.004]}><boxGeometry args={[offset * 2, 0.001, 0.001]} /><meshStandardMaterial color="#a6abad" metalness={0.8} roughness={0.3} /></mesh>
        {[-offset, offset].map(dx => <mesh key={dx} position={[x + dx, 0, z]}><boxGeometry args={[0.004, 0.005, 0.006]} /><meshStandardMaterial color="#35393a" roughness={0.6} /></mesh>)}
      </group>;
    })}
  </>;
}
