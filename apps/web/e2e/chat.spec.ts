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
        'Hi! I’m Elio, Ivan’s AI assistant.',
      );
      await expect(
        page.getByRole('list', { name: 'Example questions' }).getByRole('link'),
      ).toHaveCount(4);
      await expect(page.getByText(/Elio is an AI assistant and can be wrong/)).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });
  }

  // Under the hood (SPEC US-A9, ROADMAP 5.2): collapsed under a finished answer, opened from the
  // keyboard, the pipeline steps inside, no a11y violations in either theme.
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Under the hood opens under an answer and shows its steps (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mockChat(page);
      await page.goto('/');
      await ask(page, 'What did Ivan do at BrainRocket?');

      const toggle = page.getByRole('button', { name: /^Under the hood/ });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      const panel = page.locator(`[id="${(await toggle.getAttribute('aria-controls')) ?? ''}"]`);
      await expect(panel).toBeHidden();

      await toggle.focus();
      await page.keyboard.press('Enter');

      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toBeFocused();
      await expect(panel).toBeVisible();
      for (const step of ['Router', 'Retrieval', 'Relevance gate', 'Answer']) {
        await expect(panel.getByText(step, { exact: true })).toBeVisible();
      }
      await expect(panel.getByText('About Ivan · en')).toBeVisible();
      await expect(panel.getByText('CV — BrainRocket')).toBeVisible();
      await expect(panel.getByText(/^Total 2\.3 s · about \$0\.0061$/)).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });
  }

  test('a source under an answer links to its place on the CV (ROADMAP 5.3)', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');
    await ask(page, 'What did Ivan do at BrainRocket?');

    const sources = page.getByRole('region', { name: 'Sources' });
    await sources.getByRole('link', { name: 'CV — BrainRocket' }).click();

    await expect(page).toHaveURL(/\/cv#job-brainrocket$/);
    await expect(page.locator('#job-brainrocket')).toBeInViewport();
  });

  test('a topic card fills the input with its question and sends nothing', async ({ page }) => {
    const questions = await mockChat(page);
    await page.goto('/');
    await expect(input(page)).toBeEnabled();

    await page.getByRole('link', { name: /Skills & stack/ }).click();

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
      page.getByRole('link', { name: /Experience/ }),
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

  test('the conversation survives Text mode and back, until New chat', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');
    await ask(page, 'What did Ivan do at BrainRocket?');
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();

    // On a phone the mode switch steps aside while the keyboard is up.
    await input(page).blur();
    await page.getByRole('link', { name: 'Text mode' }).click();
    await expect(page).toHaveURL(/\/cv\/?$/);
    await page.getByRole('link', { name: 'AI mode' }).click();

    // Restored after hydration: the question is back as a turn, not as an example chip.
    await expect(
      page.getByRole('article').getByText('What did Ivan do at BrainRocket?'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'New chat' }).click();
    // The answer and its actions are gone (the same question returns as an example chip).
    await expect(page.getByRole('button', { name: 'Copy' })).toBeHidden();
    await expect(input(page)).toBeFocused();

    await page.reload();
    await expect(page.getByRole('list', { name: 'Example questions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New chat' })).toBeHidden();
  });

  test('a reload starts a new chat', async ({ page }) => {
    // Ivan, 2026-11-06: the mode switch and Back keep the conversation; F5 clears the page.
    await mockChat(page);
    await page.goto('/');
    await ask(page, 'What did Ivan do at BrainRocket?');
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('list', { name: 'Example questions' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New chat' })).toHaveCount(0);
  });

  test('New chat sits by the input, in reach after scrolling back to the first question', async ({
    page,
  }) => {
    // Ivan, 2026-11-06: at the top of the conversation it meant scrolling all the way up.
    await mockChat(page);
    await page.goto('/');
    for (const question of ['What did Ivan do at BrainRocket?', 'What projects has Ivan built?']) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Copy' })).toHaveCount(
        question.includes('projects') ? 2 : 1,
      );
    }
    await input(page).blur();

    await page.getByRole('article').first().scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      document.querySelector('.chat__scroll')?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    });

    const button = page.getByRole('button', { name: 'New chat' });
    await expect(button).toBeInViewport();
    const [newChat, field] = await Promise.all([button.boundingBox(), input(page).boundingBox()]);
    // On the input's row: beside it, its bottom level with the input's bottom row.
    expect(newChat).not.toBeNull();
    expect(field).not.toBeNull();
    expect((newChat?.x ?? 0) + (newChat?.width ?? 0)).toBeLessThanOrEqual(field?.x ?? 0);
    expect(newChat?.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(page.getByRole('article')).toHaveCount(0);
  });

  test('back from the CV, the chat returns to the answer the reader left, not to its end', async ({
    page,
  }) => {
    // Ivan, 2026-11-05: a link in an answer opens the CV; back in AI mode the chat was at its end.
    await mockChat(page);
    await page.goto('/');
    for (const question of [
      'What did Ivan do at BrainRocket?',
      'Which technologies does Ivan use?',
      'Tell me more about BrainRocket',
    ]) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }
    await input(page).blur();

    // The first answer near the top of the visible area (the panel from md, the window below it).
    const first = page.getByRole('article').first();
    const topOf = () =>
      first.evaluate((element) => {
        const area = document.querySelector('.chat__scroll');
        const scrolls = area !== null && getComputedStyle(area).overflowY === 'auto';
        const viewTop = scrolls ? area.getBoundingClientRect().top : 0;
        return element.getBoundingClientRect().top - viewTop;
      });
    await first.evaluate((element) => {
      element.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
    const before = await topOf();

    await page.getByRole('link', { name: 'Text mode' }).click();
    await expect(page).toHaveURL(/\/cv\/?$/);
    await page.getByRole('link', { name: 'AI mode' }).click();
    await expect(first).toBeVisible();

    // The same answer, at the same place, and the chat knows the reader is not at the end.
    await expect.poll(topOf).toBeCloseTo(before, -1);
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
  });

  test('a link in an answer, then Back: the answer with the link is where it was', async ({
    page,
  }) => {
    // Ivan's case (2026-11-05): following "Skills" in an answer to the CV, then going back.
    await mockChat(page);
    await page.goto('/');
    for (const question of [
      'Which technologies does Ivan use?',
      'What did Ivan do at BrainRocket?',
      'Tell me more about BrainRocket',
    ]) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }
    await input(page).blur();

    const link = page
      .getByRole('article')
      .first()
      .getByRole('link', { name: 'Skills', exact: true });
    await link.evaluate((element) => {
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    const before = (await link.boundingBox())?.y ?? Number.NaN;
    await link.click();
    await expect(page).toHaveURL(/\/cv#skills$/);

    await page.goBack();
    await expect(link).toBeInViewport();
    await expect
      .poll(async () => (await link.boundingBox())?.y ?? Number.NaN)
      .toBeCloseTo(before, -1);
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
  });

  test('back from the CV, a reader who left at the end is at the end again', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');
    for (const question of [
      'What did Ivan do at BrainRocket?',
      'Which technologies does Ivan use?',
    ]) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }
    await input(page).blur();

    await page.getByRole('link', { name: 'Text mode' }).click();
    await expect(page).toHaveURL(/\/cv\/?$/);
    await page.getByRole('link', { name: 'AI mode' }).click();

    await expect(page.getByRole('article').last()).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeHidden();
  });

  test('different questions get different answers from the mock', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');

    // Inside the answers (the live region for screen readers repeats the finished answer).
    const answers = page.getByRole('article');
    await ask(page, 'Which technologies does Ivan use?');
    await expect(answers.getByText(/Ivan's core is frontend/)).toBeVisible();
    await ask(page, 'Does Ivan have a dog?');
    await expect(answers.getByText(/far too friendly/)).toBeVisible();
  });

  test('the empty chat opens at the top of the page', async ({ page }) => {
    // Regression: on a phone the follow-the-answer scroll ran with no answer and hid the greeting.
    await mockChat(page);
    await page.goto('/');
    await expect(input(page)).toBeEnabled();

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  });

  test('the topic cards fill the empty panel and each keeps a 44 px touch target', async ({
    page,
  }) => {
    await mockChat(page);
    await page.goto('/');
    const cards = page.getByRole('list', { name: 'Example questions' }).getByRole('link');

    await expect(cards).toHaveCount(4);
    for (const card of await cards.all()) {
      await expect(card).toBeInViewport();
      expect((await card.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    // Two columns from 30em, one below: the cards never overflow a phone's width.
    const width = page.viewportSize()?.width ?? 0;
    const first = await cards.first().boundingBox();
    expect((first?.x ?? 0) + (first?.width ?? 0)).toBeLessThanOrEqual(width);
  });

  test('the input field has hover and fading focus layers', async ({ page, isMobile }) => {
    await mockChat(page);
    await page.goto('/');
    // Disabled until hydrated: a disabled field neither hovers nor takes focus.
    await expect(input(page)).toBeEnabled();
    const field = page.locator('.chat-composer__field');
    const layer = (pseudo: '::before' | '::after'): Promise<string> =>
      field.evaluate((element, which) => getComputedStyle(element, which).opacity, pseudo);

    if (!isMobile) {
      await field.hover();
      await expect.poll(() => layer('::before')).toBe('1');
    }
    await input(page).focus();
    await expect.poll(() => layer('::after')).toBe('1');
    // The ring fades in (a transition), it does not snap on.
    expect(
      await field.evaluate((element) => getComputedStyle(element, '::after').transitionProperty),
    ).toContain('opacity');
  });

  test('the send button sits in the centre of the field', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');
    const field = await page.locator('.chat-composer__field').boundingBox();
    const button = await page.getByRole('button', { name: 'Send' }).boundingBox();
    expect(field && button).toBeTruthy();
    if (field && button) {
      const above = button.y - field.y;
      const below = field.y + field.height - (button.y + button.height);
      const right = field.x + field.width - (button.x + button.width);
      expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
      expect(Math.abs(right - below)).toBeLessThanOrEqual(1);
    }
  });

  test('from md the chat is a panel: the conversation scrolls inside it, never under the input', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'Below md the page scrolls and a scrim covers the docked input instead.');
    await mockChat(page);
    await page.goto('/');
    for (const question of [
      'What did Ivan do at BrainRocket?',
      'Which technologies does Ivan use?',
    ]) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }

    // The page itself stays put; the panel's scroll area followed the answer to its end.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const area = page.locator('.chat__scroll');
    const distance = await area.evaluate(
      (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
    );
    expect(distance).toBeLessThanOrEqual(1);

    // The scroll area ends above the input: no text can pass behind it.
    const areaBox = await area.boundingBox();
    const field = await page.locator('.chat-composer__field').boundingBox();
    expect(areaBox && field).toBeTruthy();
    if (areaBox && field) expect(areaBox.y + areaBox.height).toBeLessThanOrEqual(field.y);
    // And the whole panel, input included, fits in the window.
    const viewport = page.viewportSize();
    if (field && viewport) expect(field.y + field.height).toBeLessThanOrEqual(viewport.height);
  });

  test('below md a blurred scrim covers text passing behind the input, only while reading up', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'From md the input is inside the panel, with nothing behind it.');
    await mockChat(page);
    await page.goto('/');
    const scrim = (): Promise<string> =>
      page
        .locator('.chat__dock')
        .evaluate((element) => getComputedStyle(element, '::before').content);
    for (const question of [
      'What did Ivan do at BrainRocket?',
      'Which technologies does Ivan use?',
    ]) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }

    // At the end of the conversation nothing passes behind the input: no scrim over the disclosure.
    await input(page).blur();
    expect(await scrim()).toBe('none');

    await page.evaluate(() => {
      window.scrollBy(0, -600);
    });
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();
    expect(await scrim()).not.toBe('none');
  });

  test('below md the end of the conversation is the bottom, even with the footer still below', async ({
    page,
    isMobile,
  }) => {
    // Regression (Ivan, 2026-11-05): a little above the footer the last answer and the input were in
    // full view, yet "Jump to latest" stayed and the scrim blurred the disclosure under the input.
    test.skip(!isMobile, 'From md the conversation scrolls inside the panel.');
    await mockChat(page);
    await page.goto('/');
    for (const question of [
      'What did Ivan do at BrainRocket?',
      'Which technologies does Ivan use?',
    ]) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }
    await input(page).blur();

    await page.evaluate(() => {
      window.scrollBy(0, -600);
    });
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();

    // Back down until the footer's top edge is at the bottom of the screen: the footer is still
    // below, farther than the follow threshold, but the conversation and the input are in view.
    await page.evaluate(() => {
      const footer = document.querySelector('footer')?.getBoundingClientRect();
      if (footer) window.scrollBy(0, footer.top - window.innerHeight);
    });
    await expect(page.getByText('Elio is an AI assistant and can be wrong')).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight - window.scrollY - window.innerHeight,
      ),
    ).toBeGreaterThan(80);
    await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeHidden();
    expect(
      await page
        .locator('.chat__dock')
        .evaluate((element) => getComputedStyle(element, '::before').content),
    ).toBe('none');
  });

  test('from md the answers end exactly where the input ends', async ({ page, isMobile }) => {
    // Ivan, 2026-11-05: the scrollbar's gutter made the input look wider than the conversation.
    test.skip(isMobile, 'Below md the page scrolls: the conversation has no scrollbar of its own.');
    await mockChat(page);
    await page.goto('/');
    await ask(page, 'What did Ivan do at BrainRocket?');
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();

    const edges = await page.evaluate(() => {
      const right = (selector: string): number =>
        document.querySelector(selector)?.getBoundingClientRect().right ?? Number.NaN;
      return { answer: right('.chat-turn__answer'), input: right('.chat-composer') };
    });
    expect(Math.abs(edges.answer - edges.input)).toBeLessThanOrEqual(1);
  });

  test('Jump to latest floats over the text: it never shifts the layout', async ({
    page,
    isMobile,
  }) => {
    await mockChat(page);
    await page.goto('/');
    for (const question of [
      'What did Ivan do at BrainRocket?',
      'Which technologies does Ivan use?',
    ]) {
      await ask(page, question);
      await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
    }
    await input(page).blur();
    const fieldTop = async (): Promise<number | undefined> =>
      (await page.locator('.chat-composer__field').boundingBox())?.y;

    const before = await fieldTop();
    if (isMobile) {
      await page.evaluate(() => {
        window.scrollBy(0, -600);
      });
    } else {
      // As a reader does it: the wheel over the conversation (an upward wheel pauses following).
      await page.locator('.chat__scroll').hover();
      await page.mouse.wheel(0, -600);
    }
    const jump = page.getByRole('button', { name: 'Jump to latest' });
    await expect(jump).toBeVisible();
    // On a phone the docked input stays where it is on screen; in the panel it never moves.
    if (!isMobile) expect(await fieldTop()).toBe(before);
    expect(await jump.evaluate((element) => getComputedStyle(element).position)).toBe('absolute');
    // Rounded: while the pill slides in, the box can come back a hair under 44 (43.99997).
    expect(Math.round((await jump.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44);

    await jump.click();
    await expect(jump).toBeHidden();
    if (!isMobile) {
      expect(await fieldTop()).toBe(before);
      // The fitted page itself never scrolls, however long the conversation.
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(
        page.viewportSize()?.height,
      );
    }
  });

  test('the focus ring replaces the field border instead of circling it', async ({ page }) => {
    await mockChat(page);
    await page.goto('/');
    await expect(input(page)).toBeEnabled();
    await input(page).focus();

    const ring = await page.locator('.chat-composer__field').evaluate((element) => {
      const field = element.getBoundingClientRect();
      const style = getComputedStyle(element, '::after');
      return {
        top: parseFloat(style.top),
        left: parseFloat(style.left),
        radius: style.borderTopLeftRadius,
        fieldRadius: getComputedStyle(element).borderTopLeftRadius,
        fieldWidth: field.width,
      };
    });
    // Exactly over the 1 px border, with the field's own corner radius: one line, concentric.
    expect(ring.top).toBe(-1);
    expect(ring.left).toBe(-1);
    expect(ring.radius).toBe(ring.fieldRadius);
  });

  test.describe('scrolling the panel (from md)', () => {
    test.skip(({ isMobile }) => isMobile, 'The panel scrolls by itself only from md.');

    const conversation = async (page: Page): Promise<void> => {
      await mockChat(page);
      await page.goto('/');
      for (const question of [
        'What did Ivan do at BrainRocket?',
        'Which technologies does Ivan use?',
      ]) {
        await ask(page, question);
        await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
      }
      await input(page).blur();
    };
    const distanceToBottom = (page: Page): Promise<number> =>
      page
        .locator('.chat__scroll')
        .evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);

    test('a wheel outside the panel does not pause following', async ({ page }) => {
      // Regression (Ivan, 2026-11-05): wheeling over the page showed "Jump to latest".
      await conversation(page);
      await page.mouse.move(1200, 300);
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(300);

      await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeHidden();
    });

    test('coming back near the end does not snap to it', async ({ page }) => {
      // Regression: within the follow threshold the area jumped to the very bottom in one step.
      await conversation(page);
      await page.locator('.chat__scroll').hover();
      await page.mouse.wheel(0, -500);
      await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeVisible();

      await page.locator('.chat__scroll').evaluate((element) => {
        element.scrollTop = element.scrollHeight - element.clientHeight - 40;
      });
      await page.waitForTimeout(300);

      expect(await distanceToBottom(page)).toBeGreaterThan(30);
      // Near the end the reader follows again, and the button fades away.
      await expect(page.getByRole('button', { name: 'Jump to latest' })).toBeHidden();
    });

    test('Jump to latest scrolls smoothly and fades out', async ({ page }) => {
      await conversation(page);
      await page.locator('.chat__scroll').hover();
      await page.mouse.wheel(0, -600);
      const jump = page.getByRole('button', { name: 'Jump to latest' });
      await expect(jump).toBeVisible();
      const button = page.locator('.chat__jump');

      await jump.click();

      // A fade, not a disappearance: the button stays in the page, inert and transparent.
      await expect(button).toHaveAttribute('inert', '');
      expect(
        await button.evaluate((element) => getComputedStyle(element).transitionProperty),
      ).toContain('opacity');
      await expect
        .poll(() => button.evaluate((element) => getComputedStyle(element).opacity))
        .toBe('0');
      await expect.poll(() => distanceToBottom(page)).toBeLessThanOrEqual(1);
    });
  });
});
