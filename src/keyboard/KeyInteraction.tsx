import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Matrix4, Raycaster, Vector2, Vector3 } from 'three';
import type { Group, InstancedMesh, Object3D } from 'three';
import { KEY_LAYOUT } from './layout';
import { capHeight } from './geometry/keycap';
import type { AssemblyHandle } from './assembly';
import { CODE_TO_KEY, KEY_INDEX, STABILIZED, characterFor } from './keymap';
import { useConfigurator } from '../state/store';
import { sfx } from '../audio/sfx';
import { useSound } from '../audio/soundStore';
import { applyEditingKey, typeFromKeyboardEvent, typing } from '../screen/typing';

// Additive interaction layer. assembly.ts owns each keycap group's transform;
// this layer only offsets the group's children (cap + legend), the switch
// stems, and the knob's inner "knob-spin" group, so both compose freely.
export const HOVER_DEPTH = 0.0007;
export const PRESS_DEPTH = 0.0036; // cap skirt stops just above the plate
export const KNOB_DIP = 0.0005;
export const DETENT = Math.PI / 12; // 24 detents per turn
const DETENT_PX = 14, DRAG_THRESHOLD_PX = 4, MAX_OVERSHOOT = 0.00025, VOLUME_STEP = 0.04;
const SEATED = 0.0004;
const EDITING: Record<string, string> = { backspace: 'Backspace', delete: 'Delete', enter: 'Enter', tab: 'Tab', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', end: 'End' };
// Keys a focused button/radio uses itself (activation, roving focus).
const CONTROL_KEYS = new Set([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab', 'Escape']);

const isEditable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || Boolean(target.closest('#studio-controls')));
// The programmatically focused studio <main tabIndex={-1}> receives typing;
// it is not an activating control. Real buttons/radios still own their keys.
const isControl = (target: EventTarget | null) => target instanceof HTMLElement && target !== document.body && Boolean(target.closest('button, a[href], [role="radio"], [role="button"], [tabindex]:not(main)'));

/** Critically damped on the way down; a softer, slightly springy return. */
function step(y: number, v: number, target: number, dt: number, pressRelease: boolean) {
  const down = target > y;
  const omega = down ? 125 : pressRelease ? 72 : 58, zeta = down ? 1 : pressRelease ? 0.62 : 0.5;
  const substeps = Math.max(1, Math.ceil(dt / (1 / 480))), h = dt / substeps;
  for (let s = 0; s < substeps; s++) {
    v += (omega * omega * (target - y) - 2 * zeta * omega * v) * h;
    y += v * h;
    if (y < -MAX_OVERSHOOT) { y = -MAX_OVERSHOOT; v = Math.max(0, v); }
  }
  return [y, v];
}

export function KeyInteraction({ caps, knob, root, assembly }: { caps: RefObject<Group[]>; knob: RefObject<Group | null>; root: RefObject<Group | null>; assembly: RefObject<AssemblyHandle | null> }) {
  const gl = useThree(state => state.gl);
  const camera = useThree(state => state.camera);
  const frame = useRef<(dt: number) => void>(() => {});

  useEffect(() => {
    const n = KEY_LAYOUT.length;
    const depth = new Float64Array(n), velocity = new Float64Array(n), fromPress = new Uint8Array(n);
    const hover = new Uint8Array(n), pointerDown = new Uint8Array(n), physical = new Uint8Array(n);
    const stemRest = new Float64Array(n).fill(NaN), lastCapY = new Float64Array(n);
    const active = new Set<number>();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = gl.domElement, container = canvas.parentElement ?? canvas;
    const raycaster = new Raycaster(), ndc = new Vector2(), bounds = new Box3(), matrix = new Matrix4();
    let boundsReady = false, pointerInside = false, pointerDirty = false, pointerType = 'mouse';
    let hovered = -1, overKnob = false, cursor = '';
    let pointerKey = -1, pointerKeyId = -1;
    const physicalCodes = new Map<string, number>();
    let shiftLatch = false, capsLatch = false, tabPass = false;
    let lastPhase = useConfigurator.getState().phase, seenAssembled = lastPhase === 'assembled';
    let wave: null | { lifts: number; seats: number; liftPending: number; seatPending: number; lastLift: number; lastSeat: number; knobY: number } = null;
    const knobState = { detents: 0, angle: 0, angleVelocity: 0, dip: 0, dipVelocity: 0, pressed: false, ticks: 0, clicks: 0, residual: 0,
      drag: null as null | { x: number; id: number; moved: boolean; step: number } };

    const introActive = () => Boolean(assembly.current?.intro && assembly.current.intro.phase !== 'done');
    const assembled = () => !introActive() && useConfigurator.getState().phase === 'assembled';
    let wasReady = false;
    const spin = () => knob.current?.getObjectByName('knob-spin') ?? null;
    const stems = () => ['switch-stem-a', 'switch-stem-b'].map(name => root.current?.getObjectByName(name) as InstancedMesh | undefined).filter(Boolean) as InstancedMesh[];
    const pan = (i: number) => (KEY_LAYOUT[i].x + KEY_LAYOUT[i].w / 2 - 8.125) / 8.125 * 0.35;
    const activate = (i: number) => { active.add(i); };

    function apply(i: number) {
      const offset = -depth[i];
      for (const child of caps.current[i].children) child.position.y = offset;
      for (const stem of stems()) {
        stem.getMatrixAt(i, matrix);
        if (Number.isNaN(stemRest[i])) stemRest[i] = matrix.elements[13];
        matrix.elements[13] = stemRest[i] + offset;
        stem.setMatrixAt(i, matrix); stem.instanceMatrix.needsUpdate = true;
      }
    }

    function hitTest(): { key: number } | { knob: true } | null {
      const group = root.current;
      if (!group || !assembled()) return null;
      raycaster.setFromCamera(ndc, camera);
      if (!boundsReady) { group.updateWorldMatrix(true, true); bounds.setFromObject(group); boundsReady = true; }
      // Cheap bounding pre-check: most pointer moves are over the desk, not the board.
      if (!raycaster.ray.intersectsBox(bounds)) return null;
      const capMeshes = caps.current.map(cap => cap.children[0]);
      const knobGroup = spin();
      const targets: Object3D[] = knobGroup ? [...capMeshes, knobGroup] : capMeshes;
      const hit = raycaster.intersectObjects(targets, true)[0];
      if (!hit) return null;
      const index = capMeshes.indexOf(hit.object);
      if (index >= 0) return { key: index };
      let object: Object3D | null = hit.object;
      while (object && object !== knobGroup) object = object.parent;
      return object ? { knob: true } : null;
    }
    const toNdc = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const setCursor = (value: string) => { if (value !== cursor) { cursor = value; canvas.style.cursor = value; } };

    const voice = (i: number) => KEY_LAYOUT[i].id === 'space' ? 'Space' : STABILIZED.has(KEY_LAYOUT[i].id) ? 'Stab' : '';
    const pressSound = (i: number) => sfx.play(`keyDown${voice(i)}`, { pan: pan(i) });
    const releaseSound = (i: number) => sfx.play(`keyUp${voice(i)}`, { pan: pan(i) });
    const shiftHeld = () => physicalCodes.has('ShiftLeft') || physicalCodes.has('ShiftRight');

    function typeClicked(i: number) {
      const key = KEY_LAYOUT[i];
      if (key.id === 'shiftleft' || key.id === 'shiftright') { shiftLatch = !shiftLatch; return; }
      if (key.id === 'caps') { capsLatch = !capsLatch; return; }
      const character = characterFor(key, shiftLatch || shiftHeld(), capsLatch);
      if (character !== null) { typing.insert(character); shiftLatch = false; return; }
      if (EDITING[key.id]) { applyEditingKey(EDITING[key.id], shiftLatch || shiftHeld()); shiftLatch = false; }
    }

    // --- pointer ------------------------------------------------------------
    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || !event.isPrimary) return;
      toNdc(event);
      const hit = hitTest();
      if (!hit) return;
      // Capture phase on OrbitControls' own element: it never sees this press.
      event.stopPropagation(); event.preventDefault();
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
      if ('key' in hit) {
        pointerKey = hit.key; pointerKeyId = event.pointerId;
        pointerDown[hit.key] = 1; fromPress[hit.key] = 1; activate(hit.key);
        pressSound(hit.key); typeClicked(hit.key);
      } else {
        knobState.drag = { x: event.clientX, id: event.pointerId, moved: false, step: 0 };
        knobState.pressed = true;
        setCursor('grabbing');
      }
    }
    function dragKnob(event: PointerEvent) {
      const drag = knobState.drag!;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > DRAG_THRESHOLD_PX) { drag.moved = true; knobState.pressed = false; }
      if (!drag.moved) return;
      // Horizontal drag: right = clockwise = volume up, one detent per 14 px.
      const continuous = dx / DETENT_PX, nearest = Math.round(continuous);
      let k = 0;
      while (drag.step !== nearest) {
        const direction = nearest > drag.step ? 1 : -1;
        drag.step += direction; knobState.ticks++;
        sfx.play('knobTick', { delay: k++ * 0.012, pan: 0.33 });
        const sound = useSound.getState();
        sound.setMaster(sound.master + direction * VOLUME_STEP, true);
      }
      knobState.residual = continuous - nearest;
    }
    function endKnob() {
      const drag = knobState.drag!;
      if (!drag.moved) { knobState.clicks++; sfx.play('knobClick', { pan: 0.33 }); }
      else knobState.detents += drag.step;
      knobState.drag = null; knobState.pressed = false; knobState.residual = 0;
      pointerDirty = true;
    }
    function onPointerMove(event: PointerEvent) {
      if (!assembled() && knobState.drag) cancelInteractions();
      if (knobState.drag && event.pointerId === knobState.drag.id) { dragKnob(event); return; }
      pointerType = event.pointerType;
      const inside = event.target === canvas;
      if (inside) toNdc(event);
      if (inside || pointerInside) pointerDirty = true;
      pointerInside = inside;
    }
    function onPointerUp(event: PointerEvent) {
      if (!assembled()) { cancelInteractions(); return; }
      if (pointerKey >= 0 && event.pointerId === pointerKeyId) {
        const i = pointerKey; pointerKey = -1;
        pointerDown[i] = 0; activate(i);
        if (!physical[i]) releaseSound(i);
      }
      if (knobState.drag && event.pointerId === knobState.drag.id) endKnob();
    }
    const onPointerLeave = () => { pointerInside = false; pointerDirty = true; };

    // --- physical keyboard --------------------------------------------------
    function onKeyDown(event: KeyboardEvent) {
      if (!assembled() || isEditable(event.target)) return;
      const id = CODE_TO_KEY[event.code], i = id === undefined ? undefined : KEY_INDEX.get(id);
      if (i !== undefined && !event.repeat && !physicalCodes.has(event.code)) {
        physicalCodes.set(event.code, i);
        if (physical[i]++ === 0) { fromPress[i] = 1; activate(i); if (!pointerDown[i]) pressSound(i); }
      }
      if (isControl(event.target) && CONTROL_KEYS.has(event.key)) return; // the focused control owns it
      if (event.key === 'Escape') { tabPass = true; return; }
      if (event.key === 'Tab' && tabPass) { tabPass = false; return; } // Escape, Tab: leave the page to the UI
      if (typeFromKeyboardEvent(event)) { tabPass = false; event.preventDefault(); }
    }
    function releasePhysical(code: string) {
      const i = physicalCodes.get(code);
      if (i === undefined) return;
      physicalCodes.delete(code);
      if (--physical[i] === 0) { activate(i); if (assembled() && !pointerDown[i]) releaseSound(i); }
    }
    function onKeyUp(event: KeyboardEvent) {
      releasePhysical(event.code);
      // macOS withholds keyups for keys released while Cmd is held.
      if (event.key === 'Meta') for (const code of [...physicalCodes.keys()]) releasePhysical(code);
    }
    const releaseAll = () => {
      for (const code of [...physicalCodes.keys()]) releasePhysical(code);
      if (pointerKey >= 0) { pointerDown[pointerKey] = 0; activate(pointerKey); pointerKey = -1; }
    };
    // Replaying the intro (or changing variant) cancels a held key/knob without
    // writing over the assembly's parent transforms or making a release sound.
    function cancelInteractions() {
      physicalCodes.clear(); physical.fill(0); pointerDown.fill(0); hover.fill(0);
      for (let i = 0; i < n; i++) {
        if (depth[i] !== 0 || velocity[i] !== 0) { depth[i] = 0; velocity[i] = 0; apply(i); }
        fromPress[i] = 0;
      }
      active.clear(); pointerKey = -1; pointerKeyId = -1;
      hovered = -1; overKnob = false; shiftLatch = false; capsLatch = false;
      knobState.drag = null; knobState.pressed = false; knobState.residual = 0;
      knobState.dip = 0; knobState.dipVelocity = 0;
      const group = spin(); if (group) group.position.y = 0;
      boundsReady = false; setCursor('');
    }
    const onVisibility = () => { if (document.hidden) releaseAll(); };

    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    canvas.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onVisibility);

    frame.current = rawDt => {
      const dt = Math.min(rawDt, 0.05);
      const phase = useConfigurator.getState().phase;
      const ready = assembled();
      if (ready !== wasReady) {
        if (!ready) cancelInteractions();
        else { seenAssembled = true; wave = null; }
        // Recompute the world-space pre-check after the frame lands, never from
        // the floating frame or the mat roll. A stationary pointer works too.
        boundsReady = false; pointerDirty = true; wasReady = ready;
      }
      if (phase !== lastPhase) { boundsReady = false; lastPhase = phase; }
      // Hover: one hit test per pointer move (none while the pointer is still).
      if (!ready && hovered >= 0) { hover[hovered] = 0; activate(hovered); hovered = -1; overKnob = false; setCursor(''); }
      if (pointerDirty) {
        pointerDirty = false;
        const hit = pointerInside && pointerType !== 'touch' && !knobState.drag ? hitTest() : null;
        const key = hit && 'key' in hit ? hit.key : -1;
        overKnob = Boolean(hit && 'knob' in hit);
        if (key !== hovered) {
          if (hovered >= 0) { hover[hovered] = 0; activate(hovered); }
          if (key >= 0) { hover[key] = 1; activate(key); if (pointerKey < 0) sfx.play('hover', { pan: pan(key) }); }
          hovered = key;
        }
        setCursor(knobState.drag ? 'grabbing' : key >= 0 ? 'pointer' : overKnob ? 'grab' : '');
      }
      for (const i of active) {
        const target = pointerDown[i] || physical[i] ? PRESS_DEPTH : hover[i] ? HOVER_DEPTH : 0;
        if (target === PRESS_DEPTH) fromPress[i] = 1;
        if (reduced) { depth[i] = target; velocity[i] = 0; }
        else [depth[i], velocity[i]] = step(depth[i], velocity[i], target, dt, fromPress[i] === 1 && target < PRESS_DEPTH);
        if (Math.abs(depth[i] - target) < 2e-6 && Math.abs(velocity[i]) < 2e-4) {
          depth[i] = target; velocity[i] = 0; active.delete(i);
          if (target < PRESS_DEPTH) fromPress[i] = 0;
        }
        apply(i);
      }
      // Knob: follow the drag with a magnetic pull toward the nearest detent.
      const spinGroup = spin();
      if (spinGroup) {
        const drag = knobState.drag;
        const angleTarget = -(knobState.detents + (drag?.moved ? drag.step + knobState.residual * 0.3 : 0)) * DETENT;
        const dipTarget = knobState.pressed ? KNOB_DIP : 0;
        if (reduced) { knobState.angle = angleTarget; knobState.dip = dipTarget; }
        else {
          // Substepped like step(): one explicit step per frame is unstable for
          // the stiff drag spring at 60 Hz (2*zeta*omega*dt > 2) and diverged.
          const omega = drag ? 70 : 38, zeta = drag ? 1 : 0.62;
          const substeps = Math.max(1, Math.ceil(dt / (1 / 480))), h = dt / substeps;
          for (let s = 0; s < substeps; s++) {
            knobState.angleVelocity += (omega * omega * (angleTarget - knobState.angle) - 2 * zeta * omega * knobState.angleVelocity) * h;
            knobState.angle += knobState.angleVelocity * h;
          }
          [knobState.dip, knobState.dipVelocity] = step(knobState.dip, knobState.dipVelocity, dipTarget, dt, false);
          knobState.dip = Math.max(0, knobState.dip);
        }
        if (Math.abs(knobState.angle - angleTarget) < 1e-5 && Math.abs(knobState.angleVelocity) < 1e-4) { knobState.angle = angleTarget; knobState.angleVelocity = 0; }
        spinGroup.rotation.y = knobState.angle; spinGroup.position.y = -knobState.dip;
      }
      // Replacement wave: soft clicks as caps lift off and snap back in,
      // observed from the assembly's own transforms and thinned to <= 20.
      const groups = caps.current;
      const observe = seenAssembled && !introActive() && (phase === 'disassembling' || phase === 'assembling');
      if (introActive()) wave = null; // Intro owns its own thinned seating cues.
      if (observe) wave ??= { lifts: 0, seats: 0, liftPending: 0, seatPending: 0, lastLift: -1, lastSeat: -1, knobY: knob.current?.position.y ?? 0 };
      for (let i = 0; i < groups.length; i++) {
        const y = groups[i].position.y;
        if (wave && observe) {
          if (lastCapY[i] <= SEATED && y > SEATED) wave.liftPending++;
          if (lastCapY[i] > SEATED && y <= SEATED) wave.seatPending++;
        }
        lastCapY[i] = y;
      }
      if (wave && observe) {
        const t = performance.now() / 1000;
        if (wave.liftPending && wave.lifts < 8 && t - wave.lastLift >= 0.05) {
          sfx.play('capLift', { gain: Math.min(1, 0.55 + 0.12 * wave.liftPending), pan: (Math.random() - 0.5) * 0.5 });
          wave.lifts++; wave.lastLift = t; wave.liftPending = 0;
        }
        if (wave.seatPending && wave.seats < 11 && t - wave.lastSeat >= 0.075) {
          sfx.play('capSeat', { gain: Math.min(1, 0.55 + 0.1 * wave.seatPending), pan: (Math.random() - 0.5) * 0.5 });
          wave.seats++; wave.lastSeat = t; wave.seatPending = 0;
        }
        const knobY = knob.current?.position.y ?? 0;
        if (wave.knobY > SEATED && knobY <= SEATED) sfx.play('knobSeat', { pan: 0.33 });
        wave.knobY = knobY;
      }
    };

    const project = (object: Object3D, local: Vector3) => {
      const p = object.localToWorld(local.clone()).project(camera);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    };
    window.__interaction = {
      state: () => {
        const offsets: Record<string, number> = {}, stemOffsets: Record<string, number> = {};
        caps.current.forEach((cap, i) => { const y = -cap.children[0].position.y; if (y !== 0) offsets[KEY_LAYOUT[i].id] = y; });
        const stem = stems()[0];
        if (stem) KEY_LAYOUT.forEach((key, i) => { if (Number.isNaN(stemRest[i])) return; stem.getMatrixAt(i, matrix); const d = stemRest[i] - matrix.elements[13]; if (d !== 0) stemOffsets[key.id] = d; });
        const spinGroup = spin();
        return {
          hovered: hovered >= 0 ? KEY_LAYOUT[hovered].id : null, overKnob, cursor: canvas.style.cursor,
          pressed: KEY_LAYOUT.filter((_, i) => pointerDown[i] || physical[i]).map(key => key.id), active: active.size,
          offsets, stemOffsets, shiftLatch, capsLatch,
          knob: { detents: knobState.detents + (knobState.drag?.moved ? knobState.drag.step : 0), ticks: knobState.ticks, clicks: knobState.clicks, angleDeg: (spinGroup?.rotation.y ?? 0) * 180 / Math.PI, dip: -(spinGroup?.position.y ?? 0), dragging: Boolean(knobState.drag) },
        };
      },
      keyPoint: id => {
        const i = KEY_INDEX.get(id)!;
        return project(caps.current[i], new Vector3(0, capHeight(KEY_LAYOUT[i].row, 0), 0));
      },
      knobPoint: () => project(knob.current!, new Vector3(0, 0.013, 0)),
      constants: { hoverDepth: HOVER_DEPTH, pressDepth: PRESS_DEPTH, knobDip: KNOB_DIP, detentDeg: 15, detentPx: DETENT_PX },
      codeMap: { ...CODE_TO_KEY },
    };

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.style.cursor = '';
      frame.current = () => {};
      delete window.__interaction;
    };
  }, [gl, camera, caps, knob, root, assembly]);

  useFrame((_, dt) => frame.current(dt));
  return null;
}
