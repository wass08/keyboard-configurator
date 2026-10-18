import { FloatType, HalfFloatType, RedFormat, RGFormat } from 'three';
import type { Mesh, Scene, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';

/** Explicit diagnostics only. Byte estimates cover identified textures and
 * target attachments; driver caches/default framebuffers aren't observable. */
export function renderMetrics(gl: WebGLRenderer, scene: Scene, targets: WebGLRenderTarget[]) {
  const textures = new Set<Texture>();
  scene.traverse(object => {
    const mesh = object as Mesh;
    for (const material of mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : [])
      for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as Texture);
  });
  if (scene.environment) textures.add(scene.environment);
  for (const target of targets) { for (const texture of target.textures) textures.add(texture); if (target.depthTexture) textures.add(target.depthTexture); }
  let textureBytes = 0, multisampleBytes = 0;
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const bytes = texture.type === FloatType ? 4 : texture.type === HalfFloatType ? 2 : 1;
    const channels = texture.format === RedFormat ? 1 : texture.format === RGFormat ? 2 : 4;
    textureBytes += (image?.width ?? 0) * (image?.height ?? 0) * bytes * channels * (texture.generateMipmaps ? 4 / 3 : 1);
  }
  for (const target of targets) if (target.samples) multisampleBytes += target.width * target.height * target.samples * (8 + (target.depthBuffer ? 4 : 0));
  return { calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs?.length ?? 0, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
    textureBytesEstimate: Math.round(textureBytes), multisampleBytesEstimate: multisampleBytes, identifiedBytesEstimate: Math.round(textureBytes + multisampleBytes),
    buffer: [gl.domElement.width, gl.domElement.height], pixelRatio: gl.getPixelRatio(),
    targetSizes: targets.map(target => ({ size: [target.width, target.height], samples: target.samples })) };
}
