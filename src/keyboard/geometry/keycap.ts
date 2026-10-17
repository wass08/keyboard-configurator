import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { PITCH } from '../layout';

const cache = new Map<string, BufferGeometry>();
export const ROW_HEIGHT = [0.0150, 0.0140, 0.0118, 0.0108, 0.0123, 0.0108];
const ROW_SLOPE = [-0.19, -0.17, -0.065, 0.065, 0.20, 0.20];
const DISH = 0.00095;
const TOP_HALF_DEPTH = (PITCH - 0.0051) / 2;
export function capHeight(row: number, z: number) {
  return ROW_HEIGHT[row] + ROW_SLOPE[row] * z + DISH * ((z / TOP_HALF_DEPTH) ** 2 - 1);
}
export function capSlope(row: number, z: number) {
  return ROW_SLOPE[row] + 2 * DISH * z / TOP_HALF_DEPTH ** 2;
}

/** A rectangular surface grid: no center fan, radial triangles or duplicated corners.
 * Top normals are the exact derivative of the cylindrical dish, including row tilt.
 * Six fillet strips roll that surface into the tapered shell. */
export function getKeycapGeometry(width: number, row: number) {
  const id = `${width}:${row}`;
  const cached = cache.get(id);
  if (cached) return cached;
  const w = width * PITCH - 0.0011;
  const topW = w - 0.0034, topD = TOP_HALF_DEPTH * 2;
  const radius = 0.00165;
  const nx = Math.max(20, Math.ceil(width * 12)), nz = 28;
  const positions: number[] = [], indices: number[] = [];
  const analyticNormals = new Map<number, [number, number, number]>();
  const normal = new Vector3();
  const topNormal = (z: number): [number, number, number] => {
    normal.set(0, 1, -capSlope(row, z)).normalize();
    return [normal.x, normal.y, normal.z];
  };
  for (let j = 0; j <= nz; j++) {
    // More samples around the rounded corners and top/front edges.
    const z = Math.sin((j / nz - 0.5) * Math.PI) * topD / 2;
    const cornerZ = Math.max(0, Math.abs(z) - (topD / 2 - radius));
    const limit = topW / 2 - radius + Math.sqrt(Math.max(0, radius ** 2 - cornerZ ** 2));
    for (let i = 0; i <= nx; i++) {
      const index = positions.length / 3;
      positions.push((i / nx * 2 - 1) * limit, capHeight(row, z), z);
      analyticNormals.set(index, topNormal(z));
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + nx + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // The grid's continuous perimeter, each corner included exactly once.
  const boundary: number[] = [];
  for (let i = nx; i > 0; i--) boundary.push(nz * (nx + 1) + i);
  for (let j = nz; j > 0; j--) boundary.push(j * (nx + 1));
  for (let i = 0; i < nx; i++) boundary.push(i);
  for (let j = 0; j < nz; j++) boundary.push(j * (nx + 1) + nx);
  const count = boundary.length;
  const outline = boundary.map(index => {
    const x = positions[index * 3], z = positions[index * 3 + 2];
    const cx = Math.max(-topW / 2 + radius, Math.min(topW / 2 - radius, x));
    const cz = Math.max(-topD / 2 + radius, Math.min(topD / 2 - radius, z));
    const length = Math.hypot(x - cx, z - cz);
    return { x, z, ox: (x - cx) / length, oz: (z - cz) / length };
  });
  let previous = boundary;
  function connect(next: number[]) {
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      indices.push(previous[i], previous[j], next[i], previous[j], next[j], next[i]);
    }
    previous = next;
  }
  const roll = 0.00095, angleMax = 1.40;
  for (let strip = 1; strip <= 6; strip++) {
    const angle = strip / 6 * angleMax;
    const next = outline.map(({ x, z, ox, oz }) => {
      const index = positions.length / 3;
      positions.push(x + ox * roll * (1 - Math.cos(angle)), capHeight(row, z) - roll * Math.sin(angle), z + oz * roll * (1 - Math.cos(angle)));
      normal.set(Math.sin(angle) * ox, Math.cos(angle), Math.sin(angle) * oz - Math.cos(angle) * capSlope(row, z)).normalize();
      analyticNormals.set(index, [normal.x, normal.y, normal.z]);
      return index;
    });
    connect(next);
  }
  for (const [y, scale] of [[0.003, 1], [0.0013, 1], [0.0007, 0.97]]) {
    connect(outline.map(({ x, z }) => {
      const index = positions.length / 3;
      positions.push(x * (w / topW) * scale, y, z * ((PITCH - 0.0011) / topD) * scale);
      return index;
    }));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  analyticNormals.forEach((n, index) => normals.setXYZ(index, ...n));
  cache.set(id, geometry);
  return geometry;
}
