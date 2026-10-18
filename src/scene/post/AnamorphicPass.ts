import { Color, HalfFloatType, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three';
import type { WebGLRenderer } from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import type { LightingSettings } from '../lightingControls';

const vertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
/** WebGL port of the example's threshold → weighted horizontal taps → tint.
 * Three short convolutions at quarter resolution replace its 80 wide taps. */
export class AnamorphicPass extends Pass {
  audit?: (stage: string, renderer: WebGLRenderer, target: WebGLRenderTarget) => void;
  private a = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  private b = this.a.clone();
  private high = new ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, vertexShader: vertex,
    uniforms: { tInput: { value: null }, threshold: { value: 1.6 }, texel: { value: new Vector2() } },
    fragmentShader: `varying vec2 vUv; uniform sampler2D tInput; uniform float threshold; uniform vec2 texel;
      void main() {
        vec3 c = texture2D(tInput, vUv).rgb;
        c = max(c, texture2D(tInput, vUv + texel * vec2(-0.5, -0.5)).rgb);
        c = max(c, texture2D(tInput, vUv + texel * vec2(0.5, 0.5)).rgb);
        float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float energy = max(luminance - threshold, 0.0) / max(luminance, 1e-5);
        gl_FragColor = vec4(c * energy, 1.0);
      }` });
  private blur = new ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, vertexShader: vertex,
    uniforms: { tInput: { value: null }, radius: { value: 0.01 }, samples: { value: 16 } },
    fragmentShader: `varying vec2 vUv; uniform sampler2D tInput; uniform float radius; uniform int samples;
      void main() {
        vec3 sum = vec3(0.0); float weight = 0.0;
        for (int i = 0; i < 32; i++) {
          if (i >= samples) break;
          float offset = (float(i) + 0.5) / float(samples) * 2.0 - 1.0;
          float w = pow(1.0 - abs(offset), 2.0);
          sum += texture2D(tInput, clamp(vUv + vec2(offset * radius, 0.0), vec2(0.0), vec2(1.0))).rgb * w;
          weight += w;
        }
        gl_FragColor = vec4(sum / weight, 1.0);
      }` });
  private composite = new ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, vertexShader: vertex,
    uniforms: { tInput: { value: null }, tFlare: { value: this.b.texture }, tint: { value: new Color() }, intensity: { value: 0.12 } },
    fragmentShader: `varying vec2 vUv; uniform sampler2D tInput, tFlare; uniform vec3 tint; uniform float intensity;
      void main() { vec4 c = texture2D(tInput, vUv); gl_FragColor = vec4(c.rgb + texture2D(tFlare, vUv).rgb * tint * intensity, c.a); }` });
  private quad = new FullScreenQuad();
  private width = 1;
  private height = 1;
  private resolution = 0.25;
  private length = 0.12;
  readonly resources = [this.a, this.b, this.high, this.blur, this.composite];
  constructor() { super(); this.a.texture.name = 'Anamorphic.high'; this.b.texture.name = 'Anamorphic.streaks'; }
  configure(s: LightingSettings) {
    this.enabled = s.anamorphicEnabled && s.anamorphicIntensity > 0;
    this.high.uniforms.threshold.value = s.anamorphicThreshold;
    this.blur.uniforms.samples.value = Math.max(8, Math.min(32, Math.round(s.anamorphicSamples)));
    this.composite.uniforms.tint.value.set(s.anamorphicTint); this.composite.uniforms.intensity.value = s.anamorphicIntensity;
    this.length = s.anamorphicLength;
    if (this.resolution !== s.anamorphicResolution) { this.resolution = s.anamorphicResolution; this.setSize(this.width, this.height); }
  }
  setSize(width: number, height: number) {
    this.width = width; this.height = height;
    const w = Math.max(1, Math.round(width * this.resolution)), h = Math.max(1, Math.round(height * this.resolution));
    this.a.setSize(w, h); this.b.setSize(w, h); this.high.uniforms.texel.value.set(1 / width, 1 / height);
  }
  /** Extract from the original scene-linear HDR, never bloom's brighter copy. */
  extract(renderer: WebGLRenderer, readBuffer: WebGLRenderTarget) {
    this.high.uniforms.tInput.value = readBuffer.texture;
    this.quad.material = this.high; renderer.setRenderTarget(this.a); this.quad.render(renderer);
    this.audit?.('anamorphicSeed', renderer, this.a);
    this.quad.material = this.blur;
    let source = this.a, destination = this.b;
    for (const spread of [0.12, 0.3, 0.58]) {
      this.blur.uniforms.tInput.value = source.texture; this.blur.uniforms.radius.value = this.length * 0.5 * spread;
      renderer.setRenderTarget(destination); this.quad.render(renderer); [source, destination] = [destination, source];
    }
    this.audit?.('anamorphicStreaks', renderer, source);
  }
  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    this.composite.uniforms.tInput.value = readBuffer.texture; this.composite.uniforms.tFlare.value = this.b.texture;
    this.quad.material = this.composite; renderer.setRenderTarget(writeBuffer); this.quad.render(renderer);
  }
}
