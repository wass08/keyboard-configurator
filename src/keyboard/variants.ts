import type { ColorGroup, KeyDefinition } from './layout';

export interface Variant {
  id: string;
  name: string;
  caseBody: string;
  caseFrame: string;
  knob: string;
  ring: string;
  groups: Record<ColorGroup, { cap: string; legend: string }>;
  overrides?: Record<string, ColorGroup>;
}
export const VARIANTS: readonly Variant[] = [
  { id: 'glacial-blue', name: 'Glacial Blue', caseBody: '#e5e8e9', caseFrame: '#f2f3ef', knob: '#e8ecea', ring: '#e5e6e5', groups: { alpha: { cap: '#edf0ed', legend: '#28313a' }, mod: { cap: '#a9c3d9', legend: '#28313a' }, accent: { cap: '#23263a', legend: '#f9f9f4' } } },
  { id: 'cool-black', name: 'Cool Black', caseBody: '#1d1e21', caseFrame: '#282a2b', knob: '#26282a', ring: '#6c7278', groups: { alpha: { cap: '#2b3040', legend: '#e3b232' }, mod: { cap: '#202123', legend: '#e3b232' }, accent: { cap: '#e3b232', legend: '#242323' } } },
  { id: 'emerald', name: 'Emerald', caseBody: '#8c97b3', caseFrame: '#e4dbcd', knob: '#e6e1d8', ring: '#e1e5e9', groups: { alpha: { cap: '#f1e2d6', legend: '#42494b' }, mod: { cap: '#7f8bad', legend: '#f2f1e9' }, accent: { cap: '#6f8f72', legend: '#f1f0e4' } } },
  { id: 'pink', name: 'Pink', caseBody: '#e6aebd', caseFrame: '#f0b9c4', knob: '#f0b9c4', ring: '#e4e5e4', groups: { alpha: { cap: '#f3e9dc', legend: '#d78c9e' }, mod: { cap: '#eeaab8', legend: '#fff7ed' }, accent: { cap: '#eeaab8', legend: '#fff7ed' } }, overrides: { space: 'mod' } },
  { id: 'overnight', name: 'Overnight', caseBody: '#bcd3e8', caseFrame: '#edf0ea', knob: '#edf0ea', ring: '#e5e8e7', groups: { alpha: { cap: '#edf2f0', legend: '#83b9d6' }, mod: { cap: '#b0cedf', legend: '#f8fbf2' }, accent: { cap: '#7f9fd6', legend: '#f5f7f3' } } },
  { id: 'white-blue-purple', name: 'White & Blue & Purple', caseBody: '#e4e9e8', caseFrame: '#eff1ee', knob: '#e9edeb', ring: '#e7e9e8', groups: { alpha: { cap: '#edf1ed', legend: '#72a4cd' }, mod: { cap: '#8fbcec', legend: '#f5f7ef' }, accent: { cap: '#8f8ee6', legend: '#f9f7f2' } } },
  { id: 'white-brown', name: 'White & Brown', caseBody: '#77665e', caseFrame: '#8a7468', knob: '#8a7468', ring: '#e3e6e4', groups: { alpha: { cap: '#f0ece3', legend: '#24231f' }, mod: { cap: '#c9b49a', legend: '#302923' }, accent: { cap: '#6e564b', legend: '#f9f4ea' } } },
];
export const getVariant = (id: string) => VARIANTS.find(v => v.id === id) ?? VARIANTS[0];
export const colorGroupFor = (key: KeyDefinition, variant: Variant) => variant.overrides?.[key.id] ?? key.colorGroup;
