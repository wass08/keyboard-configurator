import { DepthTexture, HalfFloatType, MeshBasicMaterial, UnsignedIntType, WebGLRenderTarget } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

/** MSAA belongs to geometry, not every later fullscreen pass. Resolve scene
 * color once into single-sample composer buffers and share its native depth. */
export class SceneResolvePass extends Pass {
  target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4, depthTexture: new DepthTexture(1, 1, UnsignedIntType) });
  material = new MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false, toneMapped: false });
  private quad = new FullScreenQuad(this.material);
  constructor(private scene: Scene, private camera: Camera) { super(); this.needsSwap = false; }
  setSize(width: number, height: number) { this.target.setSize(width, height); }
  render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget) {
    renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(this.scene, this.camera);
    // setRenderTarget resolves the color and depth attachments on WebGL2.
    renderer.setRenderTarget(read); this.quad.render(renderer);
  }
  dispose() { this.target.dispose(); this.material.dispose(); }
}
