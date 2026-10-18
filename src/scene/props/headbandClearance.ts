import { Raycaster, Vector3 } from 'three';
import type { Mesh, Scene } from 'three';

export interface HeadbandClearance {
  samples: number; canopyClearanceMm: number; frameClearanceMm: number; minimumClearanceMm: number; barBounds: number[][];
}
declare global { interface Window { __headphones?: () => HeadbandClearance } }

/** Capture-only audit of real geometry, cached by the mounted owner. Vertical
 * rays test bar vertices, edge midpoints and triangle centers against the knit.
 * Both entire rail meshes must lie outside the bar's extrusion slab; that
 * conservative gap certifies the volumes, not just a few nearby vertices. */
export function headbandClearance(scene: Scene): HeadbandClearance {
  scene.updateMatrixWorld(true);
  const bar = scene.getObjectByName('headphone-headrest') as Mesh;
  const canopy = scene.getObjectByName('headphone-canopy') as Mesh;
  const p = bar.geometry.getAttribute('position'), index = bar.geometry.index;
  const samples = new Map<string, Vector3>(), a = new Vector3(), b = new Vector3(), c = new Vector3();
  const add = (v: Vector3) => samples.set(v.toArray().map(x => Math.round(x * 1e7)).join(','), v.clone());
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i); b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1); c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
    add(a); add(b); add(c); add(a.clone().add(b).multiplyScalar(0.5)); add(b.clone().add(c).multiplyScalar(0.5)); add(c.clone().add(a).multiplyScalar(0.5)); add(a.clone().add(b).add(c).divideScalar(3));
  }
  const ray = new Raycaster(), down = new Vector3(0, -1, 0), point = new Vector3();
  let canopyClearanceMm = Infinity;
  for (const sample of samples.values()) {
    bar.localToWorld(point.copy(sample));
    ray.set(point.clone().addScaledVector(down, -0.3), down); ray.far = 0.6;
    const hit = ray.intersectObject(canopy, false)[0];
    if (!hit) throw new Error('Headrest sample must sit under the actual canopy');
    canopyClearanceMm = Math.min(canopyClearanceMm, (hit.point.y - point.y) * 1000);
  }
  bar.geometry.computeBoundingBox(); const bounds = bar.geometry.boundingBox!;
  let frameClearanceMm = Infinity;
  for (const side of ['front', 'back']) {
    const rail = scene.getObjectByName(`headphone-rail-${side}`) as Mesh, vertices = rail.geometry.getAttribute('position');
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < vertices.count; i++) {
      bar.worldToLocal(rail.localToWorld(point.fromBufferAttribute(vertices, i))); min = Math.min(min, point.z); max = Math.max(max, point.z);
    }
    frameClearanceMm = Math.min(frameClearanceMm, (side === 'front' ? min - bounds.max.z : bounds.min.z - max) * 1000);
  }
  return { samples: samples.size, canopyClearanceMm, frameClearanceMm, minimumClearanceMm: Math.min(canopyClearanceMm, frameClearanceMm), barBounds: [bounds.min.toArray(), bounds.max.toArray()] };
}
