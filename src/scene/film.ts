import { ACESFilmicToneMapping, AgXToneMapping, CineonToneMapping, LinearToneMapping, NeutralToneMapping, NoToneMapping, ReinhardToneMapping } from 'three';

export const TONE_OPERATORS = { None: NoToneMapping, 'ACES Filmic': ACESFilmicToneMapping, AgX: AgXToneMapping, Neutral: NeutralToneMapping, Reinhard: ReinhardToneMapping, Cineon: CineonToneMapping, Linear: LinearToneMapping };
export const FILM_DEFAULTS = {
  toneOperator: 'ACES Filmic', gradeEnabled: true, contrast: 1.11, saturation: 1, vibrance: 0.19, temperature: 0.28, tint: 0.22,
  lift: { x: 0, y: 0, z: 0 }, gamma: { x: 1, y: 1, z: 1 }, gain: { x: 1, y: 1, z: 1 },
  vignetteAmount: 0.52, vignetteSoftness: 0.48,
};

export const DUST_LAYER = 1;
