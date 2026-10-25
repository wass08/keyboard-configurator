import { useFrame } from '@react-three/fiber';
import type { RenderCallback } from '@react-three/fiber';
import { cpuProfiling, profileCpu } from './PassProfiler';
/** Named callback attribution only while diagnostics are explicitly enabled. */
export function useProfiledFrame(name: string, callback: RenderCallback, priority?: number) {
  const label=`callback.${name}`;
  useFrame((state, delta, frame) => cpuProfiling() ? profileCpu(label, () => callback(state, delta, frame)) : callback(state,delta,frame), priority);
}
