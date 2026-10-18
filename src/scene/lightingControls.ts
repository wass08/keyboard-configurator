import { useRef } from 'react';
import { button, folder, useControls } from 'leva';
import { FILM_DEFAULTS as F, TONE_OPERATORS } from './film';

// Meters, candela (spot), and luminance (area lights). User-tuned defaults.
const KEY_POSITION = { x: -0.67, y: 1.75, z: 0.80 };
const KEY_AIM = { x: 0, y: 0.79, z: -0.02 };
export function useLightingControls() {
  const latest = useRef<unknown>(null);
  const values = useControls({
    'Key · softbox': folder({
      softboxIntensity: { value: 0.75, min: 0, max: 80, step: 0.05, label: 'Intensity' },
      keyColor: { value: '#fff7f0', label: 'Color' },
      softboxWidth: { value: 0.44, min: 0.1, max: 2, step: 0.01, label: 'Width' },
      softboxHeight: { value: 0.68, min: 0.1, max: 2, step: 0.01, label: 'Height' },
      keyPosition: { value: KEY_POSITION, step: 0.01, label: 'Position' },
      keyAim: { value: KEY_AIM, step: 0.01, label: 'Aim' },
    }, { collapsed: true, order: 0 }),
    'Key · spot (shadows)': folder({
      keyIntensity: { value: 6.235, min: 0, max: 30, step: 0.05, label: 'Intensity' },
      keyAngle: { value: 0.21, min: 0.1, max: 1.5, step: 0.01, label: 'Angle (rad)' },
      keyPenumbra: { value: 0.78, min: 0, max: 1, step: 0.01, label: 'Penumbra' },
      shadowSoftness: { value: 147, min: 1, max: 300, step: 1, label: 'Shadow softness' },
      shadowRadius: { value: 4.1, min: 1, max: 10, step: 0.1, label: 'Shadow radius' },
      linkSpot: { value: true, label: 'Link to softbox' },
      spotPosition: { value: KEY_POSITION, step: 0.01, label: 'Position', render: get => !get('Key · spot (shadows).linkSpot') },
      spotAim: { value: KEY_AIM, step: 0.01, label: 'Aim', render: get => !get('Key · spot (shadows).linkSpot') },
    }, { collapsed: true, order: 1 }),
    'Fill · area': folder({
      fillIntensity: { value: 0.25, min: 0, max: 10, step: 0.05, label: 'Intensity' },
      fillColor: { value: '#eee4ff', label: 'Color' },
      fillWidth: { value: 1.8, min: 0.2, max: 3, step: 0.01, label: 'Width' },
      fillHeight: { value: 1.5, min: 0.2, max: 3, step: 0.01, label: 'Height' },
      fillPosition: { value: { x: 1.4, y: 1.4, z: 0.4 }, step: 0.01, label: 'Position' },
      fillAim: { value: KEY_AIM, step: 0.01, label: 'Aim' },
    }, { collapsed: true, order: 2 }),
    'Monitor · rim': folder({
      screenOn: { value: true, label: 'Screen on' },
      rimIntensity: { value: 7.1, min: 0, max: 80, step: 0.1, label: 'Intensity' },
      rimColor: { value: '#8f77ff', label: 'Color' },
      rimPosition: { value: { x: 0, y: 1.025, z: -0.43 }, step: 0.01, label: 'Screen center' },
      rimAim: { value: { x: 0, y: 0.99, z: 0 }, step: 0.01, label: 'Aim' },
      wallGlow: { value: 27.2, min: 0, max: 60, step: 0.05, label: 'Wall glow' },
    }, { collapsed: true, order: 3 }),
    Screen: folder({
      textLightEnabled: { value: true, label: 'Text practical light' },
      textIntensity: { value: 12, min: 0, max: 60, step: 0.1, label: 'Text intensity' },
      textFlare: { value: 0.32, min: 0, max: 2, step: 0.01, label: 'Keystroke flare' },
    }, { collapsed: true, order: 3.5 }),
    Desk: folder({
      deskClearcoat: { value: 0.24, min: 0, max: 1, step: 0.01, label: 'Clearcoat' },
      deskClearcoatRoughness: { value: 0.22, min: 0.05, max: 1, step: 0.01, label: 'Coat roughness' },
      deskRoughnessMin: { value: 0.30, min: 0.1, max: 0.95, step: 0.01, label: 'Grain roughness min' },
      deskRoughnessScale: { value: 0.32, min: 0, max: 0.8, step: 0.01, label: 'Grain roughness scale' },
      deskNormalStrength: { value: 0.45, min: 0, max: 1, step: 0.01, label: 'Normal strength' },
      deskCoatNormalStrength: { value: 0.18, min: 0, max: 0.6, step: 0.01, label: 'Coat normal strength' },
      deskCoatRoughnessInfluence: { value: 0.32, min: 0, max: 1, step: 0.01, label: 'Coat map influence' },
      deskEnvMapIntensity: { value: 0.9, min: 0, max: 4, step: 0.01, label: 'Environment intensity' },
    }, { collapsed: true, order: 4 }),
    Environment: folder({
      lightformerIntensity: { value: 1.28, min: 0, max: 4, step: 0.01, label: 'Lightformer intensity' },
      hdriIntensity: { value: 0.095, min: 0, max: 0.5, step: 0.005, label: 'HDRI intensity' },
      environmentRotation: { value: -1.29, min: -Math.PI, max: Math.PI, step: 0.01, label: 'HDRI rotation (rad)' },
    }, { collapsed: true, order: 5 }),
    'Stream Deck': folder({
      deckEmissive: { value: 2.4, min: 0, max: 8, step: 0.05, label: 'Key emission' },
      bloomStrength: { value: 0.16, min: 0, max: 1, step: 0.01, label: 'Bloom strength' },
      bloomThreshold: { value: 2, min: 0.5, max: 4, step: 0.05, label: 'Bloom threshold' },
      deckSpill: { value: 0.8, min: 0, max: 8, step: 0.05, label: 'Key light spill' },
    }, { collapsed: true, order: 5.5 }),
    Wall: folder({
      wallColor: { value: '#2a2b2e', label: 'Paint color' },
      wallRoughness: { value: 0.55, min: 0.3, max: 0.9, step: 0.01, label: 'Roughness' },
      wallNormal: { value: 0.035, min: 0, max: 0.2, step: 0.005, label: 'Normal strength' },
    }, { collapsed: true, order: 5.6 }),
    Dust: folder({
      dustEnabled: { value: true, label: 'Show dust' },
      dustCount: { value: 120, min: 0, max: 600, step: 1, label: 'Count' },
      dustSize: { value: 0.5, min: 0.1, max: 3, step: 0.01, label: 'Size (mm)' },
      dustIntensity: { value: 0.25, min: 0, max: 12, step: 0.01, label: 'Intensity' },
      dustSpeed: { value: 1, min: 0, max: 5, step: 0.05, label: 'Speed' },
      dustPadding: { value: 0.03, min: 0, max: 0.3, step: 0.005, label: 'Volume padding (m)' },
    }, { collapsed: true, order: 5.7 }),
    Film: folder({
      anamorphicEnabled: { value: F.anamorphicEnabled, label: 'Anamorphic' },
      anamorphicThreshold: { value: F.anamorphicThreshold, min: 0.5, max: 6, step: 0.05, label: 'Flare threshold' },
      anamorphicIntensity: { value: F.anamorphicIntensity, min: 0, max: 2, step: 0.01, label: 'Flare intensity' },
      anamorphicLength: { value: F.anamorphicLength, min: 0.01, max: 0.5, step: 0.005, label: 'Streak length' },
      anamorphicTint: { value: F.anamorphicTint, label: 'Flare tint' },
      anamorphicResolution: { value: F.anamorphicResolution, options: [0.125, 0.25, 0.5, 1], label: 'Flare resolution' },
      anamorphicSamples: { value: F.anamorphicSamples, min: 8, max: 32, step: 2, label: 'Flare samples' },
      toneOperator: { value: F.toneOperator, options: Object.keys(TONE_OPERATORS), label: 'Tone mapping' },
      exposure: { value: 1, min: 0.2, max: 2, step: 0.01, label: 'Exposure' },
      gradeEnabled: { value: F.gradeEnabled, label: 'Color grading' },
      contrast: { value: F.contrast, min: 0.5, max: 1.6, step: 0.01, label: 'Contrast' },
      saturation: { value: F.saturation, min: 0, max: 2, step: 0.01, label: 'Saturation' },
      vibrance: { value: F.vibrance, min: -1, max: 1, step: 0.01, label: 'Vibrance' },
      temperature: { value: F.temperature, min: -1, max: 1, step: 0.01, label: 'Temperature' },
      tint: { value: F.tint, min: -1, max: 1, step: 0.01, label: 'Tint' },
      lift: { value: F.lift, step: 0.005, label: 'Lift RGB' },
      gamma: { value: F.gamma, step: 0.01, label: 'Gamma RGB' },
      gain: { value: F.gain, step: 0.01, label: 'Gain RGB' },
      vignetteAmount: { value: F.vignetteAmount, min: 0, max: 0.6, step: 0.01, label: 'Vignette' },
      vignetteSoftness: { value: F.vignetteSoftness, min: 0.1, max: 1, step: 0.01, label: 'Vignette softness' },
    }, { collapsed: true, order: 6 }),
    'Copy lighting values': { ...button(() => { void navigator.clipboard.writeText(JSON.stringify(latest.current, null, 2)); }), order: 7 },
  });
  latest.current = lightingValues(values);
  return values;
}
export type LightingSettings = ReturnType<typeof useLightingControls>;
export type Point = { x: number; y: number; z: number };
export const xyz = (p: Point): [number, number, number] => [p.x, p.y, p.z];

// Four tunable light roles. The monitor retains its attached rear-wall spill;
// export that auxiliary emitter too so the JSON completely reproduces the rig.
export function lightingValues(s: LightingSettings) {
  return {
    lights: {
      softbox: { type: 'RectAreaLight', intensity: s.softboxIntensity, color: s.keyColor, width: s.softboxWidth, height: s.softboxHeight, position: xyz(s.keyPosition), aim: xyz(s.keyAim) },
      spot: { type: 'SpotLight', intensity: s.keyIntensity, color: s.keyColor, angle: s.keyAngle, penumbra: s.keyPenumbra, shadowSoftness: s.shadowSoftness, shadowRadius: s.shadowRadius, linkedToSoftbox: s.linkSpot, position: xyz(s.linkSpot ? s.keyPosition : s.spotPosition), aim: xyz(s.linkSpot ? s.keyAim : s.spotAim), unlinkedPosition: xyz(s.spotPosition), unlinkedAim: xyz(s.spotAim) },
      fill: { type: 'RectAreaLight', intensity: s.fillIntensity, color: s.fillColor, width: s.fillWidth, height: s.fillHeight, position: xyz(s.fillPosition), aim: xyz(s.fillAim) },
      monitor: { screenOn: s.screenOn, type: 'RectAreaLight', intensity: s.rimIntensity, color: s.rimColor, width: 0.598, height: 0.028, position: xyz(s.rimPosition), aim: xyz(s.rimAim), wallGlow: { intensity: s.wallGlow, color: s.rimColor, width: 0.5, height: 0.26, localPosition: [0, 0, -0.06] } },
    },
    environment: { lightformerIntensity: s.lightformerIntensity, hdriIntensity: s.hdriIntensity, rotation: s.environmentRotation },
    desk: { clearcoat: s.deskClearcoat, clearcoatRoughness: s.deskClearcoatRoughness, roughnessMin: s.deskRoughnessMin, roughnessScale: s.deskRoughnessScale, normalStrength: s.deskNormalStrength, coatNormalStrength: s.deskCoatNormalStrength, coatRoughnessInfluence: s.deskCoatRoughnessInfluence, envMapIntensity: s.deskEnvMapIntensity },
    streamDeck: { emissiveIntensity: s.deckEmissive, bloomStrength: s.bloomStrength, bloomThreshold: s.bloomThreshold, spillIntensity: s.deckSpill },
    screen: { textLightEnabled: s.textLightEnabled, textIntensity: s.textIntensity, textFlare: s.textFlare },
    wall: { color: s.wallColor, roughness: s.wallRoughness, normalStrength: s.wallNormal },
    rendering: { exposure: s.exposure },
    film: {
      toneMapping: s.toneOperator, exposure: s.exposure,
      anamorphic: { enabled: s.anamorphicEnabled, threshold: s.anamorphicThreshold, intensity: s.anamorphicIntensity, length: s.anamorphicLength, tint: s.anamorphicTint, resolution: s.anamorphicResolution, samples: s.anamorphicSamples },
      grade: { enabled: s.gradeEnabled, contrast: s.contrast, saturation: s.saturation, vibrance: s.vibrance, temperature: s.temperature, tint: s.tint, lift: xyz(s.lift), gamma: xyz(s.gamma), gain: xyz(s.gain) },
      vignette: { amount: s.vignetteAmount, softness: s.vignetteSoftness },
    },
    dust: { enabled: s.dustEnabled, count: s.dustCount, size: s.dustSize, intensity: s.dustIntensity, speed: s.dustSpeed, padding: s.dustPadding },
  };
}
export type LightingValues = ReturnType<typeof lightingValues>;
