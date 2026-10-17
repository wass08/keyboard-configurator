export const PITCH = 0.01905;
export const TILT = 7 * Math.PI / 180;
export type ColorGroup = 'alpha' | 'mod' | 'accent';
export interface KeyDefinition {
  id: string;
  labels: string[];
  x: number;
  y: number;
  w: number;
  row: number;
  colorGroup: ColorGroup;
}

const keys: KeyDefinition[] = [];
function add(id: string, labels: string[], x: number, row: number, w = 1, colorGroup: ColorGroup = 'alpha') {
  keys.push({ id, labels, x, row, w, y: row === 0 ? 0 : row + 0.25, colorGroup });
}
add('esc', ['Esc'], 0, 0, 1, 'accent');
for (let i = 1; i <= 12; i++) {
  const x = i <= 4 ? i + 0.75 : i <= 8 ? i + 1.375 : i + 2;
  add(`f${i}`, [`F${i}`], x, 0, 1, i >= 5 && i <= 8 ? 'mod' : 'alpha');
}
const numbers = [['~', '`'], ['!', '1'], ['@', '2'], ['#', '3'], ['$', '4'], ['%', '5'], ['^', '6'], ['&', '7'], ['*', '8'], ['(', '9'], [')', '0'], ['_', '-'], ['+', '=']];
numbers.forEach((label, i) => add(`num${i}`, label, i, 1));
add('backspace', ['← Backspace'], 13, 1, 2, 'mod');
add('delete', ['Delete'], 15.25, 1, 1, 'mod');
add('tab', ['⇤', 'Tab ⇥'], 0, 2, 1.5, 'mod');
['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'].forEach((label, i) => add(label, label === '[' ? ['{', '['] : label === ']' ? ['}', ']'] : [label], 1.5 + i, 2));
add('backslash', ['|', '\u005c'], 13.5, 2, 1.5); // One U+005C glyph.
add('pageup', ['PgUp'], 15.25, 2, 1, 'mod');
add('caps', ['Caps Lock'], 0, 3, 1.75, 'mod');
['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'"].forEach((label, i) => add(label, label === ';' ? [':', ';'] : label === "'" ? ['"', "'"] : [label], 1.75 + i, 3));
add('enter', ['↵ Enter'], 12.75, 3, 2.25, 'accent');
add('pagedown', ['PgDn'], 15.25, 3, 1, 'mod');
add('shiftleft', ['⇧ Shift'], 0, 4, 2.25, 'mod');
['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'].forEach((label, i) => add(label, label === ',' ? ['<', ','] : label === '.' ? ['>', '.'] : label === '/' ? ['?', '/'] : [label], 2.25 + i, 4));
add('shiftright', ['⇧ Shift'], 12.25, 4, 1.75, 'mod');
add('up', ['↑'], 14.25, 4, 1, 'accent');
add('end', ['End'], 15.25, 4, 1, 'mod');
add('ctrlleft', ['Ctrl'], 0, 5, 1.25, 'mod');
add('win', ['Win'], 1.25, 5, 1.25, 'mod');
add('alt', ['Alt'], 2.5, 5, 1.25, 'mod');
add('space', [], 3.75, 5, 6.25, 'accent');
add('fn', ['Fn'], 10, 5, 1, 'mod');
add('ctrlright', ['Ctrl'], 11, 5, 1, 'mod');
add('left', ['←'], 13.25, 5, 1, 'accent');
add('down', ['↓'], 14.25, 5, 1, 'accent');
add('right', ['→'], 15.25, 5, 1, 'accent');

export const KEY_LAYOUT: readonly KeyDefinition[] = keys;
// The spec's explicit rows (and reference photos) total 80 keys, despite its
// "82 keys" heading. Preserve the prescribed layout rather than inventing keys.
if (KEY_LAYOUT.length !== 80) throw new Error(`Expected 80 keys in the prescribed layout, received ${KEY_LAYOUT.length}`);
export const keyPosition = (key: KeyDefinition): [number, number, number] => [(key.x + key.w / 2 - 8.125) * PITCH, 0, (key.y + 0.5 - 3.125) * PITCH];
export const KNOB_POSITION: [number, number, number] = [(15.75 - 8.125) * PITCH, 0, (0.5 - 3.125) * PITCH];
