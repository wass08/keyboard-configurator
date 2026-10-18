import { useEffect } from 'react';
import type { BufferGeometry, Material, Texture, WebGLRenderTarget } from 'three';

type OwnedResource = BufferGeometry | Material | Texture | WebGLRenderTarget;
export interface ResourceCount { registered: number; disposed: number; active: number }
const counts: Record<string, ResourceCount> = {};

/** Dispose only resources allocated by this owner. Do not recurse into material
 * maps: the legend atlas and useTexture assets belong to application caches.
 * Declarative <...Geometry>/<...Material> children remain R3F-owned.
 */
export function useOwnedDisposal(owner: string, resources: readonly OwnedResource[]) {
  useEffect(() => {
    const count = counts[owner] ??= { registered: 0, disposed: 0, active: 0 };
    const owned = [...new Set(resources)];
    count.registered += owned.length; count.active += owned.length;
    return () => {
      owned.forEach(resource => {
        // Observe this owner's release, rather than incidental material dispose
        // events from shader recompilation while the component is still live.
        const onDispose = () => { count.disposed++; count.active--; };
        resource.addEventListener('dispose', onDispose);
        resource.dispose();
        resource.removeEventListener('dispose', onDispose);
      });
    };
    // A fixed list of resource identities per owner. Replacing a resource also
    // releases the previous one; merely rerendering an owner does not dispose it.
  }, [owner, ...resources]);
}

// Counts observe actual Three.js dispose events; no resource references retained.
export const getOwnedResourceStats = () => Object.fromEntries(Object.entries(counts).map(([owner, count]) => [owner, { ...count }]));

// Observe a library-owned allocation without disposing it twice. Drei owns the
// Environment portal's FBO; its actual dispose event must still be verified.
const managed = new WeakSet<OwnedResource>();
export function observeManagedDisposal(owner: string, resource: OwnedResource) {
  if (managed.has(resource)) return;
  managed.add(resource);
  const count = counts[owner] ??= { registered: 0, disposed: 0, active: 0 };
  count.registered++; count.active++;
  const release = () => {
    count.disposed++; count.active--;
    resource.removeEventListener('dispose', release);
  };
  resource.addEventListener('dispose', release);
}

/** Non-shadowing lights own no GPU maps. Verify their actual scene removal. */
export function useTrackedLight(owner: string, light: import('three').Light) {
  useEffect(() => {
    const count = counts[owner] ??= { registered: 0, disposed: 0, active: 0 };
    count.registered++; count.active++;
    const removed = () => { count.disposed++; count.active--; light.removeEventListener('removed', removed); };
    light.addEventListener('removed', removed);
    return () => { light.removeFromParent(); };
  }, [owner, light]);
}
