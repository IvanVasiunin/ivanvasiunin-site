import { expect, expectNoSeriousA11yViolations, test } from './fixtures';

// Smoke tests: prove that the build, the preview server, every Playwright project and axe work.
// `/privacy` (ROADMAP 4.7) is a plain page of the same shell.
for (const path of ['/', '/cv', '/privacy']) {
  test(`${path} renders a valid page shell without serious a11y violations`, async ({ page }) => {
    await page.goto(path);

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expectNoSeriousA11yViolations(page);
  });
}

test('the home page links to the CV', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Text mode' }).click();

  await expect(page).toHaveURL(/\/cv\/?$/);
});

test('network throttling is applied in throttled projects', async ({ page, throttle }) => {
  test.skip(throttle === null, 'This project runs without throttling.');

  await page.goto('/');
  const navigationMs = await page.evaluate(() => {
    const [navigation] = performance.getEntriesByType(
      'navigation',
    ) as PerformanceNavigationTiming[];
    return navigation?.duration ?? 0;
  });

  // Chromium adds the emulated latency after `responseStart`, so the whole navigation is measured.
  // Without throttling this page loads locally in ~15 ms.
  expect(navigationMs).toBeGreaterThanOrEqual(throttle?.network.latencyMs ?? 0);
});
