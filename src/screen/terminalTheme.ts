// Physical typography: the hero sees the lower ~40 mm of the LCD. Keep its
// input near the bezel, and all lighting independent of the changing pixels.
export const TERMINAL_RADIANCE = 0.85;
export const TERMINAL_BACKGROUND = '#111113';
export const TERMINAL_INK = '#e7e9ef';
export const TERMINAL_ACCENT = '#d97757';
export const TERMINAL_FONT = '"SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';
export const PROMPT_FONT_M = 0.0085;
export const PROMPT_MARGIN_M = 0.016;
export const PROMPT_BOTTOM_M = 0.011;

export function terminalBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = TERMINAL_BACKGROUND; ctx.fillRect(0, 0, width, height);
  const vignette = ctx.createRadialGradient(width * 0.45, height * 0.45, width * 0.1, width * 0.5, height * 0.5, width * 0.65);
  vignette.addColorStop(0, '#14141600'); vignette.addColorStop(1, '#05050780');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
}
