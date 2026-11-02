// @ts-check
// Builds Astro Fonts API `local` provider variants from a pinned Fontsource npm package (ADR-0010).
// The package's own CSS already lists every file with its weight, style and unicode-range, so the
// config reads them from there instead of copying ranges by hand.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {object} FontVariant
 * @property {string} weight `400` or a variable range such as `400 900`
 * @property {'normal' | 'italic'} style
 * @property {[string, ...string[]]} src woff2 file, relative to the project root
 * @property {[string, ...string[]]} unicodeRange
 */

// Longer names first, so `latin-ext` is not read as `latin`.
const SUBSET =
  /-(latin-ext|latin|vietnamese|cyrillic-ext|cyrillic|greek-ext|greek)-(?:wght|\d{3})-/;

/**
 * Parses the @font-face blocks of a Fontsource CSS file.
 * @param {string} css the file's text
 * @param {string} filesDir directory of the font files, relative to the project root
 * @param {readonly string[]} subsets subsets to keep, e.g. `['latin', 'latin-ext']`
 * @returns {FontVariant[]}
 */
export function parseFontsourceCss(css, filesDir, subsets) {
  /** @type {FontVariant[]} */
  const variants = [];
  for (const [, block = ''] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
    const subset = file ? SUBSET.exec(file)?.[1] : undefined;
    if (!file || !subset || !subsets.includes(subset)) continue;

    const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim();
    const style = /font-style:\s*(normal|italic);/.exec(block)?.[1];
    const ranges = /unicode-range:\s*([^;]+);/
      .exec(block)?.[1]
      ?.split(',')
      .map((range) => range.trim());
    if (!weight || (style !== 'normal' && style !== 'italic') || !ranges?.[0]) {
      throw new Error(`Unexpected @font-face block for ${file}`);
    }
    variants.push({
      weight,
      style,
      src: [`${filesDir}/${file}`],
      unicodeRange: [ranges[0], ...ranges.slice(1)],
    });
  }
  return variants;
}

/**
 * Reads the given CSS files of an installed Fontsource package.
 * @param {string} pkg package name, e.g. `@fontsource/newsreader`
 * @param {readonly string[]} cssFiles e.g. `['400.css', '400-italic.css']`
 * @param {readonly string[]} subsets
 * @returns {[FontVariant, ...FontVariant[]]} at least one variant (Astro requires a non-empty list)
 */
export function fontsourceVariants(pkg, cssFiles, subsets) {
  const dir = `./node_modules/${pkg}`;
  const variants = cssFiles.flatMap((file) =>
    parseFontsourceCss(readFileSync(path.join(dir, file), 'utf8'), `${dir}/files`, subsets),
  );
  const [first, ...rest] = variants;
  if (!first) throw new Error(`No ${subsets.join('/')} faces in ${pkg}`);
  return [first, ...rest];
}
