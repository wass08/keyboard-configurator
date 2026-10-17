import { create } from 'zustand';
import { VARIANTS } from '../keyboard/variants';

export type Phase = 'loading' | 'assembling' | 'disassembling' | 'assembled';
interface ConfiguratorState {
  selectedId: string;
  displayedId: string;
  phase: Phase;
  setVariant: (id: string) => void;
}
export const useConfigurator = create<ConfiguratorState>((set) => ({
  selectedId: VARIANTS[0].id,
  displayedId: VARIANTS[0].id,
  phase: 'loading',
  // Only the animation layer owns phase. A batched A → B → A that never
  // renders B must leave the existing A assembly and its phase intact.
  setVariant: id => { if (VARIANTS.some(v => v.id === id)) set(state => state.selectedId === id ? {} : { selectedId: id }); },
}));
