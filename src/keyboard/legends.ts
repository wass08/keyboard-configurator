import { BufferGeometry, CanvasTexture, Float32BufferAttribute, LinearMipmapLinearFilter } from 'three';
import { KEY_LAYOUT, PITCH } from './layout';
import type { KeyDefinition } from './layout';
import { capHeight } from './geometry/keycap';

const SIZE = 2048, TILE_W = 256, TILE_H = 128;
let atlas: CanvasTexture | undefined;
const geometries = new Map<string, BufferGeometry>();
export function getLegendAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  KEY_LAYOUT.forEach((key, index) => {
    const x = index % 8 * TILE_W, y = Math.floor(index / 8) * TILE_H;
    const small = key.colorGroup !== 'alpha' || key.row === 0;
    const arrow = ['up', 'left', 'down', 'right'].includes(key.id);
    const font = key.labels.length === 2 ? 37 : arrow ? 55 : small ? 29 : 46;
    ctx.font = `500 ${font}px Arial, sans-serif`;
    key.labels.forEach((label, line) => ctx.fillText(label, x + 4, y + 7 + line * 44, TILE_W - 8));
  });
  atlas = new CanvasTexture(canvas);
  atlas.anisotropy = 16;
  atlas.minFilter = LinearMipmapLinearFilter;
  return atlas;
}
/** Each atlas tile maps at a fixed physical scale; wide caps never stretch their text. */
export function getLegendGeometry(key: KeyDefinition) {
  const cached = geometries.get(key.id);
  if (cached) return cached;
  const index = KEY_LAYOUT.indexOf(key);
  const col = index % 8, row = Math.floor(index / 8);
  const x0 = -key.w * PITCH / 2 + 0.0034;
  const z0 = -0.0055;
  const w = 0.024, d = 0.012;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  // Surface follows the top dish so legends never float above the cap.
  for (let z = 0; z <= 8; z++) {
    for (let x = 0; x <= 1; x++) {
      const pz = z0 + z / 8 * d;
      positions.push(x0 + x * w, capHeight(key.row, pz) + 0.00018, pz);
      uvs.push((col * TILE_W + x * TILE_W) / SIZE, 1 - (row * TILE_H + z / 8 * TILE_H) / SIZE);
    }
  }
  for (let z = 0; z < 8; z++) { const a = z * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometries.set(key.id, geometry);
  return geometry;
}
