import { expect, test } from './fixtures';

// Element defaults from src/styles/base.scss.

test('the custom cursor applies only to a fine hover-capable pointer', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const cursorOf = (selector: string): Promise<string> =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).cursor);

  if (isMobile) {
    expect(await cursorOf('html')).toBe('auto');
    return;
  }
  const html = await cursorOf('html');
  expect(html).toContain('/cursors/arrow.svg');
  expect(html).toMatch(/auto$/);
  // Links: a custom hand with the native pointer as fallback.
  const link = await cursorOf('a[href]');
  expect(link).toContain('/cursors/pointer.svg');
  expect(link).toMatch(/pointer$/);
  // Text and text fields: a custom I-beam with the native one as fallback.
  await page.evaluate(() => {
    document.body.append(document.createElement('textarea'));
  });
  for (const selector of ['p', 'textarea']) {
    const cursor = await cursorOf(selector);
    expect(cursor, selector).toContain('/cursors/text.svg');
    expect(cursor, selector).toMatch(/text$/);
  }
});

for (const file of ['arrow.svg', 'pointer.svg', 'text.svg']) {
  test(`the ${file} cursor is served as SVG`, async ({ request }) => {
    const response = await request.get(`/cursors/${file}`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');
  });
}

test('a standalone link is underlined only on keyboard focus and hover', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  // The placeholder pages have no plain link yet (their links are styled as buttons), so the test adds
  // one to exercise the element defaults from base.scss.
  await page.evaluate(() => {
    const plain = document.createElement('a');
    plain.href = '/cv';
    plain.textContent = 'Plain link';
    document.querySelector('main')?.append(plain);
  });
  const link = page.getByRole('link', { name: 'Plain link' });
  const decoration = (): Promise<string> =>
    link.evaluate((element) => getComputedStyle(element).textDecorationLine);

  expect(await decoration()).toBe('none');

  // WebKit does not Tab to links by default (Safari behaviour), so focus programmatically: with no
  // prior pointer interaction, browsers treat that focus as `:focus-visible`.
  await link.focus();
  expect(await link.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  expect(await decoration()).toBe('underline');

  // Touch devices have no hover (hover styles live inside `@media (hover: hover)`).
  if (!isMobile) {
    await link.blur();
    await link.hover();
    expect(await decoration()).toBe('underline');
  }
});
