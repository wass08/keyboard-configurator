import { DataUtils } from 'three';
import type { WebGLRenderer, WebGLRenderTarget } from 'three';

export interface FacePoint { key: string; x: number; y: number }
export interface LinearSample extends FacePoint { rgb: number[]; luminance: number }
/** Requested captures only. Read the real HDR buffers, before tone mapping;
 * no readbacks, allocations or extra draws in ordinary viewing. */
export class HighlightAudit {
  private pending: { points: FacePoint[]; resolve: (samples: Record<string, LinearSample[]>) => void; samples: Record<string, LinearSample[]> } | null = null;
  request(points: FacePoint[]) {
    if (this.pending) throw new Error('A highlight audit is already pending');
    return new Promise<Record<string, LinearSample[]>>(resolve => { this.pending = { points, resolve, samples: {} }; });
  }
  capture(stage: string, renderer: WebGLRenderer, target: WebGLRenderTarget) {
    if (!this.pending) return;
    const { points, samples } = this.pending, w = target.width, h = target.height;
    const coordinates = points.map(p => [Math.max(0, Math.min(w - 1, Math.floor(p.x * w))), Math.max(0, Math.min(h - 1, Math.floor((1 - p.y) * h)))]);
    const x0 = Math.min(...coordinates.map(p => p[0])), y0 = Math.min(...coordinates.map(p => p[1]));
    const width = Math.max(...coordinates.map(p => p[0])) - x0 + 1, height = Math.max(...coordinates.map(p => p[1])) - y0 + 1;
    const pixels = new Uint16Array(width * height * 4);
    renderer.readRenderTargetPixels(target, x0, y0, width, height, pixels);
    samples[stage] = points.map((p, i) => {
      const offset = ((coordinates[i][1] - y0) * width + coordinates[i][0] - x0) * 4;
      const rgb = [0, 1, 2].map(c => DataUtils.fromHalfFloat(pixels[offset + c]));
      return { ...p, rgb, luminance: rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 };
    });
  }
  finish() { if (this.pending) { const { resolve, samples } = this.pending; this.pending = null; resolve(samples); } }
}
