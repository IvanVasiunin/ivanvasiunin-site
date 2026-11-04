import { expect, expectNoSeriousA11yViolations, test } from './fixtures';
import type { Page } from '@playwright/test';

// ROADMAP 2.4: Brief / Full switch on /cv (SPEC §3.2 US-T1). Full is the default and the only view
// without JS; the view is kept in `?view=brief`.

const switchGroup = (page: Page) => page.getByRole('group', { name: 'CV view' });
const option = (page: Page, name: 'Brief' | 'Full') =>
  switchGroup(page).getByRole('button', { name, exact: true });
// A Full-only sentence (job body) and a Brief-only bullet (job frontmatter) from the BrainRocket entry.
const fullText = (page: Page) =>
  page.getByText('Implement interfaces from designs', { exact: false });
const briefText = (page: Page) =>
  page.getByText('I build and review UI for large-scale iGaming platforms', { exact: false });

test.describe('with JS', () => {
  test('shows the Full view by default, with Full pressed', async ({ page }) => {
    await page.goto('/cv');

    await expect(option(page, 'Full')).toHaveAttribute('aria-pressed', 'true');
    await expect(option(page, 'Brief')).toHaveAttribute('aria-pressed', 'false');
    await expect(fullText(page)).toBeVisible();
    await expect(briefText(page)).toBeHidden();
  });

  test('Brief switches the content and the URL, and survives a reload', async ({ page }) => {
    await page.goto('/cv');
    await option(page, 'Brief').click();

    await expect(option(page, 'Brief')).toHaveAttribute('aria-pressed', 'true');
    await expect(briefText(page)).toBeVisible();
    await expect(fullText(page)).toBeHidden();
    await expect(page).toHaveURL(/\/cv\?view=brief$/);

    await page.reload();
    await expect(option(page, 'Brief')).toHaveAttribute('aria-pressed', 'true');
    await expect(briefText(page)).toBeVisible();

    await option(page, 'Full').click();
    await expect(page).toHaveURL(/\/cv$/);
    await expect(fullText(page)).toBeVisible();
  });

  test('a shared ?view=brief link is Brief before the body is parsed (no flash)', async ({
    page,
  }) => {
    // Records data-cv-view at the moment the parser creates <body>: only the inline head script can
    // have run by then (module scripts, even inlined ones, run after parsing). So "brief" here proves
    // the first paint of the content is already Brief.
    await page.addInitScript(() => {
      const store = window as unknown as { cvViewAtBody?: string | null };
      // Init scripts run before <html> exists, so watch the whole document.
      new MutationObserver((records, observer) => {
        const bodyAdded = records.some((record) =>
          [...record.addedNodes].some((node) => node.nodeName === 'BODY'),
        );
        if (!bodyAdded) return;
        store.cvViewAtBody = document.documentElement.getAttribute('data-cv-view');
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto('/cv?view=brief');

    const atBody = await page.evaluate(
      () => (window as unknown as { cvViewAtBody?: string | null }).cvViewAtBody,
    );
    expect(atBody).toBe('brief');
    await expect(briefText(page)).toBeVisible();
    await expect(fullText(page)).toBeHidden();
  });

  test('works from the keyboard; focus stays on the button', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard navigation is a desktop scenario.');
    await page.goto('/cv');
    await option(page, 'Brief').focus();

    await page.keyboard.press('Space');
    await expect(option(page, 'Brief')).toHaveAttribute('aria-pressed', 'true');
    await expect(option(page, 'Brief')).toBeFocused();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(option(page, 'Full')).toHaveAttribute('aria-pressed', 'true');
    await expect(option(page, 'Full')).toBeFocused();
  });

  test('the buttons meet the 44 px touch target', async ({ page }) => {
    await page.goto('/cv');
    for (const name of ['Brief', 'Full'] as const) {
      const box = await option(page, name).boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(44);
      expect(box?.width, name).toBeGreaterThanOrEqual(44);
    }
  });

  test('the Brief view has no serious a11y violations', async ({ page }) => {
    await page.goto('/cv?view=brief');
    await expectNoSeriousA11yViolations(page);
  });
});

test.describe('without JS', () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ['/cv', '/cv?view=brief']) {
    test(`${path} shows the Full view and no switch`, async ({ page }) => {
      await page.goto(path);

      await expect(switchGroup(page)).toBeHidden();
      await expect(fullText(page)).toBeVisible();
      await expect(briefText(page)).toBeHidden();
    });
  }
});
