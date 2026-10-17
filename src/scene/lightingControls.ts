import { folder, useControls } from 'leva';

// Meters, candela (spot), and luminance (area lights). Emitters stay attached
// to their practical source when the development controls move them.
export function useLightingControls() {
  return useControls({
    'Desk lamp · key': folder({
      keyIntensity: { value: 0.3, min: 0, max: 12, step: 0.05, label: 'Intensity' },
      keyColor: { value: '#fff1e7', label: 'Color' },
      keyPosition: { value: { x: -0.195, y: 0.95, z: 0.04 }, step: 0.01, label: 'Head position' },
      keyAim: { value: { x: 0, y: 0.79, z: -0.02 }, step: 0.01, label: 'Aim' },
    }),
    'Monitor · rim': folder({
      rimIntensity: { value: 42, min: 0, max: 80, step: 0.1, label: 'Intensity' },
      rimColor: { value: '#e6efff', label: 'Color' },
      rimPosition: { value: { x: 0, y: 1.025, z: -0.43 }, step: 0.01, label: 'Screen center' },
      rimAim: { value: { x: 0, y: 0.99, z: 0 }, step: 0.01, label: 'Aim' },
    }, { collapsed: true }),
    'Pendant · fill': folder({
      fillIntensity: { value: 12, min: 0, max: 30, step: 0.1, label: 'Intensity' },
      fillColor: { value: '#f4f7ff', label: 'Color' },
      fillPosition: { value: { x: 0, y: 1.95, z: 0.15 }, step: 0.01, label: 'Position' },
      fillAim: { value: { x: 0, y: 0.75, z: 0.15 }, step: 0.01, label: 'Aim' },
    }, { collapsed: true }),
    Rendering: folder({
      environment: { value: 0.075, min: 0, max: 0.5, step: 0.005, label: 'Environment' },
      exposure: { value: 1.02, min: 0.2, max: 2, step: 0.01, label: 'Exposure' },
    }, { collapsed: true }),
  });
}
export type LightingSettings = ReturnType<typeof useLightingControls>;
export type Point = { x: number; y: number; z: number };
export const xyz = (p: Point): [number, number, number] => [p.x, p.y, p.z];
