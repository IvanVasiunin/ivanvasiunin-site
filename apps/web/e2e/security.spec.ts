import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

// Content Security Policy (infra-security.md): Astro writes a hash-based CSP <meta> on every page
// (astro.config.mjs → security.csp). These tests load the real build and fail on any violation, so
// a new inline script or style without a hash is caught here, in every browser.

const PATHS = ['/', '/cv'] as const;

/** Records CSP violations from the first byte of every document the page loads. */
async function recordViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const store = window as unknown as { cspViolations: string[] };
    store.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      store.cspViolations.push(`${event.violatedDirective}: ${event.blockedURI || 'inline'}`);
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
}

for (const path of PATHS) {
  test(`${path} has a hash-based CSP and no violations`, async ({ page }) => {
    const violations = await recordViolations(page);
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);

    const csp = await page
      .locator('meta[http-equiv="content-security-policy"]')
      .getAttribute('content');
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(await violations()).toEqual([]);
  });
}

test('the theme toggle and the mode switch run without CSP violations', async ({ page }) => {
  const violations = await recordViolations(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Dark theme' }).click();
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('link', { name: 'Text mode' })
    .click();
  await expect(page).toHaveURL(/\/cv\/?$/);

  expect(await violations()).toEqual([]);
});

test('an injected inline script is blocked', async ({ page }) => {
  await page.goto('/');
  const ran = await page.evaluate(async () => {
    const flag = window as unknown as { injected?: boolean };
    const script = document.createElement('script');
    script.textContent = 'window.injected = true;';
    document.body.append(script);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return flag.injected === true;
  });

  expect(ran).toBe(false);
});
