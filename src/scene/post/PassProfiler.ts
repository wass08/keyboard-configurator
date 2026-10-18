import type { WebGLRenderer } from 'three';
import type { Pass } from 'three/addons/postprocessing/Pass.js';

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
/** Optional asynchronous GPU queries. Disabled in ordinary viewing and during
 * FPS sampling. No fences, readbacks, or synchronous GPU waits. */
export class PassProfiler {
  enabled = false;
  private gl: WebGL2RenderingContext;
  private extension: TimerExtension | null = null;
  private pending: { query: WebGLQuery; label: string }[] = [];
  private values: Record<string, number[]> = {};
  private cpu: Record<string, number[]> = {};
  private frame = 0;
  private active: WebGLQuery | null = null;
  constructor(renderer: WebGLRenderer) { this.gl = renderer.getContext() as WebGL2RenderingContext; }
  start() {
    this.extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.values = {}; this.cpu = {}; this.enabled = true;
  }
  wrap(label: string, pass: Pass) {
    const render = pass.render;
    pass.render = (...args) => {
      if (!this.enabled || this.frame % 3 !== 0) { render.apply(pass, args); return; }
      const start = performance.now();
      try { render.apply(pass, args); }
      finally {
        (this.cpu[label] ??= []).push(performance.now() - start);
      }
    };
  }
  // ANGLE/Metal may give every pass the command buffer's entire duration.
  // Query whole frames instead; effect costs come from enabled/disabled A/Bs.
  beginFrame() {
    if (!this.enabled || this.frame % 3 !== 0 || !this.extension || this.pending.length >= 20) return;
    this.active = this.gl.createQuery();
    if (this.active) this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.active);
  }
  endFrame() {
    if (!this.active) return;
    this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);
    this.pending.push({ query: this.active, label: 'frame' }); this.active = null;
  }
  poll() {
    this.frame++;
    if (!this.extension || !this.pending.length) return;
    const gl = this.gl, disjoint = gl.getParameter(this.extension.GPU_DISJOINT_EXT);
    this.pending = this.pending.filter(item => {
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!disjoint) (this.values[item.label] ??= []).push(gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(item.query); return false;
    });
  }
  report() {
    const summary = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0 };
    };
    return { method: this.extension ? 'Whole-frame EXT_disjoint_timer_query_webgl2; effect cost via A/B' : 'CPU submission only', gpu: Object.fromEntries(Object.entries(this.values).map(([key, values]) => [key, summary(values)])), cpu: Object.fromEntries(Object.entries(this.cpu).map(([key, values]) => [key, summary(values)])) };
  }
  dispose() { this.enabled = false; this.pending.forEach(item => this.gl.deleteQuery(item.query)); this.pending = []; }
}
