import { DirectionalLight, Group, RectAreaLight, Scene, SpotLight } from 'three';
import type { Camera, Mesh, WebGLRenderer, WebGLRenderTarget } from 'three';

/** Compile the light-count/shadow permutations used by stage transitions.
 * Borrow mesh/material identities, with a separate lights-only target scene:
 * the live scene never flashes through these lighting states. No geometry,
 * textures, shadow maps or clone-owned GPU resources are allocated here. */
export async function prepareStageShaders(gl: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget, cancelled: () => boolean) {
  const meshes = new Group();
  scene.traverse(object => {
    if (!('material' in object)) return;
    // A compile-only proxy retains instancing/skinning/geometry flags and the
    // actual shared materials, without Object3D.clone serializing userData or
    // copying instance buffers. compileAsync never draws or transforms it.
    const proxy = Object.assign(Object.create(Object.getPrototypeOf(object)), object, { children: [], parent: null }) as Mesh;
    meshes.add(proxy);
  });
  for (const [rects, directional, spotShadow] of [[4, 1, 0], [5, 1, 0], [4, 1, 1], [5, 1, 1], [6, 1, 1], [4, 0, 1], [5, 0, 1], [6, 0, 1]]) {
    if (cancelled()) break;
    const lights = new Scene(); lights.environment = scene.environment;
    const spot = new SpotLight(); spot.castShadow = Boolean(spotShadow); lights.add(spot);
    if (directional) { const bare = new DirectionalLight(); bare.castShadow = true; lights.add(bare); }
    for (let i = 0; i < rects; i++) lights.add(new RectAreaLight());
    const previous = gl.getRenderTarget();
    let ready: Promise<unknown>;
    try { gl.setRenderTarget(target); ready = gl.compileAsync(meshes, camera, lights); }
    finally { gl.setRenderTarget(previous); }
    await ready;
    spot.dispose();
    lights.traverse(o => { if (o instanceof DirectionalLight) o.dispose(); });
    lights.clear();
  }
  meshes.clear(); // Borrowed resources stay with their original owners.
}

/** A program compile alone does not upload off-frustum prop geometry or warm
 * the driver's MSAA draw pipelines. Draw every mesh at 1px with both practical
 * light counts before ready, then restore the live scene synchronously. */
export function prepareStageDraws(gl: WebGLRenderer, scene: Scene, camera: Camera, target: WebGLRenderTarget) {
  const visibility = new Map<import('three').Object3D, { visible: boolean; frustumCulled: boolean }>();
  scene.traverse(o => { visibility.set(o, { visible: o.visible, frustumCulled: o.frustumCulled }); o.visible = true; o.frustumCulled = false; });
  const bare = scene.getObjectByName('stage-bare');
  const spot = scene.getObjectByName('studio-key') as SpotLight;
  const castShadow = spot.castShadow;
  const actualText = scene.getObjectByName('screen-text-light');
  const text = actualText ?? new RectAreaLight();
  if (!actualText) scene.add(text);
  const previous = gl.getRenderTarget();
  try {
    if (bare) bare.visible = false;
    spot.castShadow = true;
    gl.setRenderTarget(target);
    for (const on of [false, true]) { text.visible = on; gl.shadowMap.needsUpdate = true; gl.render(scene, camera); }
  } finally {
    gl.setRenderTarget(previous);
    if (!actualText) scene.remove(text);
    spot.castShadow = castShadow;
    for (const [o, flags] of visibility) { o.visible = flags.visible; o.frustumCulled = flags.frustumCulled; }
    gl.shadowMap.needsUpdate = true;
  }
}
