import { Quaternion, Vector3 } from 'three';
import type { Point } from './lightingControls';

// RectAreaLight emits down local -Z. Use the same plane orientation for its
// double-sided environment reflection card; don't rotate the rig with the HDRI.
export function areaOrientation(position: Point, aim: Point) {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(aim.x - position.x, aim.y - position.y, aim.z - position.z).normalize());
}
