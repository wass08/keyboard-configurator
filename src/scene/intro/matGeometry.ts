import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { MAT_THICKNESS } from '../dimensions';

const WIDTH = 0.9, DEPTH = 0.4, RADIUS = 0.014, BEVEL = 0.0006;
const NX = 900, NZ = 8;

/** A solid rounded felt sheet, densely sampled along its rolling direction.
 * UVs belong to the undeformed sheet, so the weave travels with the felt. */
export function createRollingMat() {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const extent = (x: number, inset: number) => {
    const radius = RADIUS - inset;
    const corner = Math.max(0, Math.abs(x) - (WIDTH / 2 - RADIUS));
    return DEPTH / 2 - RADIUS + Math.sqrt(Math.max(0, radius * radius - corner * corner));
  };
  const vertex = (x: number, y: number, z: number, side = false) => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    uvs.push(x / 0.22, (side ? y : z) / 0.22);
    return index;
  };
  const quad = (a: number, b: number, c: number, d: number, reverse = false) => {
    indices.push(...(reverse ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
  };
  // Independent faces retain the same crisp felt edge normals as the bevelled
  // extrusion. Tiny bevels join the flat faces to the full-thickness edge.
  for (const top of [true, false]) {
    const start = positions.length / 3;
    for (let i = 0; i <= NX; i++) {
      const x = (i / NX - 0.5) * (WIDTH - 2 * BEVEL);
      for (let j = 0; j <= NZ; j++) vertex(x, top ? MAT_THICKNESS : 0, (j / NZ * 2 - 1) * extent(x, BEVEL));
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const a = start + i * (NZ + 1) + j;
      quad(a, a + 1, a + NZ + 1, a + NZ + 2, !top);
    }
  }
  // Clockwise perimeter, including samples across the two short end faces.
  const boundary = [
    ...Array.from({ length: NX }, (_, i) => [i / NX, -1]),
    ...Array.from({ length: NZ }, (_, j) => [1, j / NZ * 2 - 1]),
    ...Array.from({ length: NX }, (_, i) => [1 - i / NX, 1]),
    ...Array.from({ length: NZ }, (_, j) => [0, 1 - j / NZ * 2]),
  ];
  const rings = [
    ...Array.from({ length: 4 }, (_, i) => {
      const angle = i / 3 * Math.PI / 2;
      return { inset: BEVEL * (1 - Math.sin(angle)), y: MAT_THICKNESS - BEVEL + BEVEL * Math.cos(angle) };
    }),
    ...Array.from({ length: 4 }, (_, i) => {
      const angle = i / 3 * Math.PI / 2;
      return { inset: BEVEL * (1 - Math.cos(angle)), y: BEVEL - BEVEL * Math.sin(angle) };
    }),
  ];
  const start = positions.length / 3, count = boundary.length;
  for (const ring of rings) for (const [u, v] of boundary) {
    const x = (u - 0.5) * (WIDTH - ring.inset * 2);
    vertex(x, ring.y, v * extent(x, ring.inset), true);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < count; i++) {
    const a = start + k * count + i, b = start + k * count + (i + 1) % count;
    quad(a, a + count, b, b + count, true);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const rest = Float32Array.from(positions), restNormals = geometry.getAttribute('normal').array.slice();
  let progress = -1;
  const deform = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    if (next === progress) return;
    progress = next;
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
    const flat = WIDTH * progress;
    // Archimedean spiral expressed in arc length: each revolution reduces the
    // radius by one sheet thickness. The outside tangent stays on the desk.
    const pitch = MAT_THICKNESS / (2 * Math.PI);
    const outer = Math.sqrt(0.012 ** 2 + 2 * pitch * (WIDTH - flat));
    for (let i = 0; i < p.count; i++) {
      const j = i * 3, x = rest[j], y = rest[j + 1], z = rest[j + 2];
      const remaining = x + WIDTH / 2 - flat;
      if (remaining <= 0 || progress === 1) {
        p.setXYZ(i, x, y, z); n.setXYZ(i, restNormals[j], restNormals[j + 1], restNormals[j + 2]);
        continue;
      }
      const radius = Math.sqrt(Math.max(0.012 ** 2, outer * outer - 2 * pitch * remaining));
      // Stable near zero, unlike subtracting two nearly equal radii.
      const theta = 2 * remaining / (outer + radius);
      const sin = Math.sin(theta), cos = Math.cos(theta), h = y - MAT_THICKNESS / 2;
      p.setXYZ(i, -WIDTH / 2 + flat + radius * sin + pitch * (1 - cos) - h * sin,
        MAT_THICKNESS / 2 + outer - radius * cos - pitch * sin + h * cos, z);
      // Inverse transpose of the bend, including the different inner/outer
      // surface radii. No per-frame topology or normal recomputation needed.
      const nx = restNormals[j] / (1 - h / radius), ny = restNormals[j + 1], nz = restNormals[j + 2];
      const length = Math.hypot(nx, ny, nz);
      n.setXYZ(i, (nx * cos - ny * sin) / length, (nx * sin + ny * cos) / length, nz / length);
    }
    p.needsUpdate = true; n.needsUpdate = true;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  };
  const inspect = () => {
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
    let maxRestError = 0, minY = Infinity, maxY = -Infinity, normalError = 0;
    for (let i = 0; i < p.count; i++) {
      maxRestError = Math.max(maxRestError, Math.abs(p.getX(i) - rest[i * 3]), Math.abs(p.getY(i) - rest[i * 3 + 1]), Math.abs(p.getZ(i) - rest[i * 3 + 2]));
      minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i));
      normalError = Math.max(normalError, Math.abs(new Vector3().fromBufferAttribute(n, i).length() - 1));
    }
    return { progress, vertices: p.count, maxRestError, minY, maxY, normalError, thickness: MAT_THICKNESS };
  };
  return { geometry, deform, inspect };
}
