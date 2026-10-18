import { PNG } from 'pngjs';

function hsv(rgb) {
  const [r, g, b] = rgb.map(channel => channel / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
  let hue = 0;
  if (chroma) {
    if (max === r) hue = ((g - b) / chroma + 6) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
  }
  return { hue: hue * 60, saturation: max ? chroma / max : 0, value: max };
}
const round = n => Math.round(n * 100) / 100;
const rgbFromHex = hex => hex.match(/.{2}/g).map(channel => parseInt(channel, 16));

/** Sample the same rendered hero PNG delivered as evidence. Coordinates come
 * from blank top-face points on real cap meshes, not hand-picked color pixels.
 * A 3x3 median rejects isolated raster noise without hunting for matching hues.
 */
export function measureCapColors(buffer, points, palette, maxHueDegrees = 10) {
  const png = PNG.sync.read(buffer);
  const samples = points.map(point => {
    const x = Math.round(point.x * png.width), y = Math.round(point.y * png.height);
    const channels = [[], [], []];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((y + dy) * png.width + x + dx) * 4;
      channels.forEach((values, c) => values.push(png.data[i + c]));
    }
    const rgb = channels.map(values => values.sort((a, b) => a - b)[4]);
    const targetHex = palette[point.group], target = hsv(rgbFromHex(targetHex)), rendered = hsv(rgb);
    const hueDelta = Math.abs(((rendered.hue - target.hue + 540) % 360) - 180);
    const saturationDelta = Math.abs(rendered.saturation - target.saturation);
    // Hue is ill-conditioned on whites/near-grays; preserve their low chroma
    // instead. All chromatic caps enforce the requested ten-degree ceiling.
    const colored = target.saturation >= 0.12;
    const passed = (!colored || hueDelta <= maxHueDegrees) && saturationDelta <= 0.12
      && (target.saturation >= 0.025 || rendered.saturation <= 0.05) && rendered.value >= 0.1;
    return { key: point.key, group: point.group, pixel: [x, y], patch: '3x3 median', targetHex, renderedHex: rgb.map(c => c.toString(16).padStart(2, '0')).join(''), targetHue: round(target.hue), renderedHue: round(rendered.hue), hueDeltaDegrees: round(hueDelta), targetSaturation: round(target.saturation * 100), renderedSaturation: round(rendered.saturation * 100), saturationDeltaPoints: round(saturationDelta * 100), colored, status: passed ? 'passed' : 'failed' };
  });
  return { status: samples.every(sample => sample.status === 'passed') ? 'passed' : 'failed', limits: { coloredHueDegrees: maxHueDegrees, saturationPoints: 12, whiteSaturationPercent: 5, coloredMinimumTargetSaturationPercent: 12 }, samples };
}

/** Catch subpixel stand-edge fragments in a projected blank wallpaper region.
 * Material/texture inspection alone cannot detect geometry raster artifacts. */
export function measureScreenContinuity(buffer, region) {
  const png = PNG.sync.read(buffer);
  const minX = Math.max(3, Math.ceil(region.minX * png.width)), maxX = Math.min(png.width - 4, Math.floor(region.maxX * png.width));
  const minY = Math.max(0, Math.ceil(region.minY * png.height)), maxY = Math.min(png.height - 1, Math.floor(region.maxY * png.height));
  let darkOutliers = 0, maxDarkDeviation = 0, sampledPixels = 0;
  const value = (x, y, c) => png.data[(y * png.width + x) * 4 + c];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const dip = [0, 1, 2].reduce((sum, c) => sum + (value(x - 3, y, c) + value(x + 3, y, c)) / 2 - value(x, y, c), 0) / 3;
    if (dip > 8) darkOutliers++;
    maxDarkDeviation = Math.max(maxDarkDeviation, dip); sampledPixels++;
  }
  return { status: sampledPixels > 0 && darkOutliers === 0 ? 'passed' : 'failed', region, sampledPixels, darkOutliers, maxDarkDeviation: round(maxDarkDeviation), limit: 8 };
}
