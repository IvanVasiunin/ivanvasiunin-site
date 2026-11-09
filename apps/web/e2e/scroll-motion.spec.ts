import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// ROADMAP 2.6: scroll-driven animations and the mode-switch view transition. They are enhancements:
// only where supported, never with reduced motion (the header scrim is scroll-linked opacity, not motion), never in print.

type Pseudo = '' | '::before' | '::after';

const style = (selector: string, pseudo: Pseudo, property: string) =>
  `getComputedStyle(document.querySelector('${selector}'), '${pseudo}').${property}`;

const supportsScrollTimelines = (page: Page) =>
  page.evaluate(() => CSS.supports('animation-timeline: view()'));

const scrollToBottom = async (page: Page) => {
  await page.evaluate(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  });
};

test('every scroll-driven rule sits behind @supports, so other browsers get the static page', async ({
  page,
}) => {
  await page.goto('/cv');
  const unguarded = await page.evaluate(() => {
    const found: string[] = [];
    let timelines = 0;
    // Style rules are checked first: under CSS Nesting a CSSStyleRule is also a CSSGroupingRule.
    const walk = (rules: CSSRuleList, guarded: boolean) => {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          const timeline = rule.style.getPropertyValue('animation-timeline').trim();
          if (!['', 'auto'].includes(timeline)) {
            timelines += 1;
            if (!guarded) found.push(rule.selectorText);
          }
          walk(rule.cssRules, guarded);
        } else if (rule instanceof CSSSupportsRule) {
          walk(rule.cssRules, guarded || rule.conditionText.includes('animation-timeline'));
        } else if (rule instanceof CSSGroupingRule) {
          walk(rule.cssRules, guarded);
        }
      }
    };
    for (const sheet of document.styleSheets) walk(sheet.cssRules, false);
    return { found, timelines };
  });

  // The walk must actually reach the scroll-driven rules (scrim, timeline, reveals).
  expect(unguarded.timelines).toBeGreaterThanOrEqual(5);
  expect(unguarded.found).toEqual([]);
});

test.describe('on /cv with scroll-driven animations', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/cv');
    test.skip(!(await supportsScrollTimelines(page)), 'Needs scroll-driven animations.');
  });

  test('the timeline is drawn while scrolling: undrawn below the reading line, full above it', async ({
    page,
  }) => {
    const lastLine = style('.cv-job:last-child', '::before', 'transform');
    await expect.poll(() => page.evaluate(lastLine)).toMatch(/^matrix\(1, 0, 0, 0,/);

    await scrollToBottom(page);
    const lines = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.cv-job')].map(
          (job) => getComputedStyle(job, '::before').transform,
        ),
      );
    await expect
      .poll(async () => [...new Set(await lines())])
      .toEqual(['matrix(1, 0, 0, 1, 0, 0)']);
  });

  test('a comet rides the tip of the line as it is drawn', async ({ page }) => {
    await page.evaluate(() => {
      const job = document.querySelector('.cv-job');
      if (job)
        window.scrollTo({
          top: job.getBoundingClientRect().top + window.scrollY,
          behavior: 'instant',
        });
    });
    // The comet's travel along its track and the line's drawn share are the same fraction.
    const progress = () =>
      page.evaluate(() => {
        const job = document.querySelector('.cv-job');
        const track = job?.querySelector('.cv-job__comet');
        if (!job || !track) return null;
        const line = new DOMMatrix(getComputedStyle(job, '::before').transform).d;
        const head = new DOMMatrix(getComputedStyle(track, '::before').transform).f;
        return { line, head: head / track.getBoundingClientRect().height };
      });
    await expect.poll(async () => (await progress())?.line ?? 0).toBeGreaterThan(0.05);
    const { line, head } = (await progress()) ?? { line: 0, head: 1 };

    expect(line).toBeLessThan(1);
    expect(head).toBeCloseTo(line, 1);
    expect(
      await page.evaluate(() =>
        document.querySelector('.cv-job__comet')?.getAttribute('aria-hidden'),
      ),
    ).toBe('true');
  });

  test('blocks below the first screen fade in as they enter it', async ({ page }) => {
    const lastCard = style('.cv-project:last-child', '', 'opacity');
    await expect.poll(() => page.evaluate(lastCard)).toBe('0');

    await page.locator('.cv-project').last().scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      window.scrollBy({ top: 200, behavior: 'instant' });
    });
    await expect.poll(() => page.evaluate(lastCard)).toBe('1');
  });

  test('the first screen is never hidden waiting for a scroll', async ({ page }) => {
    const heading = style('.cv-section__title', '', 'opacity');
    await expect.poll(() => page.evaluate(heading)).toBe('1');
  });
});

test('reduced motion keeps every block still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cv');

  for (const [selector, pseudo] of [
    ['.cv-job', '::before'],
    ['.cv-job', '::after'],
    ['.cv-job__article', ''],
    ['.cv-project', ''],
    ['.cv-section__title', ''],
  ] as const) {
    expect(await page.evaluate(style(selector, pseudo, 'animationName')), selector + pseudo).toBe(
      'none',
    );
  }
});

test('print never runs the scroll animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/cv');
  await page.emulateMedia({ media: 'print', reducedMotion: 'no-preference' });

  expect(await page.evaluate(style('.cv-job', '::before', 'animationName'))).toBe('none');
  expect(await page.evaluate(style('.cv-project', '', 'animationName'))).toBe('none');
});

test.describe('mode switch transition', () => {
  // Chrome skips a cross-document transition when the new page takes too long to render, which the
  // 4x CPU slowdown of the Android profile can cause. This checks the behaviour, not the speed.
  test.use({ throttle: null });

  test('on a mode switch only the pill moves: the page swaps without a fade', async ({ page }) => {
    // Ivan, 2026-11-05: the content lifting out and rising in looked jerky; it is gone.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // Records, on the new page, which view-transition pseudo-elements animate.
    await page.addInitScript(() => {
      window.addEventListener('pagereveal', (event) => {
        const transition = (event as Event & { viewTransition: ViewTransition | null })
          .viewTransition;
        if (!transition) return;
        void transition.ready.then(() => {
          document.documentElement.dataset.vtAnimations = document
            .getAnimations()
            .map((animation) =>
              animation.effect instanceof KeyframeEffect
                ? (animation.effect.pseudoElement ?? '')
                : '',
            )
            .filter((pseudo) => pseudo.startsWith('::view-transition'))
            .join(' ');
        });
      });
    });
    await page.goto('/');
    test.skip(
      !(await page.evaluate(
        () => 'onpagereveal' in window && CSS.supports('selector(:active-view-transition)'),
      )),
      'Needs cross-document view transitions.',
    );
    // A prerendered page is activated without Playwright's init scripts: drop the rules.
    await page.evaluate(() => {
      document.querySelector('script[type="speculationrules"]')?.remove();
    });

    await page.getByRole('link', { name: 'Text mode' }).first().click();
    await page.waitForURL('**/cv');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.vtAnimations ?? ''))
      .toContain('::view-transition-group(mode-switch-indicator)');
    const animated = await page.evaluate(() => document.documentElement.dataset.vtAnimations ?? '');
    expect(animated).not.toContain('::view-transition-old(root)');
    expect(animated).not.toContain('::view-transition-new(root)');
    expect(animated).not.toContain('page-main');
    // Nothing on the page is named outside the switch (a named element is a backdrop root).
    expect(await page.evaluate(style('main', '', 'viewTransitionName'))).toBe('none');
  });
});
