import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { button, folder, useControls } from 'leva';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CameraValues, CameraView } from '../debug';
import { PerspectiveCamera } from 'three';

const HERO_TARGET: [number, number, number] = [0, 0.825, 0.005];
// Preserved until the user chooses new limits with the Camera panel.
const DEFAULT_MIN = 0.317, DEFAULT_MAX = 0.719;
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const reset = useRef<() => void>(() => {});
  const lastReadout = useRef(-1);
  const { camera, size } = useThree();
  const debug = new URLSearchParams(location.search).has('debug');
  const snapshot = (): CameraValues => {
    const orbit = controls.current!;
    return { minDistance: orbit.minDistance, maxDistance: orbit.maxDistance,
      distance: camera.position.distanceTo(orbit.target), polarDeg: orbit.getPolarAngle() * 180 / Math.PI,
      azimuthDeg: orbit.getAzimuthalAngle() * 180 / Math.PI,
      position: camera.position.toArray(), target: orbit.target.toArray() };
  };
  const [values, set] = useControls(() => ({
    Camera: folder({
      distance: { value: '0.000 m', editable: false, label: 'Distance' },
      polarDeg: { value: '0.000°', editable: false, label: 'Polar' },
      azimuthDeg: { value: '0.000°', editable: false, label: 'Azimuth' },
      minDistance: { value: DEFAULT_MIN, min: 0.10, max: 6, step: 0.001 },
      maxDistance: { value: DEFAULT_MAX, min: 0.10, max: 6, step: 0.001 },
      'Set min = current': button(() => set({ minDistance: snapshot().distance })),
      'Set max = current': button(() => set({ maxDistance: snapshot().distance })),
      'Copy camera values': button(() => { void navigator.clipboard.writeText(JSON.stringify(snapshot(), null, 2)); }),
      'Reset camera': button(() => reset.current()),
    }, { collapsed: false, order: -100 }),
  }));
  useEffect(() => {
    if (values.minDistance > values.maxDistance) set({ maxDistance: values.minDistance });
  }, [values.minDistance, values.maxDistance, set]);
  useFrame(({ clock }) => {
    // No React frame-loop updates in normal production viewing. Debug readouts
    // refresh at 10 Hz; their strings retain exactly three decimal places.
    if (!debug || !controls.current || clock.elapsedTime - lastReadout.current < 0.1) return;
    lastReadout.current = clock.elapsedTime;
    const current = snapshot();
    set({ distance: `${current.distance.toFixed(3)} m`, polarDeg: `${current.polarDeg.toFixed(3)}°`, azimuthDeg: `${current.azimuthDeg.toFixed(3)}°` });
  });
  useEffect(() => {
    const setView = (view: CameraView) => {
      // Flush orbit inertia before setting a deterministic view/reset pose.
      const orbit = controls.current;
      if (orbit) {
        const damping = orbit.enableDamping;
        orbit.enableDamping = false; orbit.update(); orbit.enableDamping = damping;
      }
      const aspect = size.width / size.height;
      const mobileScale = Math.max(1, (aspect < 0.75 ? 1.62 : 1.12) / aspect);
      // Evidence presets use explicit lens choices without changing orbit bounds.
      if (camera instanceof PerspectiveCamera) {
        camera.fov = view === 'props-wide' ? 64 : view === 'props-airpods' ? 35 : view === 'props-streamdeck' ? 23 : view === 'deskmat-closeup' ? 22 : view === 'desk-sheen' ? 48 : 32;
        camera.updateProjectionMatrix();
      }
      if (view === 'props-wide') { camera.position.set(-0.05, 1.24, 0.54); controls.current?.target.set(-0.025, 0.9, -0.12); }
      else if (view === 'props-streamdeck') { camera.position.set(0.41, 1.02, 0.12); controls.current?.target.set(0.298, 0.790, -0.173); }
      else if (view === 'props-airpods') { camera.position.set(-0.11, 1.10, 0.15); controls.current?.target.set(-0.315, 0.90, -0.326); }
      else if (view === 'deskmat-closeup') { camera.position.set(-0.17, 0.87, 0.25); controls.current?.target.set(-0.14, 0.758, 0.12); }
      else if (view === 'desk-sheen') { camera.position.set(0.85, 0.88, 0.25); controls.current?.target.set(0.48, 0.751, -0.08); }
      else if (view === 'desk') { camera.position.set(-1.32, 1.23, 1.75); controls.current?.target.set(0, 0.39, -0.185); }
      else if (view === 'lighting-wide') { camera.position.set(2.7, 1.85, 2.8); controls.current?.target.set(0, 0.99, -0.18); }
      else if (view === 'lighting-closeup') { camera.position.set(0.19, 0.99, 0.26); controls.current?.target.set(0.076, 0.797, -0.025); }
      else if (view === 'desk-frame') { camera.position.set(-1.15, 0.70, 1.75); controls.current?.target.set(0, 0.25, -0.185); }
      else if (view === 'closeup') { camera.position.set(-0.045, 1.002, 0.295); controls.current?.target.set(0.027, 0.795, -0.008); }
      else if (view === 'profile') { camera.position.set(-0.20, 0.89, 0.40); controls.current?.target.set(0, 0.790, 0); }
      else {
        const targetX = aspect < 0.75 ? -0.065 : 0;
        camera.position.set(targetX - 0.065 * mobileScale, HERO_TARGET[1] + 0.26 * mobileScale, HERO_TARGET[2] + 0.68 * mobileScale);
        controls.current?.target.set(targetX, HERO_TARGET[1], HERO_TARGET[2]);
      }
      controls.current?.update();
    };
    // Restoring the original bounds makes reset return to the precise default
    // view even after a user has constrained it to another distance.
    reset.current = () => {
      set({ minDistance: DEFAULT_MIN, maxDistance: DEFAULT_MAX });
      if (controls.current) { controls.current.minDistance = DEFAULT_MIN; controls.current.maxDistance = DEFAULT_MAX; }
      setView('default');
    };
    setView('default');
    if (window.__kb) window.__kb.camera = setView;
    window.__camera = snapshot;
    return () => { delete window.__camera; };
  }, [camera, size, set]);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={values.minDistance} maxDistance={values.maxDistance} minPolarAngle={0.2} maxPolarAngle={1.38} minAzimuthAngle={-1.15} maxAzimuthAngle={1.15} target={HERO_TARGET} />;
}
