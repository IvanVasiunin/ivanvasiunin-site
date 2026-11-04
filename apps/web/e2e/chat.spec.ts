import type { Page, Route } from '@playwright/test';

import { mockScenario, toSse } from '../src/lib/chat/mock/scenarios';
import { expect, expectNoSeriousA11yViolations, test } from './fixtures';

// The chat on `/` against a mocked `/api/chat` (ROADMAP 3.9; the real endpoint arrives in 3.8). The
// mock answers with the scenarios of src/lib/chat/mock/scenarios.ts, picked by the question.

const CHAT = '**/api/chat';

/** Answers every chat request like the mocked API; returns the questions it received. */
async function mockChat(page: Page): Promise<string[]> {
  const questions: string[] = [];
  await page.route(CHAT, async (route) => {
    const body: unknown = route.request().postDataJSON();
    const question =
      typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : '';
    questions.push(question);
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
  return questions;
}

/** Holds chat requests unanswered until `release` (a request still "thinking"). */
async function holdChat(page: Page): Promise<{ release: () => Promise<void> }> {
  const held: Route[] = [];
  await page.route(CHAT, (route) => {
    held.push(route);
  });
  return {
    release: async () => {
      // An aborted request can no longer be answered; that is the point of Stop.
      await Promise.all(held.map((route) => route.abort().catch(() => undefined)));
    },
  };
}

const input = (page: Page) => page.getByRole('textbox', { name: 'Ask Elio about Ivan' });

async function ask(page: Page, question: string): Promise<void> {
  await expect(input(page)).toBeEnabled();
  await input(page).fill(question);
  await input(page).press('Enter');
}

test.describe('chat', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the empty state introduces Elio without a11y violations (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mockChat(page);
      await page.goto('/');

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Ask Elio about Ivan’s work',
      );
      await expect(
        page.getByRole('list', { name: 'Example questions' }).getByRole('link'),
      ).toHaveCount(3);
      await expect(page.getByText(/Elio is an AI assistant and can be wrong/)).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });
  }

  test('an example question fills the input and sends nothing', async ({ page }) => {
    const questions = await mockChat(page);
    await page.goto('/');
    await expect(input(page)).toBeEnabled();

    await page.getByRole('link', { name: 'Which technologies does Ivan use?' }).click();

    await expect(input(page)).toHaveValue('Which technologies does Ivan use?');
    await expect(input(page)).toBeFocused();
    await expect(page).toHaveURL(/\/$/);
    expect(questions).toEqual([]);
  });

  test('?q= prefills and focuses the input, and never sends', async ({ page }) => {
    const questions = await mockChat(page);
    await page.goto('/?q=Did%20Ivan%20mentor%20anyone%3F');

    await expect(input(page)).toHaveValue('Did Ivan mentor anyone?');
    await expect(input(page)).toBeFocused();
    // Give an accidental send every chance to happen before asserting it did not.
    await page.waitForTimeout(500);
    expect(questions).toEqual([]);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`a question gets a streamed answer with sources (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      const questions = await mockChat(page);
      await page.goto('/');

      await ask(page, 'What did Ivan do at BrainRocket?');

      const turn = page.getByRole('article', { name: 'What did Ivan do at BrainRocket?' });
      await expect(turn.getByRole('button', { name: 'Copy' })).toBeVisible();
      await expect(turn.getByText('Homepage performance.')).toBeVisible();
      await expect(
        turn
          .getByRole('region', { name: 'Sources' })
          .getByRole('link', { name: 'CV — BrainRocket' }),
      ).toHaveAttribute('href', '/cv#job-brainrocket');
      await expect(input(page)).toHaveValue('');
      expect(questions).toEqual(['What did Ivan do at BrainRocket?']);
      await expectNoSeriousA11yViolations(page);
    });
  }

  test('Stop ends a pending answer and the input is ready for the next question', async ({
    page,
  }) => {
    const held = await holdChat(page);
    await page.goto('/');

    await ask(page, 'What did Ivan do at BrainRocket?');
    await expect(page.getByText('Understanding')).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();

    await expect(page.getByText('Stopped before the answer started.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    await expect(input(page)).toBeFocused();
    await held.release();
  });

  test('a rate limit says when to try again', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');

    await ask(page, 'Test the limit');

    const turn = page.getByRole('article');
    await expect(turn.getByText('Too many questions in a short time.')).toBeVisible();
    await expect(turn.getByText(/Try again in 30 seconds/)).toBeVisible();
    await expect(turn.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('unsafe Markdown in an answer never runs or loads anything', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');

    await ask(page, 'Show me markdown');

    const answer = page.getByRole('article');
    await expect(answer.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(answer.locator('script, img, [onerror]')).toHaveCount(0);
    await expect(answer.getByRole('link', { name: 'Click me' })).toHaveCount(0);
    expect(await page.evaluate(() => 'xss' in window || '__xss' in window)).toBe(false);
  });

  test('the input stays at least 16 px and the controls meet the 44 px target', async ({
    page,
  }) => {
    await mockChat(page);
    await page.goto('/');

    expect(await input(page).evaluate((element) => getComputedStyle(element).fontSize)).toBe(
      '16px',
    );
    for (const control of [
      page.getByRole('button', { name: 'Send' }),
      page.getByRole('link', { name: 'What did Ivan do at BrainRocket?' }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('on small screens the docked input sits above the floating mode switch', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'The mode switch floats at the bottom only below md.');
    await mockChat(page);
    await page.goto('/');
    // A conversation long enough to scroll, so the input is docked at the bottom.
    for (const question of ['What did Ivan do at BrainRocket?', 'Tell me more about BrainRocket']) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }

    // While typing on a touch screen the keyboard is up and the mode switch steps aside.
    await expect(input(page)).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Mode' })).toBeHidden();

    // Done typing: the switch is back, and the docked input sits above it.
    await input(page).blur();
    const modeSwitch = page.getByRole('navigation', { name: 'Mode' });
    await expect(modeSwitch).toBeVisible();
    const field = await input(page).boundingBox();
    const bar = await modeSwitch.boundingBox();
    expect(field && bar).toBeTruthy();
    if (field && bar) expect(field.y + field.height).toBeLessThanOrEqual(bar.y);
  });
});
