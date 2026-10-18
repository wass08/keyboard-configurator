import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, LinearMipmapLinearFilter, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { useOwnedDisposal } from '../resources/ownership';
import { typing } from './typing';

// Physical layout on the 598 x 336 mm panel. The hero camera sees only the
// bottom ~40 mm of the screen above the keyboard, so the page is
// bottom-anchored like a typewriter: the current line sits just above the
// bezel, older lines scroll up the (otherwise empty) page.
const MARGIN_X = 0.042, BASELINE_FROM_BOTTOM = 0.0125, FONT_SIZE = 0.0128, LINE_HEIGHT = 0.0195, TOP_MARGIN = 0.03;
const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const INK = 'rgba(28, 33, 44, 0.86)', PLACEHOLDER = 'rgba(28, 33, 44, 0.36)', CARET = 'rgba(52, 86, 140, 0.92)';
const BLINK_MS = 530, SOLID_AFTER_EDIT_MS = 600;
export const PLACEHOLDER_TEXT = 'Start typing…';

interface Line { start: number; end: number }
function wrap(measure: (s: string) => number, text: string, maxWidth: number): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  for (const paragraph of text.split('\n')) {
    let start = 0;
    for (;;) {
      if (measure(paragraph.slice(start)) <= maxWidth) { lines.push({ start: offset + start, end: offset + paragraph.length }); break; }
      // Longest fitting prefix, then back up to a space (soft word wrap).
      let lo = start + 1, hi = paragraph.length;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (measure(paragraph.slice(start, mid)) <= maxWidth) lo = mid; else hi = mid - 1; }
      const space = paragraph.lastIndexOf(' ', lo);
      const end = space > start ? space + 1 : lo;
      lines.push({ start: offset + start, end: offset + end });
      start = end;
    }
    offset += paragraph.length + 1;
  }
  return lines;
}
const lineOf = (lines: Line[], caret: number) => { let index = 0; for (let i = 0; i < lines.length; i++) if (lines[i].start <= caret) index = i; return index; };

export function ScreenText({ width, height, radiance }: { width: number; height: number; radiance: number }) {
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920; canvas.height = Math.round(1920 * height / width);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace; texture.anisotropy = 8; texture.minFilter = LinearMipmapLinearFilter;
    // Same LCD radiance as the wallpaper beneath; transparent everywhere but the ink.
    const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, color: new Color('#ffffff').multiplyScalar(radiance) });
    return { canvas, context: canvas.getContext('2d')!, texture, material, geometry: new PlaneGeometry(width, height) };
  }, [width, height, radiance]);
  useOwnedDisposal('Monitor.Typing', [resources.texture, resources.material, resources.geometry]);
  const drawn = useRef({ version: -1, caretOn: false, redraws: 0, lines: [] as string[] });

  useEffect(() => {
    const { context: ctx, canvas } = resources;
    const px = canvas.width / width;
    const font = `400 ${Math.round(FONT_SIZE * px)}px ${FONT_FAMILY}`;
    const measure = (s: string) => { ctx.font = font; return ctx.measureText(s).width; };
    const maxWidth = (width - 2 * MARGIN_X) * px;
    typing.setVerticalResolver((caret, direction) => {
      const text = typing.text, lines = wrap(measure, text, maxWidth), index = lineOf(lines, caret), target = index + direction;
      if (target < 0) return 0;
      if (target >= lines.length) return text.length;
      const x = measure(text.slice(lines[index].start, caret)), line = lines[target];
      let best = line.start, distance = Infinity;
      const last = target < lines.length - 1 && lines[target + 1].start === line.end ? line.end - 1 : line.end;
      for (let i = line.start; i <= last; i++) {
        const d = Math.abs(measure(text.slice(line.start, i)) - x);
        if (d < distance) { distance = d; best = i; }
      }
      return best;
    });
    window.__screen = () => ({ redraws: drawn.current.redraws, text: typing.text, caret: typing.caret, lines: drawn.current.lines.slice(), canvas: [canvas.width, canvas.height], fontPx: Math.round(FONT_SIZE * px) });
    return () => { typing.setVerticalResolver(null); delete window.__screen; };
  }, [resources, width]);

  useFrame(() => {
    const now = performance.now(), since = now - typing.editedAt;
    // Solid while typing, then ~1 Hz blink: at most two redraws per idle second.
    const caretOn = since < SOLID_AFTER_EDIT_MS || Math.floor((since - SOLID_AFTER_EDIT_MS) / BLINK_MS) % 2 === 1;
    const state = drawn.current;
    if (state.version === typing.version && state.caretOn === caretOn) return;
    state.version = typing.version; state.caretOn = caretOn; state.redraws++;
    const { context: ctx, canvas, texture } = resources;
    const px = canvas.width / width, text = typing.text, caret = typing.caret;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `400 ${Math.round(FONT_SIZE * px)}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'alphabetic';
    const measure = (s: string) => ctx.measureText(s).width;
    const left = MARGIN_X * px, baseline = canvas.height - BASELINE_FROM_BOTTOM * px, lineHeight = LINE_HEIGHT * px;
    const visible = Math.max(1, Math.floor((canvas.height - BASELINE_FROM_BOTTOM * px - TOP_MARGIN * px) / lineHeight) + 1);
    const lines = wrap(measure, text, (width - 2 * MARGIN_X) * px);
    const caretLine = lineOf(lines, caret);
    // Keep the caret's line on the page; otherwise show the newest lines.
    const bottom = Math.max(caretLine, Math.min(lines.length - 1, caretLine + visible - 1));
    state.lines = [];
    if (!text) {
      ctx.fillStyle = PLACEHOLDER; ctx.fillText(PLACEHOLDER_TEXT, left, baseline);
    } else {
      ctx.fillStyle = INK;
      for (let k = 0; k < visible && bottom - k >= 0; k++) {
        const line = lines[bottom - k], content = text.slice(line.start, line.end);
        ctx.fillText(content, left, baseline - k * lineHeight);
        state.lines.unshift(content);
      }
    }
    if (caretOn) {
      const line = lines[caretLine] ?? { start: 0, end: 0 };
      const x = left + measure(text.slice(line.start, caret)), y = baseline - (bottom - caretLine) * lineHeight;
      const size = FONT_SIZE * px;
      ctx.fillStyle = CARET; ctx.fillRect(Math.round(x + 1), y - size * 0.86, Math.max(2, Math.round(size * 0.075)), size * 1.06);
    }
    texture.needsUpdate = true;
  });

  return <mesh name="monitor-typing" geometry={resources.geometry} material={resources.material} position={[0, 0.003, 0.0004]} renderOrder={1} />;
}
