import { describe, expect, test } from 'vitest';
import { fontsourceVariants, parseFontsourceCss } from './fontsource-variants.mjs';

const face = (file: string, weight: string, style: string, ranges: string): string => `
/* ${file} */
@font-face {
  font-family: 'Sample';
  font-style: ${style};
  font-display: swap;
  font-weight: ${weight};
  src: url(./files/${file}.woff2) format('woff2'), url(./files/${file}.woff) format('woff');
  unicode-range: ${ranges};
}`;

const CSS = [
  face('sample-vietnamese-400-normal', '400', 'normal', 'U+0102-0103,U+1EA0-1EF9'),
  face('sample-latin-ext-400-normal', '400', 'normal', 'U+0100-02BA,U+2C60-2C7F'),
  face('sample-latin-400-normal', '400', 'normal', 'U+0000-00FF, U+2122'),
].join('\n');

describe('parseFontsourceCss', () => {
  test('keeps the requested subsets with their weight, style, file and ranges', () => {
    expect(parseFontsourceCss(CSS, './files-dir', ['latin', 'latin-ext'])).toEqual([
      {
        weight: '400',
        style: 'normal',
        src: ['./files-dir/sample-latin-ext-400-normal.woff2'],
        unicodeRange: ['U+0100-02BA', 'U+2C60-2C7F'],
      },
      {
        weight: '400',
        style: 'normal',
        src: ['./files-dir/sample-latin-400-normal.woff2'],
        unicodeRange: ['U+0000-00FF', 'U+2122'],
      },
    ]);
  });

  test('does not read latin-ext as latin', () => {
    const variants = parseFontsourceCss(CSS, '.', ['latin']);
    expect(variants.map((variant) => variant.src[0])).toEqual(['./sample-latin-400-normal.woff2']);
  });

  test('reads variable weight ranges', () => {
    const css = face('sample-latin-wght-normal', '400 900', 'normal', 'U+0000-00FF');
    expect(parseFontsourceCss(css, '.', ['latin'])[0]?.weight).toBe('400 900');
  });

  test('fails loudly on an unexpected block', () => {
    const css = face('sample-latin-400-normal', '400', 'oblique', 'U+0000-00FF');
    expect(() => parseFontsourceCss(css, '.', ['latin'])).toThrow(/Unexpected/);
  });
});

describe('fontsourceVariants', () => {
  test('reads the installed packages used by the site', () => {
    const serif = fontsourceVariants('@fontsource/newsreader', ['400.css'], ['latin']);
    expect(serif).toHaveLength(1);
    expect(serif[0].src[0]).toMatch(/newsreader-latin-400-normal\.woff2$/);
  });

  test('fails when no face matches', () => {
    expect(() => fontsourceVariants('@fontsource/newsreader', ['400.css'], ['greek'])).toThrow(
      /No greek faces/,
    );
  });
});
