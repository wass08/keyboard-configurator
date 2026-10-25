import type { Material, WebGLRenderer } from 'three';
import type { Pass } from 'three/addons/postprocessing/Pass.js';

interface TimerExtension { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }
type Pending = { query: WebGLQuery; label: string; frame: number };
let current: PassProfiler | null = null;
const captureWork = new Map<string,()=>unknown>();
export function registerGpuWork(label: string, work: ()=>unknown) {captureWork.set(label,work);return ()=>{if(captureWork.get(label)===work)captureWork.delete(label);};}
/** Diagnostics only: directly bracket one selected pass per frame. CPU/FPS
 * measurements run separately without GPU barriers or query overhead. */
export function profileGpu<T>(label: string, work: () => T): T {
  return current?.enabled ? current.scope(label, work) : work();
}
export const cpuProfiling = () => Boolean(current?.enabled);
export function profileCpu<T>(label: string, work: () => T): T { return current?.enabled ? current.cpuScope(label,work) : work(); }
export class PassProfiler {
  enabled = false;
  private gl: WebGL2RenderingContext;
  private extension: TimerExtension | null = null;
  private pending: Pending[] = [];
  private values: Record<string, number[]> = {};
  private cpu: Record<string, number[]> = {};
  private frames = new Map<number, { pending: number; done: boolean; values: Record<string, number> }>();
  private frame = 0;
  private target = 'frame';
  get offscreenFrame() { return this.enabled && this.target === 'frame.offscreen'; }
  private phase = '';
  private sampled = false;
  private active: Pending | null = null;
  private cpuStart = 0;
  private isolatedWork: (() => unknown) | null = null;
  private renderer: WebGLRenderer;
  private restore: (() => void)[] = [];
  private materials = new Map<Material, string>();
  private software = false;
  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    const render = renderer.render, shadow = renderer.shadowMap.render;
    renderer.render = (object, camera) => {
      if(!this.enabled)return render.call(renderer,object,camera);
      const label = this.materials.get((object as unknown as { material: Material }).material);
      const material = (object as unknown as { material: { uniforms?: { direction?: { value: { x: number } } } } }).material;
      const direction = material?.uniforms?.direction?.value;
      const name = label && direction ? `${label}.${direction.x ? 'x' : 'y'}` : label ?? (this.phase === 'scene' || this.phase === 'scene.withResolve' ? 'mainScene' : undefined);
      if (name && this.enabled && name === this.target && !this.isolatedWork) {
        const target = renderer.getRenderTarget();
        const mesh = object as unknown as { material: Material }, savedMaterial = mesh.material;
        const uniforms = (savedMaterial as Material & { uniforms?: Record<string, { value: unknown }> })?.uniforms;
        const saved = Object.fromEntries(Object.entries(uniforms ?? {}).map(([key, u]) => [key, u.value && typeof u.value === 'object' && 'clone' in u.value && !('isTexture' in u.value) ? (u.value as {clone:()=>unknown}).clone() : u.value]));
        this.isolatedWork = () => {
          const previous = mesh.material; mesh.material = savedMaterial;
          for (const [key, value] of Object.entries(saved)) uniforms![key].value = value;
          renderer.setRenderTarget(target);
          try { render.call(renderer, object, camera); } finally { mesh.material = previous; }
        };
      }
      return name && this.enabled ? this.scope(name, () => render.call(renderer, object, camera)) : render.call(renderer, object, camera);
    };
    renderer.shadowMap.render = (...args) => {
      const map = renderer.shadowMap;
      if (this.enabled && map.enabled && (map.autoUpdate || map.needsUpdate)) {
        // Three reuses this array for the dust-layer render later in the frame.
        // Retain the actual shadow lights for isolated diagnostic draws.
        const stable = [...args] as Parameters<typeof shadow>; stable[0]=args[0].slice();
        return this.scope('shadowMap', () => shadow.apply(map, stable));
      }
      return shadow.apply(map, args);
    };
    this.restore.push(() => { renderer.render = render; renderer.shadowMap.render = shadow; });
  }
  material(label: string, material: Material) { this.materials.set(material, label); }
  start(target = 'frame') {
    this.target = target; this.isolatedWork = null;
    if(target==='shadowMap')this.renderer.shadowMap.needsUpdate=true;
    this.stopQuery(); this.pending.forEach(item => this.gl.deleteQuery(item.query)); this.pending = [];
    this.extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const info = this.gl.getExtension('WEBGL_debug_renderer_info');
    this.software = Boolean(info && /SwiftShader/.test(this.gl.getParameter(info.UNMASKED_RENDERER_WEBGL)));
    this.values = {}; this.cpu = {}; this.frames.clear(); this.frame = 0; this.enabled = true; current = this;
  }
  private startQuery(label: string) {
    if (!this.extension || !label || this.pending.length > 2048) return;
    const query = this.gl.createQuery();
    if (query) { this.active = { query, label, frame: this.frame }; this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query); }
  }
  private stopQuery() {
    if (!this.active) return;
    this.gl.endQuery(this.extension!.TIME_ELAPSED_EXT);
    const bucket = this.frames.get(this.frame);
    if (bucket) bucket.pending++;
    this.pending.push(this.active); this.active = null;
  }
  scope<T>(label: string, work: () => T): T {
    if (!this.enabled) return work();
    const parent = this.phase; this.phase = label;
    if (label === this.target && label !== 'frame' && !this.isolatedWork) {
      const target = this.renderer.getRenderTarget();
      this.isolatedWork = () => { this.renderer.setRenderTarget(label==='shadowMap'?null:target); if(label==='shadowMap')this.renderer.shadowMap.needsUpdate=true; return work(); };
    }
    const start = performance.now();
    // Metal's multiple elapsed queries in one command buffer are cumulative,
    // not disjoint. Native diagnostics submit only the selected pass per
    // frame, with frozen real inputs. SwiftShader supports disjoint scopes
    // within the real chain; validate that mode on that backend only.
    const detailed = this.target === 'all' && this.software && /^(mainScene|scene.resolve|bloom\..*|depthOfField|dustAfterDoF|gradingAndOutput)$/.test(label);
    const measure = !this.active && (detailed || (label === this.target && !this.sampled));
    if (measure) { if (!detailed) this.sampled = true; this.startQuery(label); }
    try { return work(); }
    finally { if (measure) { this.stopQuery(); this.gl.flush(); } (this.cpu[label] ??= []).push(performance.now() - start); this.phase = parent; }
  }
  cpuScope<T>(label: string, work: () => T): T { const start=performance.now(); try {return work();} finally {(this.cpu[label]??=[]).push(performance.now()-start);} }
  wrap(label: string, pass: Pass) {
    const render = pass.render;
    pass.render = (...args) => this.enabled ? this.scope(label, () => render.apply(pass, args)) : render.apply(pass,args);
  }
  renderFrame(render: () => void) {
    // Prime real inputs once, then bracket that exact pass alone on following
    // frames. Metal starts elapsed counters at command-buffer boundaries;
    // isolating submission avoids attributing preceding draws to every pass.
    // No effect toggles, substituted shaders or lower-resolution inputs.
    // Shadow rendering needs WebGLRenderer's active render-state stack.
    // Bracket it in the real chain and explicitly request each update.
    if(this.enabled&&this.target==='shadowMap'){this.renderer.shadowMap.needsUpdate=true;render();return;}
    if(this.enabled && captureWork.has(this.target))this.isolatedWork=captureWork.get(this.target)!;
    if (this.enabled && this.target !== 'frame' && this.target !== 'frame.offscreen' && this.target !== 'all' && this.isolatedWork) this.scope(this.target, this.isolatedWork);
    else render();
  }
  beginFrame() {
    if (!this.enabled) return;
    this.sampled = false; this.cpuStart = performance.now(); this.frames.set(this.frame, { pending: 0, done: false, values: {} });
    if (this.target === 'frame' || this.target === 'frame.offscreen') { this.sampled = true; this.startQuery(this.target); }
  }
  endFrame() {
    if (!this.enabled) return;
    this.stopQuery(); if(this.target!=='cpu')this.gl.flush(); this.frames.get(this.frame)!.done = true;
    (this.cpu.frame ??= []).push(performance.now() - this.cpuStart);
  }
  poll() {
    if (this.extension && this.pending.length) {
      const gl = this.gl, disjoint = gl.getParameter(this.extension.GPU_DISJOINT_EXT);
      this.pending = this.pending.filter(item => {
        if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
        const bucket = this.frames.get(item.frame);
        if (bucket) {
          bucket.pending--;
          if (!disjoint) bucket.values[item.label] = (bucket.values[item.label] ?? 0) + gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6;
        }
        gl.deleteQuery(item.query); return false;
      });
      for (const [id, bucket] of this.frames) if (bucket.done && !bucket.pending) {
        for (const [label, value] of Object.entries(bucket.values)) { (this.values[label] ??= []).push(value); }
        if (this.target === 'all') (this.values.frame ??= []).push(Object.values(bucket.values).reduce((sum,value)=>sum+value,0));
        this.frames.delete(id);
      }
    }
    for(const [id,bucket] of this.frames)if(bucket.done&&!bucket.pending&&!Object.keys(bucket.values).length)this.frames.delete(id);
    this.frame++;
  }
  report() {
    const summary = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { samples: sorted.length, meanMs: values.reduce((sum,v)=>sum+v,0)/Math.max(1,values.length), medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0 };
    };
    return { method: this.extension ? (this.target === 'all' ? 'Direct non-overlapping elapsed scopes in real chain (SwiftShader); frame = segment sum' : 'Direct elapsed scope, isolated pass submission with frozen real inputs; Metal driver-reported durations can include encoder scheduling') : 'CPU submission only (GPU extension unavailable)', pending: this.pending.length, contextLost:this.gl.isContextLost(),
      gpu: Object.fromEntries(Object.entries(this.values).map(([key, values]) => [key, summary(values)])), cpu: Object.fromEntries(Object.entries(this.cpu).map(([key, values]) => [key, summary(values)])) };
  }
  dispose() { this.enabled = false; if (current === this) current = null; this.stopQuery(); this.pending.forEach(item => this.gl.deleteQuery(item.query)); this.pending = []; this.restore.reverse().forEach(restore => restore()); }
}
