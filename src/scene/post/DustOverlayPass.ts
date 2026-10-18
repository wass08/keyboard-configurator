import { Vector2 } from 'three';
import type { PerspectiveCamera, Points, Scene, ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import type { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { DUST_LAYER } from '../film';

/** Composite a single Points draw AFTER lens blur. The same sprite shader
 * supplies its own soft circle of confusion; the scene still occludes it. */
export class DustOverlayPass extends Pass {
  private bufferSize = new Vector2();
  constructor(private scene: Scene, private camera: PerspectiveCamera, private depth: BokehPass) { super(); this.needsSwap = false; }
  render(renderer: WebGLRenderer, _write: WebGLRenderTarget, read: WebGLRenderTarget) {
    const dust = this.scene.getObjectByName('dust-motes') as Points | undefined;
    if (!dust?.visible) return;
    const material = dust.material as ShaderMaterial;
    const depthTarget = (this.depth as unknown as { _renderTargetDepth: WebGLRenderTarget })._renderTargetDepth;
    material.uniforms.uSceneDepth.value = depthTarget.texture;
    material.uniforms.uUseSceneDepth.value = this.depth.enabled;
    material.uniforms.uViewport.value.copy(renderer.getDrawingBufferSize(this.bufferSize));
    material.uniforms.uCameraNear.value = this.camera.near;
    material.uniforms.uCameraFar.value = this.camera.far;
    // Without DoF the original scene depth is still attached to readBuffer.
    // With DoF, readBuffer has swapped: sample its cached encoded depth instead.
    material.depthTest = !this.depth.enabled;
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
