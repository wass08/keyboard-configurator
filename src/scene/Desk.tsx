import { createContext, useContext, useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { CanvasTexture, DataTexture, MeshPhysicalMaterial, MeshStandardMaterial, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType, Vector2, ShaderChunk } from 'three';
import type { LightingSettings } from './lightingControls';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESK_CENTER_Z, DESK_TOP } from './dimensions';
import { useOwnedDisposal } from '../resources/ownership';

export const DeskSettings = createContext<LightingSettings | null>(null);

function powderCoat() {
  const pixels = new Uint8Array(128 * 128 * 4);
  let seed = 83;
  for (let i = 0; i < pixels.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; pixels[i] = pixels[i + 1] = pixels[i + 2] = 205 + seed % 30; pixels[i + 3] = 255; }
  const roughness = new DataTexture(pixels, 128, 128, RGBAFormat, UnsignedByteType);
  roughness.wrapS = roughness.wrapT = RepeatWrapping; roughness.needsUpdate = true;
  return { roughness, metal: new MeshStandardMaterial({ color: '#303638', roughness: 0.88, roughnessMap: roughness, metalness: 0.18 }) };
}
function createDeskFinishes() {
  return {
    ...powderCoat(),
    rubber: new MeshStandardMaterial({ color: '#202525', roughness: 0.94 }),
    fastener: new MeshStandardMaterial({ color: '#50585a', metalness: 0.75, roughness: 0.48 }),
  };
}
const DeskFinishes = createContext<ReturnType<typeof createDeskFinishes> | null>(null);
function useDeskFinishes() {
  const finishes = useContext(DeskFinishes);
  if (!finishes) throw new Error('Desk parts must be mounted inside their finish owner');
  return finishes;
}
function Beam({ position, scale, material, radius = 0.003 }: { position: [number, number, number]; scale: [number, number, number]; material?: MeshStandardMaterial; radius?: number }) {
  const { metal } = useDeskFinishes();
  const [w, h, d] = scale;
  const geometry = useMemo(() => new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)), [w, h, d, radius]);
  useOwnedDisposal('Desk.Beam', [geometry]);
  return <mesh position={position} geometry={geometry} material={material ?? metal} castShadow receiveShadow />;
}
function Foot() {
  const { metal, fastener, rubber } = useDeskFinishes();
  const geometry = useMemo(() => {
    const geo = new RoundedBoxGeometry(0.076, 0.034, 0.56, 5, 0.008);
    const p = geo.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = Math.abs(p.getZ(i)) / 0.28;
      p.setX(i, p.getX(i) * (1 - 0.25 * t ** 2));
      p.setY(i, p.getY(i) - 0.010 * t ** 3);
    }
    // Weld before recomputing so the tapered ends keep the rounded-box smoothing.
    geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    const smooth = mergeVertices(geo, 0.000001); smooth.computeVertexNormals(); geo.dispose(); return smooth;
  }, []);
  useOwnedDisposal('Desk.Foot', [geometry]);
  return <>
    <mesh position={[0, 0.039, 0]} geometry={geometry} material={metal} castShadow receiveShadow />
    {[-0.222, 0.222].map(z => <group key={z} position={[0, 0, z]}>
      <mesh position={[0, 0.021, 0]} material={fastener} castShadow><cylinderGeometry args={[0.007, 0.007, 0.019, 20]} /></mesh>
      <mesh position={[0, 0.009, 0]} material={rubber} castShadow><cylinderGeometry args={[0.017, 0.019, 0.012, 32]} /></mesh>
    </group>)}
  </>;
}
function Handset() {
  const { rubber } = useDeskFinishes();
  const display = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#152022'; ctx.fillRect(0, 0, 256, 96); ctx.fillStyle = '#b9d0cd'; ctx.font = '48px monospace'; ctx.fillText('75.0', 18, 65);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    return texture;
  }, []);
  useOwnedDisposal('Desk.Handset', [display]);
  return <group position={[0.57, 0.709, 0.368]}>
    <Beam position={[0, 0.008, -0.019]} scale={[0.095, 0.021, 0.052]} />
    <Beam position={[0, 0, 0]} scale={[0.122, 0.022, 0.040]} radius={0.006} />
    <mesh position={[-0.032, 0, 0.0203]}><planeGeometry args={[0.033, 0.012]} /><meshStandardMaterial map={display} roughness={0.7} emissive="#6a8e83" emissiveIntensity={0.12} /></mesh>
    {[-0.003, 0.014, 0.033, 0.047].map((x, i) => <group key={x} position={[x, 0, 0.0206]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={rubber}><cylinderGeometry args={[0.0048, 0.0048, 0.001, 24]} /></mesh>
      <mesh position={[0, 0, 0.0007]}><boxGeometry args={[0.0027, 0.00045, 0.0002]} /><meshStandardMaterial color={i < 2 ? '#aeb8b5' : '#717a77'} /></mesh>
    </group>)}
  </group>;
}
export function Desk() {
  const settings = useContext(DeskSettings)!;
  const scene = useThree(state => state.scene);
  const finishes = useMemo(createDeskFinishes, []);
  const { fastener, rubber } = finishes;
  useOwnedDisposal('Desk.Finishes', Object.values(finishes));
  const maps = useTexture(['/textures/wood/oak_veneer_01_diff_2k.jpg', '/textures/wood/oak_veneer_01_nor_gl_2k.jpg', '/textures/wood/oak_veneer_01_rough_2k.jpg', '/textures/wood/oak_veneer_01_ao_2k.jpg']);
  const resources = useMemo(() => {
    maps.forEach((map, index) => { map.wrapS = map.wrapT = RepeatWrapping; map.anisotropy = 16; if (index === 0) map.colorSpace = SRGBColorSpace; });
    const geometry = new RoundedBoxGeometry(1.6, 0.028, 0.75, 5, 0.004);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
    const grainTile = 0.42;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const nx = Math.abs(normals.getX(i)), ny = Math.abs(normals.getY(i)), nz = Math.abs(normals.getZ(i));
      if (ny >= nx && ny >= nz) uv.setXY(i, z / grainTile + 0.5, x / grainTile + 0.5);
      else if (nz >= nx) uv.setXY(i, (y + 0.014) / grainTile + (z < 0 ? -0.375 : 0.375) / grainTile + 0.5, x / grainTile + 0.5);
      else uv.setXY(i, z / grainTile + 0.5, (x < 0 ? -0.8 : 0.8) / grainTile + y / grainTile + 0.5);
    }
    geometry.setAttribute('uv1', uv.clone());
    const grainMin = { value: settings.deskRoughnessMin }, grainScale = { value: settings.deskRoughnessScale };
    const material = new MeshPhysicalMaterial({ color: '#dedcd5', map: maps[0], normalMap: maps[1], roughnessMap: maps[2], aoMap: maps[3], aoMapIntensity: 0.4, roughness: 1, normalScale: new Vector2(settings.deskNormalStrength, settings.deskNormalStrength), clearcoatNormalMap: maps[1], clearcoatNormalScale: new Vector2(settings.deskCoatNormalStrength, settings.deskCoatNormalStrength), clearcoatRoughnessMap: maps[2], clearcoat: settings.deskClearcoat, clearcoatRoughness: settings.deskClearcoatRoughness, envMapIntensity: settings.deskEnvMapIntensity });
    const coatRoughnessInfluence = { value: settings.deskCoatRoughnessInfluence };
    material.userData.coatRoughnessInfluence = coatRoughnessInfluence;
    material.userData.grainMin = grainMin; material.userData.grainScale = grainScale;
    material.onBeforeCompile = shader => {
      shader.uniforms.uCoatRoughnessInfluence = coatRoughnessInfluence;
      shader.uniforms.uGrainMin = grainMin; shader.uniforms.uGrainScale = grainScale;
      // Slightly darker edge grain also makes the eased 28mm front face read
      // clearly in the low hero view, with a continuous roll across the bevel.
      shader.vertexShader = `varying float vOakFace;\n${shader.vertexShader}`.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvOakFace = abs(objectNormal.y);');
      shader.fragmentShader = `varying float vOakFace;\nuniform float uGrainMin;\nuniform float uGrainScale;\nuniform float uCoatRoughnessInfluence;\n${shader.fragmentShader}`;
      // Keep Three's standard normal-mapped coat, direct specular and IBL.
      // The roughness knob is the center of a grain-varying lacquer lobe;
      // zero map influence gives the uniform roughness for comparison/tuning.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>',
        ShaderChunk.lights_physical_fragment.replace(
          'material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;',
          'material.clearcoatRoughness = clamp(clearcoatRoughness + uCoatRoughnessInfluence * (texture2D(clearcoatRoughnessMap, vClearcoatRoughnessMapUv).g - 0.5), 0.0525, 1.0);'
        ));
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float oakLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(vec3(oakLuma), diffuseColor.rgb, 0.88);
        diffuseColor.rgb *= mix(0.80, 1.0, smoothstep(0.35, 0.85, vOakFace));
      `).replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          roughnessFactor = clamp(uGrainMin + uGrainScale * texture2D(roughnessMap, vRoughnessMapUv).g, 0.08, 1.0);
        #endif
      `);
      material.userData.standardCoatIBL = shader.fragmentShader.includes('#include <lights_fragment_maps>') && shader.fragmentShader.includes('#include <envmap_physical_pars_fragment>');
    };
    material.customProgramCacheKey = () => 'veneer-standard-ibl-grain-coat-v1';
    return { geometry, material, grainMin, grainScale, coatRoughnessInfluence };
  }, [maps]);
  // The maps come from useTexture's shared loader cache; this mount owns only
  // its wood geometry/material and its generated finishes/display textures.
  useOwnedDisposal('Desk.Wood', [resources.geometry, resources.material]);
  useEffect(() => {
    // Three uses scene.environmentIntensity for an implicit scene environment;
    // bind this shared map explicitly so the desk's own intensity works.
    if (resources.material.envMap !== scene.environment) { resources.material.envMap = scene.environment; resources.material.needsUpdate = true; }
    if ((resources.material.clearcoat > 0) !== (settings.deskClearcoat > 0)) resources.material.needsUpdate = true;
    resources.material.clearcoat = settings.deskClearcoat;
    resources.material.clearcoatRoughness = settings.deskClearcoatRoughness;
    resources.material.envMapIntensity = settings.deskEnvMapIntensity;
    resources.material.normalScale.setScalar(settings.deskNormalStrength);
    resources.material.clearcoatNormalScale.setScalar(settings.deskCoatNormalStrength);
    resources.coatRoughnessInfluence.value = settings.deskCoatRoughnessInfluence;
    resources.grainMin.value = settings.deskRoughnessMin;
    resources.grainScale.value = settings.deskRoughnessScale;
  }, [resources, scene, settings.deskClearcoat, settings.deskClearcoatRoughness, settings.deskEnvMapIntensity, settings.deskRoughnessMin, settings.deskRoughnessScale, settings.deskNormalStrength, settings.deskCoatNormalStrength, settings.deskCoatRoughnessInfluence]);
  return <DeskFinishes.Provider value={finishes}><group position={[0, 0, DESK_CENTER_Z]}>
    <mesh name="desk-wood" position={[0, DESK_TOP - 0.014, 0]} geometry={resources.geometry} material={resources.material} castShadow receiveShadow />
    {/* The central rail and side brackets mount directly to the desktop. */}
    <Beam position={[0, 0.694, -0.015]} scale={[1.27, 0.052, 0.068]} />
    <Beam position={[0, 0.709, -0.065]} scale={[1.30, 0.022, 0.032]} />
    {[-0.61, 0.61].map(x => <group key={x} position={[x, 0, 0]}>
      <Beam position={[0, 0.711, 0]} scale={[0.086, 0.022, 0.535]} radius={0.004} />
      {[-0.207, 0.207].map(z => <mesh key={z} position={[0, 0.722, z]} material={fastener}><cylinderGeometry args={[0.006, 0.006, 0.002, 20]} /></mesh>)}
      <Beam position={[0, 0.586, 0]} scale={[0.064, 0.248, 0.074]} radius={0.0045} />
      <Beam position={[0, 0.365, 0]} scale={[0.055, 0.244, 0.065]} radius={0.004} />
      <Beam position={[0, 0.165, 0]} scale={[0.046, 0.236, 0.056]} radius={0.0035} />
      <Beam position={[0, 0.466, 0]} scale={[0.0646, 0.007, 0.0746]} material={rubber} radius={0.002} />
      <Beam position={[0, 0.247, 0]} scale={[0.0556, 0.007, 0.0656]} material={rubber} radius={0.002} />
      <Foot />
    </group>)}
    {/* Motor/controller enclosure is bolted beneath the top, behind the rail. */}
    <Beam position={[0.25, 0.705, -0.103]} scale={[0.215, 0.034, 0.105]} radius={0.005} />
    <Handset />
  </group></DeskFinishes.Provider>;
}
