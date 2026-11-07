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

// The side card (PrivacyDemo, Ivan, 2026-11-07): masking runs in the browser on what the visitor
// types, with the server's patterns (lib/privacy/mask.ts), and nothing leaves the page.
test('the masking demo shows what the server keeps and sends nothing', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/privacy');
  await page.waitForLoadState('networkidle');
  // Only what typing sends counts: the page's own loading is done.
  requests.length = 0;

  const demo = page.getByRole('complementary', { name: 'Masking demo and key facts' });
  await expect(demo.getByRole('heading', { name: 'See what the server keeps' })).toBeVisible();
  const input = demo.getByRole('textbox', { name: 'A question to Elio' });
  await expect(input).toBeEditable();

  await input.fill('Write to me@site.dev or t.me/someone, I am Bob');

  await expect(demo.getByText('Write to [email] or [url] I am Bob')).toBeVisible();
  // Screen readers hear the result once typing pauses, not on every key.
  await expect(demo.getByRole('status')).toHaveText('Kept: Write to [email] or [url] I am Bob');
  expect(requests).toEqual([]);
});

test('without JavaScript the demo is a worked example', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/privacy');

  const input = page.getByRole('textbox', { name: 'A question to Elio' });
  await expect(input).not.toBeEditable();
  await expect(
    page.getByText("Hi! I'm Anna ([email], [url]). Which stack does Ivan use?"),
  ).toBeVisible();
  await context.close();
});
