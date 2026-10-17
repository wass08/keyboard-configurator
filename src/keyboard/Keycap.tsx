import { forwardRef } from 'react';
import type { Group } from 'three';
import type { KeyDefinition, ColorGroup } from './layout';
import { keyPosition } from './layout';
import { getKeycapGeometry } from './geometry/keycap';
import { getLegendGeometry } from './legends';
import type { KeyboardMaterials } from './materials';

export const Keycap = forwardRef<Group, { definition: KeyDefinition; group: ColorGroup; materials: KeyboardMaterials }>(function Keycap({ definition, group, materials }, ref) {
  // Geometry and glyph atlas are application caches. Keyboard owns the tint
  // materials; neither may be disposed by an individual key's unmount.
  return <group ref={ref} position={keyPosition(definition)} dispose={null}>
    <mesh geometry={getKeycapGeometry(definition.w, definition.row)} material={materials.caps[group]} castShadow receiveShadow />
    {definition.labels.length > 0 && <mesh geometry={getLegendGeometry(definition)} material={materials.legends[group]} />}
  </group>;
});
