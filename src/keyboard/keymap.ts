import { KEY_LAYOUT } from './layout';
import type { KeyDefinition } from './layout';

/**
 * Physical KeyboardEvent.code -> layout id. `code` is the key's position, so
 * the 3D key matches the key pressed whatever the OS layout (AZERTY etc.);
 * the typed character still comes from `event.key`.
 */
export const CODE_TO_KEY: Readonly<Record<string, string>> = (() => {
  const map: Record<string, string> = {
    Escape: 'esc', Backquote: 'num0', Minus: 'num11', Equal: 'num12', Backspace: 'backspace', Delete: 'delete',
    Tab: 'tab', BracketLeft: '[', BracketRight: ']', Backslash: 'backslash', PageUp: 'pageup',
    CapsLock: 'caps', Semicolon: ';', Quote: "'", Enter: 'enter', NumpadEnter: 'enter', PageDown: 'pagedown',
    ShiftLeft: 'shiftleft', Comma: ',', Period: '.', Slash: '/', ShiftRight: 'shiftright', ArrowUp: 'up', End: 'end',
    ControlLeft: 'ctrlleft', MetaLeft: 'win', OSLeft: 'win', AltLeft: 'alt', Space: 'space',
    // A 75% board has one Alt and no right Win/menu key: the nearest equivalents.
    AltRight: 'alt', MetaRight: 'win', OSRight: 'win', ContextMenu: 'fn', Fn: 'fn',
    ControlRight: 'ctrlright', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
    // ISO's extra key beside left Shift shares the backslash legend on this board.
    IntlBackslash: 'backslash',
  };
  for (let i = 1; i <= 12; i++) map[`F${i}`] = `f${i}`;
  for (let i = 1; i <= 9; i++) map[`Digit${i}`] = `num${i}`;
  map.Digit0 = 'num10';
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') map[`Key${letter}`] = letter;
  return map;
})();

export const KEY_INDEX: ReadonlyMap<string, number> = new Map(KEY_LAYOUT.map((key, i) => [key.id, i]));
/** Wire-stabilized keys get the deeper sound. */
export const STABILIZED = new Set(['space', 'enter', 'backspace', 'shiftleft', 'shiftright']);

/** Character produced by clicking a 3D key (US legends), or null for non-printing keys. */
export function characterFor(key: KeyDefinition, shift: boolean, capsLock: boolean): string | null {
  if (key.id === 'space') return ' ';
  if (/^[A-Z]$/.test(key.id)) return shift !== capsLock ? key.id : key.id.toLowerCase();
  if (key.labels.length === 2 && key.id !== 'tab') return shift ? key.labels[0] : key.labels[1];
  return null;
}
