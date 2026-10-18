import { useRef } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { VARIANTS, getVariant } from '../keyboard/variants';
import { useConfigurator } from '../state/store';
import { SoundToggle } from './SoundToggle';

export function VariantPicker() {
  const selectedId = useConfigurator(state => state.selectedId);
  const setVariant = useConfigurator(state => state.setVariant);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = VARIANTS.findIndex(v => v.id === selectedId);
  const onKeyDown = (event: KeyboardEvent) => {
    let index = selectedIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') index = (index + 1) % VARIANTS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') index = (index - 1 + VARIANTS.length) % VARIANTS.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = VARIANTS.length - 1;
    else return;
    event.preventDefault(); setVariant(VARIANTS[index].id); buttons.current[index]?.focus();
  };
  return <section className="variant-picker" aria-label="Keyboard colorway">
    <div className="variant-caption" aria-live="polite" aria-atomic="true"><span className="variant-number">0{selectedIndex + 1} / 07</span><span className="variant-name">{getVariant(selectedId).name}</span><SoundToggle /></div>
    <div className="swatches" role="radiogroup" aria-label="Colorways" onKeyDown={onKeyDown}>
      {VARIANTS.map((variant, i) => <button key={variant.id} type="button" role="radio" aria-checked={variant.id === selectedId} aria-label={variant.name} title={variant.name} tabIndex={variant.id === selectedId ? 0 : -1} ref={element => { buttons.current[i] = element; }} onClick={() => setVariant(variant.id)} className="swatch-button" style={{ '--alpha': variant.groups.alpha.cap, '--mod': variant.groups.mod.cap, '--accent': variant.groups.accent.cap } as CSSProperties}><span className="swatch" /></button>)}
    </div>
  </section>;
}
