import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { RepeatWrapping, SRGBColorSpace, Vector2 } from 'three';
import { useOwnedDisposal } from '../resources/ownership';

// A physical plaster wall 30 cm behind the desk's back edge. Clone sampler
// state per mount; useTexture's source maps remain intentional shared caches.
export function StudioWall() {
  const sources = useTexture(['diff', 'nor_gl', 'rough'].map(kind => `/textures/wall/plastered_wall_04_${kind}_1k.jpg`));
  const maps = useMemo(() => sources.map((source, i) => {
    const map = source.clone();
    map.wrapS = map.wrapT = RepeatWrapping;
    map.repeat.set(12 / 0.75, 6 / 0.75);
    if (i === 0) map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  }), [sources]);
  useOwnedDisposal('StudioWall', maps);
  return <mesh name="studio-wall" position={[0, 3, -0.86]} receiveShadow>
    <planeGeometry args={[12, 6]} />
    <meshStandardMaterial color="#909193" map={maps[0]} normalMap={maps[1]} normalScale={new Vector2(0.18, 0.18)} roughnessMap={maps[2]} roughness={0.95} envMapIntensity={0.12} />
  </mesh>;
}
