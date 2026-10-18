import gsap from 'gsap';
import { Color } from 'three';
import type { Group } from 'three';
import type { KeyboardMaterials } from './materials';
import { applyKeyboardPalette } from './materials';
import { KEY_LAYOUT } from './layout';
import { getVariant } from './variants';
import { useConfigurator } from '../state/store';
import type { IntroState } from '../scene/intro/sequence';

// Use elapsed time even when WebGL compilation or a background tab delays a frame.
// GSAP's default lag smoothing can otherwise stretch a short assembly indefinitely
// under a software renderer; transforms still resolve to the same final values.
gsap.ticker.lagSmoothing(0);

export interface AssemblyHandle { timeline: gsap.core.Timeline; kind: 'initial' | 'change'; intro?: IntroState }
export function createAssembly(caps: Group[], knob: Group, materials: KeyboardMaterials, id: string, initial: boolean, reduced: boolean): AssemblyHandle {
  const variant = getVariant(id);
  const timeline = gsap.timeline();
  const duration = reduced ? 0.12 : 0.5;
  const wave = (index: number) => reduced ? 0 : (KEY_LAYOUT[index].row * 0.062 + KEY_LAYOUT[index].x * 0.026);
  const changeColor = (material: { color: Color }, hex: string, time: number) => {
    const color = new Color(hex);
    timeline.to(material.color, { r: color.r, g: color.g, b: color.b, duration: reduced ? 0.08 : 0.28, ease: 'sine.inOut' }, time);
  };
  let insertAt = 0.25;
  if (initial) {
    // The requested variant may have changed while assets suspended this tree.
    // Apply it to every persistent material and publish the same id for key overrides.
    applyKeyboardPalette(materials, variant);
    caps.forEach(cap => { cap.position.y = reduced ? 0.012 : 0.075; });
    knob.position.y = reduced ? 0.012 : 0.09;
    knob.rotation.y = -Math.PI;
    useConfigurator.setState({ displayedId: id, phase: 'assembling' });
  } else {
    useConfigurator.setState({ phase: 'disassembling' });
    caps.forEach((cap, i) => {
      timeline.to(cap.position, { y: 0.075, duration: reduced ? 0.08 : 0.45, ease: 'power2.inOut' }, reduced ? 0 : (0.72 - wave(i)) * 0.5);
      timeline.to(cap.rotation, { x: 0, z: 0, duration: 0.2 }, 0);
    });
    timeline.to(knob.position, { y: 0.09, duration: reduced ? 0.08 : 0.45, ease: 'power2.inOut' }, 0);
    timeline.to(knob.rotation, { y: -Math.PI, duration: reduced ? 0.08 : 0.55, ease: 'power2.inOut' }, 0);
    const colorAt = reduced ? 0.09 : 0.86;
    changeColor(materials.body, variant.caseBody, colorAt - 0.08);
    changeColor(materials.frame, variant.caseFrame, colorAt - 0.08);
    changeColor(materials.knob, variant.knob, colorAt);
    changeColor(materials.ring, variant.ring, colorAt);
    for (const group of ['alpha', 'mod', 'accent'] as const) {
      changeColor(materials.caps[group], variant.groups[group].cap, colorAt);
      changeColor(materials.legends[group], variant.groups[group].legend, colorAt);
    }
    timeline.call(() => useConfigurator.setState({ displayedId: id }), [], colorAt);
    insertAt = reduced ? 0.18 : 1.23;
    timeline.call(() => useConfigurator.setState({ phase: 'assembling' }), [], insertAt);
  }
  caps.forEach((cap, i) => {
    const time = insertAt + wave(i);
    timeline.to(cap.position, { y: -0.00045, duration, ease: 'power3.in' }, time);
    timeline.to(cap.position, { y: 0, duration: reduced ? 0.03 : 0.16, ease: 'power2.out' }, time + duration);
  });
  const knobAt = insertAt + (reduced ? 0 : 1.25);
  timeline.to(knob.position, { y: 0, duration: reduced ? 0.12 : 0.65, ease: 'power2.inOut' }, knobAt);
  timeline.to(knob.rotation, { y: 0, duration: reduced ? 0.12 : 0.65, ease: 'power2.out' }, knobAt);
  timeline.call(() => {
    // Explicit final values make interrupted timelines and reduced motion equally reliable.
    caps.forEach(cap => { cap.position.y = 0; cap.rotation.set(0, 0, 0); });
    knob.position.y = 0; knob.rotation.y = 0;
    const finalId = initial ? useConfigurator.getState().selectedId : id;
    if (initial) applyKeyboardPalette(materials, getVariant(finalId));
    useConfigurator.setState({ displayedId: finalId, phase: 'assembled' });
  });
  return { timeline, kind: initial ? 'initial' : 'change' };
}
