import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { DataTexture, LinearFilter, MeshStandardMaterial, Raycaster, RGBAFormat, Vector2, Vector3 } from 'three';
import type { Mesh } from 'three';
import { useOwnedDisposal } from '../resources/ownership';
import type { LightingSettings } from './lightingControls';
import { wallReflectionPosition } from './layoutTransforms';

declare global { interface Window {
  __wall?: () => { center: number[]; radius: number[]; feather: number; enabled: boolean; compiled: boolean;
    samples: (points: [number, number][], margin?: number) => { world: number[]; uv: number[]; visible: boolean; weight: number }[] };
} }

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
  const { scene, camera } = useThree();
  const maps = useMemo(paintMaps, []);
  const mask = useMemo(() => ({
    wallMaskCenter: { value: new Vector2() }, wallMaskRadius: { value: new Vector2() },
    wallMaskFeather: { value: 0.35 }, wallMaskEnabled: { value: true },
  }), []);
  const material = useMemo(() => {
    const paint = new MeshStandardMaterial({ ...maps, color: settings.wallColor, roughness: settings.wallRoughness, normalScale: new Vector2(settings.wallNormal, settings.wallNormal), envMapIntensity: 3.5 });
    paint.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, mask);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWallPosition;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallPosition = (modelMatrix * vec4(transformed, 1.0)).xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec2 vWallPosition;
          uniform vec2 wallMaskCenter, wallMaskRadius;
          uniform float wallMaskFeather;
          uniform bool wallMaskEnabled;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          // The approved mask makes this radiance exactly zero. Avoid all
          // paint maps, LTC lobes and PCSS work in that fully black region.
          if (wallMaskEnabled && length((vWallPosition-wallMaskCenter)/wallMaskRadius)>=1.0) {
            gl_FragColor=vec4(0.0,0.0,0.0,1.0); return;
          }`)
        .replace('#include <opaque_fragment>', `
          // Mask the complete linear radiance, including direct light, IBL,
          // paint specular and emission. The interior is an exact identity.
          if (wallMaskEnabled) {
            float ellipse = length((vWallPosition - wallMaskCenter) / wallMaskRadius);
            outgoingLight *= 1.0 - smoothstep(1.0 - wallMaskFeather, 1.0, ellipse);
          }
          #include <opaque_fragment>`);
      paint.userData.maskCompiled = true;
    };
    paint.customProgramCacheKey = () => 'wall-radiance-mask-v2';
    return paint;
  }, [maps, mask]);
  const center = wallReflectionPosition(settings);
  mask.wallMaskCenter.value.set(center.x, center.y);
  mask.wallMaskRadius.value.set(settings.wallMaskRadiusX, settings.wallMaskRadiusY);
  mask.wallMaskFeather.value = settings.wallMaskFeather;
  mask.wallMaskEnabled.value = settings.wallMaskEnabled;
  material.color.set(settings.wallColor); material.roughness = settings.wallRoughness;
  material.normalScale.setScalar(settings.wallNormal);
  useEffect(() => { material.envMap = scene.environment; material.needsUpdate = true; }, [material, scene]);
  useEffect(() => {
    window.__wall = () => ({ center: mask.wallMaskCenter.value.toArray(), radius: mask.wallMaskRadius.value.toArray(), feather: mask.wallMaskFeather.value, enabled: mask.wallMaskEnabled.value, compiled: Boolean(material.userData.maskCompiled),
      // Explicit evidence queries only; no allocations/raycasts in the frame loop.
      samples: (points, margin = 0) => {
        scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        const meshes: Mesh[] = [];
        scene.traverseVisible(object => { if ((object as Mesh).isMesh) meshes.push(object as Mesh); });
        const ray = new Raycaster(), p = new Vector3();
        return points.map(([x, y]) => {
          p.set(x, y, -0.86).project(camera);
          const uv = [(p.x + 1) / 2, (1 - p.y) / 2];
          // Keep optional evidence footprints clear of prop silhouettes; DoF
          // can otherwise spill their lit pixels over an exactly black wall.
          const offsets = margin ? [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]] : [[0, 0]];
          const visible = Math.abs(p.x) < 0.98 - margin && Math.abs(p.y) < 0.98 - margin && p.z > -1 && p.z < 1 && offsets.every(([dx, dy]) => {
            ray.setFromCamera(new Vector2(p.x + dx, p.y + dy), camera);
            return ray.intersectObjects(meshes, false)[0]?.object.name === 'studio-wall';
          });
          const d = Math.hypot((x - mask.wallMaskCenter.value.x) / mask.wallMaskRadius.value.x, (y - mask.wallMaskCenter.value.y) / mask.wallMaskRadius.value.y);
          const t = Math.max(0, Math.min(1, (d - (1 - mask.wallMaskFeather.value)) / mask.wallMaskFeather.value));
          return { world: [x, y, -0.86], uv, visible, weight: 1 - t * t * (3 - 2 * t) };
        });
      },
    });
    return () => { delete window.__wall; };
  }, [mask, material, scene, camera]);
  useOwnedDisposal('StudioWall', [...Object.values(maps), material]);
  return <mesh name="studio-wall" position={[0, 3, -0.86]} material={material} receiveShadow>
    <planeGeometry args={[12, 6]} />
  </mesh>;
}
