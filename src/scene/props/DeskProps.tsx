import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Box3, Matrix4, Vector3, Quaternion } from 'three';
import { DeskMat } from './DeskMat';
import { StreamDeck } from './StreamDeck';
import { Headphones } from './Headphones';

export function DeskProps() {
  const { scene, camera } = useThree();
  useEffect(() => {
    window.__props = () => {
      scene.updateMatrixWorld(true);
      const mat = new Box3().setFromObject(scene.getObjectByName('desk-mat')!);
      const feet: number[] = [];
      scene.traverse(object => { if (object.name === 'keyboard-foot') feet.push(new Box3().setFromObject(object).min.y); });
      const body = scene.getObjectByName('keyboard-case-body') as import('three').Mesh;
      const vertices = body.geometry.getAttribute('position'); let bodyBottom = Infinity;
      for (let i = 0; i < vertices.count; i++) bodyBottom = Math.min(bodyBottom, body.localToWorld(new Vector3().fromBufferAttribute(vertices, i)).y);
      const props = Object.fromEntries(['desk-mat', 'prop-streamdeck', 'prop-headphones', 'monitor-screen', 'keyboard-case-body'].map(name => {
        const b = new Box3().setFromObject(scene.getObjectByName(name)!);
        const corners = [b.min.x, b.max.x].flatMap(x => [b.min.y, b.max.y].flatMap(y => [b.min.z, b.max.z].map(z => new Vector3(x, y, z).project(camera))));
        return [name, { min: b.min.toArray(), max: b.max.toArray(), inFrame: corners.every(c => Math.abs(c.x) < 1 && Math.abs(c.y) < 1 && c.z > -1 && c.z < 1) }];
      }));
      const wood = scene.getObjectByName('desk-wood') as import('three').Mesh;
      const finish = wood.material as import('three').MeshPhysicalMaterial;
      const sheenPoint = new Vector3(0.54, 0.75001, -0.045).project(camera);
      const bezels = scene.getObjectByName('streamdeck-bezels') as import('three').InstancedMesh;
      const caps = scene.getObjectByName('streamdeck-keycaps') as import('three').InstancedMesh;
      const lcd = scene.getObjectByName('streamdeck-lcd-keys') as import('three').Mesh;
      bezels.geometry.computeBoundingBox(); lcd.geometry.computeBoundingBox();
      caps.geometry.computeBoundingBox();
      const first = new Matrix4(); caps.getMatrixAt(0, first);
      const plate = scene.getObjectByName('streamdeck-faceplate') as import('three').Mesh;
      plate.geometry.computeBoundingBox();
      const faceplateFront = plate.position.z + plate.geometry.boundingBox!.max.z;
      const opening = ((bezels.geometry as import('three').ExtrudeGeometry).parameters.shapes as import('three').Shape).holes[0].getPoints();
      const openingWidth = Math.max(...opening.map(p => p.x)) - Math.min(...opening.map(p => p.x));
      const gapMm = (openingWidth - (caps.geometry.boundingBox!.max.x - caps.geometry.boundingBox!.min.x)) * 500;
      const recess = caps.geometry.boundingBox!.max.z + first.elements[14] - lcd.geometry.boundingBox!.max.z;
      const localBounds = (name: string) => { const mesh = scene.getObjectByName(name) as import('three').Mesh; mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrix); };
      const headrestOverlap = localBounds('headphone-headrest').intersect(localBounds('headphone-upright')).getSize(new Vector3()).multiplyScalar(1000).toArray();
      const cups = [-1, 1].map(side => {
        const cup = scene.getObjectByName(`headphone-cup-${side}`)!;
        const other = scene.getObjectByName(`headphone-cup-${-side}`)!;
        const position = cup.getWorldPosition(new Vector3()), q = cup.getWorldQuaternion(new Quaternion());
        const inward = new Vector3(0, 0, -1).applyQuaternion(q);
        const towardOther = other.getWorldPosition(new Vector3()).sub(position).normalize();
        const stem = scene.getObjectByName(`headphone-stem-${side}`) as import('three').Mesh;
        return { localPosition: cup.position.toArray(), up: new Vector3(0, 1, 0).applyQuaternion(q).toArray(), inwardDot: inward.dot(towardOther), stemGeometry: stem.geometry.type };
      });
      const canopy = (scene.getObjectByName('headphone-canopy') as import('three').Mesh).material as import('three').MeshPhysicalMaterial;
      const aluminum = (scene.getObjectByName('headphone-shell-1') as import('three').Mesh).material as import('three').MeshPhysicalMaterial;
      const headphones = { cups, aluminum: { color: aluminum.color.getHexString(), metalness: aluminum.metalness, roughness: aluminum.roughness }, canopy: { alphaTest: canopy.alphaTest, hasAlphaMap: Boolean(canopy.alphaMap), hasNormalMap: Boolean(canopy.normalMap), hasRoughnessMap: Boolean(canopy.roughnessMap), sheen: canopy.sheen } };
      const panel = scene.getObjectByName('monitor-screen')!;
      const screenSamples = [-0.22, -0.11, 0, 0.11, 0.22].flatMap(x => [-0.12, -0.06, 0, 0.06, 0.12].map(y => { const p = panel.localToWorld(new Vector3(x, y, 0)).project(camera); return [(p.x + 1) / 2, (1 - p.y) / 2]; }));
      return { headphones, screenSamples, matTop: mat.max.y, feetBottom: feet, bodyBottom, contactErrorMm: Math.max(...feet.map(y => Math.abs(y - mat.max.y))) * 1000, props, headrestOverlapMm: headrestOverlap, streamdeck: { keyCount: bezels.count, lcdRecessMm: recess * 1000, keyProtrusionMm: (caps.geometry.boundingBox!.max.z + first.elements[14] - faceplateFront) * 1000, openingGapMm: gapMm, emission: (lcd.material as import('three').MeshBasicMaterial).color.r, topRoughness: (caps.material as import('three').MeshPhysicalMaterial).roughness }, sheenSample: [(sheenPoint.x + 1) / 2, (1 - sheenPoint.y) / 2], wood: { type: finish.type, clearcoat: finish.clearcoat, clearcoatRoughness: finish.clearcoatRoughness, envMapIntensity: finish.envMapIntensity, explicitEnvironment: finish.envMap === scene.environment && Boolean(finish.envMap), roughnessMin: Number(finish.userData.grainMin.value), roughnessScale: Number(finish.userData.grainScale.value), normalStrength: finish.normalScale.x, coatNormalStrength: finish.clearcoatNormalScale.x, coatRoughnessInfluence: Number(finish.userData.coatRoughnessInfluence.value), sharedNormalMap: finish.normalMap !== null && finish.clearcoatNormalMap === finish.normalMap, sharedRoughnessMap: finish.roughnessMap !== null && finish.clearcoatRoughnessMap === finish.roughnessMap, standardCoatIBL: Boolean(finish.userData.standardCoatIBL) } };
    };
    return () => { delete window.__props; };
  }, [scene, camera]);
  return <><DeskMat /><StreamDeck /><Headphones /></>;
}
