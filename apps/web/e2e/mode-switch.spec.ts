import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// Mode switch (SPEC §2 Q1, ROADMAP 1.2): navigation with aria-current, not ARIA tabs.

const MD = 768; // the `md` breakpoint (src/styles/mixins.scss)

const modeNav = (page: Page) => page.getByRole('navigation', { name: 'Mode' });
const aiMode = (page: Page) => modeNav(page).getByRole('link', { name: 'AI mode' });
const textMode = (page: Page) => modeNav(page).getByRole('link', { name: 'Text mode' });

for (const [path, current, other] of [
  ['/', 'AI mode', 'Text mode'],
  ['/cv', 'Text mode', 'AI mode'],
] as const) {
  test(`on ${path}, ${current} is the current page`, async ({ page }) => {
    await page.goto(path);
    const nav = modeNav(page);

    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: other })).not.toHaveAttribute('aria-current');
    // Navigation, not the WAI-ARIA tabs pattern.
    await expect(page.getByRole('tablist')).toHaveCount(0);
  });
}

test('the keyboard switches modes: Tab reaches the links, Enter follows them', async ({
  page,
  browserName,
}) => {
  // Playwright's WebKit build (1.64.1, Windows) crashes ("Target crashed") on the second
  // cross-document view transition in a row, / → /cv → /, about one run in three; it does so even
  // with every view-transition-name removed, and never with reduced motion (no transition). This
  // test is about the keyboard, so WebKit runs it without the transition (Ivan, 2026-11-08); the
  // transition itself has its own test below. Real iOS Safari is checked after launch (ROADMAP 7.5).
  if (browserName === 'webkit') await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  // In the DOM (and so in the Tab order) the switch comes right after the brand link.
  const afterBrand = await page.evaluate(() => {
    const brand = document.querySelector('header a[href="/"]');
    const nav = document.querySelector('nav[aria-label="Mode"]');
    return Boolean(
      brand && nav && brand.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(afterBrand).toBe(true);

  await aiMode(page).focus();
  if (browserName !== 'webkit') {
    // WebKit does not Tab to links by default (Safari behaviour); elsewhere Tab moves between the links.
    await page.keyboard.press('Tab');
    await expect(textMode(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(aiMode(page)).toBeFocused();
  }
  await textMode(page).focus();
  await expect(textMode(page)).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/cv\/?$/);
  await expect(textMode(page)).toHaveAttribute('aria-current', 'page');

  await aiMode(page).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(aiMode(page)).toHaveAttribute('aria-current', 'page');
});

test('both links meet the 44 px touch target', async ({ page }) => {
  await page.goto('/');
  for (const link of [aiMode(page), textMode(page)]) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('the switch sits in the header bar from md and floats at the bottom below it', async ({
  page,
}) => {
  await page.goto('/cv');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('This test needs a fixed viewport.');
  const nav = await modeNav(page).boundingBox();
  const header = await page.getByRole('banner').boundingBox();
  if (!nav || !header) throw new Error('The mode switch and the header must render.');

  if (viewport.width >= MD) {
    expect(nav.y).toBeGreaterThanOrEqual(header.y);
    expect(nav.y + nav.height).toBeLessThanOrEqual(header.y + header.height);
  } else {
    // Reachable with one hand: at the bottom of the screen, centred, and it stays there on scroll.
    expect(viewport.height - (nav.y + nav.height)).toBeLessThanOrEqual(48);
    expect(Math.abs(nav.x + nav.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.blockSize = '2000px';
      document.querySelector('main')?.append(filler);
      window.scrollTo(0, 1000);
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    expect(await modeNav(page).boundingBox()).toEqual(nav);
  }
});

test('with enlarged text the floating switch still fits the screen', async ({ page }) => {
  await page.goto('/cv');
  // Text-only zoom to 200% (WCAG 1.4.4). The em-based icon query follows the browser setting, not this
  // style, so this checks the worst case: icons shown, labels shrinking. Set through CSSOM: the page's
  // CSP blocks an injected <style> element (as it should), but not a style property.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('This test needs a fixed viewport.');
  test.skip(viewport.width >= MD, 'From md the switch is part of the header bar.');

  for (const link of [aiMode(page), textMode(page)]) {
    const box = await link.boundingBox();
    if (!box) throw new Error('The link must render.');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
});

test('the floating switch never covers the footer at the end of the page', async ({ page }) => {
  await page.goto('/cv');
  const viewport = page.viewportSize();
  test.skip(
    !viewport || viewport.width >= MD,
    'From md the switch is in the header, not at the bottom.',
  );
  // Instant: the site scrolls smoothly, and the long /cv page would still be moving when measured.
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  });
  const nav = await modeNav(page).boundingBox();
  const footer = await page.getByRole('contentinfo').boundingBox();
  if (!nav || !footer) throw new Error('The mode switch and the footer must render.');

  const overlaps = footer.y + footer.height > nav.y && footer.y < nav.y + nav.height;
  expect(overlaps).toBe(false);
});

test('the current mode keeps a visible marker in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  const textColour = (link: ReturnType<typeof aiMode>) =>
    link.evaluate((element) => getComputedStyle(element).color);
  const indicator = await aiMode(page).evaluate((element) => {
    const pill = element.querySelector('.mode-switch__indicator');
    return pill ? getComputedStyle(pill).backgroundColor : 'missing';
  });

  // The current link is drawn in Highlight / HighlightText, unlike the other one.
  expect(indicator).not.toBe('rgba(0, 0, 0, 0)');
  expect(indicator).not.toBe('missing');
  expect(await textColour(aiMode(page))).not.toBe(await textColour(textMode(page)));
});

test('the switch is not printed', async ({ page }) => {
  await page.goto('/cv');
  await page.emulateMedia({ media: 'print' });

  await expect(modeNav(page)).toBeHidden();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the links still switch modes', async ({ page }) => {
    await page.goto('/');
    await textMode(page).click();

    await expect(page).toHaveURL(/\/cv\/?$/);
    await expect(textMode(page)).toHaveAttribute('aria-current', 'page');
  });
});

// Cross-document view transitions (SPEC §2): `pagereveal` exposes the transition on the new page.
// Checked in Chromium; elsewhere the switch is a plain navigation, which the tests above cover.
for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`switching modes ${reducedMotion === 'reduce' ? 'skips' : 'runs'} a view transition (reduced motion: ${reducedMotion})`, async ({
    page,
    browserName,
    throttle,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Cross-document view transitions are checked in Chromium.',
    );
    // Under CDP CPU + network throttling Chromium reveals the page without a transition even though it
    // loads in ~1.4 s (cause UNVERIFIED; an emulation artefact). The unthrottled profiles check it.
    test.skip(
      reducedMotion === 'no-preference' && throttle !== null,
      'View transitions do not start under CDP throttling.',
    );
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => {
      window.addEventListener('pagereveal', (event) => {
        (window as unknown as { revealedWithTransition?: boolean }).revealedWithTransition =
          Boolean((event as Event & { viewTransition?: unknown }).viewTransition);
      });
    });
    await page.goto('/');
    // A prerendered page (speculation rules) is activated without Playwright's init scripts, so this
    // test drops the rules (removing the script removes its rule set) and checks the transition alone.
    await page.evaluate(() => {
      document.querySelector('script[type="speculationrules"]')?.remove();
    });
    await textMode(page).click();
    await expect(page).toHaveURL(/\/cv\/?$/);

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { revealedWithTransition?: boolean }).revealedWithTransition,
        ),
      )
      .toBe(reducedMotion === 'no-preference');
  });
}

test('the mode tabs are prerendered on intent (speculation rules)', async ({ page }) => {
  await page.goto('/');
  const rules = await page.evaluate((): unknown =>
    JSON.parse(document.querySelector('script[type="speculationrules"]')?.textContent ?? 'null'),
  );

  expect(rules).toEqual({
    prerender: [
      {
        where: {
          and: [
            { selector_matches: '.mode-switch__link' },
            { not: { selector_matches: '[aria-current="page"]' } },
          ],
        },
        eagerness: 'moderate',
      },
    ],
  });
});

test('the pill and each tab label are their own view-transition groups', async ({ page }) => {
  await page.goto('/');
  const names = await modeNav(page).evaluate((nav) =>
    ['.mode-switch__indicator', '.mode-switch__content--ai', '.mode-switch__content--text'].map(
      (selector) => {
        const element = nav.querySelector(selector);
        return element ? getComputedStyle(element).viewTransitionName : 'missing';
      },
    ),
  );

  expect(names).toEqual(['mode-switch-indicator', 'mode-switch-ai', 'mode-switch-text']);
});

// Impeccable audit, 2026-11-08: at 360 px with twice the text size the header ran off the screen and
// the labels were cut to "AI mo…". Below 16em (here 250 px at the default text size, the same as
// 360 px at 2× text) the header shows the mark only and the switch shows short labels; screen readers
// still hear the full names.
test('a very narrow screen with large text keeps the header on screen, names intact', async ({
  page,
}) => {
  await page.setViewportSize({ width: 250, height: 700 });
  await page.goto('/cv');

  await expect(aiMode(page)).toHaveText(/^\s*AI mode\s*AI\s*$/);
  await expect(aiMode(page)).toHaveAccessibleName('AI mode');
  await expect(textMode(page)).toHaveAccessibleName('Text mode');
  await expect(page.getByRole('banner').getByRole('link', { name: 'Ivan Vasiunin' })).toBeVisible();
  await expect(page.getByText('AI', { exact: true })).toBeVisible();
  await expect(page.getByText('CV', { exact: true })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
