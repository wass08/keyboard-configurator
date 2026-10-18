/**
 * Recorded keyboard samples (spec 08b follow-up): one sprite per format plus a
 * manifest (public/audio/keys.json), cut by scripts/extract-samples.mjs from the
 * user's ASMR typing recording (see public/CREDITS.md). Fetched once on idle
 * (bytes only), decoded once after the unlocking gesture, then played as
 * offset/duration slices of a single AudioBuffer.
 */
export type SampleClass = 'alpha' | 'space' | 'stab';
export type SampleKind = 'press' | 'release';
interface Slot { class: SampleClass; kind: SampleKind; index: number; start: number; length: number }
interface Manifest { sampleRate: number; preRollMs: number; files: { ogg: string; m4a: string }; classes: Record<SampleClass, { variants: number; gain: number }>; slots: Slot[] }
export interface Slice { offset: number; duration: number }
export interface SampleBank {
  buffer: AudioBuffer;
  slices: Record<SampleClass, Record<SampleKind, Slice[]>>;
  gain: Record<SampleClass, number>;
}

const BASE = `${import.meta.env.BASE_URL}audio/`;
export const sampleStats = {
  status: 'idle' as 'idle' | 'fetching' | 'fetched' | 'decoding' | 'decoded' | 'failed',
  format: '', bytes: 0, fetchMs: 0, decodeMs: 0, codecShiftMs: 0,
  classes: {} as Record<string, { press: number; release: number }>,
};
let fetched: Promise<{ manifest: Manifest; data: ArrayBuffer } | null> | null = null;

function format() {
  try { return new Audio().canPlayType('audio/ogg; codecs="opus"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; }
}

/** Fetch the manifest and one sprite (bytes only, no decoding, no AudioContext). */
export function prefetchSamples(onError: (message: string) => void) {
  fetched ??= (async () => {
    const t0 = performance.now();
    sampleStats.status = 'fetching';
    try {
      const response = await fetch(`${BASE}keys.json`);
      if (!response.ok) throw new Error(`keys.json: HTTP ${response.status}`);
      const manifest = await response.json() as Manifest;
      const ext = format(), audio = await fetch(`${BASE}${manifest.files[ext]}`);
      if (!audio.ok) throw new Error(`${manifest.files[ext]}: HTTP ${audio.status}`);
      const data = await audio.arrayBuffer();
      Object.assign(sampleStats, { status: 'fetched', format: ext, bytes: data.byteLength, fetchMs: performance.now() - t0 });
      return { manifest, data };
    } catch (error) {
      sampleStats.status = 'failed'; onError(`samples: ${String(error)}`);
      return null;
    }
  })();
  return fetched;
}

/**
 * Decode once, then re-find each slot's onset: codec delay (Opus pre-skip, AAC
 * priming) is normally compensated by the decoder, but not by every browser.
 */
export async function decodeSamples(ctx: BaseAudioContext, onError: (message: string) => void): Promise<SampleBank | null> {
  const loaded = await prefetchSamples(onError);
  if (!loaded) return null;
  const t0 = performance.now();
  sampleStats.status = 'decoding';
  try {
    const buffer = await ctx.decodeAudioData(loaded.data.slice(0));
    const { manifest } = loaded, data = buffer.getChannelData(0), fs = buffer.sampleRate, pre = manifest.preRollMs / 1000;
    // Onset of each slot: first sample above 20% of the slot peak, within +-25 ms.
    const shifts: number[] = [];
    for (const slot of manifest.slots) {
      const from = Math.max(0, Math.round((slot.start - 0.025) * fs)), to = Math.min(data.length, Math.round((slot.start + slot.length + 0.025) * fs));
      let peak = 0; for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(data[i]));
      let onset = from; while (onset < to && Math.abs(data[onset]) < peak * 0.2) onset++;
      shifts.push(onset / fs - (slot.start + pre));
    }
    shifts.sort((a, b) => a - b);
    // The extraction's own onset is within ~1 ms of this one: only a consistent offset is codec delay.
    const median = shifts[shifts.length >> 1], shift = Math.abs(median) > 0.002 ? Math.max(-0.025, Math.min(0.025, median)) : 0;
    const slices = { alpha: { press: [], release: [] }, space: { press: [], release: [] }, stab: { press: [], release: [] } } as SampleBank['slices'];
    for (const slot of manifest.slots) slices[slot.class][slot.kind][slot.index] = { offset: Math.max(0, slot.start + shift), duration: slot.length };
    Object.assign(sampleStats, {
      status: 'decoded', decodeMs: performance.now() - t0, codecShiftMs: shift * 1000,
      classes: Object.fromEntries(Object.entries(slices).map(([name, kinds]) => [name, { press: kinds.press.length, release: kinds.release.length }])),
    });
    return { buffer, slices, gain: Object.fromEntries(Object.entries(manifest.classes).map(([name, c]) => [name, c.gain])) as Record<SampleClass, number> };
  } catch (error) {
    sampleStats.status = 'failed'; onError(`samples: decode ${String(error)}`);
    return null;
  }
}
