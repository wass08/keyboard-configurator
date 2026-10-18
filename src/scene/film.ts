import { ACESFilmicToneMapping, AgXToneMapping, CineonToneMapping, LinearToneMapping, NeutralToneMapping, ReinhardToneMapping } from 'three';

export const TONE_OPERATORS = { 'ACES Filmic': ACESFilmicToneMapping, AgX: AgXToneMapping, Neutral: NeutralToneMapping, Reinhard: ReinhardToneMapping, Cineon: CineonToneMapping, Linear: LinearToneMapping };
export const FILM_DEFAULTS = {
  anamorphicEnabled: true, anamorphicThreshold: 1.4, anamorphicIntensity: 0.12,
  anamorphicLength: 0.12, anamorphicTint: '#83cfff', anamorphicResolution: 0.25, anamorphicSamples: 16,
  toneOperator: 'Neutral', gradeEnabled: true, contrast: 1, saturation: 1, vibrance: 0, temperature: 0, tint: 0,
  lift: { x: 0, y: 0, z: 0 }, gamma: { x: 1, y: 1, z: 1 }, gain: { x: 1, y: 1, z: 1 },
  vignetteAmount: 0, vignetteSoftness: 0.65,
};

export const DUST_LAYER = 1;
