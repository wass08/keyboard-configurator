import { ExtrudeGeometry, Path, Shape, SphereGeometry } from 'three';
import type { BufferGeometry } from 'three';

export function roundedPath<T extends Path>(p: T, w: number, h: number, r: number): T {
  const x = -w / 2, y = -h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); p.closePath(); return p;
}
export function softRing(w: number, h: number, r: number, innerW: number, innerH: number, innerR: number, depth: number, bevel: number) {
  const s = roundedPath(new Shape(), w, h, r);
  s.holes.push(roundedPath(new Path(), innerW, innerH, innerR));
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 12, steps: 1 });
  g.translate(0, 0, -depth / 2); return g;
}
export function woodUV(g: BufferGeometry, tile = 0.42) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, p.getZ(i) / tile, p.getX(i) / tile);
    else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile);
    else uv.setXY(i, p.getY(i) / tile, p.getX(i) / tile);
  }
  return g;
}
// Smooth superellipsoid: softly domed aluminum shells, not rounded cubes.
export function earShell() {
  const g = new SphereGeometry(1, 64, 40), p = g.getAttribute('position'), n = g.getAttribute('normal');
  const radii = [0.0365, 0.046, 0.0145], power = 0.72, exponent = 2 / power;
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)].map((v, k) => Math.sign(v) * Math.abs(v) ** power * radii[k]);
    p.setXYZ(i, ...v as [number, number, number]);
    const grad = v.map((v, k) => Math.sign(v) * (Math.abs(v) / radii[k]) ** (exponent - 1) / radii[k]);
    const length = Math.hypot(...grad); n.setXYZ(i, grad[0] / length, grad[1] / length, grad[2] / length);
  }
  return g;
}
