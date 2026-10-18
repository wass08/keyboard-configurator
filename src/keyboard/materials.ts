import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { getLegendAtlas } from './legends';
import type { ColorGroup } from './layout';
import type { Variant } from './variants';

export function createKeyboardMaterials(variant: Variant) {
  const caps = {} as Record<ColorGroup, MeshPhysicalMaterial>;
  const legends = {} as Record<ColorGroup, MeshStandardMaterial>;
  for (const group of ['alpha', 'mod', 'accent'] as const) {
    // Satin plastic, with the palette stored exactly. Colored practical lights
    // may tint it naturally; do not compensate by boosting broad white lobes.
    caps[group] = new MeshPhysicalMaterial({ color: variant.groups[group].cap, roughness: 0.6, ior: 1.54, specularIntensity: 1, sheen: 0.12, sheenRoughness: 0.8, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 3.6 });
    legends[group] = new MeshStandardMaterial({ color: variant.groups[group].legend, map: getLegendAtlas(), transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  }
  const body = new MeshPhysicalMaterial({ color: variant.caseBody, roughness: 0.45, clearcoat: 0.18, clearcoatRoughness: 0.45 });
  const frame = body.clone(); frame.color.set(variant.caseFrame);
  const knob = body.clone(); knob.color.set(variant.knob); knob.roughness = 0.34;
  const ring = new MeshStandardMaterial({ color: variant.ring, metalness: 1, roughness: 0.12 });
  return { caps, legends, body, frame, knob, ring };
}
export type KeyboardMaterials = ReturnType<typeof createKeyboardMaterials>;

export function applyKeyboardPalette(materials: KeyboardMaterials, variant: Variant) {
  materials.body.color.set(variant.caseBody);
  materials.frame.color.set(variant.caseFrame);
  materials.knob.color.set(variant.knob);
  materials.ring.color.set(variant.ring);
  for (const group of ['alpha', 'mod', 'accent'] as const) {
    materials.caps[group].color.set(variant.groups[group].cap);
    materials.legends[group].color.set(variant.groups[group].legend);
  }
}
