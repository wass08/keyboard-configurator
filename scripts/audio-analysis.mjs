// Objective evidence for the synthesized SFX (spec 08b): WAV export plus
// duration, peak/RMS, spectral centroid, band energy split and decay times.
// `node scripts/audio-analysis.mjs` renders every voice through src/audio/synth.ts
// directly in Node (type stripping), for quick iteration; `npm run shots` runs
// the same analysis on the buffers the browser actually precomputed.
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const BANDS = [['sub', 0, 150], ['lowMid', 150, 500], ['mid', 500, 2000], ['high', 2000, 6000], ['air', 6000, Infinity]];
const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** One-pole-pair high-pass at `f` (2nd-order RBJ), for the harsh-spike probe. */
function highpass(x, f, fs) {
  const w = 2 * Math.PI * f / fs, cw = Math.cos(w), alpha = Math.sin(w) / (2 * 0.707), a0 = 1 + alpha;
  const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}

export function analyse(samples, fs) {
  const x = Float64Array.from(samples), n = x.length;
  let peak = 0, peakAt = 0, energy = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) { peak = a; peakAt = i; } energy += x[i] * x[i]; }
  // 2 ms RMS envelope for attack/decay times.
  const win = Math.max(1, Math.round(fs * 0.002)), env = [];
  for (let i = 0; i < n; i += win) { let s = 0; for (let k = i; k < Math.min(n, i + win); k++) s += x[k] * x[k]; env.push(Math.sqrt(s / win)); }
  const envPeak = Math.max(...env), envPeakAt = env.indexOf(envPeak);
  const lastAbove = dB => { const limit = envPeak * 10 ** (dB / 20); let last = envPeakAt; for (let i = envPeakAt; i < env.length; i++) if (env[i] >= limit) last = i; return (last + 1) * win / fs * 1000; };
  // RMS over the active part (envelope within 40 dB of its peak).
  let activeEnergy = 0, activeSamples = 0;
  const activeLimit = envPeak * 0.01;
  for (let i = 0; i < env.length; i++) if (env[i] >= activeLimit) { for (let k = i * win; k < Math.min(n, (i + 1) * win); k++) activeEnergy += x[k] * x[k]; activeSamples += Math.min(win, n - i * win); }
  // Whole-voice power spectrum.
  let size = 1; while (size < n) size <<= 1; size = Math.max(size, 4096);
  const re = new Float64Array(size), im = new Float64Array(size); re.set(x); fft(re, im);
  const bands = Object.fromEntries(BANDS.map(([name]) => [name, 0]));
  let total = 0, weighted = 0;
  for (let k = 1; k < size / 2; k++) {
    const f = k * fs / size, p = re[k] * re[k] + im[k] * im[k];
    total += p; weighted += p * f;
    for (const [name, lo, hi] of BANDS) if (f >= lo && f < hi) { bands[name] += p; break; }
  }
  for (const key of Object.keys(bands)) bands[key] = round(bands[key] / total * 100, 2);
  const hf = highpass(x, 4000, fs); let hfPeak = 0; for (const v of hf) hfPeak = Math.max(hfPeak, Math.abs(v));
  return {
    samples: n, durationMs: round(n / fs * 1000), peakDb: round(db(peak), 2), rmsDb: round(db(Math.sqrt(activeEnergy / Math.max(1, activeSamples))), 2),
    totalRmsDb: round(db(Math.sqrt(energy / n)), 2), attackMs: round(peakAt / fs * 1000, 2), decay20Ms: round(lastAbove(-20)), decay40Ms: round(lastAbove(-40)), decay60Ms: round(lastAbove(-60)),
    centroidHz: Math.round(weighted / total), bandsPercent: bands, above4kPeakDbRel: round(db(hfPeak) - db(peak), 1),
  };
}

export function wav(samples, fs) {
  const n = samples.length, buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + n * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(fs, 24); buffer.writeUInt32LE(fs * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buffer;
}

/** Write every variant as WAV, return per-voice stats (variant 0 + spread over variants). */
export async function exportVoices(voices, fs, dir = 'screenshots/audio') {
  await mkdir(dir, { recursive: true });
  const report = {};
  for (const [name, variants] of Object.entries(voices)) {
    const stats = [];
    for (let v = 0; v < variants.length; v++) {
      await writeFile(`${dir}/${name}${variants.length > 1 ? `-${v + 1}` : ''}.wav`, wav(variants[v], fs));
      stats.push(analyse(variants[v], fs));
    }
    const spread = key => [Math.min(...stats.map(s => s[key])), Math.max(...stats.map(s => s[key]))];
    report[name] = { variants: variants.length, ...stats[0], spread: { centroidHz: spread('centroidHz'), peakDb: spread('peakDb'), rmsDb: spread('rmsDb'), decay40Ms: spread('decay40Ms') } };
  }
  // Press/release level relationship, measured on the active-part RMS.
  report.relations = {
    keyUpVsKeyDownDb: round(report.keyUp.rmsDb - report.keyDown.rmsDb, 2),
    keyUpStabVsKeyDownStabDb: round(report.keyUpStab.rmsDb - report.keyDownStab.rmsDb, 2),
  };
  await writeFile(`${dir}/analysis.json`, `${JSON.stringify({ sampleRate: fs, bands: BANDS.map(([n, lo, hi]) => `${n}: ${lo}-${hi} Hz`), voices: report }, null, 2)}\n`);
  return report;
}

export function table(report) {
  const rows = Object.entries(report).filter(([name]) => name !== 'relations').map(([name, s]) => [
    name, s.variants, s.durationMs, s.peakDb, s.rmsDb, s.attackMs, s.decay20Ms, s.decay40Ms, s.centroidHz,
    ...BANDS.map(([b]) => s.bandsPercent[b]), s.above4kPeakDbRel,
  ]);
  const head = ['voice', 'var', 'ms', 'peak', 'rms', 'atk', 'd-20', 'd-40', 'centroid', '<150', '150-500', '0.5-2k', '2-6k', '>6k', 'hf>4k'];
  return [head, ...rows].map(r => r.map((c, i) => String(c).padStart(i ? 8 : 12)).join(' ')).join('\n') + `\nrelations: ${JSON.stringify(report.relations)}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { renderVoice, VARIANTS, VOICE_ORDER } = await import('../src/audio/synth.ts');
  const fs = Number(process.env.AUDIO_RATE ?? 48000);
  const t0 = performance.now();
  const voices = Object.fromEntries(VOICE_ORDER.map(name => [name, Array.from({ length: VARIANTS[name] }, (_, v) => renderVoice(name, v, fs))]));
  const renderMs = performance.now() - t0;
  const report = await exportVoices(voices, fs, process.env.AUDIO_DIR ?? 'screenshots/audio');
  console.log(table(report));
  console.log(`rendered ${Object.values(voices).flat().length} buffers in ${renderMs.toFixed(1)} ms (Node, ${fs} Hz)`);
}
