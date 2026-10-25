import { useProfiledFrame as useFrame } from './post/useProfiledFrame';
import { useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, Mesh, MeshBasicMaterial, MeshDepthMaterial, OrthographicCamera, PlaneGeometry, ShaderMaterial, WebGLRenderTarget } from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';
import { useOwnedDisposal } from '../resources/ownership';
import { DESK_CENTER_Z } from './dimensions';

/** A single cached depth/blur pass for the static desk's floor contact.
 * Own the targets and off-scene blur materials as well as the visible plane.
 * Moving keyboard parts are above the 80cm capture range.
 */
export function FloorContact() {
  const { gl, scene } = useThree();
  const group = useRef<Mesh>(null);
  const camera = useRef<OrthographicCamera>(null);
  const captured = useRef(false);
  const resources = useMemo(() => {
    const target = new WebGLRenderTarget(512, 512), scratch = new WebGLRenderTarget(512, 512);
    target.texture.generateMipmaps = scratch.texture.generateMipmaps = false;
    const geometry = new PlaneGeometry(3, 3).rotateX(Math.PI / 2);
    const depth = new MeshDepthMaterial({ depthTest: false, depthWrite: false });
    depth.onBeforeCompile = shader => {
      shader.uniforms.contactColor = { value: new Color('#464139') };
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform vec3 contactColor;\nvoid main() {')
        .replace('vec4( vec3( 1.0 - fragCoordZ ), opacity );', 'vec4( contactColor * fragCoordZ * 2.0, 1.0 - fragCoordZ );');
    };
    const horizontal = new ShaderMaterial(HorizontalBlurShader), vertical = new ShaderMaterial(VerticalBlurShader);
    horizontal.depthTest = vertical.depthTest = false;
    const display = new MeshBasicMaterial({ map: target.texture, transparent: true, opacity: 0.3, depthWrite: false });
    const blurPlane = new Mesh(geometry);
    // The off-scene filter plane must share the translated capture center and
    // sit just inside its near plane, rather than at the world's origin.
    blurPlane.position.set(0, 0.002, DESK_CENTER_Z);
    return { target, scratch, geometry, depth, horizontal, vertical, display, blurPlane };
  }, []);
  const { target, scratch, geometry, depth, horizontal, vertical, display, blurPlane } = resources;
  useOwnedDisposal('FloorContact', [target, scratch, geometry, depth, horizontal, vertical, display]);
  useFrame('floorContact', () => {
    if (captured.current || !camera.current || !group.current) return;
    captured.current = true;
    const background = scene.background, override = scene.overrideMaterial, previousTarget = gl.getRenderTarget();
    group.current.visible = false; scene.background = null; scene.overrideMaterial = depth;
    try {
      gl.setRenderTarget(target); gl.render(scene, camera.current);
      for (const radius of [2.5, 1]) {
        blurPlane.material = horizontal;
        horizontal.uniforms.tDiffuse.value = target.texture;
        horizontal.uniforms.h.value = radius / 256;
        gl.setRenderTarget(scratch); gl.render(blurPlane, camera.current);
        blurPlane.material = vertical;
        vertical.uniforms.tDiffuse.value = scratch.texture;
        vertical.uniforms.v.value = radius / 256;
        gl.setRenderTarget(target); gl.render(blurPlane, camera.current);
      }
    } finally {
      gl.setRenderTarget(previousTarget); scene.background = background; scene.overrideMaterial = override; group.current.visible = true;
    }
  });
  return <group position={[0, 0.001, DESK_CENTER_Z]} rotation={[Math.PI / 2, 0, 0]}>
    <mesh ref={group} geometry={geometry} material={display} scale={[1, -1, 1]} rotation={[-Math.PI / 2, 0, 0]} dispose={null} />
    <orthographicCamera ref={camera} args={[-1.5, 1.5, 1.5, -1.5, 0, 0.8]} />
  </group>;
}
