import { DataTexture, FloatType, HalfFloatType, RGBAFormat, WebGLRenderTarget, DataUtils, NearestFilter } from 'three';
import type { DepthTexture, PerspectiveCamera, WebGLRenderer } from 'three';
import { DepthAwareDoFPass } from './DepthAwareDoFPass';

/** Requested regression fixture, dynamically loaded; never part of a frame. */
export function probeSilhouette(renderer: WebGLRenderer, camera: PerspectiveCamera) {
  const width = 2048, height = 128, edge = 1024, color = new Float32Array(width * height * 4), depth = new Float32Array(color.length);
  const foreground = [0.4, 0.5, 0.6], values: { near: boolean; maxInsideDelta: number; smearBandPx: number; outsideOverlap: number; backgroundContrastRatio: number }[] = [];
  const input = new DataTexture(color, width, height, RGBAFormat, FloatType), depths = new DataTexture(depth, width, height, RGBAFormat, FloatType);
  input.minFilter = input.magFilter = depths.minFilter = depths.magFilter = NearestFilter;
  const output = new WebGLRenderTarget(width, height, { type: HalfFloatType, depthBuffer: false });
  const pass = new DepthAwareDoFPass(camera); pass.depthTexture = depths as unknown as DepthTexture; pass.setSize(width, height);
  pass.material.uniforms.focus.value = 1; pass.material.uniforms.focalRange.value = 0.38; pass.material.uniforms.bokehScale.value = 1;
  const previous = renderer.getRenderTarget();
  try {
    for (const near of [false, true]) {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4, front = x >= edge, z = front ? near ? 0.4 : 1 : 3;
        const rgb = front ? foreground : (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? [0.8, 0.1, 0.05] : [0.05, 0.1, 0.8];
        color.set([...rgb, 1], i); depth.set([camera.far * (z - camera.near) / (z * (camera.far - camera.near)), 0, 0, 1], i);
      }
      input.needsUpdate = depths.needsUpdate = true;
      pass.render(renderer, output, { texture: input } as unknown as WebGLRenderTarget);
      const pixels = new Uint16Array(color.length); renderer.readRenderTargetPixels(output, 0, 0, width, height, pixels);
      let maxInsideDelta = 0, smearBandPx = 0, outsideOverlap = 0, before = 0, after = 0;
      for (let y = 24; y < height - 24; y++) {
        for (let d = 0; d < 20; d++) {
          const i = (y * width + edge + d) * 4;
          const delta = Math.max(...foreground.map((v, c) => Math.abs(v - DataUtils.fromHalfFloat(pixels[i + c]))));
          maxInsideDelta = Math.max(maxInsideDelta, delta); if (delta > 0.003) smearBandPx = Math.max(smearBandPx, d + 1);
        }
        const i = (y * width + edge - 2) * 4;
        outsideOverlap = Math.max(outsideOverlap, Math.abs(color[i + 1] - DataUtils.fromHalfFloat(pixels[i + 1])));
        for (let x = 80; x < 180; x++) { const j = (y * width + x) * 4; before += Math.abs(color[j] - color[j - 4]); after += Math.abs(DataUtils.fromHalfFloat(pixels[j]) - DataUtils.fromHalfFloat(pixels[j - 4])); }
      }
      values.push({ near, maxInsideDelta, smearBandPx, outsideOverlap, backgroundContrastRatio: after / before });
    }
    return { resolution: [width, height], limitPx: 1, cases: values };
  } finally { renderer.setRenderTarget(previous); input.dispose(); depths.dispose(); output.dispose(); pass.dispose(); }
}
