// Re-encode the downloaded CC0 2K masters; no resize, UV, material or color
// changes. Requires libwebp's cwebp (brew install webp). CI ships the results.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat, unlink } from 'node:fs/promises';
const exec = promisify(execFile);
let before=0,after=0;
for(const folder of ['wood','felt'])for(const name of await readdir(`public/textures/${folder}`)) {
  if(!name.endsWith('.jpg'))continue;
  const source=`public/textures/${folder}/${name}`,target=source.replace(/\.jpg$/,'.webp');
  before+=(await stat(source)).size;
  await exec('cwebp',['-q','95','-m','6','-sharp_yuv',source,'-o',target]);
  after+=(await stat(target)).size;
  console.log(`${name}: ${(await stat(source)).size} → ${(await stat(target)).size} bytes`);
  await unlink(source);
}
if (before) console.log(`Textures: ${before} → ${after} bytes (${(100*(1-after/before)).toFixed(1)}% smaller)`);

// Derive mobile assets from the shipped 2K WebPs too: rerunning is safe and
// does not require downloading or deleting the existing desktop masters.
for (const folder of ['wood', 'felt']) for (const name of await readdir(`public/textures/${folder}`)) {
  if (!/_2k\.webp$/i.test(name)) continue;
  const source = `public/textures/${folder}/${name}`, target = source.replace(/_2k\.webp$/i, '_1k.webp');
  await exec('cwebp', ['-q', '90', '-m', '6', '-sharp_yuv', '-resize', '1024', '1024', source, '-o', target]);
  console.log(`${name} → ${target}`);
}
