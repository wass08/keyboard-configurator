import { create } from 'zustand';
export type QualityTier = 'high' | 'medium' | 'low';
export type QualityMode = 'auto' | QualityTier;
const requested = new URLSearchParams(location.search).get('quality');
export const INITIAL_QUALITY: QualityMode = ['high','medium','low'].includes(requested ?? '') ? requested as QualityTier : 'auto';
export const useQuality = create<{ mode: QualityMode; tier: QualityTier; decided: boolean; decisions: number }>(() => ({
  mode: INITIAL_QUALITY, tier: INITIAL_QUALITY === 'auto' ? 'high' : INITIAL_QUALITY, decided: INITIAL_QUALITY !== 'auto', decisions: 0,
}));
export function selectQuality(mode: QualityMode) {
  useQuality.setState({mode,tier:mode==='auto'?'high':mode,decided:mode!=='auto',decisions:0});
}
