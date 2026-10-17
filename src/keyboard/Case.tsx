import { useMemo } from 'react';
import { bodyGeometry, frameGeometry, grooveGeometry, plateGeometry } from './geometry/case';
import type { KeyboardMaterials } from './materials';
import { KNOB_POSITION } from './layout';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CASE_BOTTOM } from '../scene/dimensions';
import { useOwnedDisposal } from '../resources/ownership';

export function Case({ materials }: { materials: KeyboardMaterials }) {
  const geometries = useMemo(() => ({ body: bodyGeometry(), frame: frameGeometry(), groove: grooveGeometry(), plate: plateGeometry() }), []);
  const separators = useMemo(() => [
    { x: 0, z: -0.0381, geometry: new RoundedBoxGeometry(0.312, 0.004, 0.0032, 2, 0.0006) },
    ...[1.375, 6.0625, 10.6875].map((x, i) => ({ x: (x - 8.125) * 0.01905, z: -0.05, geometry: new RoundedBoxGeometry(i === 0 ? 0.012 : 0.0095, 0.004, 0.020, 2, 0.0006) })),
  ], []);
  useOwnedDisposal('Case', [...Object.values(geometries), ...separators.map(separator => separator.geometry)]);
  return <group>
    <mesh geometry={geometries.body} material={materials.body} castShadow receiveShadow />
    <mesh geometry={geometries.frame} material={materials.frame} castShadow receiveShadow />
    {separators.map((separator, i) => <mesh key={i} position={[separator.x, -0.001, separator.z]} geometry={separator.geometry} material={materials.frame} castShadow receiveShadow />)}
    <mesh geometry={geometries.groove}><meshStandardMaterial color="#45494a" roughness={0.65} /></mesh>
    <mesh geometry={geometries.plate} receiveShadow><meshStandardMaterial color="#41464a" roughness={0.65} metalness={0.25} /></mesh>
    <mesh position={[KNOB_POSITION[0], 0.0008, KNOB_POSITION[2]]}>
      <cylinderGeometry args={[0.0118, 0.0118, 0.0015, 64]} /><meshStandardMaterial color="#343638" roughness={0.65} />
    </mesh>
    <mesh position={[-0.1295, 0.0019, -0.05]}>
      <boxGeometry args={[0.0009, 0.0003, 0.012]} /><meshStandardMaterial color="#e8f5f3" emissive="#b3e0df" emissiveIntensity={0.4} />
    </mesh>
    {[-0.135, 0.135].flatMap(x => [-0.045, 0.045].map(z => <mesh key={`${x}${z}`} position={[x, CASE_BOTTOM + z * Math.tan(7 * Math.PI / 180), z]} rotation={[-7 * Math.PI / 180, 0, 0]}>
      <boxGeometry args={[0.022, 0.0014, 0.008]} /><meshStandardMaterial color="#262729" roughness={0.96} />
    </mesh>))}
  </group>;
}
