import { useEffect, useLayoutEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { button, folder, useControls } from 'leva';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CameraValues, CameraView } from '../debug';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { DEFAULT_DOF, DEFAULT_FOCAL_LENGTH_MM, DEFAULT_PROJECTION, useDepthOfField } from './lens';
import type { LensValues } from './lens';
import { supportHeight, useLayoutStore } from '../state/layout';

import { HERO_POSITION, HERO_TARGET, DEFAULT_MIN_DISTANCE as DEFAULT_MIN, DEFAULT_MAX_DISTANCE as DEFAULT_MAX, PORTRAIT_MAX_DISTANCE, PORTRAIT_FOV, ORBIT_DISTANCE_EPSILON } from './cameraDefaults';
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const reset = useRef<() => void>(() => {});
  const lastReadout = useRef(-1);
  const projection = useRef({ ...DEFAULT_PROJECTION, verticalFovDeg: PORTRAIT_FOV });
  const projectionEdited = useRef(false);
  const apply = useRef<(patch: Partial<LensValues>) => void>(() => {});
  const focus = useRef<() => void>(() => {});
  const { camera: activeCamera, scene, size } = useThree();
  // Stage owns the default perspective camera throughout its lifetime.
  const camera = activeCamera as PerspectiveCamera;
  const portrait = size.width / size.height < 0.75;
  const defaultMax = portrait ? PORTRAIT_MAX_DISTANCE : DEFAULT_MAX;
  const debug = new URLSearchParams(location.search).has('debug');
  const lensSnapshot = (): LensValues => ({
    focalLengthMm: camera.getFocalLength(), verticalFovDeg: camera.fov,
    filmGaugeMm: camera.filmGauge, near: camera.near, far: camera.far,
    ...useDepthOfField.getState(),
  });
  const snapshot = (): CameraValues => {
    const orbit = controls.current!;
    return { minDistance: orbit.minDistance, maxDistance: orbit.maxDistance,
      distance: camera.position.distanceTo(orbit.target), polarDeg: orbit.getPolarAngle() * 180 / Math.PI,
      azimuthDeg: orbit.getAzimuthalAngle() * 180 / Math.PI,
      position: camera.position.toArray(), target: orbit.target.toArray(), lens: lensSnapshot() };
  };
  const opticalInput = (value: number | boolean, key: keyof LensValues, context: { fromPanel: boolean; initial: boolean }) => {
    // Programmatic synchronization must not feed back into the linked control.
    if (context.fromPanel && !context.initial) apply.current({ [key]: value });
  };
  const [values, set] = useControls(() => ({
    Camera: folder({
      distance: { value: '0.000 m', editable: false, label: 'Distance' },
      polarDeg: { value: '0.000°', editable: false, label: 'Polar' },
      azimuthDeg: { value: '0.000°', editable: false, label: 'Azimuth' },
      minDistance: { value: DEFAULT_MIN, min: 0.10, max: 6, step: 0.001 },
      maxDistance: { value: defaultMax, min: 0.10, max: 6, step: 0.001 },
      Lens: folder({
        focalLengthMm: { value: camera.getFocalLength(), min: 12, max: 200, step: 0.1, label: 'Focal length (mm)', transient: false, onChange: (v, _, c) => opticalInput(v, 'focalLengthMm', c) },
        verticalFovDeg: { value: camera.fov, min: 1, max: 120, step: 0.1, label: 'Vertical FOV (deg)', transient: false, onChange: (v, _, c) => opticalInput(v, 'verticalFovDeg', c) },
        filmGaugeMm: { value: 35, min: 1, max: 100, step: 0.1, label: 'Film gauge (mm)', transient: false, onChange: (v, _, c) => opticalInput(v, 'filmGaugeMm', c) },
        near: { value: 0.008, min: 0.001, max: 1, step: 0.001, pad: 3, label: 'Near (m)', transient: false, onChange: (v, _, c) => opticalInput(v, 'near', c) },
        far: { value: 25, min: 1, max: 100, step: 0.1, label: 'Far (m)', transient: false, onChange: (v, _, c) => opticalInput(v, 'far', c) },
        'Depth of field': folder({
          depthOfField: { value: false, label: 'Enabled', transient: false, onChange: (v, _, c) => opticalInput(v, 'depthOfField', c) },
          focusDistance: { value: DEFAULT_DOF.focusDistance, min: 0.01, max: 10, step: 0.001, pad: 3, label: 'Focus distance (m)', transient: false, onChange: (v, _, c) => opticalInput(v, 'focusDistance', c) },
          'Focus on keyboard': button(() => focus.current()),
          bokehScale: { value: DEFAULT_DOF.bokehScale, min: 0, max: 4, step: 0.05, label: 'Bokeh scale', transient: false, onChange: (v, _, c) => opticalInput(v, 'bokehScale', c) },
          focalRange: { value: DEFAULT_DOF.focalRange, min: 0, max: 2, step: 0.005, label: 'Focal range (m)', transient: false, onChange: (v, _, c) => opticalInput(v, 'focalRange', c) },
        }, { collapsed: false }),
      }, { collapsed: true }),
      'Set min = current': button(() => set({ minDistance: snapshot().distance })),
      'Set max = current': button(() => set({ maxDistance: snapshot().distance })),
      'Copy camera values': button(() => { void navigator.clipboard.writeText(JSON.stringify(snapshot(), null, 2)); }),
      'Reset camera': button(() => reset.current()),
    }, { collapsed: false, order: -100 }),
  }));
  const syncLens = () => set(lensSnapshot());
  apply.current = patch => {
    // Use Three's sensor/aspect-aware conversions in both directions. A sensor
    // edit retains the current focal length; a FOV edit recalculates that lens.
    const previousFocalLength = camera.getFocalLength();
    if (Number.isFinite(patch.filmGaugeMm)) camera.filmGauge = Math.max(1, Math.min(100, patch.filmGaugeMm!));
    if (Number.isFinite(patch.verticalFovDeg)) camera.fov = Math.max(1, Math.min(120, patch.verticalFovDeg!));
    else if (Number.isFinite(patch.focalLengthMm) || patch.filmGaugeMm !== undefined) {
      camera.setFocalLength(patch.focalLengthMm === undefined ? previousFocalLength : Math.max(12, Math.min(200, patch.focalLengthMm)));
    }
    if (Number.isFinite(patch.near)) camera.near = Math.max(0.001, patch.near!);
    if (Number.isFinite(patch.far)) camera.far = Math.max(camera.near + 0.001, patch.far!);
    camera.far = Math.max(camera.near + 0.001, camera.far);
    camera.updateProjectionMatrix();
    if (['verticalFovDeg', 'focalLengthMm', 'filmGaugeMm', 'near', 'far'].some(key => key in patch)) {
      projection.current = { verticalFovDeg: camera.fov, filmGaugeMm: camera.filmGauge, near: camera.near, far: camera.far };
      projectionEdited.current = true;
    }
    const dof = useDepthOfField.getState();
    useDepthOfField.setState({
      depthOfField: patch.depthOfField ?? dof.depthOfField,
      focusDistance: Number.isFinite(patch.focusDistance) ? Math.max(0.01, patch.focusDistance!) : dof.focusDistance,
      bokehScale: Number.isFinite(patch.bokehScale) ? Math.max(0, Math.min(4, patch.bokehScale!)) : dof.bokehScale,
      focalRange: Number.isFinite(patch.focalRange) ? Math.max(0, patch.focalRange!) : dof.focalRange,
    });
    syncLens();
  };
  focus.current = () => {
    const body = scene.getObjectByName('keyboard-case-body');
    const center = body ? new Box3().setFromObject(body).getCenter(new Vector3()) : new Vector3(...HERO_TARGET);
    apply.current({ focusDistance: camera.position.distanceTo(center) });
  };
  useLayoutEffect(() => {
    const orbit = controls.current!;
    const update = orbit.update;
    const previousPosition = new Vector3(), previousTarget = new Vector3();
    // Three's controls clamp strictly on every frame, even at rest. Permit
    // sub-micrometer copied-coordinate rounding while exposing the exact bound.
    orbit.update = () => {
      previousPosition.copy(camera.position); previousTarget.copy(orbit.target);
      const max = orbit.maxDistance, distance = camera.position.distanceTo(orbit.target);
      if (distance > max && distance <= max + ORBIT_DISTANCE_EPSILON) orbit.maxDistance = distance + 1e-12;
      try {
        const result = update();
        if (camera.position.distanceToSquared(previousPosition) < 1e-24 && orbit.target.equals(previousTarget)) {
          camera.position.copy(previousPosition); camera.lookAt(orbit.target);
        }
        return result;
      } finally { orbit.maxDistance = max; }
    };
    return () => { orbit.update = update; };
  }, [camera]);
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
      const portraitView = aspect < 0.75;
      if (view === 'default' && !projectionEdited.current) {
        camera.filmGauge = DEFAULT_PROJECTION.filmGaugeMm;
        camera.near = DEFAULT_PROJECTION.near; camera.far = DEFAULT_PROJECTION.far;
        if (portraitView) camera.fov = PORTRAIT_FOV;
        else camera.setFocalLength(DEFAULT_FOCAL_LENGTH_MM);
        projection.current = { ...DEFAULT_PROJECTION, verticalFovDeg: camera.fov };
      }
      // Sensor focal length follows the new aspect, retaining the user's chosen
      // vertical FOV. Portrait distance also uses that live FOV, within bounds.
      const fovScale = portraitView ? Math.tan(PORTRAIT_FOV * Math.PI / 360) / Math.tan(projection.current.verticalFovDeg * Math.PI / 360) : 1;
      const mobileScale = Math.max(1, (aspect < 0.75 ? 1.62 : 1.12) / aspect) * fovScale;
      // Evidence presets use explicit lens choices without changing orbit bounds.
      if (camera instanceof PerspectiveCamera) {
        camera.fov = view === 'case-corner' ? 10 : view === 'screen-terminal' ? 32 : view === 'wall-paint' ? 70 : view === 'props-wide' ? 64 : view === 'props-airpods' ? 35 : view === 'props-streamdeck' ? 23 : view === 'deskmat-closeup' ? 22 : view === 'desk-sheen' ? 48 : view === 'desk-sheen-closeup' ? 26 : view === 'default' ? projection.current.verticalFovDeg : 32;
        camera.updateProjectionMatrix();
        syncLens();
      }
      if (view === 'case-corner') { camera.position.set(0.34, 0.92, 0.39); controls.current?.target.set(0.155, 0.769, 0.062); }
      else if (view === 'screen-terminal') { camera.position.set(0.05, 1.14, 0.57); controls.current?.target.set(0, 1.025, -0.384); }
      else if (view === 'wall-paint') { camera.position.set(0.40, 1.20, 0.25); controls.current?.target.set(0, 1.15, -0.43); }
      else if (view === 'props-wide') { camera.position.set(-0.05, 1.24, 0.54); controls.current?.target.set(-0.025, 0.9, -0.12); }
      else if (view === 'props-streamdeck') {
        const pose = useLayoutStore.getState().poses.streamdeck, y = supportHeight('streamdeck', pose);
        camera.position.copy(new Vector3(0.146, 0.266, 0.278).applyAxisAngle(new Vector3(0, 1, 0), pose.rotationY * Math.PI / 180).add(new Vector3(pose.x, y, pose.z)));
        controls.current?.target.set(pose.x, y + 0.036, pose.z);
      }
      else if (view === 'props-airpods') {
        const pose = useLayoutStore.getState().poses.headphones, y = supportHeight('headphones', pose);
        camera.position.set(pose.x + 0.205, y + 0.35, pose.z + 0.476);
        controls.current?.target.set(pose.x, y + 0.15, pose.z);
      }
      else if (view === 'deskmat-closeup') { camera.position.set(-0.17, 0.87, 0.25); controls.current?.target.set(-0.14, 0.758, 0.12); }
      else if (view === 'desk-sheen') { camera.position.set(0.57, 0.85, 0.46); controls.current?.target.set(0.50, 0.751, -0.06); }
      else if (view === 'desk-sheen-closeup') { camera.position.set(0.58, 0.80, 0.28); controls.current?.target.set(0.54, 0.751, -0.04); }
      else if (view === 'desk') { camera.position.set(-1.32, 1.23, 1.75); controls.current?.target.set(0, 0.39, -0.185); }
      else if (view === 'lighting-wide') { camera.position.set(2.7, 1.85, 2.8); controls.current?.target.set(0, 0.99, -0.18); }
      else if (view === 'lighting-closeup') { camera.position.set(0.19, 0.99, 0.26); controls.current?.target.set(0.076, 0.797, -0.025); }
      else if (view === 'desk-frame') { camera.position.set(-1.15, 0.70, 1.75); controls.current?.target.set(0, 0.25, -0.185); }
      else if (view === 'closeup') { camera.position.set(-0.045, 1.002, 0.295); controls.current?.target.set(0.027, 0.795, -0.008); }
      else if (view === 'profile') { camera.position.set(-0.20, 0.89, 0.40); controls.current?.target.set(0, 0.790, 0); }
      else if (portraitView) {
        const targetX = -0.065;
        camera.position.set(targetX - 0.065 * mobileScale, HERO_TARGET[1] + 0.26 * mobileScale, HERO_TARGET[2] + 0.68 * mobileScale);
        controls.current?.target.set(targetX, HERO_TARGET[1], HERO_TARGET[2]);
      }
      else { camera.position.set(...HERO_POSITION); controls.current?.target.set(...HERO_TARGET); }
      controls.current?.update();
    };
    // Restoring the original bounds makes reset return to the precise default
    // view even after a user has constrained it to another distance.
    reset.current = () => {
      const max = portrait ? PORTRAIT_MAX_DISTANCE : DEFAULT_MAX;
      set({ minDistance: DEFAULT_MIN, maxDistance: max });
      useDepthOfField.setState(DEFAULT_DOF); projectionEdited.current = false;
      if (controls.current) { controls.current.minDistance = DEFAULT_MIN; controls.current.maxDistance = max; }
      setView('default');
    };
    setView('default');
    if (window.__kb) window.__kb.camera = setView;
    window.__camera = snapshot;
    window.__cameraStore = { set: patch => apply.current(patch), focusOnKeyboard: () => focus.current(), reset: () => reset.current() };
    return () => { delete window.__camera; delete window.__cameraStore; };
  }, [camera, size, set]);
  useEffect(() => () => { useDepthOfField.setState(DEFAULT_DOF); }, []);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={values.minDistance} maxDistance={values.maxDistance} minPolarAngle={0.2} maxPolarAngle={1.38} minAzimuthAngle={-1.15} maxAzimuthAngle={1.15} target={HERO_TARGET} />;
}
