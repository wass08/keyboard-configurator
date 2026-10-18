// Keyboard sample extraction (spec 08b follow-up). Data in, samples out:
//   node scripts/extract-samples.mjs <section.wav> <workDir> [stage]
// The WAV is the user's 0:52-6:00 section decoded by ffmpeg to 48 kHz float.
// Stages: "explore" prints diagnostics; the default runs the full pipeline.
import { readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { analyse, wav } from './audio-analysis.mjs';

export function readWav(buffer) {
  let offset = 12, fmt = null, data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') fmt = { format: buffer.readUInt16LE(offset + 8), channels: buffer.readUInt16LE(offset + 10), rate: buffer.readUInt32LE(offset + 12), bits: buffer.readUInt16LE(offset + 22) };
    if (id === 'data') { data = { start: offset + 8, size: Math.min(size, buffer.length - offset - 8) }; break; }
    offset += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.bits !== 32 || (fmt.format !== 3 && fmt.format !== 0xfffe)) throw new Error('Expected 32-bit float WAV');
  const frames = Math.floor(data.size / 4 / fmt.channels), channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < fmt.channels; c++) channels[c][i] = buffer.readFloatLE(data.start + (i * fmt.channels + c) * 4);
  return { rate: fmt.rate, channels };
}

export function biquad(x, type, f, q, fs) {
  const w = 2 * Math.PI * f / fs, cw = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; } else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; } else { b0 = alpha; b1 = 0; b2 = -alpha; }
  const a0 = 1 + alpha, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0; b0 /= a0; b1 /= a0; b2 /= a0;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const db = v => 20 * Math.log10(Math.max(v, 1e-12));
function percentile(values, p) { const s = Float64Array.from(values).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

/** 1 ms RMS envelope (dB) of a signal. */
function envelope(x, fs, hopMs = 1) {
  const hop = Math.round(fs * hopMs / 1000), out = new Float64Array(Math.floor(x.length / hop));
  for (let j = 0; j < out.length; j++) { let s = 0; for (let i = j * hop; i < (j + 1) * hop; i++) s += x[i] * x[i]; out[j] = db(Math.sqrt(s / hop)); }
  return { env: out, hop };
}

/**
 * Onsets: the 1 kHz high-passed envelope (clicks are broadband, room tone and
 * rumble are not) rising sharply above its recent minimum and well above the
 * noise floor. Refined to the first sample above 15% of the local peak.
 */
export function detectOnsets(mono, fs, { riseDb = 12, floorMarginDb = 14, minGapMs = 25 } = {}) {
  const hp = biquad(biquad(mono, 'hp', 1000, 0.707, fs), 'hp', 1000, 0.707, fs);
  const { env, hop } = envelope(hp, fs);
  const floor = percentile(env, 0.2);
  const onsets = [];
  let last = -Infinity;
  for (let j = 6; j < env.length - 2; j++) {
    let recent = Infinity; for (let k = j - 6; k < j - 1; k++) recent = Math.min(recent, env[k]);
    if (env[j] - recent >= riseDb && env[j] > floor + floorMarginDb && j - last >= minGapMs && env[j] >= env[j - 1] && env[j] >= env[j + 1] - 3) {
      // Refine: local peak within 6 ms, then back to the first sample above 15% of it.
      const from = (j - 2) * hop, to = Math.min(mono.length, (j + 6) * hop);
      let peak = 0, peakAt = from; for (let i = from; i < to; i++) { const a = Math.abs(hp[i]); if (a > peak) { peak = a; peakAt = i; } }
      let start = peakAt; while (start > from && Math.abs(hp[start]) > peak * 0.15) start--;
      onsets.push({ sample: start, peakAt, hpPeakDb: db(peak) });
      last = j;
    }
  }
  return { onsets, floorDb: floor };
}

/** Features of one event over [start, end): level, spectrum shape, decay, clipping. */
export function features(x, fs, start, end) {
  const seg = x.subarray(start, end), n = seg.length;
  let peak = 0, clipped = 0, energy = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(seg[i]); peak = Math.max(peak, a); if (a > 0.985) clipped++; energy += seg[i] * seg[i]; }
  // Spectrum of the first 40 ms (Hann), centroid and band ratios.
  const N = 2048, m = Math.min(n, N), re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < m; i++) re[i] = seg[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (m - 1)));
  fft(re, im);
  let total = 0, weighted = 0, low = 0, high = 0;
  for (let k = 1; k < N / 2; k++) { const f = k * fs / N, p = re[k] * re[k] + im[k] * im[k]; total += p; weighted += p * f; if (f < 500) low += p; if (f > 2000) high += p; }
  // Decay: ms until the 2 ms envelope falls 30 dB under its peak.
  const win = Math.round(fs * 0.002); let envPeak = 0; const env = [];
  for (let i = 0; i + win <= n; i += win) { let s = 0; for (let k = i; k < i + win; k++) s += seg[k] * seg[k]; const v = Math.sqrt(s / win); env.push(v); envPeak = Math.max(envPeak, v); }
  let lastAbove = 0; env.forEach((v, i) => { if (v > envPeak * 0.0316) lastAbove = i; });
  // Unwindowed spectrum (the transient included, as heard): centroid and 2-6 kHz share.
  const R = new Float64Array(4096), I = new Float64Array(4096); R.set(seg.subarray(0, Math.min(n, 4096))); fft(R, I);
  let ft = 0, fw = 0, fh = 0; for (let k = 1; k < 2048; k++) { const f = k * fs / 4096, p = R[k] * R[k] + I[k] * I[k]; ft += p; fw += p * f; if (f >= 2000 && f < 6000) fh += p; }
  // Sustain: energy 20-45 ms vs 0-20 ms after the onset (window-independent).
  const pre = Math.round(fs * 0.0025), e1 = sumSq(seg, pre, pre + Math.round(fs * 0.02)), e2 = sumSq(seg, pre + Math.round(fs * 0.02), pre + Math.round(fs * 0.045));
  let deep = 0; for (let k = 1; k < N / 2; k++) { const f = k * fs / N; if (f >= 60 && f < 250) deep += re[k] * re[k] + im[k] * im[k]; }
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(energy / Math.max(1, n))), centroid: weighted / total, lowRatio: low / total, highRatio: high / total, deepRatio: deep / total, fullCentroid: fw / ft, fullHigh: fh / ft, sustainDb: 10 * Math.log10((e2 + 1e-12) / (e1 + 1e-12)), decay30Ms: (lastAbove + 1) * 2, clipped, lengthMs: n / fs * 1000 };
}
function sumSq(x, a, b) { let s = 0; for (let i = a; i < Math.min(b, x.length); i++) s += x[i] * x[i]; return s; }
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}

async function main() {
  const [input, work = '/tmp/kb-asmr-work', stage = 'all'] = process.argv.slice(2);
  const { rate, channels } = readWav(await readFile(input));
  const mono = new Float32Array(channels[0].length);
  for (let i = 0; i < mono.length; i++) mono[i] = channels.reduce((s, c) => s + c[i], 0) / channels.length;
  const { onsets, floorDb } = detectOnsets(mono, rate);
  const events = onsets.map((o, i) => ({ ...o, t: o.sample / rate, gapMs: ((onsets[i + 1]?.sample ?? mono.length) - o.sample) / rate * 1000, prevMs: i ? (o.sample - onsets[i - 1].sample) / rate * 1000 : Infinity }));
  // Classification features on a fixed 45 ms window (independent of the gap).
  for (const e of events) Object.assign(e, features(mono, rate, Math.max(0, e.sample - Math.round(rate * 0.0025)), Math.min(mono.length, e.sample + Math.round(rate * 0.045))));
  // Cleanliness around each onset: quiet just before it, no clipping.
  for (const e of events) {
    let pre = 0; for (let i = Math.max(0, e.sample - Math.round(rate * 0.012)); i < e.sample - Math.round(rate * 0.003); i++) pre = Math.max(pre, Math.abs(mono[i]));
    e.preQuietDb = e.peakDb - db(pre);
  }
  // Keystrokes: an isolated press followed 45-180 ms later by its release.
  const pairs = [];
  for (let i = 1; i + 1 < events.length; i++) {
    const p = events[i], r = events[i + 1];
    if (p.prevMs < 75 || p.gapMs < 45 || p.gapMs > 180 || r.gapMs < 60) continue;
    if (p.clipped || r.clipped || p.peakDb < -30 || r.peakDb < -38 || p.preQuietDb < 16 || r.preQuietDb < 10) continue;
    if (p.sustainDb > -6 || p.sustainDb < -26) continue; // precursor or truncated detections
    pairs.push({ press: p, release: r, holdMs: p.gapMs });
  }
  if (stage === 'pairs') {
    const pct = (k, q) => percentile(pairs.map(x => x.press[k]), q).toFixed(3);
    console.log('pairs', pairs.length, Object.fromEntries(['centroid', 'lowRatio', 'deepRatio', 'peakDb', 'sustainDb'].map(k => [k, [pct(k, 0.1), pct(k, 0.5), pct(k, 0.9)]])));
    await writeFile(`${work}/pairs.json`, JSON.stringify(pairs));
  }
  if (stage === 'all') await build(mono, rate, events, pairs, work, process.argv[5] ?? 'public/audio');
  if (stage === 'explore') {
    // Stereo correlation, noise floor, density, distributions.
    let lr = 0, ll = 0, rr = 0; if (channels.length > 1) for (let i = 0; i < mono.length; i += 7) { lr += channels[0][i] * channels[1][i]; ll += channels[0][i] ** 2; rr += channels[1][i] ** 2; }
    const { env } = envelope(mono, rate);
    console.log({ seconds: mono.length / rate, rate, channels: channels.length, lrCorrelation: lr / Math.sqrt(ll * rr), fullbandFloorDb: percentile(env, 0.1), medianDb: percentile(env, 0.5), hpFloorDb: floorDb, onsets: events.length, perSecond: events.length / (mono.length / rate) });
    const hist = (key, step) => { const h = {}; for (const e of events) { const b = Math.floor(e[key] / step) * step; h[b] = (h[b] ?? 0) + 1; } return Object.entries(h).sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b}:${c}`).join(' '); };
    console.log('peakDb', hist('peakDb', 3)); console.log('centroid', hist('centroid', 250)); console.log('gapMs', hist('gapMs', 25)); console.log('decay30', hist('decay30Ms', 10)); console.log('lowRatio%', events.reduce((h, e) => { const b = Math.floor(e.lowRatio * 10) * 10; h[b] = (h[b] ?? 0) + 1; return h; }, {}));
    await mkdir(work, { recursive: true });
    await writeFile(`${work}/events.json`, JSON.stringify(events.map(e => ({ ...e, t: +e.t.toFixed(4) })), null, 0));
  }
}

// --- curation -------------------------------------------------------------------
/**
 * Classes (inferred from features, not labelled in the source):
 *  - space: the deepest, longest-ringing presses (most 60-250 Hz energy, slow decay);
 *  - stab: the next-deepest, hollower presses (Backspace/Enter/Shift class);
 *  - alpha: the main population (centroid ~0.75-1.4 kHz).
 */
const CLASSES = {
  alpha: { count: 16, test: p => p.fullCentroid >= 1550 && p.fullCentroid <= 2150 && p.deepRatio >= 0.08 && p.deepRatio < 0.3 && p.sustainDb <= -12, maxMs: 150 },
  space: { count: 7, test: p => p.fullCentroid <= 1350 && p.deepRatio >= 0.2 && p.sustainDb >= -19, maxMs: 200, ratio: [-9, 2] },
  stab: { count: 5, test: p => p.fullCentroid > 1300 && p.fullCentroid < 1600 && p.deepRatio >= 0.18 && p.sustainDb >= -19, maxMs: 170 },
};
const PRE_MS = 2.5;

function cut(x, fs, onset, maxEnd, maxMs) {
  const start = onset - Math.round(fs * PRE_MS / 1000), end = Math.min(maxEnd, onset + Math.round(fs * maxMs / 1000));
  const out = x.slice(start, end), fadeIn = Math.round(fs * 0.0005), fadeOut = Math.min(Math.round(fs * 0.008), out.length >> 2);
  for (let i = 0; i < fadeIn; i++) out[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fadeIn);
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fadeOut);
  return out;
}
const rmsDb = (x, fs, ms = 40) => { const n = Math.min(x.length, Math.round(fs * ms / 1000)); let s = 0; for (let i = 0; i < n; i++) s += x[i] * x[i]; return db(Math.sqrt(s / n)); };
const peakOf = x => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; };
/** dB the clip has decayed by at its end, vs its peak (a cut through a loud body sounds chopped). */
function tailDb(x, fs) { const n = Math.round(fs * 0.004); let m = 0; for (let i = x.length - n - Math.round(fs * 0.008); i < x.length - Math.round(fs * 0.008); i++) m = Math.max(m, Math.abs(x[i] ?? 0)); return db(peakOf(x)) - db(m); }

async function build(mono, fs, events, pairs, work, outDir) {
  const x = biquad(biquad(mono, 'hp', 35, 0.707, fs), 'hp', 35, 0.707, fs); // rumble only
  const used = new Set(), report = { detectedOnsets: events.length, cleanPairs: pairs.length, classes: {} }, chosen = {};
  for (const [name, spec] of Object.entries(CLASSES)) {
    const candidates = pairs.filter(({ press, release, holdMs }) => spec.test(press) && holdMs >= 60 && release.peakDb - press.peakDb <= (spec.ratio?.[1] ?? 1) && release.peakDb - press.peakDb >= (spec.ratio?.[0] ?? -7) && press.fullCentroid >= 650 && release.fullCentroid >= 700 && !used.has(press.sample));
    // Typical members only: distance to the class median over the shaping features.
    const keys = ['fullCentroid', 'deepRatio', 'sustainDb', 'peakDb'];
    const med = Object.fromEntries(keys.map(k => [k, percentile(candidates.map(c => c.press[k]), 0.5)]));
    const spread = Object.fromEntries(keys.map(k => [k, Math.max(1e-6, percentile(candidates.map(c => Math.abs(c.press[k] - med[k])), 0.5))]));
    // The release must be typical too: its level relative to the press, and its centroid.
    const ratio = c => c.release.peakDb - c.press.peakDb;
    const medRatio = percentile(candidates.map(ratio), 0.5), medRel = percentile(candidates.map(c => c.release.fullCentroid), 0.5);
    const spreadRatio = Math.max(0.5, percentile(candidates.map(c => Math.abs(ratio(c) - medRatio)), 0.5));
    const spreadRel = Math.max(1, percentile(candidates.map(c => Math.abs(c.release.fullCentroid - medRel)), 0.5));
    const scored = candidates.map(c => {
      const press = cut(x, fs, c.press.sample, c.release.sample - Math.round(fs * 0.001), spec.maxMs);
      const release = cut(x, fs, c.release.sample, c.release.sample + Math.round(fs * (c.release.gapMs - 1) / 1000), 120);
      const score = keys.reduce((s, k) => s + Math.abs(c.press[k] - med[k]) / spread[k], 0) + Math.abs(ratio(c) - medRatio) / spreadRatio + Math.abs(c.release.fullCentroid - medRel) / spreadRel;
      return { ...c, pressClip: press, releaseClip: release, score, pressTail: tailDb(press, fs), releaseTail: tailDb(release, fs) };
    }).filter(c => c.pressClip.length >= fs * 0.06 && c.releaseClip.length >= fs * 0.045 && c.pressTail >= 18 && c.releaseTail >= 14).sort((a, b) => a.score - b.score);
    const picked = [];
    for (const c of scored) { if (picked.length >= spec.count) break; if (picked.some(p => Math.abs(p.press.t - c.press.t) < 1.5)) continue; picked.push(c); used.add(c.press.sample); }
    chosen[name] = picked;
    report.classes[name] = { candidates: candidates.length, usable: scored.length, kept: picked.length, median: med };
  }
  // Loudness: each press to its class median (40 ms RMS), same factor on its release
  // (keeps the natural press/release ratio). Then one global gain: alpha presses
  // peak around -4 dBFS, natural class-to-class level kept, nothing above -2 dBFS.
  // Classes are levelled to the alphas (the recording's per-key loudness mostly
  // reflects finger force): Space +1 dB, stabilized +0.5 dB.
  const alphaLevel = percentile(chosen.alpha.map(c => rmsDb(c.pressClip, fs)), 0.5);
  const level = { alpha: alphaLevel, space: alphaLevel + 1, stab: alphaLevel + 0.5 };
  for (const list of Object.values(chosen)) for (const c of list) {
    const target = level[Object.keys(chosen).find(n => chosen[n] === list)];
    const g = 10 ** ((target - rmsDb(c.pressClip, fs)) / 20);
    for (const clip of [c.pressClip, c.releaseClip]) for (let i = 0; i < clip.length; i++) clip[i] *= g;
  }
  const alphaPeak = percentile(chosen.alpha.map(c => peakOf(c.pressClip)), 0.5);
  let global = 10 ** (-4 / 20) / alphaPeak;
  const maxPeak = Math.max(...Object.values(chosen).flat().flatMap(c => [peakOf(c.pressClip), peakOf(c.releaseClip)]));
  global = Math.min(global, 10 ** (-2 / 20) / maxPeak); // codec overshoot headroom
  // Sprite: every clip, 60 ms of silence apart (self-aligned again after decoding).
  const gap = Math.round(fs * 0.06), slots = [], parts = [];
  let cursor = gap;
  const add = (clip, cls, kind, index, source) => { parts.push([cursor, clip]); slots.push({ class: cls, kind, index, start: +(cursor / fs).toFixed(5), length: +(clip.length / fs).toFixed(5), source: +source.toFixed(3) }); cursor += clip.length + gap; };
  for (const [name, list] of Object.entries(chosen)) list.forEach((c, i) => { add(c.pressClip, name, 'press', i, c.press.t + 52); add(c.releaseClip, name, 'release', i, c.release.t + 52); });
  const sprite = new Float32Array(cursor);
  for (const [at, clip] of parts) for (let i = 0; i < clip.length; i++) sprite[at + i] = clip[i] * global;
  await mkdir(outDir, { recursive: true }); await rm(`${work}/clips`, { recursive: true, force: true }); await mkdir(`${work}/clips`, { recursive: true });
  await writeFile(`${work}/keys-sprite.wav`, wav(sprite, fs));
  for (const [args, file] of [[['-c:a', 'libopus', '-b:a', '96k', '-vbr', 'on', '-application', 'audio'], 'keys.ogg'], [['-c:a', 'aac', '-b:a', '128k'], 'keys.m4a']]) {
    const r = spawnSync('/opt/homebrew/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${work}/keys-sprite.wav`, '-ac', '1', '-ar', '48000', ...args, '-map_metadata', '-1', `${outDir}/${file}`]);
    if (r.status !== 0) throw new Error(String(r.stderr));
  }
  // Per-clip evidence and stats.
  const stats = {};
  for (const [name, list] of Object.entries(chosen)) {
    stats[name] = { press: [], release: [] };
    for (const [i, c] of list.entries()) for (const kind of ['press', 'release']) {
      const clip = Float32Array.from(c[`${kind}Clip`], v => v * global);
      await writeFile(`${work}/clips/${name}-${kind}-${i + 1}.wav`, wav(clip, fs));
      stats[name][kind].push(analyse(clip, fs));
    }
  }
  const summary = Object.fromEntries(Object.entries(stats).map(([name, s]) => [name, Object.fromEntries(['press', 'release'].map(kind => {
    const arr = s[kind], m = k => +percentile(arr.map(a => a[k]), 0.5).toFixed(1);
    return [kind, { n: arr.length, durationMs: m('durationMs'), peakDb: m('peakDb'), rmsDb: m('rmsDb'), centroidHz: m('centroidHz'), decay40Ms: m('decay40Ms'), sub: +percentile(arr.map(a => a.bandsPercent.sub), 0.5).toFixed(1), lowMid: +percentile(arr.map(a => a.bandsPercent.lowMid), 0.5).toFixed(1), mid: +percentile(arr.map(a => a.bandsPercent.mid), 0.5).toFixed(1), high: +percentile(arr.map(a => a.bandsPercent.high), 0.5).toFixed(1), air: +percentile(arr.map(a => a.bandsPercent.air), 0.5).toFixed(1) }];
  }))]));
  const manifest = {
    source: 'User-provided ASMR keyboard typing recording, section 0:52-6:00 (one keyboard); see CREDITS.md',
    sampleRate: fs, preRollMs: PRE_MS, files: { ogg: 'keys.ogg', m4a: 'keys.m4a' },
    classes: Object.fromEntries(Object.entries(chosen).map(([n, list]) => [n, { variants: list.length, gain: 1 }])),
    slots,
  };
  await writeFile(`${outDir}/keys.json`, `${JSON.stringify(manifest, null, 1)}\n`);
  const sizes = {}; for (const f of ['keys.ogg', 'keys.m4a', 'keys.json']) sizes[f] = (await stat(`${outDir}/${f}`)).size;
  Object.assign(report, { globalGainDb: +db(global).toFixed(1), spriteSeconds: +(cursor / fs).toFixed(2), sizes, summary });
  await writeFile(`${work}/extraction-report.json`, JSON.stringify({ ...report, picked: Object.fromEntries(Object.entries(chosen).map(([n, l]) => [n, l.map(c => ({ t: +(c.press.t + 52).toFixed(3), holdMs: Math.round(c.holdMs), centroid: Math.round(c.press.fullCentroid), deepRatio: +c.press.deepRatio.toFixed(2), releaseRelDb: +(c.release.peakDb - c.press.peakDb).toFixed(1) }))])) }, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
