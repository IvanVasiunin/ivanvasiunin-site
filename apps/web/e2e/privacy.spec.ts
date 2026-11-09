import { expect, test } from './fixtures';

// The privacy notice (SPEC US-X3, §6.6; ROADMAP 4.7). The shell, axe and the CSP are covered for
// `/privacy` in smoke, layout and security specs; this file checks what the notice promises and how a
// visitor reaches it.

test('the notice names what is stored, for how long, and where to ask', async ({ page }) => {
  await page.goto('/privacy');

  await expect(page).toHaveTitle(/Privacy/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  for (const section of [
    'When you ask Elio a question',
    'What the site keeps, and for how long',
    'Monitoring',
    'What is never stored',
    'What your browser keeps',
    'Questions',
  ]) {
    await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
  }
  // The retention matches CHAT_STATS_RETENTION_DAYS (core/config.py) and the Langfuse setting.
  await expect(
    page.getByText('These records are deleted automatically after 30 days.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'ivanvasyunin@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:ivanvasyunin@gmail.com',
  );
});

test('the notice works without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/privacy');

  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await context.close();
});

test('the chat disclosure leads to the notice', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'How chats are handled' }).click();

  await expect(page).toHaveURL(/\/privacy\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
});

// The side card (PrivacyPromises, Ivan, 2026-11-08): Elio says the key promises one at a time.
// The turning itself is unit-tested (components/PrivacyPromises/promises.test.ts).
const CARD = 'Elio’s promises and key facts';

test('Elio’s card shows one promise at a time; the dots and Pause control it', async ({ page }) => {
  await page.goto('/privacy');
  const card = page.getByRole('complementary', { name: CARD });
  const promises = card.getByRole('list', { name: 'Elio’s promises' }).getByRole('listitem');
  await expect(promises).toHaveCount(5);

  await card.getByRole('button', { name: 'Promise 3 of 5' }).click();
  await expect(promises.nth(2)).toHaveCSS('opacity', '1');
  await expect(promises.nth(0)).toHaveCSS('opacity', '0');

  const pause = card.getByRole('button', { name: 'Pause the promises' });
  await pause.click();
  await expect(card.getByRole('button', { name: 'Play the promises' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card.getByText('Memory only', { exact: true })).toBeVisible();
});

test('with reduced motion the promises start paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/privacy');

  await expect(
    page
      .getByRole('complementary', { name: CARD })
      .getByRole('button', { name: 'Play the promises' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('without JavaScript the card shows the first promise and no controls', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/privacy');

  const card = page.getByRole('complementary', { name: CARD });
  await expect(card.getByText('Your IP address stays in the server’s memory only')).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await context.close();
});

test.describe('layout', () => {
  // Impeccable audit, 2026-11-08: on a laptop screen the demo card sat at the top while the text ran
  // on below it, leaving an empty column. The card now fits and stays in view as the text scrolls.
  test('the demo card stays in view on a laptop-height window', async ({ page, isMobile }) => {
    test.skip(isMobile, 'two columns are a desktop layout');
    await page.setViewportSize({ width: 1440, height: 760 });
    await page.goto('/privacy');
    const aside = page.getByRole('complementary', { name: CARD });
    await expect(aside).toHaveCSS('position', 'sticky');

    await page.mouse.wheel(0, 400);
    await expect
      .poll(async () => (await aside.boundingBox())?.y ?? 0, { timeout: 5_000 })
      .toBeGreaterThan(0);
    const after = await aside.boundingBox();
    // Still fully inside the window after scrolling: sticky, not scrolled away.
    expect((after?.y ?? 0) + (after?.height ?? 0)).toBeLessThanOrEqual(760);
  });

  test('a window too short for the card scrolls it with the page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'two columns are a desktop layout');
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto('/privacy');

    await expect(page.getByRole('complementary', { name: CARD })).toHaveCSS('position', 'static');
  });

  test('large text settings never push the page sideways on a phone', async ({ browser }) => {
    // The test's style tag is inline CSS, which the page's CSP blocks on purpose.
    const context = await browser.newContext({ bypassCSP: true });
    const page = await context.newPage();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/privacy');
    // Twice the text size (the header's own fit at this size is a separate audit item).
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });

    const overflow = await page
      .getByRole('main')
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await context.close();
  });
});
