import type { Page } from '@playwright/test';

import { expect, expectNoSeriousA11yViolations, test } from './fixtures';

// Theme toggle and the no-flash head script (SPEC US-X1, ROADMAP 1.1).

const STORAGE_KEY = 'theme';
const BG = { light: 'rgb(244, 239, 229)', dark: 'rgb(14, 20, 48)' } as const;
const THEME_COLOR = { light: '#f4efe5', dark: '#0e1430' } as const;

const toggleOf = (page: Page) => page.getByRole('button', { name: 'Dark theme' });

async function themeState(page: Page) {
  return page.evaluate((key) => {
    let stored: string | null;
    try {
      stored = localStorage.getItem(key);
    } catch {
      stored = 'blocked';
    }
    return {
      attribute: document.documentElement.getAttribute('data-theme'),
      stored,
      background: getComputedStyle(document.body).backgroundColor,
      themeColors: [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
        (meta) => meta.content,
      ),
      colorScheme: document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')?.content,
    };
  }, STORAGE_KEY);
}

test('a stored choice is applied before the body is parsed (no flash)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'light');
    // Records the root's theme at the moment <body> enters the DOM, i.e. before anything can paint.
    // This checks script order (a blocking head script), which is what prevents the flash.
    const record = window as unknown as { themeAtBody?: string | null };
    new MutationObserver((_records, observer) => {
      if (document.querySelector('body')) {
        record.themeAtBody = document.documentElement.getAttribute('data-theme');
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  }, STORAGE_KEY);
  await page.goto('/');

  const themeAtBody = await page.evaluate(
    () => (window as unknown as { themeAtBody?: string | null }).themeAtBody,
  );
  expect(themeAtBody).toBe('light');
  expect((await themeState(page)).background).toBe(BG.light);
});

test('the toggle switches between light and dark and remembers the choice', async ({ page }) => {
  // No choice yet: the page is dark (the default, over a light system theme); the toggle is on.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const toggle = toggleOf(page);

  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await themeState(page)).toMatchObject({
    attribute: null,
    stored: null,
    background: BG.dark,
    themeColors: [THEME_COLOR.dark],
    colorScheme: 'dark',
  });

  // The first click switches to the opposite of what is visible.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await themeState(page)).toMatchObject({
    attribute: 'light',
    stored: 'light',
    background: BG.light,
    themeColors: [THEME_COLOR.light],
    colorScheme: 'light',
  });

  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect((await themeState(page)).background).toBe(BG.light);

  // Keyboard: Enter and Space activate it, and focus stays on the button.
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await themeState(page)).toMatchObject({
    attribute: 'dark',
    stored: 'dark',
    background: BG.dark,
    themeColors: [THEME_COLOR.dark],
    colorScheme: 'dark',
  });

  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeFocused();
  expect(await themeState(page)).toMatchObject({ attribute: 'light', stored: 'light' });
});

test('with no choice, a system theme change keeps the page dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true');
  expect((await themeState(page)).background).toBe(BG.dark);
});

test('the icon shows the visible theme: sun in light, moon in dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/');
  const toggle = toggleOf(page);
  const opacities = () =>
    toggle.evaluate((element) =>
      ['light', 'dark'].map((name) => {
        const icon = element.querySelector(`.theme-toggle__icon--${name}`);
        return icon ? getComputedStyle(icon).opacity : 'missing';
      }),
    );

  // No choice yet: the moon (dark), even with a light system theme.
  await expect.poll(opacities).toEqual(['0', '1']);
  // Explicit choices.
  await toggle.click();
  await expect.poll(opacities).toEqual(['1', '0']);
  await toggle.click();
  await expect.poll(opacities).toEqual(['0', '1']);
});

test('a choice made in another tab is picked up', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto('/cv');

  await toggleOf(page).click(); // Light
  await expect(toggleOf(other)).toHaveAttribute('aria-pressed', 'false');
  expect(await themeState(other)).toMatchObject({ attribute: 'light', background: BG.light });

  await toggleOf(page).click(); // Dark
  await expect(toggleOf(other)).toHaveAttribute('aria-pressed', 'true');
  expect(await themeState(other)).toMatchObject({ attribute: 'dark', background: BG.dark });

  await toggleOf(page).click(); // Light again
  await expect(toggleOf(other)).toHaveAttribute('aria-pressed', 'false');

  // Cleared storage in one tab: the other goes back to the default, dark.
  await page.evaluate(() => {
    localStorage.clear();
  });
  await expect.poll(async () => (await themeState(other)).attribute).toBeNull();
  expect((await themeState(other)).background).toBe(BG.dark);
});

test('the toggle still works for the page when storage is blocked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage is blocked.', 'SecurityError');
      },
    });
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const toggle = toggleOf(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await themeState(page)).toMatchObject({ attribute: 'light', stored: 'blocked' });
  expect(errors).toEqual([]);
});

test('an explicit light choice over a dark system theme has no serious a11y violations', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await toggleOf(page).click();
  await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'false');

  await expectNoSeriousA11yViolations(page);
});

test('the toggle keeps a visible boundary in forced colors', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  const border = await toggleOf(page).evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.borderTopWidth, color: style.borderTopColor };
  });

  expect(border.width).toBe('1px');
  expect(border.color).not.toBe('rgba(0, 0, 0, 0)');
});

test('the toggle meets the 44 px touch target', async ({ page }) => {
  await page.goto('/');
  const box = await toggleOf(page).boundingBox();

  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the toggle is hidden and the page is dark, even with a light system theme', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    await expect(page.locator('.theme-toggle')).toBeHidden();
    expect((await themeState(page)).background).toBe(BG.dark);
  });
});
