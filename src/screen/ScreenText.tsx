import { useProfiledFrame as useFrame } from '../scene/post/useProfiledFrame';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, Color, LinearMipmapLinearFilter, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { RectAreaLight } from 'three';
import { useOwnedDisposal } from '../resources/ownership';
import { useSound } from '../audio/soundStore';
import type { LightingSettings } from '../scene/lightingControls';
import { typing } from './typing';
import { dampedScalar } from '../animation/dampedScalar';
import { PROMPT_BOTTOM_M, PROMPT_FONT_M, PROMPT_MARGIN_M, TERMINAL_ACCENT, TERMINAL_FONT, TERMINAL_INK, terminalBackground } from './terminalTheme';
import { PAST_SESSION } from './session';
import type { SessionRow } from './session';

const BLINK_MS = 530, SOLID_AFTER_EDIT_MS = 600, OSD_HOLD_MS = 1200, OSD_FADE_MS = 300;
const HISTORY_TOP_M = 0.012, HISTORY_LINE_M = 0.0098, HISTORY_FONT_M = 0.0062, HISTORY_GAP_M = 0.0035;
export const PLACEHOLDER_TEXT = 'Ask Claude to build something…';
interface Line { start: number; end: number }
function wrap(measure: (s: string) => number, text: string, maxWidth: number): Line[] {
  const lines: Line[] = []; let offset = 0;
  for (const paragraph of text.split('\n')) {
    let start = 0;
    for (;;) {
      if (measure(paragraph.slice(start)) <= maxWidth) { lines.push({ start: offset + start, end: offset + paragraph.length }); break; }
      let lo = start + 1, hi = paragraph.length;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (measure(paragraph.slice(start, mid)) <= maxWidth) lo = mid; else hi = mid - 1; }
      const space = paragraph.lastIndexOf(' ', lo), end = space > start ? space + 1 : lo;
      lines.push({ start: offset + start, end: offset + end }); start = end;
    }
    offset += paragraph.length + 1;
  }
  return lines;
}
const lineOf = (lines: Line[], caret: number) => { let index = 0; for (let i = 0; i < lines.length; i++) if (lines[i].start <= caret) index = i; return index; };
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); }

/** Bottom-anchored scrollback and a narrow live footer, plus a prompt emitter. Typing,
 * light animation and volume feedback never update React or the environment. */
export function ScreenText({ width, height, radiance, settings, lightEnabled }: { width: number; height: number; radiance: number; settings: LightingSettings; lightEnabled: boolean }) {
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = Math.round(1920 * height / width);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8; texture.minFilter = LinearMipmapLinearFilter;
    const material = new MeshBasicMaterial({ map: texture, depthWrite: false, color: new Color('#ffffff').multiplyScalar(radiance) });
    // The scene's final Neutral tone mapper subtracts the darkest linear
    // channel. Give the LCD a calibrated black floor so #111113 remains a
    // near-black panel after that pass rather than clipping to pure black.
    material.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += vec3(0.025);\n#include <opaque_fragment>'); };
    const footer = document.createElement('canvas'); footer.width = canvas.width; footer.height = Math.ceil(0.067 * canvas.width / width);
    const footerTexture = new CanvasTexture(footer); footerTexture.colorSpace = SRGBColorSpace; footerTexture.anisotropy = 8; footerTexture.minFilter = LinearMipmapLinearFilter;
    const footerMaterial = material.clone(); footerMaterial.map = footerTexture; footerMaterial.onBeforeCompile = material.onBeforeCompile;
    const footerHeight = footer.height * width / canvas.width;
    return { canvas, context: canvas.getContext('2d')!, texture, material, geometry: new PlaneGeometry(width, height), footer, footerTexture, footerMaterial, footerContext: footer.getContext('2d')!, footerHeight, footerGeometry: new PlaneGeometry(width, footerHeight) };
  }, [width, height, radiance]);
  useOwnedDisposal('Monitor.Typing', [resources.texture, resources.material, resources.geometry, resources.footerTexture, resources.footerMaterial, resources.footerGeometry]);
  const light = useRef<RectAreaLight>(null);
  const drawn = useRef({ canvas: null as HTMLCanvasElement | null, version: -1, historyVersion: -1, historyHeight: -1, caretOn: false, caretFrozen: false, redraws: 0, staticRedraws: 0, lines: [] as string[], promptLines: 1, coverage: 0, osdAlpha: 0, osdAt: -Infinity, osdVolume: useSound.getState().master, osdVelocity: 0, osdPaintedVolume: useSound.getState().master, lastDraw: 0, promptHeight: 0.026, scroll: 0,
    history: { rows: [] as { text: string; y: number }[], totalRows: 0, capacity: 0, scrolledRows: 0, lineHeight: 0, top: 0, promptTop: 0, lastBaseline: 0, column: 0 } });
  useEffect(() => {
    const { context: ctx, canvas } = resources, px = canvas.width / width;
    const measure = (s: string) => { ctx.font = `400 ${Math.round(PROMPT_FONT_M * px)}px ${TERMINAL_FONT}`; return ctx.measureText(s).width; };
    const maxWidth = (width - 2 * PROMPT_MARGIN_M - 0.024) * px;
    typing.setVerticalResolver((caret, direction) => {
      const text = typing.text, lines = wrap(measure, text, maxWidth), index = lineOf(lines, caret), target = index + direction;
      if (target < 0) return 0; if (target >= lines.length) return text.length;
      const x = measure(text.slice(lines[index].start, caret)), line = lines[target];
      let best = line.start, distance = Infinity;
      const last = target < lines.length - 1 && lines[target + 1].start === line.end ? line.end - 1 : line.end;
      for (let i = line.start; i <= last; i++) { const d = Math.abs(measure(text.slice(line.start, i)) - x); if (d < distance) { distance = d; best = i; } }
      return best;
    });
    window.__screen = () => ({ redraws: drawn.current.redraws, staticRedraws: drawn.current.staticRedraws, dynamicCanvas: [resources.footer.width, resources.footer.height], text: typing.text, transcript: [...typing.transcript], caret: typing.caret, lines: drawn.current.lines.slice(), canvas: [canvas.width, canvas.height], fontPx: Math.round(PROMPT_FONT_M * px), promptLines: drawn.current.promptLines, scroll: drawn.current.scroll, history: drawn.current.history, caretOn: drawn.current.caretOn, osd: { visible: drawn.current.osdAlpha > 0, alpha: drawn.current.osdAlpha, volume: useSound.getState().master, displayedVolume: drawn.current.osdPaintedVolume, animating: drawn.current.osdVelocity !== 0 }, practical: { intensity: light.current?.intensity ?? 0, coverage: drawn.current.coverage } });
    window.__screenControl = { freezeCaret: freeze => { drawn.current.caretFrozen = freeze; }, clear: () => typing.clear() };
    const unsubscribe = useSound.subscribe((state, previous) => { if (state.master !== previous.master) drawn.current.osdAt = performance.now(); });
    return () => { unsubscribe(); typing.setVerticalResolver(null); delete window.__screen; delete window.__screenControl; };
  }, [resources, width]);
  useFrame('terminal', (_, delta) => {
    const now = performance.now(), since = now - typing.editedAt, state = drawn.current;
    const caretOn = state.caretFrozen ? state.caretOn : since < SOLID_AFTER_EDIT_MS || Math.floor((since - SOLID_AFTER_EDIT_MS) / BLINK_MS) % 2 === 1;
    const osdAge = now - state.osdAt, osdAlpha = osdAge < OSD_HOLD_MS ? 1 : Math.max(0, 1 - (osdAge - OSD_HOLD_MS) / OSD_FADE_MS);
    const targetVolume = useSound.getState().master;
    if (osdAlpha > 0 && (state.osdVolume !== targetVolume || state.osdVelocity !== 0)) {
      // Keep velocity across rapid detents. The bar reaches 95% in ~150ms,
      // without restarting a tween (or repainting the full screen texture).
      const next = dampedScalar(state.osdVolume, state.osdVelocity, targetVolume, Math.min(delta, 0.1), 32);
      state.osdVolume = next.value; state.osdVelocity = next.velocity;
    }
    // Fast Refresh preserves refs/version counters but recreates memoized GPU
    // resources. A fresh canvas needs both rasters painted, even with a frozen
    // caret and identical transcript/input versions.
    const canvasChanged = state.canvas !== resources.canvas;
    const changed = canvasChanged || state.version !== typing.version || state.caretOn !== caretOn;
    const osdChanged = osdAlpha !== state.osdAlpha && (osdAlpha === 0 || osdAlpha === 1 || now - state.lastDraw > 1000 / 30);
    const levelChanged = osdAlpha > 0 && state.osdPaintedVolume !== state.osdVolume;
    if (changed || osdChanged || levelChanged) {
      state.version = typing.version; state.caretOn = caretOn; state.osdAlpha = osdAlpha; state.lastDraw = now; state.redraws++;
      state.osdPaintedVolume = state.osdVolume;
      const { canvas, texture } = resources, px = canvas.width / width;
      state.canvas = canvas;
      let ctx = resources.context;
      const text = typing.text, caret = typing.caret, margin = PROMPT_MARGIN_M * px, font = Math.round(PROMPT_FONT_M * px), lineHeight = 0.012 * px;
      const fontStyle = `400 ${font}px ${TERMINAL_FONT}`;
      ctx.font = fontStyle;
      const inputX = margin + 0.019 * px, maxWidth = canvas.width - inputX - margin - 0.005 * px;
      const lines = wrap(s => ctx.measureText(s).width, text, maxWidth), caretLine = lineOf(lines, caret);
      state.promptLines = Math.min(3, lines.length); state.promptHeight = 0.026 + (state.promptLines - 1) * 0.012;
      const boxH = state.promptHeight * px, boxY = canvas.height - PROMPT_BOTTOM_M * px - boxH;
      const first = Math.max(0, Math.min(lines.length - state.promptLines, caretLine - state.promptLines + 1)); state.scroll = first;
      const visibleLines = lines.slice(first, first + state.promptLines); state.lines = visibleLines.map(line => text.slice(line.start, line.end));
      if (canvasChanged || state.historyVersion !== typing.transcriptVersion || state.historyHeight !== state.promptHeight) {
        terminalBackground(ctx, canvas.width, canvas.height); ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        const historyStyle = `400 ${Math.round(HISTORY_FONT_M * px)}px ${TERMINAL_FONT}`;
        ctx.font = historyStyle;
        const transcript: SessionRow[] = [...PAST_SESSION];
        for (const message of typing.transcript) for (const line of wrap(s => ctx.measureText(s).width, '> ' + message, canvas.width - 2 * margin)) transcript.push({ text: ('> ' + message).slice(line.start, line.end), color: TERMINAL_INK });
        const historyLineH = HISTORY_LINE_M * px, lastBaseline = boxY - HISTORY_GAP_M * px;
        const maxRows = Math.max(0, Math.floor((lastBaseline - (HISTORY_TOP_M + PROMPT_FONT_M) * px) / historyLineH) + 1);
        const history = maxRows ? transcript.slice(-maxRows) : [];
        const firstBaseline = lastBaseline - (history.length - 1) * historyLineH;
        state.history = { rows: history.map((row, i) => ({ text: row.text, y: firstBaseline + i * historyLineH })), totalRows: transcript.length, capacity: maxRows, scrolledRows: transcript.length - history.length, lineHeight: historyLineH, top: HISTORY_TOP_M * px, promptTop: boxY, lastBaseline, column: margin };
        ctx.save(); ctx.beginPath(); ctx.rect(margin, HISTORY_TOP_M * px, canvas.width - 2 * margin, boxY - HISTORY_TOP_M * px); ctx.clip();
        history.forEach((line, i) => {
          ctx.font = line.heading ? `500 ${Math.round(PROMPT_FONT_M * px)}px ${TERMINAL_FONT}` : historyStyle;
          ctx.fillStyle = line.color; ctx.fillText(line.text, margin, firstBaseline + i * historyLineH);
        });
        ctx.restore();
        state.historyVersion = typing.transcriptVersion; state.historyHeight = state.promptHeight; state.staticRedraws++;
        texture.needsUpdate = true;
      }
      // Only this ~215px-tall strip is uploaded for typing, caret and OSD.
      // Reuse the static raster's vignette; don't repaint a 2MP gradient.
      ctx = resources.footerContext;
      const footerTop = canvas.height - resources.footer.height;
      ctx.setTransform(1, 0, 0, 1, 0, -footerTop);
      ctx.clearRect(0, footerTop, canvas.width, resources.footer.height);
      ctx.drawImage(canvas, 0, footerTop, canvas.width, resources.footer.height, 0, footerTop, canvas.width, resources.footer.height);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#141416'; ctx.strokeStyle = '#49464d'; ctx.lineWidth = 1.5;
      rounded(ctx, margin, boxY, canvas.width - 2 * margin, boxH, 0.003 * px); ctx.fill(); ctx.stroke();
      const baseline = boxY + 0.017 * px;
      ctx.font = fontStyle; ctx.fillStyle = TERMINAL_ACCENT; ctx.fillText('>', margin + 0.006 * px, baseline);
      ctx.save(); ctx.beginPath(); ctx.rect(inputX, boxY + 1, maxWidth, boxH - 2); ctx.clip();
      if (!text) { ctx.fillStyle = '#77747e'; ctx.fillText(PLACEHOLDER_TEXT, inputX, baseline); }
      else { ctx.fillStyle = TERMINAL_INK; visibleLines.forEach((line, i) => ctx.fillText(text.slice(line.start, line.end), inputX, baseline + i * lineHeight)); }
      if (caretOn) { const line = lines[caretLine], x = inputX + ctx.measureText(text.slice(line.start, caret)).width; ctx.fillStyle = '#e5e7eb'; ctx.fillRect(x + 1, baseline + (caretLine - first) * lineHeight - font * 0.8, Math.max(2.5, font * 0.075), font); }
      ctx.restore(); ctx.font = `400 ${Math.round(0.0038 * px)}px ${TERMINAL_FONT}`; ctx.fillStyle = '#737078';
      ctx.fillText('? for shortcuts   ·   Claude Code   ·   Enter to send / Shift+Enter for a new line', margin + 0.006 * px, canvas.height - 0.0038 * px);
      const glyphs = state.lines.join('').replace(/\s/g, '').length;
      state.coverage = Math.min(0.24, glyphs * (PROMPT_FONT_M ** 2 * 0.24) / ((width - 2 * PROMPT_MARGIN_M) * state.promptHeight));
      if (osdAlpha > 0) {
        const w = 0.104 * px, h = 0.032 * px, x = canvas.width - 0.012 * px - w, y = canvas.height - 0.013 * px - h;
        ctx.save(); ctx.globalAlpha = osdAlpha;
        rounded(ctx, x, y, w, h, 0.009 * px); ctx.fillStyle = 'rgba(60,60,66,0.94)'; ctx.fill(); ctx.strokeStyle = '#77757e88'; ctx.stroke();
        const cx = x + 0.013 * px, cy = y + h / 2, unit = 0.003 * px;
        ctx.fillStyle = '#eeeef2'; ctx.beginPath(); ctx.moveTo(cx - unit, cy - unit); ctx.lineTo(cx, cy - unit); ctx.lineTo(cx + 1.4 * unit, cy - 2 * unit); ctx.lineTo(cx + 1.4 * unit, cy + 2 * unit); ctx.lineTo(cx, cy + unit); ctx.lineTo(cx - unit, cy + unit); ctx.closePath(); ctx.fill();
        const volume = useSound.getState().master; ctx.strokeStyle = '#eeeef2'; ctx.lineWidth = 1.7;
        if (volume === 0) { ctx.beginPath(); ctx.moveTo(cx + 2.2 * unit, cy - unit); ctx.lineTo(cx + 4 * unit, cy + unit); ctx.moveTo(cx + 4 * unit, cy - unit); ctx.lineTo(cx + 2.2 * unit, cy + unit); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(cx + unit, cy, 2.7 * unit, -0.7, 0.7); ctx.stroke(); }
        const barX = x + 0.034 * px, barY = cy - 0.0015 * px, barW = w - 0.043 * px, barH = 0.003 * px;
        rounded(ctx, barX, barY, barW, barH, barH / 2); ctx.fillStyle = '#1c1c21'; ctx.fill();
        if (state.osdVolume > 0) { rounded(ctx, barX, barY, Math.max(barH, barW * state.osdVolume), barH, barH / 2); ctx.fillStyle = '#edecf0'; ctx.fill(); }
        ctx.restore();
      }
      resources.footerTexture.needsUpdate = true;
    }
    if (light.current) {
      const flare = since >= 0 && since < 150 ? settings.textFlare * Math.exp(-since / 45) : 0;
      light.current.intensity = lightEnabled && settings.textLightEnabled ? settings.textIntensity * state.coverage + flare : 0;
      // A zero-intensity LTC area light still costs a full lighting evaluation
      // on every surface pixel. Omit it while the prompt is dark/disabled.
      light.current.visible = light.current.intensity > 0;
      light.current.height = state.promptHeight;
      light.current.position.y = 0.003 - height / 2 + PROMPT_BOTTOM_M + state.promptHeight / 2;
    }
  });
  return <>
    <mesh name="monitor-typing" geometry={resources.geometry} material={resources.material} position={[0, 0.003, 0.0004]} renderOrder={1} />
    <mesh name="monitor-prompt" geometry={resources.footerGeometry} material={resources.footerMaterial} position={[0, 0.003 - height / 2 + resources.footerHeight / 2, 0.0007]} renderOrder={2} />
    <rectAreaLight ref={light} name="screen-text-light" width={width - 2 * PROMPT_MARGIN_M} height={0.026} position={[0, -height / 2 + 0.027, 0.001]} rotation={[0, Math.PI, 0]} color={TERMINAL_INK} intensity={0} />
  </>;
}
