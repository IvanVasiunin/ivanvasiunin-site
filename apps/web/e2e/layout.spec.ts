import { chooseTheme, expect, expectNoSeriousA11yViolations, test } from './fixtures';

// Page shell (ROADMAP 1.1): layer order, landmarks, skip link, header, buttons, no horizontal scroll.

const PAGES = ['/', '/cv', '/privacy'] as const;

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
        await chooseTheme(page, colorScheme);
        await page.goto(path);
        await expectNoSeriousA11yViolations(page);
      });
    }
  });
}

test('the header stays at the top while a long page scrolls', async ({ page }) => {
  // The CV: a long page. (AI mode fits the window from md and scrolls inside its chat panel.)
  await page.goto('/cv');
  await page.evaluate(() => {
    window.scrollTo(0, 1500);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  const box = await page.getByRole('banner').boundingBox();

  expect(box?.y).toBeCloseTo(0, 0);
});

test('the header scrim is invisible at the top of the page and fades in on scroll', async ({
  page,
}) => {
  await page.goto('/cv');
  const scrim = () =>
    page.evaluate(() => ({
      supported: CSS.supports('animation-timeline: scroll()'),
      opacity: getComputedStyle(document.querySelector('.site-header') ?? document.body, '::before')
        .opacity,
    }));

  // A tint over the bare backdrop read as a flat stripe across the top (Ivan, 2026-11-03), so at the
  // top the sky shows through untouched; without scroll-driven animations the scrim is always on.
  // Polled: the scroll timeline becomes active a frame after load.
  const { supported } = await scrim();
  await expect.poll(async () => (await scrim()).opacity).toBe(supported ? '0' : '1');

  await page.evaluate(() => {
    window.scrollTo({ top: 800, behavior: 'instant' });
  });
  await expect.poll(async () => (await scrim()).opacity).toBe('1');
});

test('the header scrim covers only the bar and its soft edges, not the whole width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cv');
  const { scrim, bar, viewport } = await page.evaluate(() => {
    const header = document.querySelector('.site-header') ?? document.body;
    return {
      scrim: Number.parseFloat(getComputedStyle(header, '::before').width),
      bar: document.querySelector('.site-header__bar')?.getBoundingClientRect().width ?? 0,
      viewport: document.documentElement.clientWidth,
    };
  });

  // Ivan, 2026-11-03: a full-width blurred band was too heavy; the side fades are 24 px each.
  expect(scrim).toBeGreaterThanOrEqual(bar);
  expect(scrim).toBeLessThanOrEqual(bar + 2 * 24);
  expect(scrim).toBeLessThan(viewport - 100);
});

test('the header scrim stays hidden on a page too short to scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 2000 });
  await page.goto('/');
  const state = () =>
    page.evaluate(() => ({
      supported: CSS.supports('animation-timeline: scroll()'),
      scrolls: document.documentElement.scrollHeight > window.innerHeight,
      opacity: getComputedStyle(document.querySelector('.site-header') ?? document.body, '::before')
        .opacity,
    }));
  const { supported, scrolls } = await state();
  test.skip(!supported, 'Needs scroll-driven animations.');

  expect(scrolls).toBe(false);
  await expect.poll(async () => (await state()).opacity).toBe('0');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`theme-color matches --color-bg in the ${colorScheme} theme`, async ({ page }) => {
    await chooseTheme(page, colorScheme);
    await page.goto('/');
    const { meta, background } = await page.evaluate(() => {
      const tag = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const probe = document.createElement('span');
      probe.style.color = tag?.content ?? '';
      document.body.append(probe);
      const metaColor = getComputedStyle(probe).color;
      probe.remove();
      return { meta: metaColor, background: getComputedStyle(document.body).backgroundColor };
    });

    expect(meta).toBe(background);
  });
}

test('component styles win over element defaults (layer order works)', async ({ page }) => {
  // The site's link-styled button since the home page's "Read the CV" went (2026-11-05).
  await page.goto('/cv');
  const button = page.getByRole('link', { name: 'Download PDF' });

  // base.scss colours links with the accent; the secondary button overrides it with the text colour
  // and a gradient fill. If the components layer were weaker, the base colour would win.
  const style = await button.evaluate((element) => {
    const computed = getComputedStyle(element);
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-text)';
    document.body.append(probe);
    const text = getComputedStyle(probe).color;
    probe.remove();
    return { color: computed.color, text, background: computed.backgroundImage };
  });

  expect(style.color).toBe(style.text);
  expect(style.background).toContain('linear-gradient');
});

test('button hover and active states fade layers in without moving the button', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Touch devices have no hover state.');
  await page.goto('/cv');
  const button = page.getByRole('link', { name: 'Download PDF' });
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
    await chooseTheme(page, colorScheme);
    await page.goto('/cv');
    const button = page.getByRole('link', { name: 'Download PDF' });
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

test('link buttons meet the 44 px touch target', async ({ page }) => {
  // The site has no primary link button since the home page's "Read the CV" went (2026-11-05).
  await page.goto('/cv');
  const box = await page.getByRole('link', { name: 'Download PDF' }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test('the PDF link sits beside the Brief / Full switch, with a short label on phones', async ({
  page,
  isMobile,
}) => {
  // Ivan, 2026-11-05: next to the switch it read as a third view; an icon sets the action apart.
  await page.goto('/cv');
  // Exact: the hidden verb and "PDF" must not run together ("DownloadPDF").
  const link = page.getByRole('link', { name: 'Download PDF', exact: true });
  const switchBox = await page.getByRole('group', { name: 'CV view' }).boundingBox();
  const linkBox = await link.boundingBox();
  expect(switchBox && linkBox).toBeTruthy();
  // One row, even on a phone.
  if (switchBox && linkBox) expect(Math.abs(linkBox.y - switchBox.y)).toBeLessThan(1);

  // On phones only "PDF" shows: the verb is visually hidden (a 1 px box), still in the name.
  const verbWidth = await link
    .locator('.cv-header__pdf-verb')
    .evaluate((element) => element.getBoundingClientRect().width);
  if (isMobile) expect(verbWidth).toBeLessThanOrEqual(1);
  else expect(verbWidth).toBeGreaterThan(20);
});

test('the brand mark planet orbits while the brand link is hovered', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch devices have no hover state.');
  await page.goto('/');
  const brand = page.getByRole('banner').getByRole('link', { name: 'Ivan Vasiunin' });
  const planet = () =>
    brand.evaluate((element) => {
      const node = element.querySelector('.site-header__planet');
      if (!node) return null;
      const style = getComputedStyle(node);
      return { state: style.animationPlayState, transform: style.transform };
    });

  expect(await planet()).toMatchObject({ state: 'paused' });
  await brand.hover();
  expect(await planet()).toMatchObject({ state: 'running' });
  const first = (await planet())?.transform;
  await expect.poll(async () => (await planet())?.transform).not.toBe(first);
});

test('the brand mark planet stays still with reduced motion', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Touch devices have no hover state.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const brand = page.getByRole('banner').getByRole('link', { name: 'Ivan Vasiunin' });
  await brand.hover();

  expect(
    await brand.evaluate((element) => {
      const node = element.querySelector('.site-header__planet');
      return node ? getComputedStyle(node).animationName : 'missing';
    }),
  ).toBe('none');
});

test('the brand mark planet also orbits on keyboard focus', async ({ page, browserName }) => {
  test.skip(
    browserName === 'webkit',
    'WebKit does not Tab to links by default (Safari behaviour).',
  );
  await page.goto('/');
  await page.keyboard.press('Tab'); // skip link
  await page.keyboard.press('Tab'); // brand
  const brand = page.getByRole('banner').getByRole('link', { name: 'Ivan Vasiunin' });
  await expect(brand).toBeFocused();

  expect(
    await brand.evaluate((element) => {
      const node = element.querySelector('.site-header__planet');
      return node ? getComputedStyle(node).animationPlayState : 'missing';
    }),
  ).toBe('running');
});

test('the brand mark is drawn in system colours in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  const paint = await page
    .getByRole('banner')
    .getByRole('link', { name: 'Ivan Vasiunin' })
    .evaluate((element) => {
      const reticle = element.querySelector('.site-header__reticle');
      const planet = element.querySelector('.site-header__planet');
      return {
        stroke: reticle ? getComputedStyle(reticle).stroke : 'missing',
        fill: planet ? getComputedStyle(planet).fill : 'missing',
      };
    });

  // Plain system colours instead of the gradient paint server.
  expect(paint.stroke).not.toContain('url(');
  expect(paint.fill).not.toContain('url(');
});

test('the content and the backdrop do not shift sideways between a short page and a long one', async ({
  playwright,
  browserName,
  isMobile,
  baseURL,
}) => {
  // Mobile browsers draw scrollbars over the page, so they never take layout space there.
  test.skip(isMobile || browserName !== 'chromium', 'Needs classic scrollbars (desktop Chromium).');
  // Headless Chromium hides scrollbars by default; this test needs real ones.
  const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    // Tall enough that "/" fits without scrolling, while "/cv" scrolls.
    const page = await browser.newPage({
      ...(baseURL ? { baseURL } : {}),
      viewport: { width: 1280, height: 1100 },
    });
    const measure = async (path: string) => {
      await page.goto(path);
      return page.evaluate(() => ({
        scrolls: document.documentElement.scrollHeight > window.innerHeight,
        scrollbar: window.innerWidth - document.documentElement.clientWidth,
        // The page frame both pages share (AI mode's heading sits inside the chat panel).
        main: document.querySelector('main')?.getBoundingClientRect().left ?? Number.NaN,
        chart:
          document.querySelector('.backdrop__chart')?.getBoundingClientRect().left ?? Number.NaN,
      }));
    };
    const home = await measure('/');
    const cv = await measure('/cv');

    expect(home.scrolls).toBe(false);
    expect(cv.scrolls).toBe(true);
    expect(cv.scrollbar).toBeGreaterThan(0);
    expect(cv.main).toBeCloseTo(home.main, 0);
    expect(cv.chart).toBeCloseTo(home.chart, 0);
  } finally {
    await browser.close();
  }
});
