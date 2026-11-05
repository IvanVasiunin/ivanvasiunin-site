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
