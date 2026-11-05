import type { Page } from '@playwright/test';
import { expect, expectNoSeriousA11yViolations, test } from './fixtures';

// ROADMAP 2.6: "Back to top" (src/components/ScrollTop). A link to #top that appears once the page has
// scrolled; hidden (and out of the tab order) at the top and on pages too short to scroll.

const button = (page: Page) => page.getByRole('link', { name: 'Back to top' });

test('is hidden at the top, appears after scrolling and brings the reader back up', async ({
  page,
}) => {
  await page.goto('/cv');
  const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
  test.skip(!supported, 'Needs scroll-driven animations (elsewhere the button is always shown).');

  await expect(button(page)).toBeHidden();

  await page.evaluate(() => {
    window.scrollTo({ top: 2000, behavior: 'instant' });
  });
  await expect(button(page)).toBeVisible();
  await expect(button(page)).toHaveAttribute('href', '#top');

  await button(page).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(button(page)).toBeHidden();
  // Keyboard users are not left on the hidden button.
  await expect(page.getByRole('main')).toBeFocused();
});

test('a click ignites the engine on the pad, then the rocket climbs and pulls the page up', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/cv');
  await page.evaluate(() => {
    window.scrollTo({ top: 2000, behavior: 'instant' });
  });
  const hook = page.locator('[data-scroll-top]');
  const flame = () =>
    page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.scroll-top__flame') ?? document.body)
          .animationName,
    );
  await button(page).click();

  // Ignition: the engine lights while the rocket and the page stay put.
  await expect(hook).toHaveAttribute('data-state', 'ignition');
  expect(await flame()).toBe('scroll-top-ignite');
  expect(await page.evaluate(() => window.scrollY)).toBe(2000);

  // Ascent: the rocket moves up and the page follows.
  await expect(hook).toHaveAttribute('data-state', 'ascent');
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 3000 })
    .toBeLessThan(2000);

  // Landed: at the top, the state cleared, the rocket back in place for next time.
  await expect(hook).not.toHaveAttribute('data-state', /.+/, { timeout: 5000 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page.evaluate(
      () => document.querySelector<SVGElement>('[data-scroll-top-rocket]')?.style.transform,
    ),
  ).toBe('');
});

test('with reduced motion there is no launch: the page goes straight to the top', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cv');
  await page.evaluate(() => {
    window.scrollTo({ top: 2000, behavior: 'instant' });
  });
  await button(page).click();

  // The button is hidden again at the top, so it is found by its hook, not by its role.
  await expect(page.locator('[data-scroll-top]')).not.toHaveAttribute('data-state', /.+/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('meets the 44 px touch target and does not cover the mobile mode switch', async ({ page }) => {
  await page.goto('/cv');
  await page.evaluate(() => {
    window.scrollTo({ top: 2000, behavior: 'instant' });
  });
  const box = await button(page).boundingBox();
  const modeSwitch = await page.getByRole('navigation', { name: 'Mode' }).boundingBox();

  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  if (box && modeSwitch) {
    const overlaps =
      box.x < modeSwitch.x + modeSwitch.width &&
      modeSwitch.x < box.x + box.width &&
      box.y < modeSwitch.y + modeSwitch.height &&
      modeSwitch.y < box.y + box.height;
    expect(overlaps).toBe(false);
  }
});

test('on phones it stands level with the floating mode switch, beside it', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'From md the mode switch is in the header.');
  // Below 24em the corner beside the switch is too narrow: the rocket stands above it there.
  test.skip((page.viewportSize()?.width ?? 0) < 24 * 16, 'Too narrow for the side-by-side layout.');
  await page.goto('/cv');
  await page.evaluate(() => {
    window.scrollTo({ top: 2000, behavior: 'instant' });
  });
  const box = await button(page).boundingBox();
  const modeSwitch = await page.getByRole('navigation', { name: 'Mode' }).boundingBox();
  expect(box && modeSwitch).toBeTruthy();
  if (box && modeSwitch) {
    const centre = (rect: { y: number; height: number }): number => rect.y + rect.height / 2;
    expect(Math.abs(centre(box) - centre(modeSwitch))).toBeLessThan(1);
    expect(box.x).toBeGreaterThanOrEqual(modeSwitch.x + modeSwitch.width);
  }
});

test('stays hidden on a page too short to scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 2000 });
  await page.goto('/');
  const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
  test.skip(!supported, 'Needs scroll-driven animations.');

  await expect(button(page)).toBeHidden();
});

test('is not printed', async ({ page }) => {
  await page.goto('/cv');
  await page.evaluate(() => {
    window.scrollTo({ top: 2000, behavior: 'instant' });
  });
  await page.emulateMedia({ media: 'print' });

  await expect(button(page)).toBeHidden();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`has no serious a11y violations when shown (${colorScheme})`, async ({ page }) => {
    // Reduced motion: blocks entering at the bottom edge are mid-fade while scrolling (the scroll
    // reveal), which axe would read as low contrast. The check is about the page with the button.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/cv');
    await page.evaluate(() => {
      window.scrollTo({ top: 2000, behavior: 'instant' });
    });
    await expectNoSeriousA11yViolations(page);
  });
}
