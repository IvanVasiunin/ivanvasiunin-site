import type { Page } from '@playwright/test';

import { mockScenario, toSse } from '../src/lib/chat/mock/scenarios';
import { expect, expectNoSeriousA11yViolations, test } from './fixtures';

// The knowledge map (SPEC US-A11, US-A12; ADR-0012): a card beside the chat from 80rem, none on
// phones. Its data is the fixed file fixtures.ts routes (map-points.ts); the chat is mocked.

const WIDE = { width: 1440, height: 900 };
const input = (page: Page) => page.getByRole('textbox', { name: 'Ask Elio about Ivan' });
const map = (page: Page) => page.getByRole('region', { name: 'Knowledge map' });

async function mockChat(page: Page): Promise<void> {
  await page.route('**/api/chat', async (route) => {
    const body: unknown = route.request().postDataJSON();
    const question =
      typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : '';
    const scenario = mockScenario(question);
    if (scenario.kind === 'http-error') {
      await route.fulfill({ status: scenario.status, json: scenario.body });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: scenario.steps.map((step) => toSse(step.event)).join(''),
    });
  });
}

async function ask(page: Page, question: string): Promise<void> {
  await input(page).fill(question);
  await input(page).press('Enter');
}

test.describe('knowledge map on a wide screen', () => {
  test.skip(({ isMobile }) => isMobile, 'The map is desktop-only.');

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(WIDE);
    await mockChat(page);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`stands beside the chat and says what it is (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');

      await expect(map(page).getByRole('heading', { name: 'Knowledge map' })).toBeVisible();
      await expect(map(page)).toContainText('Each dot is a passage Elio can read.');
      const [chat, card] = await Promise.all([input(page).boundingBox(), map(page).boundingBox()]);
      expect((card?.x ?? 0) > (chat?.x ?? 0) + (chat?.width ?? 0)).toBe(true);
      await expectNoSeriousA11yViolations(page);
    });
  }

  test('an answer lights its sources and the caption names its topics', async ({ page }) => {
    await page.goto('/');
    await ask(page, 'What did Ivan do at BrainRocket?');

    await expect(map(page)).toContainText(/Elio read \d passages for this answer\./);
    await expect(map(page)).toContainText(/Topics: .*BrainRocket/);
  });

  test('pointing at a source shows its star with a tooltip', async ({ page }) => {
    await page.goto('/');
    await ask(page, 'What did Ivan do at BrainRocket?');
    const source = page.getByRole('region', { name: 'Sources' }).getByRole('listitem').first();
    await expect(source).toBeVisible();
    // Let the camera settle on the lit stars first.
    await page.waitForTimeout(3000);

    await source.hover();

    await expect(
      map(page).getByText('Read for this answer · relevance', { exact: false }),
    ).toBeVisible();
  });

  test('"What is this?" opens, closes with Escape and gives focus back', async ({ page }) => {
    await page.goto('/');
    const button = map(page).getByRole('button', { name: 'What is this?' });

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(map(page).getByRole('heading', { name: 'What is this map?' })).toBeVisible();
    await expect(map(page).getByRole('button', { name: 'Got it' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });

  test('a broken points file hides the map and the chat keeps working', async ({ page }) => {
    await page.route('**/data/points.json', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto('/');

    await expect(map(page)).toHaveCount(0);
    await ask(page, 'What did Ivan do at BrainRocket?');
    await expect(page.getByRole('region', { name: 'Sources' })).toBeVisible();
  });
});

test('phones get no map and never fetch its data', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Only on phones.');
  const fetched: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/data/points.json')) fetched.push(request.url());
  });

  await page.goto('/');
  await expect(input(page)).toBeVisible();

  await expect(map(page)).toBeHidden();
  expect(fetched).toEqual([]);
});
