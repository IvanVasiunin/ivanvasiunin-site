import { expect, expectNoSeriousA11yViolations, test } from './fixtures';

// Page shell (ROADMAP 1.1): layer order, landmarks, skip link, header, buttons, no horizontal scroll.

const PAGES = ['/', '/cv'] as const;

for (const path of PAGES) {
  test.describe(`${path} shell`, () => {
    test('declares the cascade layer order before any other CSS', async ({ page }) => {
      await page.goto(path);
      const first = await page.evaluate(() => {
        const rule = document.styleSheets[0]?.cssRules[0];
        return rule instanceof CSSLayerStatementRule ? [...rule.nameList] : null;
      });

      expect(first).toEqual(['reset', 'base', 'tokens', 'components', 'utilities']);
    });

    test('has one banner, one main and one contentinfo landmark', async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
    });

    test('the skip link is the first tab stop and moves focus to main', async ({
      page,
      browserName,
    }) => {
      await page.goto(path);
      const skipLink = page.getByRole('link', { name: 'Skip to content' });

      // First focusable element in DOM order, in every browser.
      const firstFocusable = await page.evaluate(
        () =>
          document.querySelector('a[href], button, input, select, textarea, [tabindex="0"]')
            ?.textContent,
      );
      expect(firstFocusable).toBe('Skip to content');

      // Playwright's WebKit, like Safari, does not Tab to links (Option+Tab on macOS only), so the
      // real Tab key is exercised in the Chromium projects and WebKit focuses the link directly.
      if (browserName === 'webkit') {
        await skipLink.focus();
      } else {
        await page.keyboard.press('Tab');
      }
      await expect(skipLink).toBeFocused();
      await expect(skipLink).toBeInViewport();

      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
    });

    test('the brand link meets the 44 px touch target', async ({ page }) => {
      await page.goto(path);
      const box = await page
        .getByRole('banner')
        .getByRole('link', { name: 'Ivan Vasiunin' })
        .boundingBox();

      expect(box?.height).toBeGreaterThanOrEqual(44);
    });

    test('nothing overflows horizontally', async ({ page }) => {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow).toBeLessThanOrEqual(0);
    });

    for (const colorScheme of ['light', 'dark'] as const) {
      test(`has no serious a11y violations in the ${colorScheme} theme`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await expectNoSeriousA11yViolations(page);
      });
    }
  });
}

test('the header stays at the top while a long page scrolls', async ({ page }) => {
  await page.goto('/');
  // The placeholder is short; make main tall enough to scroll.
  await page.evaluate(() => {
    const filler = document.createElement('div');
    filler.style.blockSize = '3000px';
    document.querySelector('main')?.append(filler);
    window.scrollTo(0, 1500);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  const box = await page.getByRole('banner').boundingBox();

  expect(box?.y).toBeCloseTo(0, 0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`theme-color matches --color-bg in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    const { meta, background } = await page.evaluate((scheme) => {
      const tag = document.querySelector<HTMLMetaElement>(
        `meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`,
      );
      const probe = document.createElement('span');
      probe.style.color = tag?.content ?? '';
      document.body.append(probe);
      const metaColor = getComputedStyle(probe).color;
      probe.remove();
      return { meta: metaColor, background: getComputedStyle(document.body).backgroundColor };
    }, colorScheme);

    expect(meta).toBe(background);
  });
}

test('component styles win over element defaults (layer order works)', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('link', { name: 'Read the CV' });

  // base.scss colours links with the accent; the primary button overrides it with on-accent text
  // and a gradient fill. If the components layer were weaker, the base colour would win.
  const style = await button.evaluate((element) => {
    const computed = getComputedStyle(element);
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-on-accent)';
    document.body.append(probe);
    const onAccent = getComputedStyle(probe).color;
    probe.remove();
    return { color: computed.color, onAccent, background: computed.backgroundImage };
  });

  expect(style.color).toBe(style.onAccent);
  expect(style.background).toContain('linear-gradient');
});

test('button hover and active states fade layers in without moving the button', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Touch devices have no hover state.');
  await page.goto('/');
  const button = page.getByRole('link', { name: 'Read the CV' });
  const layerOpacity = (pseudo: '::before' | '::after'): Promise<string> =>
    button.evaluate((element, which) => getComputedStyle(element, which).opacity, pseudo);
  const before = await button.boundingBox();

  await button.hover();
  await expect.poll(() => layerOpacity('::before')).toBe('1');
  expect(await button.evaluate((element) => getComputedStyle(element).transform)).toBe('none');
  expect(await button.boundingBox()).toEqual(before);

  await page.mouse.down();
  await expect.poll(() => layerOpacity('::after')).toBe('1');
  await page.mouse.up();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the secondary button label keeps the body text colour on hover and press (${colorScheme})`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Touch devices have no hover state.');
    await page.emulateMedia({ colorScheme });
    await page.goto('/cv');
    const button = page.getByRole('link', { name: 'Back to the home page' });
    const colours = () =>
      button.evaluate((element) => ({
        label: getComputedStyle(element).color,
        text: getComputedStyle(document.body).color,
        pressedLayer: getComputedStyle(element, '::after').opacity,
      }));
    const atRest = await colours();
    expect(atRest.label).toBe(atRest.text);

    await button.hover();
    expect((await colours()).label).toBe(atRest.text);
    await page.mouse.down();
    await expect.poll(async () => (await colours()).pressedLayer).toBe('1');
    expect((await colours()).label).toBe(atRest.text);
    await page.mouse.up();
  });
}

test('the brand mark sits at equal distances from the bar edges', async ({ page }) => {
  await page.goto('/');
  const offsets = await page.evaluate(() => {
    const bar = document.querySelector('.site-header__bar')?.getBoundingClientRect();
    const mark = document.querySelector('.site-header__mark')?.getBoundingClientRect();
    if (!bar || !mark) return null;
    return {
      top: Math.round(mark.top - bar.top),
      bottom: Math.round(bar.bottom - mark.bottom),
      start: Math.round(mark.left - bar.left),
    };
  });

  expect(offsets?.top).toBe(offsets?.bottom);
  expect(offsets?.start).toBe(offsets?.top);
});

test('primary and secondary buttons meet the 44 px touch target', async ({ page }) => {
  for (const [path, name] of [
    ['/', 'Read the CV'],
    ['/cv', 'Back to the home page'],
  ] as const) {
    await page.goto(path);
    const box = await page.getByRole('link', { name }).boundingBox();
    expect(box?.height, name).toBeGreaterThanOrEqual(44);
  }
});
