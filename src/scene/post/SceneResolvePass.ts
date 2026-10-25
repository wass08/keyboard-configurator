import { DepthTexture, HalfFloatType, MeshBasicMaterial, UnsignedIntType, WebGLRenderTarget } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { profileGpu } from './PassProfiler';
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
    // Resolve must follow real draws: an isolated repeated blit of unchanged
    // attachments can be eliminated by the driver and report zero GPU work.
    profileGpu('scene.withResolve', () => {
      renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(read); // Resolve MSAA color and depth on WebGL2.
    });
    this.quad.render(renderer);
  }
  dispose() { this.target.dispose(); this.material.dispose(); }
}
