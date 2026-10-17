import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CameraView } from '../debug';

const HERO_TARGET: [number, number, number] = [0, 0.825, 0.005];
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  useEffect(() => {
    const setView = (view: CameraView) => {
      // Keep the keyboard at 55–65% on desktop. Portrait widens enough to fit
      // the compact background lamp as well as the keyboard and monitor.
      const aspect = size.width / size.height;
      const mobileScale = Math.max(1, (aspect < 0.75 ? 1.62 : 1.12) / aspect);
      if (view === 'desk') { camera.position.set(-1.32, 1.23, 1.75); controls.current?.target.set(0, 0.39, -0.185); }
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
    setView('default');
    if (window.__kb) window.__kb.camera = setView;
  }, [camera, size]);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={0.25} maxDistance={4.8} minPolarAngle={0.2} maxPolarAngle={1.38} minAzimuthAngle={-1.15} maxAzimuthAngle={1.15} target={HERO_TARGET} />;
}
