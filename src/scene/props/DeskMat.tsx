import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { MeshPhysicalMaterial, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three';
import { useOwnedDisposal } from '../../resources/ownership';
import { DESK_TOP, MAT_CENTER_Z } from '../dimensions';
import { createRollingMat } from '../intro/matGeometry';

export const FELT_MAPS = ['/textures/felt/Fabric034_Color_2K.webp', '/textures/felt/Fabric034_NormalGL_2K.webp', '/textures/felt/Fabric034_Roughness_2K.webp'];
export function DeskMat() {
  const maps = useTexture(FELT_MAPS);
  const resources = useMemo(() => {
    const copies = maps.map((map, i) => { const copy = map.clone(); copy.wrapS = copy.wrapT = RepeatWrapping; copy.anisotropy = 16; if (i === 0) copy.colorSpace = SRGBColorSpace; return copy; });
    const rolling = createRollingMat(), g = rolling.geometry;
    rolling.deform(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0);
    const m = new MeshPhysicalMaterial({ color: '#888a8c', map: copies[0], normalMap: copies[1], roughnessMap: copies[2], normalScale: new Vector2(0.38, 0.38), roughness: 1, sheen: 0.7, sheenColor: '#8c8e91', sheenRoughness: 0.95, specularIntensity: 0.08 });
    return { g, m, copies, rolling };
  }, [maps]);
  useOwnedDisposal('Props.DeskMat', [resources.g, resources.m, ...resources.copies]);
  return <mesh name="desk-mat" position={[0, DESK_TOP, MAT_CENTER_Z]} geometry={resources.g} material={resources.m} userData={resources.rolling} castShadow receiveShadow />;
}
