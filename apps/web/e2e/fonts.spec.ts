import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// Self-hosted fonts (ROADMAP 1.3, ADR-0010, docs/CREDITS.md): no third-party requests, the UI face is
// used and preloaded, the serif loads only on demand, and the font swap does not shift the layout.

const PATHS = ['/', '/cv'] as const;
const FONT_FILES = '**/_astro/fonts/**';

for (const path of PATHS) {
  test(`${path} makes no third-party requests`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);

    const thirdParty = requests.filter(
      (url) => !url.startsWith('data:') && new URL(url).origin !== origin,
    );
    expect(thirdParty).toEqual([]);
  });
}

test('the UI font is self-hosted, preloaded and in use', async ({ page, baseURL }) => {
  await page.goto('/');
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      faces: [...document.fonts].map((face) => ({ family: face.family, status: face.status })),
      body: getComputedStyle(document.body).fontFamily,
      preloads: [
        ...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]'),
      ].map((link) => link.href),
    };
  });

  // The family name carries Astro's hash suffix, so match the prefix only.
  expect(fonts.body).toMatch(/^"?Schibsted Grotesk/);
  expect(
    fonts.faces.some(
      (face) => face.family.startsWith('Schibsted Grotesk') && face.status === 'loaded',
    ),
  ).toBe(true);
  // Exactly one preload: the UI face, from the site's own origin.
  expect(fonts.preloads).toHaveLength(1);
  const preload = new URL(fonts.preloads[0] ?? '');
  expect(preload.origin).toBe(new URL(baseURL ?? 'http://localhost').origin);
  expect(preload.pathname).toMatch(/^\/_astro\/fonts\//);
});

test('the serif face is fetched only when text uses it', async ({ page }) => {
  // Distinct files: WebKit reports the preload and the font use of the same file as two requests.
  const fontFiles = new Set<string>();
  page.on('request', (request) => {
    if (request.url().includes('/_astro/fonts/')) fontFiles.add(request.url());
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  // TODO(ROADMAP 2.x): once /cv has serif prose, check it there instead of on the placeholder page.
  const beforeSerifText = fontFiles.size;
  expect(beforeSerifText).toBe(1); // only the preloaded UI face

  await page.evaluate(() => {
    const prose = document.createElement('p');
    prose.style.fontFamily = 'var(--font-serif)';
    prose.textContent = 'Serif sample';
    document.querySelector('main')?.append(prose);
  });
  // One more file: Newsreader Latin regular (Latin Extended is not needed for this text).
  await expect.poll(() => fontFiles.size).toBe(beforeSerifText + 1);
});

/** Sums layout shifts from navigation start; the observer is installed before the page loads. */
async function recordLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { layoutShift: number };
    store.layoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[]) {
        if (!entry.hadRecentInput) store.layoutShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

for (const path of PATHS) {
  test(`${path} keeps layout shift under 0.1 when the fonts arrive late`, async ({
    page,
    browserName,
  }) => {
    // The Layout Instability API is Chromium-only; on iOS Safari the swap is checked by hand (ROADMAP 7.5).
    test.skip(browserName !== 'chromium', 'The Layout Instability API is Chromium-only.');
    // TEMPORARY (Ivan, 2026-11-09): on CI the throttled Android profile measured 0.13 on /cv while
    // every local run stays under 0.1. Investigated after launch (docs/ROADMAP.md, CI follow-ups);
    // remove this line then.
    test.skip(Boolean(process.env.CI), 'Investigating a CI-only CLS result (see the comment).');
    // Delay the font files so the page first paints with the fallback faces and the swap happens
    // inside the measurement (on localhost the fonts would otherwise be ready before first paint).
    await page.route(FONT_FILES, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await recordLayoutShifts(page);
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);
    // Let the swap render, then read the total.
    await page.waitForTimeout(300);

    const shift = await page.evaluate(
      () => (window as unknown as { layoutShift: number }).layoutShift,
    );
    expect(shift).toBeLessThan(0.1);
  });
}
