import { SFX_CATEGORIES, useSound } from './soundStore';
import type { SfxCategory } from './soundStore';

/**
 * Small Web Audio engine. One AudioContext, created inside the first user
 * gesture (never before: no autoplay warnings, no sound before interaction).
 * Samples are CC0 recordings (public/CREDITS.md), fetched once on idle,
 * decoded once on unlock; synthesized layers add body and need no assets.
 *
 * graph: voice gain -> (panner) -> category gain -> master gain -> limiter -> out
 */
export type SfxName = 'hover' | 'keyDown' | 'keyUp' | 'keyDownStab' | 'keyUpStab' | 'capLift' | 'capSeat' | 'knobSeat' | 'knobTick' | 'knobClick' | 'thud' | 'softClick';
export interface PlayOptions {
  /** Linear gain multiplier on the recipe (default 1). */
  gain?: number;
  /** Playback-rate multiplier (default 1); jitter is applied on top. */
  rate?: number;
  /** Seconds from now. */
  delay?: number;
  /** -1 (left) .. 1 (right). */
  pan?: number;
  /** Override the volume bus. Defaults to the recipe's own category. */
  category?: SfxCategory;
}
export type { SfxCategory };

const CLIPS = ['key-down-1', 'key-down-2', 'key-down-3', 'key-down-4', 'key-up-1', 'key-up-2', 'key-up-3', 'cap-lift', 'knob-click', 'knob-tick', 'hover-tick', 'soft-click'] as const;
type ClipName = typeof CLIPS[number];
interface Clip { buffer: AudioBuffer; start: number; length: number; norm: number }
interface Voice { output: GainNode; sources: AudioScheduledSourceNode[]; end: number }
interface SfxEvent { name: SfxName; at: number; wall: number; rate: number; gain: number; category: SfxCategory }

const MAX_VOICES = 20;
const HOVER_INTERVAL = 0.06;
const CATEGORY: Record<SfxName, SfxCategory> = {
  hover: 'hover', keyDown: 'typing', keyUp: 'typing', keyDownStab: 'typing', keyUpStab: 'typing',
  capLift: 'replacement', capSeat: 'replacement', knobSeat: 'replacement', knobTick: 'knob', knobClick: 'knob', thud: 'intro', softClick: 'intro',
};

const stats = {
  contexts: 0, unlocked: false, ready: false, suppressed: 0, muted: 0, dropped: 0, scheduled: 0, stolen: 0,
  byName: {} as Partial<Record<SfxName, number>>, events: [] as SfxEvent[], errors: [] as string[],
};
let ctx: AudioContext | null = null;
let master: GainNode, buses: Record<SfxCategory, GainNode>;
let noise: AudioBuffer;
const clips = new Map<ClipName, Clip>();
const voices: Voice[] = [];
let fetched: Promise<Map<ClipName, ArrayBuffer>> | null = null;
let pending: { name: SfxName; opts: PlayOptions; at: number }[] = [];
let lastHover = -1;
const lastVariant: Partial<Record<string, number>> = {};
const jitter = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;

function extension() {
  try { return new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'; } catch { return 'mp3'; }
}
function prefetch() {
  fetched ??= (async () => {
    const ext = extension(), out = new Map<ClipName, ArrayBuffer>();
    await Promise.all(CLIPS.map(async name => {
      try {
        const response = await fetch(`/audio/${name}.${ext}`);
        if (response.ok) out.set(name, await response.arrayBuffer());
        else stats.errors.push(`${name}: HTTP ${response.status}`);
      } catch (error) { stats.errors.push(`${name}: ${String(error)}`); }
    }));
    return out;
  })();
  return fetched;
}

/** Trim leading silence (and MP3 encoder padding) and the inaudible tail. */
function analyse(buffer: AudioBuffer): Clip {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  peak ||= 1;
  let first = 0, last = data.length - 1;
  while (first < data.length && Math.abs(data[first]) < peak * 0.05) first++;
  while (last > first && Math.abs(data[last]) < peak * 0.004) last--;
  const start = Math.max(0, first - Math.round(buffer.sampleRate * 0.0015));
  return { buffer, start: start / buffer.sampleRate, length: (last - start + 1) / buffer.sampleRate, norm: 1 / peak };
}

async function decodeAll() {
  const raw = await prefetch();
  await Promise.all([...raw].map(async ([name, data]) => {
    try { clips.set(name, analyse(await ctx!.decodeAudioData(data.slice(0)))); }
    catch (error) { stats.errors.push(`${name}: decode ${String(error)}`); }
  }));
  stats.ready = true;
  const now = performance.now();
  const queued = pending; pending = [];
  // A gesture that unlocks audio may itself be a key press: keep it if recent.
  for (const item of queued) if (now - item.at < 180) play(item.name, item.opts);
}

function applyVolumes() {
  if (!ctx) return;
  const state = useSound.getState(), t = ctx.currentTime;
  master.gain.setTargetAtTime(state.enabled ? state.master ** 1.6 : 0, t, 0.015);
  for (const category of SFX_CATEGORIES) buses[category].gain.setTargetAtTime(state.volumes[category], t, 0.015);
}

function unlock() {
  if (!useSound.getState().enabled) return;
  try {
    if (!ctx) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      ctx = new Context({ latencyHint: 'interactive' });
      stats.contexts++;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 6; limiter.attack.value = 0.002; limiter.release.value = 0.12;
      limiter.connect(ctx.destination);
      master = ctx.createGain(); master.gain.value = 0; master.connect(limiter);
      buses = Object.fromEntries(SFX_CATEGORIES.map(category => { const bus = ctx!.createGain(); bus.connect(master); return [category, bus]; })) as Record<SfxCategory, GainNode>;
      noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.5), ctx.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      applyVolumes();
      void decodeAll();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    stats.unlocked = true;
  } catch (error) { stats.errors.push(`unlock: ${String(error)}`); }
}

// --- voice building blocks ---------------------------------------------------
interface Build { at: number; out: GainNode; sources: AudioScheduledSourceNode[]; end: number }
function filterChain(input: AudioNode, output: AudioNode, filters: { type: BiquadFilterType; frequency: number; Q?: number; gain?: number }[]) {
  let node = input;
  for (const f of filters) {
    const biquad = ctx!.createBiquadFilter();
    biquad.type = f.type; biquad.frequency.value = f.frequency;
    if (f.Q !== undefined) biquad.Q.value = f.Q;
    if (f.gain !== undefined) biquad.gain.value = f.gain;
    node.connect(biquad); node = biquad;
  }
  node.connect(output);
}
/** A decoded recording, trimmed, normalized, with a short release fade. */
function sample(b: Build, name: ClipName, { gain, rate, offset = 0, maxLength = 0.16, filters = [] }: { gain: number; rate: number; offset?: number; maxLength?: number; filters?: { type: BiquadFilterType; frequency: number; Q?: number; gain?: number }[] }) {
  const clip = clips.get(name);
  if (!clip) return;
  const at = b.at + offset, length = Math.min(clip.length, maxLength) / rate, fade = Math.min(0.012, length / 3);
  const source = ctx!.createBufferSource();
  source.buffer = clip.buffer; source.playbackRate.value = rate;
  const env = ctx!.createGain();
  const level = gain * clip.norm;
  env.gain.setValueAtTime(level, at);
  env.gain.setValueAtTime(level, at + length - fade);
  env.gain.linearRampToValueAtTime(0, at + length);
  source.connect(env); filterChain(env, b.out, filters);
  source.start(at, clip.start); source.stop(at + length + 0.005);
  b.sources.push(source); b.end = Math.max(b.end, at + length);
}
/** Resonant case body: a sine whose pitch drops as it decays (a soft "thock"). */
function body(b: Build, { from, to, decay, gain, offset = 0 }: { from: number; to: number; decay: number; gain: number; offset?: number }) {
  const at = b.at + offset, end = at + decay * 7;
  const osc = ctx!.createOscillator(), env = ctx!.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, at + decay * 3);
  env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + 0.0015); env.gain.setTargetAtTime(0, at + 0.0015, decay);
  osc.connect(env); env.connect(b.out);
  osc.start(at); osc.stop(end);
  b.sources.push(osc); b.end = Math.max(b.end, end);
}
/** Filtered noise burst: felt/plastic contact without any tonal ring. */
function burst(b: Build, { frequency, Q = 0.7, decay, gain, type = 'lowpass' as BiquadFilterType, offset = 0 }: { frequency: number; Q?: number; decay: number; gain: number; type?: BiquadFilterType; offset?: number }) {
  const at = b.at + offset, end = at + decay * 7;
  const source = ctx!.createBufferSource(), env = ctx!.createGain();
  source.buffer = noise;
  env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(gain, at + 0.001); env.gain.setTargetAtTime(0, at + 0.001, decay);
  source.connect(env); filterChain(env, b.out, [{ type, frequency, Q }]);
  source.start(at, Math.random() * 0.3); source.stop(end);
  b.sources.push(source); b.end = Math.max(b.end, end);
}
/** Round-robin without immediate repeats. */
function pick<T extends string>(group: string, options: readonly T[]): T {
  let index = Math.floor(Math.random() * options.length);
  if (options.length > 1 && index === lastVariant[group]) index = (index + 1) % options.length;
  lastVariant[group] = index;
  return options[index];
}

const DOWN = ['key-down-1', 'key-down-2', 'key-down-3', 'key-down-4'] as const;
const UP = ['key-up-1', 'key-up-2', 'key-up-3'] as const;
// Recipes return the nominal gain/rate used, for the scheduling log.
const RECIPES: Record<SfxName, (b: Build, gain: number, rate: number) => void> = {
  // Recorded switch bottom-out, the bright clack rolled off, plus a pitched body.
  keyDown: (b, g, r) => {
    sample(b, pick('down', DOWN), { gain: 0.78 * g, rate: r, maxLength: 0.12, filters: [{ type: 'lowpass', frequency: 4200, Q: 0.6 }, { type: 'lowshelf', frequency: 260, gain: 3 }] });
    body(b, { from: 240 * r, to: 150 * r, decay: 0.012, gain: 0.16 * g });
  },
  // Stabilized keys: the same recordings ~3.5 semitones lower, darker, longer body.
  keyDownStab: (b, g, r) => {
    sample(b, pick('downStab', DOWN), { gain: 0.85 * g, rate: 0.82 * r, maxLength: 0.15, filters: [{ type: 'lowpass', frequency: 2900, Q: 0.6 }, { type: 'lowshelf', frequency: 200, gain: 5 }] });
    body(b, { from: 170 * r, to: 98 * r, decay: 0.022, gain: 0.26 * g });
    burst(b, { frequency: 700, decay: 0.012, gain: 0.05 * g });
  },
  // Lighter top-out: higher, quieter recordings, low end removed.
  keyUp: (b, g, r) => {
    sample(b, pick('up', UP), { gain: 0.36 * g, rate: 1.04 * r, maxLength: 0.07, filters: [{ type: 'highpass', frequency: 380 }, { type: 'lowpass', frequency: 6200 }] });
  },
  keyUpStab: (b, g, r) => {
    sample(b, pick('upStab', UP), { gain: 0.42 * g, rate: 0.84 * r, maxLength: 0.09, filters: [{ type: 'highpass', frequency: 220 }, { type: 'lowpass', frequency: 3800 }] });
    body(b, { from: 190 * r, to: 130 * r, decay: 0.01, gain: 0.07 * g });
  },
  hover: (b, g, r) => {
    sample(b, 'hover-tick', { gain: 0.085 * g, rate: 1.2 * r, maxLength: 0.03, filters: [{ type: 'highpass', frequency: 900 }, { type: 'lowpass', frequency: 3600 }] });
  },
  capLift: (b, g, r) => {
    sample(b, 'cap-lift', { gain: 0.2 * g, rate: 1.12 * r, maxLength: 0.05, filters: [{ type: 'lowpass', frequency: 5200 }] });
  },
  capSeat: (b, g, r) => {
    sample(b, pick('seat', DOWN), { gain: 0.3 * g, rate: 1.18 * r, maxLength: 0.08, filters: [{ type: 'lowpass', frequency: 3200, Q: 0.6 }] });
  },
  knobSeat: (b, g, r) => {
    sample(b, 'knob-click', { gain: 0.24 * g, rate: 0.9 * r, maxLength: 0.08, filters: [{ type: 'lowpass', frequency: 3600 }] });
  },
  // Detent: a very short recorded tick, slightly lowered and de-essed.
  knobTick: (b, g, r) => {
    sample(b, 'knob-tick', { gain: 0.3 * g, rate: 0.86 * r, maxLength: 0.03, filters: [{ type: 'highpass', frequency: 1200 }, { type: 'lowpass', frequency: 7500 }] });
  },
  knobClick: (b, g, r) => {
    sample(b, 'knob-click', { gain: 0.55 * g, rate: r, maxLength: 0.09, filters: [{ type: 'lowpass', frequency: 5200 }] });
    body(b, { from: 320 * r, to: 210 * r, decay: 0.008, gain: 0.06 * g });
  },
  // For the intro (spec 07b): a soft, low landing with no tonal ring.
  thud: (b, g, r) => {
    body(b, { from: 120 * r, to: 58 * r, decay: 0.05, gain: 0.42 * g });
    burst(b, { frequency: 520 * r, decay: 0.022, gain: 0.22 * g });
  },
  softClick: (b, g, r) => {
    sample(b, 'soft-click', { gain: 0.4 * g, rate: r, maxLength: 0.04, filters: [{ type: 'lowpass', frequency: 3000 }] });
  },
};
// Natural variation: ±3.5% pitch, ±3.5% level. Detents stay more uniform.
const JITTER: Partial<Record<SfxName, number>> = { knobTick: 0.015, thud: 0.02 };

function release(voice: Voice, t: number) {
  voice.output.gain.setTargetAtTime(0, t, 0.004);
  for (const source of voice.sources) { try { source.stop(t + 0.03); } catch { /* already stopped */ } }
  voice.end = t + 0.03;
}

export function play(name: SfxName, opts: PlayOptions = {}): boolean {
  const state = useSound.getState();
  if (!state.enabled) { stats.muted++; return false; }
  if (!ctx || !stats.unlocked) { stats.suppressed++; return false; }
  if (!stats.ready) { pending.push({ name, opts, at: performance.now() }); return false; }
  if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  if (name === 'hover') {
    if (now - lastHover < HOVER_INTERVAL) { stats.dropped++; return false; }
    lastHover = now;
  }
  try {
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) voices.splice(i, 1);
    while (voices.length >= MAX_VOICES) { release(voices.shift()!, now); stats.stolen++; }
    const category = opts.category ?? CATEGORY[name];
    const amount = JITTER[name] ?? 0.035;
    const rate = (opts.rate ?? 1) * jitter(amount), gain = (opts.gain ?? 1) * jitter(amount);
    const output = ctx.createGain();
    let tail: AudioNode = output;
    if (opts.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      output.connect(panner); tail = panner;
    }
    tail.connect(buses[category]);
    const build: Build = { at: now + Math.max(0, opts.delay ?? 0) + 0.002, out: output, sources: [], end: now };
    RECIPES[name](build, gain, rate);
    if (!build.sources.length) { output.disconnect(); return false; }
    voices.push({ output, sources: build.sources, end: build.end });
    // Disconnect the voice graph once its last source ends.
    build.sources[build.sources.length - 1].onended = () => { try { tail.disconnect(); if (tail !== output) output.disconnect(); } catch { /* ok */ } };
    stats.scheduled++;
    stats.byName[name] = (stats.byName[name] ?? 0) + 1;
    stats.events.push({ name, at: build.at, wall: performance.now(), rate, gain, category });
    if (stats.events.length > 200) stats.events.splice(0, stats.events.length - 200);
    return true;
  } catch (error) { stats.errors.push(`${name}: ${String(error)}`); return false; }
}

/** Public API, also intended for the intro sequence (spec 07b). */
export const sfx = {
  play,
  unlock,
  get ready() { return stats.ready; },
  get context() { return ctx; },
};

if (typeof window !== 'undefined') {
  // Any of these is a user activation; the engine stays silent before one.
  const gesture = () => { if (!ctx || ctx.state !== 'running') unlock(); };
  for (const type of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(type, gesture, { capture: true, passive: true });
  useSound.subscribe((state, previous) => {
    if (state.enabled && !previous.enabled) unlock();
    applyVolumes();
  });
  // Fetch (not decode) the ~100 KB of samples once the scene has had a head start.
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  const start = () => { void prefetch(); };
  if (document.readyState === 'complete') setTimeout(() => idle ? idle(start, { timeout: 3000 }) : start(), 1200);
  else window.addEventListener('load', () => setTimeout(() => idle ? idle(start, { timeout: 3000 }) : start(), 1200), { once: true });
  window.__sfx = () => ({
    ...stats, byName: { ...stats.byName }, events: stats.events.slice(), errors: stats.errors.slice(),
    state: ctx?.state ?? 'none', voices: voices.filter(v => !ctx || v.end >= ctx.currentTime).length, maxVoices: MAX_VOICES,
    enabled: useSound.getState().enabled, master: useSound.getState().master, sampleRate: ctx?.sampleRate ?? 0, clips: [...clips.keys()],
  });
}
