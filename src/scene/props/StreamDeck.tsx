import { MOBILE_PROFILE } from '../deviceProfile';
import { useLayoutEffect, useMemo, useRef, useContext, useEffect } from 'react';
import { CanvasTexture, Color, RectAreaLight, ExtrudeGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Path, Shape, ShapeGeometry, SRGBColorSpace } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useOwnedDisposal } from '../../resources/ownership';
import { MovableProp } from '../PropLayout';
import { DeskSettings } from '../Desk';
import { useTrackedLight } from '../../resources/ownership';
import { roundedPath, softRing } from './geometry';

const LOCATIONS = Array.from({ length: 15 }, (_, i) => [(i % 5 - 2) * 0.0217, (1 - Math.floor(i / 5)) * 0.0224]);
function icons() {
  const c = document.createElement('canvas'); c.width = 1280; c.height = 768;
  const ctx = c.getContext('2d')!;
  const colors = ['#df353c', '#df434c', '#2263bb', '#18b95b', '#695be0', '#823cce', '#943bdb', '#6541c4', '#121722', '#111a24', '#e6e9df', '#3b9fbe', '#609bd5', '#3bba63', '#8cca47'];
  for (let i = 0; i < 15; i++) {
    ctx.save(); ctx.translate(i % 5 * 256, Math.floor(i / 5) * 256);
    ctx.fillStyle = '#080b11'; ctx.fillRect(0, 0, 256, 256);
    const gradient = ctx.createLinearGradient(0, 0, 256, 256); gradient.addColorStop(0, colors[i]); gradient.addColorStop(1, '#151924');
    ctx.fillStyle = gradient; ctx.fillRect(7, 7, 242, 242);
    ctx.strokeStyle = i === 10 ? '#1d2836' : '#f4f7ff'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 13; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const symbol = i % 10;
    ctx.beginPath();
    if (symbol === 0) { ctx.moveTo(101, 78); ctx.lineTo(177, 128); ctx.lineTo(101, 178); ctx.closePath(); ctx.fill(); }
    else if (symbol === 1) { ctx.roundRect(63, 72, 132, 91, 15); ctx.moveTo(94, 163); ctx.lineTo(85, 190); ctx.lineTo(122, 163); ctx.stroke(); [101, 130, 159].forEach(x => { ctx.beginPath(); ctx.arc(x, 118, 5, 0, Math.PI * 2); ctx.fill(); }); }
    else if (symbol === 2) { ctx.roundRect(108, 62, 40, 89, 20); ctx.stroke(); ctx.beginPath(); ctx.arc(128, 128, 44, 0, Math.PI); ctx.moveTo(128, 174); ctx.lineTo(128, 198); ctx.moveTo(103, 198); ctx.lineTo(153, 198); ctx.stroke(); }
    else if (symbol === 3) { ctx.moveTo(114, 160); ctx.lineTo(114, 81); ctx.lineTo(177, 65); ctx.lineTo(177, 145); ctx.stroke(); [[96, 164], [159, 150]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x, y, 23, 15, -0.3, 0, Math.PI * 2); ctx.fill(); }); }
    else if (symbol === 4) { [60, 86, 112, 138, 164, 190].forEach((x, j) => { const h = [20, 44, 67, 52, 32, 15][j]; ctx.moveTo(x, 128 - h); ctx.lineTo(x, 128 + h); }); ctx.stroke(); }
    else if (symbol === 5) { ctx.moveTo(68, 96); ctx.lineTo(99, 123); ctx.lineTo(128, 72); ctx.lineTo(157, 123); ctx.lineTo(188, 96); ctx.lineTo(170, 173); ctx.lineTo(85, 173); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(86, 191); ctx.lineTo(171, 191); ctx.stroke(); }
    else if (symbol === 6) { ctx.roundRect(57, 97, 142, 65, 32); ctx.stroke(); ctx.beginPath(); ctx.arc(162, 129, 20, 0, Math.PI * 2); ctx.fill(); }
    else if (symbol === 7) { ctx.moveTo(70, 105); ctx.lineTo(96, 105); ctx.lineTo(132, 77); ctx.lineTo(132, 182); ctx.lineTo(96, 155); ctx.lineTo(70, 155); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(141, 129, 44, -0.9, 0.9); ctx.stroke(); }
    else if (symbol === 8) { ctx.arc(128, 136, 57, -1.15, Math.PI * 2 - 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(128, 62); ctx.lineTo(128, 122); ctx.stroke(); }
    else { ctx.roundRect(88, 83, 80, 99, 12); ctx.moveTo(108, 64); ctx.lineTo(148, 64); ctx.moveTo(107, 111); ctx.lineTo(107, 151); ctx.moveTo(148, 111); ctx.lineTo(148, 151); ctx.stroke(); }
    ctx.restore();
  }
  const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
  const average = new Color(0, 0, 0), sample = new Color(); let count = 0;
  for (let y = 8; y < c.height; y += 16) for (let x = 8; x < c.width; x += 16) {
    const i = (y * c.width + x) * 4;
    average.add(sample.setRGB(pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255, SRGBColorSpace)); count++;
  }
  average.multiplyScalar(1 / count); average.multiplyScalar(1 / Math.max(average.r, average.g, average.b));
  const t = new CanvasTexture(c); t.userData.spillColor = average; t.colorSpace = SRGBColorSpace; t.anisotropy = 8; return t;
}
export function StreamDeck() {
  const settings = useContext(DeskSettings)!;
  const bezels = useRef<InstancedMesh>(null);
  const caps = useRef<InstancedMesh>(null);
  const r = useMemo(() => {
    const atlas = icons();
    const displayParts = LOCATIONS.map(([x, y], i) => {
      const g = new ShapeGeometry(roundedPath(new Shape(), 0.0158, 0.0158, 0.0022), 12);
      const p = g.getAttribute('position'), uv = g.getAttribute('uv');
      for (let k = 0; k < p.count; k++) uv.setXY(k, (i % 5 + (p.getX(k) / 0.0158 + 0.5)) / 5, (2 - Math.floor(i / 5) + p.getY(k) / 0.0158 + 0.5) / 3);
      g.translate(x, y - 0.003, 0.0137); return g;
    });
    const faces = mergeGeometries(displayParts); displayParts.forEach(g => g.dispose());
    const shape = new Shape(); shape.moveTo(0.044, 0.003); shape.lineTo(-0.034, 0.003); shape.lineTo(0.034, 0.057); shape.closePath();
    const hole = new Path(); hole.moveTo(0.031, 0.012); hole.lineTo(0.027, 0.040); hole.lineTo(-0.012, 0.012); hole.closePath(); shape.holes.push(hole);
    const stand = new ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 3, curveSegments: 6 }); stand.rotateY(Math.PI / 2); stand.translate(-0.003, 0, 0);
    return { atlas, faces, stand,
      body: new RoundedBoxGeometry(0.118, 0.084, 0.021, 5, 0.006),
      bezel: softRing(0.0199, 0.0199, 0.003, 0.0170, 0.0170, 0.0026, 0.002, 0.00035),
      cap: new RoundedBoxGeometry(0.0164, 0.0164, 0.003, 4, 0.0012),
      capGlass: new MeshPhysicalMaterial({ color: '#eef4ff', roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0.10, depthWrite: false }),
      panel: new RoundedBoxGeometry(0.112, 0.078, 0.0016, 3, 0.0007),
      black: new MeshStandardMaterial({ color: '#282a2d', roughness: 0.65, metalness: 0.08 }),
      glass: new MeshPhysicalMaterial({ color: '#07090c', roughness: 0.2, clearcoat: 0.45 }),
      lcd: new MeshBasicMaterial({ map: atlas, color: new Color('#ffffff').multiplyScalar(settings.deckEmissive), toneMapped: false }),
    };
  }, []);
  useEffect(() => { r.lcd.color.setRGB(settings.deckEmissive, settings.deckEmissive, settings.deckEmissive); }, [r, settings.deckEmissive]);
  useOwnedDisposal('Props.StreamDeck', Object.values(r));
  useLayoutEffect(() => { LOCATIONS.forEach(([x, y], i) => { bezels.current!.setMatrixAt(i, new Matrix4().makeTranslation(x, y - 0.003, 0.0108)); caps.current!.setMatrixAt(i, new Matrix4().makeTranslation(x, y - 0.003, 0.0128)); }); bezels.current!.instanceMatrix.needsUpdate = true; caps.current!.instanceMatrix.needsUpdate = true; }, []);
  return <MovableProp id="streamdeck"><group name="prop-streamdeck">
    {[-0.049, 0.049].map(x => <mesh key={x} position={[x, 0, 0]} geometry={r.stand} material={r.black} castShadow receiveShadow />)}
    <mesh position={[0, 0.003, 0]} material={r.black} castShadow receiveShadow><boxGeometry args={[0.104, 0.006, 0.070]} /></mesh>
    <group position={[0, 0.037, 0]} rotation={[-0.93, 0, 0]}>
      <mesh geometry={r.body} material={r.black} castShadow receiveShadow />
      <mesh name="streamdeck-faceplate" geometry={r.panel} position={[0, 0, 0.0105]} material={r.black} castShadow receiveShadow />
      <instancedMesh name="streamdeck-bezels" ref={bezels} args={[r.bezel, r.glass, 15]} castShadow receiveShadow />
      <instancedMesh name="streamdeck-keycaps" ref={caps} args={[r.cap, r.capGlass, 15]} castShadow receiveShadow />
      {!MOBILE_PROFILE && <DeckSpill color={r.atlas.userData.spillColor} intensity={settings.deckSpill} />}
      <mesh name="streamdeck-lcd-keys" geometry={r.faces} material={r.lcd} castShadow receiveShadow />
    </group>
  </group></MovableProp>;
}

function DeckSpill({ intensity, color }: { intensity: number; color: Color }) {
  // A single small emitter models the combined LCD spill; no per-key lights.
  const light = useMemo(() => new RectAreaLight(color, 0, 0.10, 0.018), []);
  const solo = new URLSearchParams(location.search).get('solo');
  light.intensity = solo ? 0 : intensity;
  useTrackedLight('Props.StreamDeckLight', light);
  return <primitive name="streamdeck-spill" object={light} position={[0, 0.017, 0.026]} rotation={[-1.28, 0, 0]} />;
}
