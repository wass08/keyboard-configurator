import { forwardRef, useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Group } from 'three';
import type { KeyboardMaterials } from './materials';
import { KNOB_POSITION } from './layout';
import { useOwnedDisposal } from '../resources/ownership';

export const Knob = forwardRef<Group, { materials: KeyboardMaterials }>(function Knob({ materials }, ref) {
  const flutes = useMemo(() => {
    const p: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 240; i++) {
      const angle = i / 240 * Math.PI * 2;
      const radius = 0.01035 + (i % 3 === 0 ? 0.00016 : 0);
      for (const y of [0.003, 0.012]) p.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      if (i < 240) { const n = i * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(p, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }, []);
  useOwnedDisposal('Knob', [flutes]);
  return <group ref={ref} position={KNOB_POSITION}>
    <mesh position={[0, 0.002, 0]} material={materials.ring} castShadow><cylinderGeometry args={[0.0113, 0.0109, 0.003, 80]} /></mesh>
    <mesh geometry={flutes} material={materials.ring} castShadow />
    <mesh position={[0, 0.012, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.ring} castShadow><torusGeometry args={[0.0098, 0.00105, 24, 80]} /></mesh>
    <mesh position={[0, 0.012, 0]} material={materials.knob} castShadow><cylinderGeometry args={[0.0092, 0.0095, 0.0014, 80]} /></mesh>
  </group>;
});
