import { Vector3 } from 'three';
import type { ToneMapping, WebGLRenderer, WebGLRenderTarget } from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OutputShader } from 'three/addons/shaders/OutputShader.js';
import { TONE_OPERATORS } from '../film';
import type { LightingSettings } from '../lightingControls';

const grade = /* glsl */`
uniform bool gradeEnabled;
uniform float contrast, saturation, vibrance, temperature, tint, vignetteAmount, vignetteSoftness;
uniform vec3 lift, gamma, gain;
vec3 gradeColor(vec3 c) {
  c *= exp2(vec3(temperature * 0.3 + tint * 0.1, -tint * 0.1, -temperature * 0.3 + tint * 0.1));
  c = max(vec3(0.0), c + lift) * gain;
  c = pow(max(c, vec3(0.0)), 1.0 / max(gamma, vec3(0.05)));
  c = max(vec3(0.0), (c - 0.18) * contrast + 0.18);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float colorfulness = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  return max(vec3(0.0), mix(vec3(luma), c, saturation + vibrance * (1.0 - clamp(colorfulness, 0.0, 1.0))));
}
`;

/** One final fullscreen pass: linear grading, ONE tone map, vignette, sRGB.
 * The renderer remains NoToneMapping during every scene/offscreen render. */
export class FilmOutputPass extends OutputPass {
  operator: ToneMapping = TONE_OPERATORS.Neutral;
  reference = false;
  private fragment: string;
  constructor() {
    super(); this.material.name = 'FilmOutput';
    Object.assign(this.uniforms, {
      gradeEnabled: { value: true }, contrast: { value: 1 }, saturation: { value: 1 }, vibrance: { value: 0 }, temperature: { value: 0 }, tint: { value: 0 },
      lift: { value: new Vector3() }, gamma: { value: new Vector3(1, 1, 1) }, gain: { value: new Vector3(1, 1, 1) }, vignetteAmount: { value: 0 }, vignetteSoftness: { value: 0.65 },
    });
    this.fragment = OutputShader.fragmentShader
      .replace('void main() {', `${grade}\nvoid main() {`)
      .replace('// tone mapping', 'if (gradeEnabled) gl_FragColor.rgb = gradeColor(gl_FragColor.rgb);\n// tone mapping')
      .replace('// color space', `if (gradeEnabled && vignetteAmount > 0.0) {
        float radius = length((vUv - 0.5) * 1.41421356);
        gl_FragColor.rgb *= 1.0 - vignetteAmount * smoothstep(1.0 - vignetteSoftness, 1.0, radius);
      }\n// color space`);
    this.material.fragmentShader = this.fragment; this.material.toneMapped = false;
  }
  configure(s: LightingSettings) {
    this.operator = TONE_OPERATORS[s.toneOperator as keyof typeof TONE_OPERATORS] ?? TONE_OPERATORS.Neutral;
    for (const key of ['gradeEnabled', 'contrast', 'saturation', 'vibrance', 'temperature', 'tint', 'vignetteAmount', 'vignetteSoftness'] as const) this.uniforms[key].value = s[key];
    for (const key of ['lift', 'gamma', 'gain'] as const) this.uniforms[key].value.set(s[key].x, s[key].y, s[key].z);
    // Neutral grading is a bit-identical bypass, including pow/gamma roundoff.
    const identity = s.contrast === 1 && s.saturation === 1 && s.vibrance === 0 && s.temperature === 0 && s.tint === 0 &&
      s.lift.x === 0 && s.lift.y === 0 && s.lift.z === 0 && s.gamma.x === 1 && s.gamma.y === 1 && s.gamma.z === 1 &&
      s.gain.x === 1 && s.gain.y === 1 && s.gain.z === 1 && s.vignetteAmount === 0;
    this.uniforms.gradeEnabled.value = s.gradeEnabled && !identity;
  }
  useReference(value: boolean) {
    this.reference = value;
    this.material.fragmentShader = value ? OutputShader.fragmentShader : this.fragment; this.material.needsUpdate = true;
  }
  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, delta: number, mask: boolean) {
    const previous = renderer.toneMapping;
    // OutputPass selects its explicit RawShaderMaterial defines from this
    // setting. Raw shaders never receive a second injected tone-map call.
    renderer.toneMapping = this.operator;
    try { super.render(renderer, writeBuffer, readBuffer, delta, mask); }
    finally { renderer.toneMapping = previous; }
  }
}
