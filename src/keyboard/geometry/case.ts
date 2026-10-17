import { ExtrudeGeometry, Path, Shape } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PITCH, TILT } from '../layout';
import { CASE_BOTTOM } from '../../scene/dimensions';

type Point = [number, number];
function roundedPolygon<T extends Path>(path: T, points: Point[], radius: number): T {
  points.forEach((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const dl = Math.hypot(previous[0] - point[0], previous[1] - point[1]);
    const dr = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const r = Math.min(radius, dl / 3, dr / 3);
    const entry: Point = [point[0] + (previous[0] - point[0]) * r / dl, point[1] + (previous[1] - point[1]) * r / dl];
    const exit: Point = [point[0] + (next[0] - point[0]) * r / dr, point[1] + (next[1] - point[1]) * r / dr];
    if (index === 0) path.moveTo(...entry); else path.lineTo(...entry);
    path.quadraticCurveTo(...point, ...exit);
  });
  path.closePath();
  return path;
}
const rectangle = (w: number, d: number): Point[] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
const wellPoints: Point[] = [
  [-0.5, -0.5], [16.75, -0.5], [16.75, 6.75], [13.2, 6.75], [13.2, 5.65], [12.07, 5.65], [12.07, 6.75], [-0.5, 6.75],
].map(([x, z]) => [(x - 8.125) * PITCH, (z - 3.125) * PITCH]);
// The well reaches just beyond the key edges, leaving a continuous raised bezel.
const innerPoints: Point[] = [
  [-0.18, -0.18], [16.43, -0.18], [16.43, 6.43], [13.07, 6.43], [13.07, 5.43], [12.18, 5.43], [12.18, 6.43], [-0.18, 6.43],
].map(([x, z]) => [(x - 8.125) * PITCH, (z - 3.125) * PITCH]);
export function frameGeometry() {
  const shape = roundedPolygon(new Shape(), rectangle(0.341, 0.150), 0.010);
  shape.holes.push(roundedPolygon(new Path(), [...innerPoints].reverse(), 0.0018));
  const geo = new ExtrudeGeometry(shape, { depth: 0.010, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 4, steps: 1, curveSegments: 10 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.001, 0);
  return geo;
}
export function bodyGeometry() {
  const geo = new RoundedBoxGeometry(0.344, 0.026, 0.153, 5, 0.004);
  const positions = geo.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const blend = (positions.getY(i) + 0.013) / 0.026;
    const bottom = CASE_BOTTOM + positions.getZ(i) * Math.tan(TILT);
    positions.setY(i, bottom * (1 - blend) - 0.0105 * blend);
  }
  // RoundedBoxGeometry is non-indexed: recomputing its normals directly would
  // turn each triangle into a flat facet after the wedge deformation.
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  const smooth = mergeVertices(geo, 0.000001);
  smooth.computeVertexNormals();
  geo.dispose();
  return smooth;
}
export function plateGeometry() {
  const shape = roundedPolygon(new Shape(), wellPoints, 0.003);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.0015, bevelEnabled: false, curveSegments: 5 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -0.003, 0);
  return geometry;
}
export function grooveGeometry() {
  const shape = roundedPolygon(new Shape(), rectangle(0.3425, 0.1515), 0.009);
  shape.holes.push(roundedPolygon(new Path(), rectangle(0.3385, 0.1475).reverse(), 0.008));
  const geometry = new ExtrudeGeometry(shape, { depth: 0.00065, bevelEnabled: false, curveSegments: 8 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -0.0099, 0);
  return geometry;
}
