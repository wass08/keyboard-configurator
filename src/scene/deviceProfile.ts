import { HalfFloatType, UnsignedByteType } from 'three';
import type { WebGLRenderer } from 'three';

// Decide before Canvas/assets exist; a slow-frame detector cannot protect the
// initial allocation/compile peak on a phone or a memory-constrained laptop.
// Feature detection also covers Chrome iOS (CriOS); it uses the same profile.
const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
export const MOBILE_PROFILE = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 ||
  (devicePixelRatio >= 2 && Math.min(screen.width, screen.height) <= 600) || (memory !== undefined && memory <= 4);
export const DPR_CAP = MOBILE_PROFILE ? 1.25 : 2;
export const texturePath = (path: string) => MOBILE_PROFILE ? path.replace(/_2k\.webp$/i, '_1k.webp') : path;
export const hdrRenderable = (gl: WebGLRenderer) => gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
export const targetType = (gl: WebGLRenderer) => hdrRenderable(gl) ? HalfFloatType : UnsignedByteType;
export const sceneSamples = (gl: WebGLRenderer) => MOBILE_PROFILE ? 0 : Math.min(4, gl.capabilities.maxSamples);
