import { ShaderMaterial, Vector2 } from 'three';
import type { DepthTexture, PerspectiveCamera, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { QualityTier } from '../quality';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

// Paired Vogel points: a circular, balanced footprint without axial rings or
// temporal noise. Depth and color always sample the same texel center.
const makeDisk = (pairs: number) => Array.from({ length: pairs }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / pairs), a = i * 2.39996323;
  return [new Vector2(Math.cos(a) * r, Math.sin(a) * r), new Vector2(-Math.cos(a) * r, -Math.sin(a) * r)];
}).flat();
const disk = makeDisk(8), mediumDisk = [...makeDisk(4), ...Array.from({length:8},()=>new Vector2())];
export class DepthAwareDoFPass extends Pass {
  depthTexture: DepthTexture | null = null;
  material = new ShaderMaterial({
    name: 'DepthAwareDoF', depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { tColor: { value: null }, tDepth: { value: null }, resolution: { value: new Vector2(1, 1) }, nearClip: { value: 0.008 }, farClip: { value: 25 },
      focus: { value: 1.35 }, focalRange: { value: 0.38 }, bokehScale: { value: 1 }, gatherCount: { value: 16 }, disk: { value: disk } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: /* glsl */`
      #include <packing>
      varying vec2 vUv;
      uniform sampler2D tColor, tDepth;
      uniform vec2 resolution, disk[16];
      uniform float nearClip, farClip, focus, focalRange, bokehScale;
      uniform int gatherCount;
      float depthAt(vec2 uv) {return -perspectiveDepthToViewZ(texture2D(tDepth,uv).r,nearClip,farClip);}
      float coc(float z) {
        float d=z-focus;
        return sign(d)*min(max(abs(d)-focalRange*0.5,0.0)*0.016,0.0048)*resolution.x*bokehScale;
      }
      vec2 texel(vec2 uv){return (floor(clamp(uv,vec2(0.0),vec2(0.999999))*resolution)+0.5)/resolution;}
      void main(){
        vec3 sharp=texture2D(tColor,vUv).rgb;
        float z=depthAt(vUv), c=coc(z), maxRadius=resolution.x*0.0048*bokehScale;
        // Look for a near blur footprint even on an otherwise sharp receiver.
        // Far blur is NEVER allowed to paint over a focused silhouette.
        float nearRadius=max(-c,0.0);
        for(int i=0;i<8;i++){
          float a=float(i)*0.785398163;
          vec2 p=texel(vUv+vec2(cos(a),sin(a))*maxRadius/resolution);
          nearRadius=max(nearRadius,-coc(depthAt(p)));
        }
        if(abs(c)<0.5 && nearRadius<0.5){gl_FragColor=vec4(sharp,1.0);return;}
        float radius=max(abs(c),nearRadius), tolerance=max(0.002,z*0.001);
        vec3 farSum=sharp, nearSum=vec3(0.0);
        float farWeight=1.0, nearWeight=0.0;
        for(int i=0;i<16;i++){
          if(i>=gatherCount)break;
          vec2 offset=disk[i]*radius, uv=texel(vUv+offset/resolution);
          float sz=depthAt(uv), sc=coc(sz), r=length(offset);
          vec3 color=texture2D(tColor,uv).rgb;
          // Reject nearer objects from the far gather, including their sharp
          // antialiased silhouettes. No color-only blur across depth edges.
          float wf=c>0.5 && sz>=z-tolerance ? 1.0-smoothstep(max(0.0,c*0.85),c+0.5,r) : 0.0;
          farSum+=color*wf; farWeight+=wf;
          float wn=sc< -0.5 && sz<=z+tolerance ? 1.0-smoothstep(-sc*0.85,-sc+0.5,r) : 0.0;
          nearSum+=color*wn; nearWeight+=wn;
        }
        vec3 base=farSum/farWeight;
        // Premultiplied near coverage may overlap a farther receiver softly,
        // while the background is unable to contaminate the near layer.
        float coverage=clamp(nearWeight/(float(gatherCount)*0.8125),0.0,1.0);
        gl_FragColor=vec4(mix(base,nearSum/max(nearWeight,0.00001),coverage),1.0);
      }`,
  });
  private quad = new FullScreenQuad(this.material);
  constructor(private camera: PerspectiveCamera) { super(); }
  setQuality(tier: QualityTier) { this.material.uniforms.gatherCount.value=tier==='medium'?8:16; this.material.uniforms.disk.value=tier==='medium'?mediumDisk:disk; }
  setSize(width: number, height: number) { this.material.uniforms.resolution.value.set(width, height); }
  render(renderer: WebGLRenderer, write: WebGLRenderTarget, read: WebGLRenderTarget) {
    this.material.uniforms.tColor.value = read.texture;
    this.material.uniforms.tDepth.value = this.depthTexture;
    this.material.uniforms.nearClip.value = this.camera.near;
    this.material.uniforms.farClip.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : write); this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); }
}
