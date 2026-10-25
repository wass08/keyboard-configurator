import { useMemo, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { BufferGeometry, CatmullRomCurve3, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, Shape, SRGBColorSpace, TubeGeometry, Vector2, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { useOwnedDisposal } from '../../resources/ownership';
import { MovableProp } from '../PropLayout';
import { FELT_MAPS } from './DeskMat';
import { earShell, roundedPath, softRing, woodUV } from './geometry';
import { headbandClearance } from './headbandClearance';

const railPoints = (z: number) => Array.from({ length: 33 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 32; return new Vector3(0.082 * Math.sin(a), 0.19 + 0.092 * Math.cos(a), z); });
function canopyGeometry() {
  const p: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 64; i++) for (let j = 0; j <= 8; j++) {
    const a = -Math.PI / 2 + i * Math.PI / 64, v = j / 8;
    p.push(0.082 * Math.sin(a), 0.19 + 0.092 * Math.cos(a) - 0.006 * Math.sin(v * Math.PI), (v - 0.5) * 0.048);
    uv.push(i / 64 * 3, v);
    if (i < 64 && j < 8) { const k = i * 9 + j; indices.push(k, k + 9, k + 1, k + 1, k + 9, k + 10); }
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(p, 3)); g.setAttribute('uv', new Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
export function Headphones() {
  const scene = useThree(state => state.scene);
  const maps = useTexture(['/textures/wood/oak_veneer_01_diff_2k.webp', '/textures/wood/oak_veneer_01_nor_gl_2k.webp', ...FELT_MAPS.slice(1)]);
  const r = useMemo(() => {
    const clones = maps.map((map, i) => { const t = map.clone(); t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 16; if (i === 0) t.colorSpace = SRGBColorSpace; return t; });
    clones[2].repeat.set(3, 3); clones[3].repeat.set(3, 3);
    // Follow the real suspended canopy instead of a taller, unrelated Bezier
    // dome. Offset inward for the chamfer and a sub-millimeter knit allowance.
    const shape = new Shape(); shape.moveTo(-0.064, 0.234); shape.lineTo(0.064, 0.234);
    for (let i = 64; i >= 0; i--) {
      const x = -0.064 + i / 64 * 0.128, arc = Math.sqrt(1 - (x / 0.082) ** 2);
      const y = 0.003 + 0.19 + 0.092 * arc - 0.006;
      const slope = -0.092 * x / (0.082 ** 2 * arc), normalLength = Math.hypot(slope, 1), inset = 0.0017;
      shape.lineTo(x + inset * slope / normalLength, y - inset / normalLength);
    }
    shape.closePath();
    const headrest = new ExtrudeGeometry(shape, { depth: 0.034, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 4, steps: 1, curveSegments: 24 }); headrest.translate(0, 0, -0.017); woodUV(headrest);
    const trayLip = softRing(0.216, 0.116, 0.014, 0.201, 0.101, 0.011, 0.010, 0.0017); trayLip.rotateX(-Math.PI / 2); trayLip.translate(0, 0.010, 0); woodUV(trayLip);
    const tray = new ExtrudeGeometry(roundedPath(new Shape(), 0.2186, 0.1186, 0.014), { depth: 0.0076, bevelEnabled: true, bevelSize: 0.0007, bevelThickness: 0.0007, bevelSegments: 4, curveSegments: 16 });
    tray.rotateX(-Math.PI / 2); tray.translate(0, -0.0038, 0); woodUV(tray);
    return { clones, tray, trayLip, headrest,
      upright: new RoundedBoxGeometry(0.022, 0.247, 0.009, 4, 0.002),
      shell: earShell(), cushion: softRing(0.067, 0.087, 0.027, 0.037, 0.059, 0.018, 0.015, 0.004),
      cushionBack: new RoundedBoxGeometry(0.043, 0.065, 0.002, 4, 0.0009),
      rail: new TubeGeometry(new CatmullRomCurve3(railPoints(0)), 72, 0.0015, 10, false), canopy: canopyGeometry(),
      arm: new CylinderGeometry(0.0028, 0.0028, 0.028, 24),
      telescope: new CylinderGeometry(0.0018, 0.0018, 0.026, 24), crown: new CylinderGeometry(0.0053, 0.0053, 0.0037, 48),
      button: new RoundedBoxGeometry(0.010, 0.0021, 0.0033, 3, 0.0009),
      walnut: new MeshPhysicalMaterial({ color: '#8f6c55', map: clones[0], normalMap: clones[1], normalScale: new Vector2(0.08, 0.08), roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.3 }),
      metal: new MeshStandardMaterial({ color: '#292b2d', metalness: 0.26, roughness: 0.67 }),
      aluminum: new MeshPhysicalMaterial({ color: '#5d5f63', metalness: 0.9, roughness: 0.34, envMapIntensity: 7 }),
      steel: new MeshStandardMaterial({ color: '#d7dadc', metalness: 1, roughness: 0.16 }),
      rubber: new MeshStandardMaterial({ color: '#111418', roughness: 0.82 }),
      knit: new MeshPhysicalMaterial({ color: '#252729', roughness: 1, normalMap: clones[2], roughnessMap: clones[3], normalScale: new Vector2(0.45, 0.45), sheen: 0.8, sheenColor: '#8c9299', sheenRoughness: 0.9, specularIntensity: 0.1 }),
      net: new MeshPhysicalMaterial({ color: '#14171b', roughness: 1, normalMap: clones[2], roughnessMap: clones[3], normalScale: new Vector2(0.22, 0.22), side: 2, sheen: 0.65, sheenColor: '#72777d', sheenRoughness: 0.9, specularIntensity: 0.1 }),
    };
  }, [maps]);
  const { clones, ...owned } = r;
  useOwnedDisposal('Props.Headphones', [...Object.values(owned), ...clones]);
  useEffect(() => { r.aluminum.envMap = scene.environment; r.aluminum.needsUpdate = true; }, [r, scene]);
  useEffect(() => {
    let cached: ReturnType<typeof headbandClearance> | null = null;
    window.__headphones = () => cached ??= headbandClearance(scene);
    return () => { delete window.__headphones; };
  }, [r, scene]);
  return <MovableProp id="headphones"><group name="prop-headphones">
    <mesh geometry={r.tray} material={r.walnut} position={[0, 0.0045, 0]} castShadow receiveShadow />
    <mesh geometry={r.trayLip} material={r.walnut} castShadow receiveShadow />
    <mesh name="headphone-upright" geometry={r.upright} material={r.metal} position={[0, 0.13, -0.016]} castShadow receiveShadow />
    <mesh name="headphone-headrest" geometry={r.headrest} material={r.walnut} castShadow receiveShadow />
    <group position={[0, 0.003, 0]}>
      {[-0.024, 0.024].map(z => <mesh name={`headphone-rail-${z > 0 ? 'front' : 'back'}`} key={z} position={[0, 0, z]} geometry={r.rail} material={r.steel} castShadow receiveShadow />)}
      <mesh name="headphone-canopy" geometry={r.canopy} material={r.net} castShadow receiveShadow />
      {[-1, 1].map(side => <group key={side}>
        <mesh name={`headphone-stem-${side}`} geometry={r.arm} material={r.steel} position={[side * 0.082, 0.178, 0]} castShadow receiveShadow />
        <mesh geometry={r.telescope} material={r.steel} position={[side * 0.082, 0.152, 0]} castShadow receiveShadow />
        <group name={`headphone-cup-${side}`} position={[side * 0.082, 0.099, 0]} rotation={[0, side * Math.PI / 2, 0]}>
          <mesh name={`headphone-shell-${side}`} geometry={r.shell} material={r.aluminum} castShadow receiveShadow />
          <mesh geometry={r.cushion} material={r.knit} position={[0, 0, -0.020]} castShadow receiveShadow />
          <mesh geometry={r.cushionBack} material={r.knit} position={[0, 0, -0.0155]} castShadow receiveShadow />
          {side === 1 && <>
            <mesh geometry={r.crown} material={r.aluminum} position={[0.018, 0.046, 0.002]} castShadow receiveShadow />
            <mesh geometry={r.button} material={r.aluminum} position={[-0.015, 0.045, 0.003]} castShadow receiveShadow />
          </>}
          {[-0.012, 0, 0.012].map(x => <mesh key={x} position={[x, -0.044, 0.004]} material={r.rubber} castShadow receiveShadow><boxGeometry args={[0.005, 0.0008, 0.0014]} /></mesh>)}
        </group>
      </group>)}
    </group>
  </group></MovableProp>;
}
