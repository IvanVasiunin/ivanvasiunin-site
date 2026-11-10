import type { Page } from '@playwright/test';
import {
  compositeOver,
  contrastRatio,
  parseRgba,
  type Rgb,
  type Rgba,
} from '../src/lib/color/contrast';
import { chooseTheme, expect, test } from './fixtures';

// Design tokens (ROADMAP 1.1): the page is dark by default without JS, whatever the system theme (SPEC
// US-X1), `data-theme="light"` switches it, and every colour pairing the UI relies on meets WCAG contrast.

const BACKGROUND_TOKENS = ['--color-bg', '--color-surface'] as const;
// The backdrop nebulae, composited over `--color-bg` all at once: the worst case where they overlap.
const GLOW_TOKENS = ['--color-glow-1', '--color-glow-2', '--color-glow-3'] as const;
// Text on accent gradients must read on every gradient stop.
const GRADIENT_STOP_TOKENS = [
  '--color-accent',
  '--color-accent-2',
  '--color-accent-active',
  '--color-accent-2-active',
] as const;
const TEXT_TOKENS = [
  '--color-text',
  '--color-text-muted',
  '--color-accent',
  '--color-danger',
] as const;
const GRAPHIC_TOKENS = [
  '--color-border',
  '--color-focus',
  '--color-highlight',
  '--color-source-cv',
  '--color-source-experience',
  '--color-source-personal',
  '--color-source-site-docs',
  '--color-source-github',
] as const;
const ALL_TOKENS = [
  ...BACKGROUND_TOKENS,
  ...GLOW_TOKENS,
  ...TEXT_TOKENS,
  ...GRAPHIC_TOKENS,
  ...GRADIENT_STOP_TOKENS,
  '--color-accent-3',
  '--color-on-accent',
];

type Scheme = 'light' | 'dark';
type Colors = Record<string, Rgba>;

/**
 * Resolves colour tokens to computed rgb() values, whatever syntax the tokens use.
 * Fails on an undefined token: `var(--missing)` would silently inherit the text colour.
 */
async function readColors(page: Page): Promise<Colors> {
  const computed = await page.evaluate((tokens) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const probe = document.createElement('span');
    document.body.append(probe);
    const result: Record<string, string> = {};
    for (const token of tokens) {
      const defined = rootStyle.getPropertyValue(token).trim() !== '';
      probe.style.color = `var(${token})`;
      result[token] = defined ? getComputedStyle(probe).color : '';
    }
    probe.remove();
    return result;
  }, ALL_TOKENS);
  return Object.fromEntries(
    Object.entries(computed).map(([token, value]) => {
      if (value === '') throw new Error(`Token ${token} is not defined on :root`);
      return [token, parseRgba(value)];
    }),
  );
}

const color = (colors: Colors, token: string): Rgba => {
  const value = colors[token];
  if (!value) throw new Error(`Token ${token} was not resolved`);
  return value;
};

/** The page background under every nebula at once. */
const nebulaBackground = (colors: Colors): Rgb =>
  GLOW_TOKENS.reduce<Rgb>(
    (background, token) => compositeOver(color(colors, token), background),
    color(colors, '--color-bg'),
  );

/** Background colour of the page in its current state. */
async function background(page: Page): Promise<Rgba> {
  return color(await readColors(page), '--color-bg');
}

const setTheme = (page: Page, theme: Scheme | null): Promise<void> =>
  page.evaluate((value) => {
    if (value === null) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = value;
  }, theme);

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await chooseTheme(page, scheme);
    });

    test('the page background and text come from the theme tokens', async ({ page }) => {
      await page.goto('/');
      const colors = await readColors(page);
      const body = await page.locator('body').evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, text: style.color };
      });

      expect(parseRgba(body.background)).toEqual(color(colors, '--color-bg'));
      expect(parseRgba(body.text)).toEqual(color(colors, '--color-text'));
    });

    test('text tokens reach 4.5:1 and graphic tokens 3:1 on every background', async ({ page }) => {
      await page.goto('/');
      const colors = await readColors(page);
      const backgrounds: readonly (readonly [string, Rgb])[] = [
        ...BACKGROUND_TOKENS.map((token) => [token, color(colors, token)] as const),
        ['nebulae over --color-bg', nebulaBackground(colors)],
      ];

      for (const [name, background] of backgrounds) {
        for (const token of TEXT_TOKENS) {
          const ratio = contrastRatio(color(colors, token), background);
          expect(ratio, `${token} on ${name}`).toBeGreaterThanOrEqual(4.5);
        }
        for (const token of GRAPHIC_TOKENS) {
          const ratio = contrastRatio(color(colors, token), background);
          expect(ratio, `${token} on ${name}`).toBeGreaterThanOrEqual(3);
        }
      }
    });

    test('text on accent gradients reaches 4.5:1 on every gradient stop', async ({ page }) => {
      await page.goto('/');
      const colors = await readColors(page);

      for (const stop of GRADIENT_STOP_TOKENS) {
        const ratio = contrastRatio(color(colors, '--color-on-accent'), color(colors, stop));
        expect(ratio, `--color-on-accent on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    test('the backdrop renders behind the content and is hidden from assistive tech', async ({
      page,
    }) => {
      await page.goto('/');
      const backdrop = page.locator('.backdrop');

      await expect(backdrop).toHaveAttribute('aria-hidden', 'true');
      await expect(backdrop).toHaveCSS('position', 'fixed');
      await expect(backdrop).toHaveCSS('pointer-events', 'none');
      // Content above the backdrop stays clickable.
      await page.getByRole('link', { name: 'Text mode' }).click();
      await expect(page).toHaveURL(/\/cv\/?$/);
    });
  });
}

test('the page is dark by default under either system theme, light only by choice', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const dark = await background(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await background(page)).toEqual(dark);

  await setTheme(page, 'light');
  const light = await background(page);
  expect(light).not.toEqual(dark);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await background(page)).toEqual(light);

  await setTheme(page, 'dark');
  expect(await background(page)).toEqual(dark);
  await setTheme(page, null);
  expect(await background(page)).toEqual(dark);
});

test('the page gutter widens from the md breakpoint', async ({ page }) => {
  /** Resolves `var(--gutter)` to pixels at the given viewport width. */
  const gutterAt = async (width: number): Promise<number> => {
    await page.setViewportSize({ width, height: 800 });
    return page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.inlineSize = 'var(--gutter)';
      document.body.append(probe);
      const pixels = probe.getBoundingClientRect().width;
      probe.remove();
      return pixels;
    });
  };
  await page.goto('/');

  expect(await gutterAt(360)).toBe(16);
  expect(await gutterAt(1024)).toBe(32);
});
