import { SFX_CATEGORIES, useSound } from './soundStore';
import type { SfxCategory } from './soundStore';
import { CHARACTER_VOICES, DEFAULT_CHARACTER, VARIANTS, VOICE_ORDER, renderVoice } from './synth';
import type { Character, VoiceName } from './synth';

/**
 * Small Web Audio engine, fully synthesized: no audio files are fetched.
 * One AudioContext, created inside the first user gesture (never before: no
 * autoplay warnings, no sound before interaction). On unlock every voice is
 * rendered by src/audio/synth.ts into a few AudioBuffer micro-variations, in
 * time-sliced chunks so no frame is blocked; playback is then one buffer
 * source per sound with ±3% pitch/gain jitter.
 *
 * graph: buffer source -> voice gain -> (panner) -> category gain -> master gain -> high shelf -> limiter -> out
 */
export type SfxName = VoiceName;
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
export type { SfxCategory, Character };

interface Voice { output: GainNode; source: AudioBufferSourceNode; end: number }
interface SfxEvent { name: SfxName; at: number; wall: number; rate: number; gain: number; category: SfxCategory }

const MAX_VOICES = 20;
const HOVER_INTERVAL = 0.06;
/** Default minimum spacing of knob detent ticks (seconds); see play(). */
export const DEFAULT_TICK_GAP = 0.045;
/** Work budget per precompute slice before yielding to the page. */
const SLICE_MS = 4;
/** A queued play() (made before its buffers existed) is kept this long. */
const PENDING_MS = 180;
const CATEGORY: Record<SfxName, SfxCategory> = {
  hover: 'hover', keyDown: 'typing', keyUp: 'typing', keyDownStab: 'typing', keyUpStab: 'typing',
  capLift: 'replacement', capSeat: 'replacement', knobSeat: 'replacement', knobTick: 'knob', knobClick: 'knob',
  thud: 'intro', softClick: 'intro', matUnroll: 'intro',
};
// Natural variation: ±3% pitch and level. Detents and the intro stay more uniform.
const JITTER: Partial<Record<SfxName, number>> = { knobTick: 0.012, thud: 0.02, matUnroll: 0.02 };

const stats = {
  contexts: 0, unlocked: false, ready: false, suppressed: 0, muted: 0, dropped: 0, scheduled: 0, stolen: 0, coalesced: 0,
  byName: {} as Partial<Record<SfxName, number>>, events: [] as SfxEvent[], errors: [] as string[],
  precompute: { runs: 0, buffers: 0, samples: 0, ms: 0, workMs: 0, longestSliceMs: 0, slices: 0, afterUnlockMs: -1 },
};
let ctx: AudioContext | null = null;
let master: GainNode, buses: Record<SfxCategory, GainNode>;
let unlockedAt = 0;
const buffers = new Map<SfxName, AudioBuffer[]>();
const voices: Voice[] = [];
let pending: { name: SfxName; opts: PlayOptions; at: number }[] = [];
let lastHover = -1, lastTick = -1, tickGap = DEFAULT_TICK_GAP;
const lastVariant: Partial<Record<SfxName, number>> = {};
let character: Character = { ...DEFAULT_CHARACTER };
let generation = 0, recharacterTimer = 0;
const jitter = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;

/**
 * Render `names` (all variants) into AudioBuffers, a few ms of work per task.
 * A voice is swapped in only once all its variants exist, so a re-render after
 * a Character change never leaves a gap.
 */
function precompute(names: readonly SfxName[]) {
  if (!ctx) return;
  const gen = ++generation, run = { ...character }, rate = ctx.sampleRate;
  const queue = names.flatMap(name => Array.from({ length: VARIANTS[name] }, (_, v) => [name, v] as const));
  const staged = new Map<SfxName, AudioBuffer[]>();
  const started = performance.now();
  let work = 0, longest = 0, slices = 0, count = 0, samples = 0;
  stats.precompute.runs++;
  const slice = () => {
    if (gen !== generation || !ctx) return;
    const t0 = performance.now();
    try {
      while (queue.length && performance.now() - t0 < SLICE_MS) {
        const [name, variant] = queue.shift()!;
        const data = renderVoice(name, variant, rate, run);
        const buffer = ctx.createBuffer(1, data.length, rate);
        buffer.copyToChannel(data, 0);
        const list = staged.get(name) ?? [];
        list[variant] = buffer; staged.set(name, list);
        count++; samples += data.length;
        if (variant === VARIANTS[name] - 1) { buffers.set(name, list); flush(); }
      }
    } catch (error) { stats.errors.push(`precompute: ${String(error)}`); queue.length = 0; }
    const spent = performance.now() - t0;
    work += spent; longest = Math.max(longest, spent); slices++;
    if (queue.length) { setTimeout(slice, 0); return; }
    stats.ready = VOICE_ORDER.every(name => buffers.has(name));
    stats.precompute = { runs: stats.precompute.runs, buffers: count, samples, ms: performance.now() - started, workMs: work, longestSliceMs: longest, slices, afterUnlockMs: started - unlockedAt };
    flush();
  };
  // The first slice runs inside the unlocking gesture: the press voices are first.
  slice();
}

/** Play queued calls whose voice is now rendered; drop the stale ones. */
function flush() {
  if (!pending.length) return;
  const now = performance.now(), queued = pending;
  pending = [];
  for (const item of queued) {
    if (now - item.at >= PENDING_MS) continue;
    if (buffers.has(item.name)) play(item.name, item.opts);
    else pending.push(item);
  }
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
      unlockedAt = performance.now();
      // A gentle safety limiter (it should rarely engage: voices peak around
      // -9 dBFS at the default volume) and a soft top-end guard against fatigue.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 10; limiter.ratio.value = 3; limiter.attack.value = 0.004; limiter.release.value = 0.18;
      limiter.connect(ctx.destination);
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'highshelf'; shelf.frequency.value = 6000; shelf.gain.value = -3;
      shelf.connect(limiter);
      master = ctx.createGain(); master.gain.value = 0; master.connect(shelf);
      buses = Object.fromEntries(SFX_CATEGORIES.map(category => { const bus = ctx!.createGain(); bus.connect(master); return [category, bus]; })) as Record<SfxCategory, GainNode>;
      applyVolumes();
      precompute(VOICE_ORDER);
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    stats.unlocked = true;
  } catch (error) { stats.errors.push(`unlock: ${String(error)}`); }
}

/** Round-robin over the micro-variations, without immediate repeats. */
function pick(name: SfxName, count: number) {
  let index = Math.floor(Math.random() * count);
  if (count > 1 && index === lastVariant[name]) index = (index + 1 + Math.floor(Math.random() * (count - 1))) % count;
  lastVariant[name] = index;
  return index;
}

function release(voice: Voice, t: number) {
  voice.output.gain.setTargetAtTime(0, t, 0.004);
  try { voice.source.stop(t + 0.03); } catch { /* already stopped */ }
  voice.end = t + 0.03;
}

export function play(name: SfxName, opts: PlayOptions = {}): boolean {
  const state = useSound.getState();
  if (!state.enabled) { stats.muted++; return false; }
  if (!ctx || !stats.unlocked) { stats.suppressed++; return false; }
  const variants = buffers.get(name);
  if (!variants) { if (pending.length < 32) pending.push({ name, opts, at: performance.now() }); return false; }
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
    const amount = JITTER[name] ?? 0.03;
    let rate = (opts.rate ?? 1) * jitter(amount), gain = (opts.gain ?? 1) * jitter(amount);
    let at = now + Math.max(0, opts.delay ?? 0) + 0.002;
    if (name === 'knobTick') {
      // Fast turns: detents closer than the minimum gap are coalesced into a
      // regular ratchet (at most one tick per gap), never a buzz. The visual
      // detents and the volume steps are unaffected.
      const next = Math.max(at, lastTick + tickGap);
      if (next - at > tickGap) { stats.coalesced++; return false; }
      if (next > at) { at = next; gain *= 0.82 * jitter(0.08); rate *= jitter(0.025); }
      lastTick = at;
    }
    const source = ctx.createBufferSource();
    source.buffer = variants[pick(name, variants.length)];
    source.playbackRate.value = rate;
    const output = ctx.createGain();
    output.gain.value = gain;
    source.connect(output);
    let tail: AudioNode = output;
    if (opts.pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner(); panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      output.connect(panner); tail = panner;
    }
    tail.connect(buses[category]);
    source.start(at);
    const end = at + source.buffer!.duration / rate;
    voices.push({ output, source, end });
    // Disconnect the voice graph once it ends.
    source.onended = () => { try { source.disconnect(); output.disconnect(); if (tail !== output) tail.disconnect(); } catch { /* ok */ } };
    stats.scheduled++;
    stats.byName[name] = (stats.byName[name] ?? 0) + 1;
    stats.events.push({ name, at, wall: performance.now(), rate, gain, category });
    if (stats.events.length > 200) stats.events.splice(0, stats.events.length - 200);
    return true;
  } catch (error) { stats.errors.push(`${name}: ${String(error)}`); return false; }
}

/** Update the synthesis character (debug controls); re-renders the affected voices. */
function setCharacter(patch: Partial<Character>) {
  const next = { ...character, ...patch };
  if ((Object.keys(next) as (keyof Character)[]).every(key => next[key] === character[key])) return;
  character = next;
  if (!ctx) return;
  clearTimeout(recharacterTimer);
  // Include anything an interrupted first run had not rendered yet.
  recharacterTimer = window.setTimeout(() => precompute([...new Set([...CHARACTER_VOICES, ...VOICE_ORDER.filter(name => !buffers.has(name))])]), 120);
}

/** Minimum spacing of knob detent ticks, in seconds (debug control). */
function setTickGap(seconds: number) { tickGap = Math.max(0, seconds); }

/** Public API, also intended for the intro sequence (spec 07b). */
export const sfx = {
  play,
  unlock,
  setCharacter,
  setTickGap,
  get tickGap() { return tickGap; },
  get character(): Readonly<Character> { return character; },
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
  window.__sfx = () => ({
    ...stats, byName: { ...stats.byName }, events: stats.events.slice(), errors: stats.errors.slice(), precompute: { ...stats.precompute },
    state: ctx?.state ?? 'none', voices: voices.filter(v => !ctx || v.end >= ctx.currentTime).length, maxVoices: MAX_VOICES,
    enabled: useSound.getState().enabled, master: useSound.getState().master, sampleRate: ctx?.sampleRate ?? 0,
    buffers: Object.fromEntries([...buffers].map(([name, list]) => [name, list.length])), character: { ...character }, tickGap,
  });
  window.__sfxPlay = (name: string, opts?: PlayOptions) => play(name as SfxName, opts);
  // Evidence/analysis hook: the exact samples that are played (scripts/audio-analysis.mjs).
  window.__sfxDump = () => ({ sampleRate: ctx?.sampleRate ?? 0, voices: Object.fromEntries([...buffers].map(([name, list]) => [name, list.map(b => Array.from(b.getChannelData(0)))])) });
}
