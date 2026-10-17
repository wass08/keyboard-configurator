import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { ExtrudeGeometry, MeshPhysicalMaterial, RepeatWrapping, Shape, SRGBColorSpace, Vector2 } from 'three';
import { useOwnedDisposal } from '../../resources/ownership';
import { DESK_TOP, MAT_CENTER_Z, MAT_THICKNESS } from '../dimensions';
import { roundedPath } from './geometry';

export const FELT_MAPS = ['/textures/felt/Fabric034_Color_2K.jpg', '/textures/felt/Fabric034_NormalGL_2K.jpg', '/textures/felt/Fabric034_Roughness_2K.jpg'];
export function DeskMat() {
  const maps = useTexture(FELT_MAPS);
  const resources = useMemo(() => {
    const copies = maps.map((map, i) => { const copy = map.clone(); copy.wrapS = copy.wrapT = RepeatWrapping; copy.anisotropy = 16; if (i === 0) copy.colorSpace = SRGBColorSpace; return copy; });
    const g = new ExtrudeGeometry(roundedPath(new Shape(), 0.9 - 0.0012, 0.4 - 0.0012, 0.014), { depth: MAT_THICKNESS - 0.0012, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 3, curveSegments: 16, steps: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, 0.0006, 0);
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, p.getX(i) / 0.22, p.getZ(i) / 0.22);
      else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, p.getZ(i) / 0.22, p.getY(i) / 0.22);
      else uv.setXY(i, p.getX(i) / 0.22, p.getY(i) / 0.22);
    }
    const m = new MeshPhysicalMaterial({ color: '#888a8c', map: copies[0], normalMap: copies[1], roughnessMap: copies[2], normalScale: new Vector2(0.38, 0.38), roughness: 1, sheen: 0.7, sheenColor: '#8c8e91', sheenRoughness: 0.95, specularIntensity: 0.08 });
    return { g, m, copies };
  }, [maps]);
  useOwnedDisposal('Props.DeskMat', [resources.g, resources.m, ...resources.copies]);
  return <mesh name="desk-mat" position={[0, DESK_TOP, MAT_CENTER_Z]} geometry={resources.g} material={resources.m} castShadow receiveShadow />;
}
