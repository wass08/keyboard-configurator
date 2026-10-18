import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, LinearFilter, MeshStandardMaterial, RGBAFormat, Vector2 } from 'three';
import { useOwnedDisposal } from '../resources/ownership';
import type { LightingSettings } from './lightingControls';

// One non-repeating 12m paint field. Low-amplitude roller/orange-peel variation
// is surface relief, not a photograph of bricks or a visible tiled pattern.
function paintMaps() {
  const n = 512, normal = new Uint8Array(n * n * 4), rough = new Uint8Array(n * n * 4);
  const height = (x: number, y: number) => Math.sin(x * 0.109 + Math.sin(y * 0.061)) * 0.5 + Math.sin(y * 0.183 + Math.cos(x * 0.137)) * 0.3 + Math.sin(x * 0.731 + y * 0.599) * 0.12;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    normal[i] = 128 - (height(x + 1, y) - height(x - 1, y)) * 28;
    normal[i + 1] = 128 - (height(x, y + 1) - height(x, y - 1)) * 28;
    normal[i + 2] = 255; normal[i + 3] = 255;
    rough[i] = rough[i + 1] = rough[i + 2] = 246 + height(x, y) * 9; rough[i + 3] = 255;
  }
  const normalMap = new DataTexture(normal, n, n, RGBAFormat), roughnessMap = new DataTexture(rough, n, n, RGBAFormat);
  normalMap.magFilter = normalMap.minFilter = roughnessMap.magFilter = roughnessMap.minFilter = LinearFilter;
  normalMap.needsUpdate = roughnessMap.needsUpdate = true;
  return { normalMap, roughnessMap };
}
export function StudioWall({ settings }: { settings: LightingSettings }) {
  const scene = useThree(state => state.scene);
  const maps = useMemo(paintMaps, []);
  const material = useMemo(() => new MeshStandardMaterial({ ...maps, color: settings.wallColor, roughness: settings.wallRoughness, normalScale: new Vector2(settings.wallNormal, settings.wallNormal), envMapIntensity: 3.5 }), [maps]);
  material.color.set(settings.wallColor); material.roughness = settings.wallRoughness;
  material.normalScale.setScalar(settings.wallNormal);
  useEffect(() => { material.envMap = scene.environment; material.needsUpdate = true; }, [material, scene]);
  useOwnedDisposal('StudioWall', [...Object.values(maps), material]);
  return <mesh name="studio-wall" position={[0, 3, -0.86]} material={material} receiveShadow>
    <planeGeometry args={[12, 6]} />
  </mesh>;
}
