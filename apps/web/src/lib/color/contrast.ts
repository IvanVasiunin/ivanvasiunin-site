/** An sRGB colour with 0–255 channels. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// Browsers serialize computed sRGB colours (hex, rgb(), named) as rgb() / rgba(), and colours made with
// color-mix(in srgb, …) as color(srgb r g b) with 0–1 channels. Other spaces (oklch(), display-p3)
// fail loudly here; extend the parser then.
const NUMBER = '(\\d+(?:\\.\\d+)?(?:e-?\\d+)?)';
const ALPHA = `(?:\\s*[,/]\\s*${NUMBER}(%?))?`;
const RGB_PATTERN = new RegExp(
  `^rgba?\\(\\s*${NUMBER}[\\s,]+${NUMBER}[\\s,]+${NUMBER}${ALPHA}\\s*\\)$`,
);
const SRGB_PATTERN = new RegExp(
  `^color\\(\\s*srgb\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}${ALPHA}\\s*\\)$`,
);

/** An sRGB colour with an alpha channel in [0, 1]. */
export interface Rgba extends Rgb {
  readonly a: number;
}

/** Parses a computed colour such as `rgb(30, 43, 47)`, `rgba(30, 43, 47, 0.5)` or `rgb(30 43 47 / 50%)`. */
export function parseRgba(value: string): Rgba {
  const trimmed = value.trim();
  const rgb = RGB_PATTERN.exec(trimmed);
  const srgb = rgb ? null : SRGB_PATTERN.exec(trimmed);
  const match = rgb ?? srgb;
  if (!match) {
    throw new Error(`Not an rgb() or color(srgb) colour: "${value}"`);
  }
  // color(srgb) channels are 0–1; scale them to the 0–255 range of rgb().
  const scale = srgb ? 255 : 1;
  const [, r = '', g = '', b = '', alpha, percent] = match;
  const a = alpha === undefined ? 1 : Number(alpha) / (percent ? 100 : 1);
  return { r: Number(r) * scale, g: Number(g) * scale, b: Number(b) * scale, a };
}

/** Parses a computed colour and ignores its alpha channel. */
export function parseRgb(value: string): Rgb {
  const { r, g, b } = parseRgba(value);
  return { r, g, b };
}

/** Source-over compositing of a translucent colour onto an opaque one. */
export function compositeOver(top: Rgba, bottom: Rgb): Rgb {
  const mix = (front: number, back: number): number => front * top.a + back * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) };
}

const linearize = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.x contrast ratio, from 1 (same colour) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
