import { Quaternion, Vector3 } from 'three';
import type { LightingSettings } from './lightingControls';
import type { PropPose } from '../state/layout';
import { supportHeight } from '../state/layout';
import { DESK_TOP } from './dimensions';

type PlacedSettings = LightingSettings & { screenQuaternion?: Quaternion };
export function screenOrientation(s: LightingSettings) {
  return (s as PlacedSettings).screenQuaternion ?? new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(s.rimAim.x - s.rimPosition.x, s.rimAim.y - s.rimPosition.y, s.rimAim.z - s.rimPosition.z).normalize());
}
export function monitorSettings(s: LightingSettings, pose: PropPose): PlacedSettings {
  // The saved lighting rig and Monitor's local geometry were calibrated at
  // z=-0.43. Keep that reference frame separate from the user's Layout default,
  // and apply the pose from the first mount, including its support height.
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), pose.rotationY * Math.PI / 180);
  const transform = (p: { x: number; y: number; z: number }) => {
    const v = new Vector3(p.x, p.y - DESK_TOP, p.z + 0.43).applyQuaternion(q).add(new Vector3(pose.x, supportHeight('monitor', pose), pose.z));
    return { x: v.x, y: v.y, z: v.z };
  };
  return { ...s, rimPosition: transform(s.rimPosition), rimAim: transform(s.rimAim), screenQuaternion: q.clone().multiply(screenOrientation(s)) };
}
export function wallReflectionPosition(s: LightingSettings) {
  // Keep the original default exactly; moved/yawed monitors project their rear
  // emitter onto the real wall rather than dragging a floating red rectangle.
  if (s.rimPosition.x === 0 && s.rimPosition.y === 1.025 && s.rimPosition.z === -0.43 && s.rimAim.x === 0 && s.rimAim.y === 0.99 && s.rimAim.z === 0) return new Vector3(0, 1.025, -0.854);
  const p = new Vector3(s.rimPosition.x, s.rimPosition.y, s.rimPosition.z);
  const dir = p.clone().sub(new Vector3(s.rimAim.x, s.rimAim.y, s.rimAim.z)).normalize();
  const t = (-0.854 - p.z) / Math.min(-0.05, dir.z);
  return p.addScaledVector(dir, Math.max(0, t));
}

export function wallBounceVisible(s: LightingSettings) {
  return s.rimPosition.z < s.rimAim.z - 0.05 ? 1 : 0;
}
