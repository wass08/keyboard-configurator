/**
 * The monitor's text buffer. Plain module state plus a version counter: the
 * screen polls `version` in its frame loop, so typing never re-renders React.
 */
const MAX_LENGTH = 1600;
export const TAB = '    ';
let text = '';
let caret = 0;
let version = 0;
let editedAt = 0;
const transcript: string[] = [];
let transcriptVersion = 0;
/** The screen registers its wrapped layout so Up/Down can move by visual line. */
let verticalResolver: ((caret: number, direction: -1 | 1) => number) | null = null;

function commit(nextText: string, nextCaret: number) {
  if (nextText.length > MAX_LENGTH) {
    // Drop whole old lines (or words) from the top, like a scrolling page.
    let cut = nextText.length - MAX_LENGTH;
    const newline = nextText.indexOf('\n', cut);
    if (newline >= 0 && newline - cut < 200) cut = newline + 1;
    nextText = nextText.slice(cut); nextCaret = Math.max(0, nextCaret - cut);
  }
  text = nextText; caret = Math.max(0, Math.min(nextText.length, nextCaret));
  version++; editedAt = performance.now();
}
const touch = (nextCaret: number) => { if (nextCaret !== caret) { caret = nextCaret; version++; } editedAt = performance.now(); };
const lineStart = () => text.lastIndexOf('\n', caret - 1) + 1;
const lineEnd = () => { const end = text.indexOf('\n', caret); return end < 0 ? text.length : end; };

export const typing = {
  get text() { return text; },
  get caret() { return caret; },
  get version() { return version; },
  get editedAt() { return editedAt; },
  get transcript(): readonly string[] { return transcript; },
  get transcriptVersion() { return transcriptVersion; },
  insert(value: string) { commit(text.slice(0, caret) + value + text.slice(caret), caret + value.length); },
  backspace() { if (caret > 0) commit(text.slice(0, caret - 1) + text.slice(caret), caret - 1); else editedAt = performance.now(); },
  forwardDelete() { if (caret < text.length) commit(text.slice(0, caret) + text.slice(caret + 1), caret); },
  left() { touch(caret - 1 < 0 ? 0 : caret - 1); },
  right() { touch(Math.min(text.length, caret + 1)); },
  up() { touch(verticalResolver ? verticalResolver(caret, -1) : lineStart()); },
  down() { touch(verticalResolver ? verticalResolver(caret, 1) : lineEnd()); },
  home() { touch(lineStart()); },
  end() { touch(lineEnd()); },
  submit() {
    if (text.trim()) { transcript.push(text); if (transcript.length > 80) transcript.shift(); transcriptVersion++; }
    commit('', 0);
  },
  clear() { commit('', 0); },
  setVerticalResolver(resolver: typeof verticalResolver) { verticalResolver = resolver; },
};

/** Editing keys shared by the physical keyboard and the clicked 3D keys. */
export function applyEditingKey(name: string, shift = false): boolean {
  switch (name) {
    case 'Enter': if (shift) typing.insert('\n'); else typing.submit(); return true;
    case 'Backspace': typing.backspace(); return true;
    case 'Delete': typing.forwardDelete(); return true;
    case 'Tab': typing.insert(TAB); return true;
    case 'ArrowLeft': typing.left(); return true;
    case 'ArrowRight': typing.right(); return true;
    case 'ArrowUp': typing.up(); return true;
    case 'ArrowDown': typing.down(); return true;
    case 'Home': typing.home(); return true;
    case 'End': typing.end(); return true;
    default: return false;
  }
}

/** Physical typing: the character comes from `event.key` (respects the OS layout). */
export function typeFromKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.isComposing) return false;
  if (event.key.length === 1 || (event.key.length === 2 && /[\uD800-\uDBFF]/.test(event.key[0]))) { typing.insert(event.key); return true; }
  return applyEditingKey(event.key, event.shiftKey);
}
