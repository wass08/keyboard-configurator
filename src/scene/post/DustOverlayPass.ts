import { Vector2 } from 'three';
import type { PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import type { DepthAwareDoFPass } from './DepthAwareDoFPass';
import { DUST_LAYER } from '../film';

/** Composite a single Points draw AFTER lens blur. The same sprite shader
 * supplies its own soft circle of confusion; the scene still occludes it. */
export class DustOverlayPass extends Pass {
  private bufferSize = new Vector2();
  constructor(private scene: Scene, private camera: PerspectiveCamera, private depth: DepthAwareDoFPass) { super(); this.needsSwap = false; }
  render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget) {
    const dust = this.scene.getObjectByName('dust-motes') as Points | undefined;
    if (!dust?.visible) return;
    const material = dust.material as ShaderMaterial;
    material.uniforms.uSceneDepth.value = this.depth.depthTexture;
    material.uniforms.uUseSceneDepth.value = true;
    material.uniforms.uViewport.value.copy(renderer.getDrawingBufferSize(this.bufferSize));
    material.uniforms.uCameraNear.value = this.camera.near;
    material.uniforms.uCameraFar.value = this.camera.far;
    // Both optical modes share the native scene depth texture. Composer
    // buffers contain only color, so the sprite shader handles occlusion.
    material.depthTest = false;
    const mask = this.camera.layers.mask, clear = renderer.autoClear, background = this.scene.background, shadows = renderer.shadowMap.enabled;
    try {
      this.camera.layers.set(DUST_LAYER); this.scene.background = null;
      renderer.autoClear = false; renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(read); renderer.render(this.scene, this.camera);
    } finally {
      this.camera.layers.mask = mask; this.scene.background = background;
      renderer.autoClear = clear; renderer.shadowMap.enabled = shadows;
    }
  }
}
