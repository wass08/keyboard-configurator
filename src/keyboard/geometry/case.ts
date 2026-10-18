import { BufferAttribute, ExtrudeGeometry, Path, Shape, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PITCH, TILT } from '../layout';
import { CASE_BOTTOM } from '../../scene/dimensions';

type Point = [number, number];
const positionKey = (x: number, y: number, z: number) => `${Math.round(x * 1e8)},${Math.round(y * 1e8)},${Math.round(z * 1e8)}`;
/** Smooth only faces within 35 degrees at an identical position. Work in
 * meters: centimeter-quantized welding would merge these tiny bevel vertices. */
function smoothCurves(geometry: BufferGeometry, planarLids = false) {
  const p = geometry.getAttribute('position'), normals = new Float32Array(p.count * 3);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const faces: Vector3[] = [], buckets = new Map<string, Set<number>>();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    faces.push(c.sub(b).cross(a.sub(b)).normalize().clone());
    for (let j = i; j < i + 3; j++) {
      const key = positionKey(p.getX(j), p.getY(j), p.getZ(j));
      if (!buckets.has(key)) buckets.set(key, new Set()); buckets.get(key)!.add(i / 3);
    }
  }
  const crease = Math.cos(35 * Math.PI / 180), n = new Vector3();
  for (let i = 0; i < p.count; i++) {
    n.set(0, 0, 0); const face = faces[Math.floor(i / 3)];
    for (const f of buckets.get(positionKey(p.getX(i), p.getY(i), p.getZ(i)))!) if (face.dot(faces[f]) >= crease) n.add(faces[f]);
    // Flat lids must not inherit the bevel's normal or the number of earcut
    // triangles meeting at a corner. Pin their shared boundary too, so the
    // bevel meets the plane tangentially, without altering a single position.
    if (planarLids && Math.abs(p.getY(i) - max.y) < 1e-8) n.set(0, 1, 0);
    else if (planarLids && Math.abs(p.getY(i) - min.y) < 1e-8) n.set(0, -1, 0);
    n.normalize().toArray(normals, i * 3);
  }
  geometry.setAttribute('normal', new BufferAttribute(normals, 3)); return geometry;
}
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
  const geo = new ExtrudeGeometry(shape, { depth: 0.010, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 4, steps: 1, curveSegments: 48 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.001, 0);
  return smoothCurves(geo, true);
}
export function bodyGeometry() {
  const geo = new RoundedBoxGeometry(0.344, 0.026, 0.153, 16, 0.004);
  const positions = geo.getAttribute('position'), normals = geo.getAttribute('normal'), normal = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    const blend = (positions.getY(i) + 0.013) / 0.026;
    const bottom = CASE_BOTTOM + positions.getZ(i) * Math.tan(TILT);
    // Apply the inverse-transpose of the wedge deformation to the original
    // analytic rounded-box normal. No triangle-area bias or UV seams.
    const dy = (-0.0105 - bottom) / 0.026, dz = Math.tan(TILT) * (1 - blend);
    normal.fromBufferAttribute(normals, i); normal.y /= dy; normal.z -= dz * normal.y; normal.normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
    positions.setY(i, bottom * (1 - blend) - 0.0105 * blend);
  }
  const indexed = mergeVertices(geo, 1e-8); geo.dispose(); return indexed;
}
export function plateGeometry() {
  const shape = roundedPolygon(new Shape(), wellPoints, 0.003);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.0015, bevelEnabled: false, curveSegments: 32 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -0.003, 0);
  return smoothCurves(geometry);
}
export function grooveGeometry() {
  const shape = roundedPolygon(new Shape(), rectangle(0.3425, 0.1515), 0.009);
  shape.holes.push(roundedPolygon(new Path(), rectangle(0.3385, 0.1475).reverse(), 0.008));
  const geometry = new ExtrudeGeometry(shape, { depth: 0.00065, bevelEnabled: false, curveSegments: 48 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -0.0099, 0);
  return smoothCurves(geometry);
}

/** Audit actual curved side-wall triangles and duplicated shading normals.
 * Called only by evidence captures, never in a frame loop. */
export function caseNormalAudit(geometry: BufferGeometry) {
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  geometry.computeBoundingBox();
  const topY = geometry.boundingBox!.max.y, up = new Vector3(0, 1, 0);
  const edges = new Map<string, Vector3[]>(), positions = new Map<string, Vector3[]>();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  let sideFaces = 0, topFaceTriangles = 0, maxTopNormalAngle = 0;
  for (let i = 0; i < (geometry.index?.count ?? p.count); i += 3) {
    const vertices = [i, i + 1, i + 2].map(j => geometry.index ? geometry.index.getX(j) : j);
    a.fromBufferAttribute(p, vertices[0]); b.fromBufferAttribute(p, vertices[1]); c.fromBufferAttribute(p, vertices[2]);
    const face = c.clone().sub(b).cross(a.clone().sub(b)).normalize();
    if (face.y > 0.999999 && vertices.every(j => Math.abs(p.getY(j) - topY) < 1e-8)) {
      topFaceTriangles++;
      for (const j of vertices) maxTopNormalAngle = Math.max(maxTopNormalAngle, up.angleTo(new Vector3().fromBufferAttribute(n, j)) * 180 / Math.PI);
    }
    // Vertical curved walls, away from the top/bottom bevel and flat sides.
    if (Math.abs(face.y) > 0.12 || Math.abs(face.x) < 0.03 || Math.abs(face.z) < 0.03) continue;
    sideFaces++;
    const keys = vertices.map(j => positionKey(p.getX(j), p.getY(j), p.getZ(j)));
    for (let j = 0; j < 3; j++) {
      const edge = [keys[j], keys[(j + 1) % 3]].sort().join('|');
      if (!edges.has(edge)) edges.set(edge, []); edges.get(edge)!.push(face);
      if (!positions.has(keys[j])) positions.set(keys[j], []); positions.get(keys[j])!.push(new Vector3().fromBufferAttribute(n, vertices[j]));
    }
  }
  let maxFaceAngle = 0, maxNormalSeam = 0, adjacentPairs = 0;
  for (const faces of edges.values()) if (faces.length === 2) { maxFaceAngle = Math.max(maxFaceAngle, faces[0].angleTo(faces[1]) * 180 / Math.PI); adjacentPairs++; }
  for (const normals of positions.values()) for (const x of normals) for (const y of normals) maxNormalSeam = Math.max(maxNormalSeam, x.angleTo(y) * 180 / Math.PI);
  geometry.computeBoundingBox();
  return { sideFaces, adjacentPairs, maxFaceAngle, maxNormalSeam, topFaceTriangles, maxTopNormalAngle, min: geometry.boundingBox!.min.toArray(), max: geometry.boundingBox!.max.toArray() };
}
