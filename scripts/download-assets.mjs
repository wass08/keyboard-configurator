// Reproducible asset download; all assets from Poly Haven, CC0.
import { mkdir, writeFile } from 'node:fs/promises';
const wood = await fetch('https://api.polyhaven.com/files/oak_veneer_01').then(r => r.json());
const studio = await fetch('https://api.polyhaven.com/files/studio_small_09').then(r => r.json());
const wall = await fetch('https://api.polyhaven.com/files/plastered_wall_04').then(r => r.json());
const assets = [
  ['textures/wood/oak_veneer_01_diff_2k.jpg', wood.Diffuse['2k'].jpg.url],
  ['textures/wood/oak_veneer_01_nor_gl_2k.jpg', wood.nor_gl['2k'].jpg.url],
  ['textures/wood/oak_veneer_01_rough_2k.jpg', wood.Rough['2k'].jpg.url],
  ['textures/wood/oak_veneer_01_ao_2k.jpg', wood.AO['2k'].jpg.url],
  ...[['Diffuse', 'diff'], ['nor_gl', 'nor_gl'], ['Rough', 'rough']].map(([kind, suffix]) => [`textures/wall/plastered_wall_04_${suffix}_1k.jpg`, wall[kind]['1k'].jpg.url]),
  ['hdri/studio_small_09_1k.hdr', studio.hdri['1k'].hdr.url],
];
for (const [path, url] of assets) {
  await mkdir(`public/${path.substring(0, path.lastIndexOf('/'))}`, { recursive: true });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(`public/${path}`, buffer);
  console.log(`${path}: ${buffer.length} bytes`);
}
await writeFile('public/CREDITS.md', `# Asset credits\n\nAll downloaded assets are by Poly Haven and licensed CC0 1.0 (public domain).\nLicense: https://polyhaven.com/license · https://creativecommons.org/publicdomain/zero/1.0/\n\n## Oak Veneer 01 (2K)\n\nhttps://polyhaven.com/a/oak_veneer_01\n\nDiffuse (sRGB), OpenGL normal, roughness and ambient occlusion (linear).\n\n## Studio Small 09 (1K HDR)\n\nhttps://polyhaven.com/a/studio_small_09\n\nUsed for studio reflections and ambient illumination.\n\n## Plastered Wall 04 (1K)\n\nhttps://polyhaven.com/a/plastered_wall_04\n\nDiffuse, OpenGL normal and roughness. Tinted neutral charcoal for the studio wall.\n\n## Exact download URLs\n\n${assets.map(([path, url]) => `- \`${path}\`: ${url} — CC0 1.0`).join('\n')}\n\n## Evaluated during development, not shipped\n\nWood Table 001 (2K), https://polyhaven.com/a/wood_table_001, CC0 1.0. Replaced after visual inspection with the calmer oak veneer. Maps downloaded from:\n\n${['diff', 'nor_gl', 'rough', 'ao'].map(kind => `- https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/wood_table_001/wood_table_001_${kind}_2k.jpg — CC0 1.0`).join('\n')}\n\nKeyboard and desk geometry, glyph atlas and UI are generated locally. Reference photos in references/ were supplied by the project owner and are not redistributed as app assets.\n`);
