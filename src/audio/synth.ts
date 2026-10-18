/**
 * Hand-written, physically inspired synthesis for every sound effect.
 * No audio files and no Web Audio graph: each voice is rendered sample by
 * sample into a Float32Array (cheap, deterministic, seedable), then copied
 * into an AudioBuffer once on unlock by the engine (sfx.ts).
 *
 * Model of a key press:
 *   - excitation: a smooth half-sine force pulse (the stem bottoming out; its
 *     length sets how soft the transient is) plus a little noise for texture;
 *   - modal body: two-pole resonators for the keycap/plate/case partials,
 *     low Q so they read as a dampened "thock", not a pitched "boop";
 *   - case thump: a short sine with a falling pitch;
 *   - noise body: band-passed noise with a fast decay (PBT/plastic grain);
 *   - an optional, very quiet bright click (brightness control).
 *
 * Kept free of imports and non-erasable TS so Node can run it directly for
 * offline analysis (scripts/audio-analysis.mjs).
 */
export type VoiceName = 'hover' | 'keyDown' | 'keyUp' | 'keyDownStab' | 'keyUpStab' | 'capLift' | 'capSeat' | 'knobSeat' | 'knobTick' | 'knobClick' | 'thud' | 'softClick' | 'matUnroll';

export interface Character {
  /** Frequency multiplier for the key/cap bodies (lower = deeper thock). */
  pitch: number;
  /** 0..1: contact hardness, click layer and top-end roll-off. */
  brightness: number;
  /** Decay-time multiplier for the key/cap bodies. */
  decay: number;
  /** 0..1: stabilizer wire rattle/ring on Space, Enter, Backspace, Shift. */
  wire: number;
}
export const DEFAULT_CHARACTER: Readonly<Character> = { pitch: 1, brightness: 0.35, decay: 1, wire: 0.35 };

/** Micro-variations rendered per voice (round-robin at play time). */
export const VARIANTS: Readonly<Record<VoiceName, number>> = {
  keyDown: 6, keyUp: 5, keyDownStab: 4, keyUpStab: 3, knobTick: 4, knobClick: 2, hover: 3,
  capLift: 3, capSeat: 4, knobSeat: 2, thud: 2, softClick: 3, matUnroll: 1,
};
/** Render order: the voices a first keystroke needs come first. */
export const VOICE_ORDER: readonly VoiceName[] = ['keyDown', 'keyUp', 'keyDownStab', 'keyUpStab', 'hover', 'knobTick', 'knobClick', 'capLift', 'capSeat', 'knobSeat', 'thud', 'softClick', 'matUnroll'];
/** Voices whose recipe follows the Character controls. */
export const CHARACTER_VOICES: readonly VoiceName[] = ['keyDown', 'keyUp', 'keyDownStab', 'keyUpStab', 'capSeat'];

// --- primitives ----------------------------------------------------------------
type Rng = () => number;
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
const TAU = Math.PI * 2;

/** RBJ biquad, in place. Band-pass is the constant 0 dB peak form. */
function biquad(x: Float32Array, type: 'lp' | 'hp' | 'bp', f: number, q: number, fs: number) {
  const w = TAU * Math.min(f, fs * 0.45) / fs, cw = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  const a0 = 1 + alpha, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i], y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0; x[i] = y0;
  }
  return x;
}

/** Smooth force pulse (half-sine) of `ms`, scaled so low modes respond with ~1. */
function pulse(ms: number, fs: number) {
  const n = Math.max(2, Math.round(ms * 0.001 * fs)), out = new Float32Array(n), scale = Math.PI / 2 / n;
  for (let i = 0; i < n; i++) out[i] = Math.sin(Math.PI * (i + 0.5) / n) * scale;
  return out;
}
/** White noise with a raised-cosine attack and an exponential decay. */
function noiseBurst(rng: Rng, attackMs: number, tauMs: number, fs: number) {
  const attack = attackMs * 0.001 * fs, tau = tauMs * 0.001 * fs;
  const n = Math.ceil(attack + tau * 7), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const env = i < attack ? 0.5 - 0.5 * Math.cos(Math.PI * i / attack) : Math.exp(-(i - attack) / tau);
    out[i] = (rng() * 2 - 1) * env;
  }
  return out;
}
/** Two-pole resonator (one damped mode) driven by `exc`, added into `out`. */
function mode(out: Float32Array, exc: Float32Array, at: number, f: number, tauS: number, amp: number, fs: number) {
  const w = TAU * f / fs, r = Math.exp(-1 / (tauS * fs)), c1 = 2 * r * Math.cos(w), c2 = -r * r, g = Math.sin(w) * amp;
  let y1 = 0, y2 = 0;
  for (let i = Math.max(0, at), k = i - at; i < out.length; i++, k++) {
    const y = c1 * y1 + c2 * y2 + (k < exc.length ? g * exc[k] : 0);
    out[i] += y; y2 = y1; y1 = y;
    if (k > exc.length && Math.abs(y1) + Math.abs(y2) < 1e-7) break;
  }
}
/** Sine with an exponential pitch glide from f0 to f1 and an exponential decay. */
function glide(out: Float32Array, at: number, f0: number, f1: number, glideMs: number, tauMs: number, amp: number, fs: number, attackMs = 1) {
  const g = glideMs * 0.001 * fs, tau = tauMs * 0.001 * fs, attack = attackMs * 0.001 * fs;
  let phase = 0;
  for (let i = Math.max(0, at), k = 0; i < out.length; i++, k++) {
    const f = f1 + (f0 - f1) * Math.exp(-k / g);
    phase += TAU * f / fs;
    const env = (k < attack ? 0.5 - 0.5 * Math.cos(Math.PI * k / attack) : 1) * Math.exp(-k / tau);
    out[i] += Math.sin(phase) * env * amp;
    if (k > attack + tau * 9) break;
  }
}
/** Band-passed decaying noise added into `out`, normalized to a peak of `amp`. */
function grain(out: Float32Array, rng: Rng, at: number, f: number, q: number, attackMs: number, tauMs: number, amp: number, fs: number) {
  const burst = biquad(noiseBurst(rng, attackMs, tauMs, fs), 'bp', f, q, fs);
  let max = 0;
  for (let k = 0; k < burst.length; k++) max = Math.max(max, Math.abs(burst[k]));
  const g = max > 0 ? amp / max : 0;
  for (let k = 0, i = at; k < burst.length && i < out.length; k++, i++) if (i >= 0) out[i] += burst[k] * g;
}
function finish(out: Float32Array, { hp, lp, peak }: { hp: number; lp: number; peak: number }, fs: number) {
  biquad(out, 'hp', hp, 0.707, fs);
  biquad(out, 'lp', lp, 0.707, fs);
  biquad(out, 'lp', lp * 1.6, 0.6, fs);
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  // Trim the inaudible tail (-66 dB) and fade the last few milliseconds.
  let end = out.length;
  while (end > 1 && Math.abs(out[end - 1]) < max * 5e-4) end--;
  const trimmed = out.slice(0, Math.min(out.length, end + Math.round(fs * 0.004)));
  const fade = Math.min(trimmed.length >> 2, Math.round(fs * 0.008));
  const scale = max > 0 ? peak / max : 0;
  for (let i = 0; i < trimmed.length; i++) {
    const k = trimmed.length - 1 - i;
    trimmed[i] *= scale * (k < fade ? 0.5 - 0.5 * Math.cos(Math.PI * k / fade) : 1);
  }
  return trimmed;
}

// --- recipes --------------------------------------------------------------------
type Mode = [f: number, tau: number, amp: number];
interface Hit {
  length: number; peak: number; hp: number; lp: number;
  /** Contact duration in ms: longer = softer transient. */
  pulseMs: number;
  modes: Mode[];
  /** Extra contacts (ms after the first, relative strength), e.g. stabilizer sides. */
  hits?: [ms: number, amp: number][];
  thump?: { f0: number; f1: number; glideMs: number; tauMs: number; amp: number };
  body?: { f: number; q: number; tauMs: number; amp: number };
  /** Contact click transient (band-passed noise); follows the Brightness control. */
  click?: { f: number; q: number; tauMs: number; amp: number; attackMs?: number };
  wire?: number;
  /** Early reflections off the case and desk: sparse taps over `ms`, low-passed. */
  room?: { ms: number; amount: number; lp: number };
}
interface Variation { rng: Rng; pitch: number; decay: number; bright: number; wire: number }

function renderHit(spec: Hit, v: Variation, fs: number) {
  const { rng } = v, vary = (amount: number) => 1 + (rng() * 2 - 1) * amount;
  const out = new Float32Array(Math.round(spec.length * Math.max(1, v.decay) * fs));
  // Brightness: harder (shorter) contact, more click, higher roll-off.
  const hardness = 2 ** ((0.35 - v.bright) * 1.6);
  const contacts: [number, number][] = [[0, 1], ...(spec.hits ?? []).map(([ms, amp]) => [ms * vary(0.25), amp * vary(0.15)] as [number, number])];
  for (const [ms, strength] of contacts) {
    const at = Math.round(ms * 0.001 * fs);
    const force = pulse(spec.pulseMs * hardness * vary(0.15), fs);
    for (const [f, tau, amp] of spec.modes) mode(out, force, at, f * v.pitch * vary(0.035), tau * v.decay * vary(0.1), amp * strength * vary(0.15), fs);
    if (spec.thump) {
      const t = spec.thump, p = v.pitch * vary(0.03);
      glide(out, at, t.f0 * p, t.f1 * p, t.glideMs, t.tauMs * v.decay * vary(0.1), t.amp * strength * vary(0.1), fs, spec.pulseMs * hardness * 0.6);
    }
    if (spec.body) {
      const b = spec.body;
      grain(out, rng, at, b.f * v.pitch * vary(0.06), b.q, 1, b.tauMs * v.decay * vary(0.15), b.amp * strength * vary(0.15), fs);
    }
    if (spec.click) {
      const c = spec.click;
      grain(out, rng, at, c.f * vary(0.08), c.q, c.attackMs ?? 0.15, c.tauMs * vary(0.15), c.amp * strength * (v.bright / 0.35) * vary(0.2), fs);
    }
  }
  if (spec.wire && v.wire > 0) {
    // Stabilizer wire: a few tiny, dark micro-contacts and a faint, short ring,
    // relative to the body's own level (spec.wire = 1 would match it).
    let body = 0;
    for (let i = 0; i < out.length; i++) body = Math.max(body, Math.abs(out[i]));
    const level = spec.wire * v.wire * body;
    const taps = 3 + Math.floor(rng() * 3);
    let ms = 3 + rng() * 3;
    for (let i = 0; i < taps; i++) {
      grain(out, rng, Math.round(ms * 0.001 * fs), 1400 * vary(0.2), 2.2, 0.1, 1.6, level * 0.5 * 0.7 ** i, fs);
      ms += 2.5 + rng() * 5;
    }
    const ring = pulse(0.5, fs);
    mode(out, ring, Math.round(fs * 0.004), 1150 * vary(0.05), 0.022, level * 0.5, fs);
    mode(out, ring, Math.round(fs * 0.005), 1730 * vary(0.05), 0.016, level * 0.3, fs);
  }
  if (spec.room) {
    // A tiny synthesized "convolution": the object sits on a desk, not in a void.
    const { ms, amount, lp } = spec.room, wet = new Float32Array(out.length), taps = 14;
    for (let j = 0; j < taps; j++) {
      const t = 1.5 + (ms - 1.5) * ((j + rng()) / taps) ** 1.2;
      const d = Math.round(t * 0.001 * fs), g = amount * Math.exp(-t / (ms / 3)) * (rng() < 0.5 ? -1 : 1) * (0.5 + 0.5 * rng());
      for (let i = 0; i + d < out.length; i++) wet[i + d] += out[i] * g;
    }
    biquad(wet, 'lp', lp, 0.707, fs); biquad(wet, 'hp', 220, 0.707, fs);
    for (let i = 0; i < out.length; i++) out[i] += wet[i];
  }
  return finish(out, { hp: spec.hp, lp: Math.min(9000, spec.lp * 2 ** ((v.bright - 0.35) * 2.2)), peak: spec.peak * vary(0.04) }, fs);
}

const HITS: Record<Exclude<VoiceName, 'matUnroll'>, Hit> = {
  // Bottom-out of a lubed switch on PBT, close-miked: a short plastic contact
  // click, a mid "clack" body (cap and plate), a modest thock under it, and a
  // tiny case/desk reflection tail.
  keyDown: {
    length: 0.1, peak: 0.64, hp: 120, lp: 7000, pulseMs: 0.35,
    modes: [[245, 0.009, 0.3], [335, 0.0075, 0.35], [620, 0.007, 0.65], [870, 0.006, 0.9], [1150, 0.0048, 1], [1500, 0.003, 0.85], [2100, 0.002, 0.6], [2900, 0.0013, 0.35]],
    thump: { f0: 210, f1: 160, glideMs: 5, tauMs: 7, amp: 0.22 },
    body: { f: 1200, q: 0.9, tauMs: 4, amp: 0.55 },
    click: { f: 2800, q: 0.7, tauMs: 1.8, amp: 1.1, attackMs: 0.4 },
    room: { ms: 22, amount: 0.4, lp: 3500 },
  },
  // Stabilized keys: only slightly deeper (~0.88x), a bit longer and fuller,
  // both stem sides landing, a tiny wire rattle.
  keyDownStab: {
    length: 0.13, peak: 0.62, hp: 110, lp: 6500, pulseMs: 0.4,
    modes: [[215, 0.011, 0.4], [295, 0.009, 0.45], [545, 0.0082, 0.7], [765, 0.007, 0.9], [1010, 0.0056, 1], [1320, 0.0036, 0.85], [1850, 0.0024, 0.55], [2550, 0.0015, 0.3]],
    hits: [[2.4, 0.5]],
    thump: { f0: 185, f1: 140, glideMs: 6, tauMs: 9, amp: 0.26 },
    body: { f: 1050, q: 0.9, tauMs: 5, amp: 0.55 },
    click: { f: 2500, q: 0.7, tauMs: 1.9, amp: 1, attackMs: 0.4 },
    wire: 0.12,
    room: { ms: 25, amount: 0.38, lp: 3200 },
  },
  // Top-out on release: a distinct, lighter, shorter and higher event.
  keyUp: {
    length: 0.06, peak: 0.215, hp: 220, lp: 7000, pulseMs: 0.3,
    modes: [[420, 0.005, 0.25], [960, 0.004, 0.7], [1300, 0.0034, 1], [1750, 0.0026, 0.7], [2400, 0.0017, 0.35]],
    body: { f: 1350, q: 1, tauMs: 2.5, amp: 0.45 },
    click: { f: 3200, q: 0.8, tauMs: 0.9, amp: 0.8, attackMs: 0.25 },
    room: { ms: 16, amount: 0.3, lp: 3800 },
  },
  keyUpStab: {
    length: 0.07, peak: 0.25, hp: 200, lp: 6500, pulseMs: 0.32,
    modes: [[370, 0.006, 0.3], [845, 0.0048, 0.7], [1145, 0.004, 1], [1540, 0.003, 0.7], [2100, 0.002, 0.35]],
    body: { f: 1190, q: 1, tauMs: 3, amp: 0.45 },
    click: { f: 2900, q: 0.8, tauMs: 1, amp: 0.75, attackMs: 0.25 },
    wire: 0.1,
    room: { ms: 20, amount: 0.32, lp: 3500 },
  },
  // Almost subliminal soft air tick.
  hover: {
    length: 0.03, peak: 0.05, hp: 800, lp: 3600, pulseMs: 0.35,
    modes: [[1900, 0.0022, 0.5], [2700, 0.0016, 0.2]],
    body: { f: 1600, q: 0.8, tauMs: 1.4, amp: 0.8 },
  },
  // Cap pulled off its stem: a soft, muted plastic pop (rising pitch, dark).
  capLift: {
    length: 0.05, peak: 0.28, hp: 180, lp: 2600, pulseMs: 1.2,
    modes: [[880, 0.0055, 0.4], [1400, 0.0038, 0.22]],
    thump: { f0: 360, f1: 800, glideMs: 5, tauMs: 8, amp: 1 },
    body: { f: 700, q: 1, tauMs: 3, amp: 0.3 },
  },
  // Cap pressed onto its stem: a small, softer version of the press.
  capSeat: {
    length: 0.08, peak: 0.4, hp: 140, lp: 6500, pulseMs: 0.4,
    modes: [[290, 0.0075, 0.4], [700, 0.0055, 0.8], [980, 0.0045, 1], [1300, 0.0035, 0.75], [1800, 0.0024, 0.4], [2500, 0.0014, 0.18]],
    thump: { f0: 240, f1: 180, glideMs: 5, tauMs: 6, amp: 0.18 },
    body: { f: 1100, q: 0.9, tauMs: 3.5, amp: 0.45 },
    click: { f: 2900, q: 0.7, tauMs: 1.1, amp: 0.7, attackMs: 0.3 },
    room: { ms: 18, amount: 0.3, lp: 3500 },
  },
  // Knob pushed onto its shaft: muted aluminium-on-plastic click.
  knobSeat: {
    length: 0.06, peak: 0.3, hp: 160, lp: 4200, pulseMs: 0.8,
    modes: [[620, 0.008, 0.8], [1050, 0.006, 0.6], [1720, 0.004, 0.4], [2650, 0.0025, 0.18]],
    body: { f: 900, q: 1, tauMs: 3, amp: 0.4 },
  },
  // Encoder detent: a soft, clicky snap with a little body; no high ringing.
  knobTick: {
    length: 0.035, peak: 0.24, hp: 400, lp: 6000, pulseMs: 0.3,
    modes: [[620, 0.003, 0.3], [980, 0.0028, 0.6], [1450, 0.0024, 0.85], [2100, 0.0018, 0.6], [2950, 0.0011, 0.25]],
    body: { f: 1500, q: 0.9, tauMs: 1.5, amp: 0.45 },
    click: { f: 2400, q: 0.8, tauMs: 0.4, amp: 0.4, attackMs: 0.2 },
    room: { ms: 12, amount: 0.25, lp: 3500 },
  },
  // The push switch under the knob: a firm tactile click over a short low-mid thump.
  knobClick: {
    length: 0.08, peak: 0.5, hp: 110, lp: 6500, pulseMs: 0.5,
    modes: [[300, 0.009, 0.7], [450, 0.0075, 0.8], [700, 0.0055, 0.65], [1100, 0.0038, 0.55], [1600, 0.0026, 0.35], [2300, 0.0016, 0.15]],
    hits: [[5, 0.6]],
    thump: { f0: 230, f1: 165, glideMs: 5, tauMs: 9, amp: 0.45 },
    body: { f: 600, q: 0.9, tauMs: 4, amp: 0.45 },
    click: { f: 2300, q: 0.8, tauMs: 1.4, amp: 1.2, attackMs: 0.35 },
    room: { ms: 20, amount: 0.35, lp: 3200 },
  },
  // Frame landing on the felt mat: soft and weighty, no ring.
  thud: {
    length: 0.4, peak: 0.8, hp: 38, lp: 1900, pulseMs: 4,
    modes: [[140, 0.04, 0.6], [212, 0.026, 0.9], [330, 0.016, 0.75], [520, 0.01, 0.3], [800, 0.006, 0.15]],
    thump: { f0: 108, f1: 60, glideMs: 28, tauMs: 45, amp: 0.7 },
    body: { f: 420, q: 0.8, tauMs: 16, amp: 0.35 },
  },
  softClick: {
    length: 0.045, peak: 0.32, hp: 260, lp: 3800, pulseMs: 0.5,
    modes: [[520, 0.006, 0.5], [920, 0.005, 0.65], [1500, 0.004, 0.8], [2300, 0.0024, 0.3]],
    body: { f: 1200, q: 1, tauMs: 2, amp: 0.3 },
  },
};

/** A felt mat unrolling: slow, dark filtered noise with fibre-friction flutter. */
function renderMatUnroll(rng: Rng, fs: number) {
  const seconds = 1.8, n = Math.round(seconds * fs), out = new Float32Array(n);
  // Smoothed random flutter (fibres catching), ~20 Hz.
  let flutter = 0, target = 0;
  const flutterStep = Math.round(fs / 22);
  // Pinkish noise: white through a leaky integrator, then a moving band-pass.
  let pink = 0;
  for (let i = 0; i < n; i++) {
    pink = 0.985 * pink + (rng() * 2 - 1) * 0.12;
    if (i % flutterStep === 0) target = rng();
    flutter += (target - flutter) * 0.0012;
    const t = i / fs;
    // Fast swell, then fading like the roll's power2.out velocity.
    const env = (1 - Math.exp(-t / 0.09)) * Math.max(0, 1 - t / seconds) ** 1.6;
    out[i] = pink * env * (0.75 + 0.5 * flutter);
  }
  // Time-varying band-pass, swept 380 -> 950 -> 520 Hz, block-wise coefficients.
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let start = 0; start < n; start += 64) {
    const t = start / n, f = 380 + 570 * Math.sin(Math.PI * Math.min(1, t * 1.6)) ** 1.5 * (t < 0.62 ? 1 : 1 - (t - 0.62) * 0.6);
    const w = TAU * f / fs, cw = Math.cos(w), alpha = Math.sin(w) / (2 * 0.65), a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
    for (let i = start; i < Math.min(n, start + 64); i++) {
      const x0 = out[i], y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0; out[i] = y0;
    }
  }
  return finish(out, { hp: 110, lp: 2200, peak: 0.2 }, fs);
}

/** Render one micro-variation of a voice at `sampleRate`. Deterministic per (name, variant, character). */
export function renderVoice(name: VoiceName, variant: number, sampleRate: number, character: Character = DEFAULT_CHARACTER): Float32Array<ArrayBuffer> {
  const rng = mulberry32(hash(`${name}:${variant}`));
  if (name === 'matUnroll') return renderMatUnroll(rng, sampleRate);
  const shaped = CHARACTER_VOICES.includes(name);
  const v: Variation = shaped
    ? { rng, pitch: character.pitch, decay: character.decay, bright: character.brightness, wire: character.wire }
    : { rng, pitch: 1, decay: 1, bright: DEFAULT_CHARACTER.brightness, wire: 0 };
  return renderHit(HITS[name], v, sampleRate);
}
