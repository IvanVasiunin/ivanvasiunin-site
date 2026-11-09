import { expect, test } from './fixtures';
import { CV_PDF_PATH } from '../src/lib/cv/pdf';

// ROADMAP 2.5: print styles and the build-time PDF (SPEC §3.2 US-T4, css-scss.md → Print).

test.describe('/cv on paper', () => {
  // Brief on screen and a dark theme: print must still be the Full view, ink on white paper.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/cv?view=brief');
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  });

  test('prints the Full view, whatever view is on screen', async ({ page }) => {
    const job = page.getByRole('region', { name: 'Experience' }).getByRole('article').first();

    await expect(job.locator('[data-cv-only="full"]')).toBeVisible();
    await expect(job.locator('[data-cv-only="brief"]')).toBeHidden();
  });

  test('leaves out navigation, page controls and the backdrop', async ({ page }) => {
    await expect(page.getByRole('banner')).toBeHidden();
    await expect(page.getByRole('contentinfo')).toBeHidden();
    await expect(page.getByRole('group', { name: 'CV view' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Download PDF' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeHidden();
    await expect(page.locator('.backdrop')).toBeHidden();
  });

  test('is black text on white, even in the dark theme', async ({ page }) => {
    const colours = await page.evaluate(() => ({
      text: getComputedStyle(document.body).color,
      background: getComputedStyle(document.body).backgroundColor,
    }));

    expect(colours).toEqual({ text: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' });
  });

  test('prints the addresses of links that cannot be followed on paper', async ({ page }) => {
    const contacts = page.getByRole('list', { name: 'Contacts' });
    await expect(contacts.getByText('linkedin.com/in/', { exact: false })).toBeVisible();
    await expect(contacts.getByText('Profile', { exact: true })).toBeHidden();

    const projects = page.getByRole('region', { name: 'Projects' });
    await expect(
      projects.getByText('github.com/IvanVasiunin/', { exact: false }).first(),
    ).toBeVisible();
  });
});

test('on screen, the printed-only addresses stay hidden', async ({ page }) => {
  await page.goto('/cv');

  await expect(page.getByRole('list', { name: 'Contacts' }).getByText('Profile')).toBeVisible();
  await expect(page.getByText('linkedin.com/in/', { exact: false })).toBeHidden();
  await expect(
    page.getByRole('region', { name: 'Projects' }).getByText('github.com/IvanVasiunin/').first(),
  ).toBeHidden();
});

test('the Download PDF link serves the build-time PDF', async ({ page, request }) => {
  await page.goto('/cv');
  const link = page.getByRole('link', { name: 'Download PDF' });

  await expect(link).toHaveAttribute('href', CV_PDF_PATH);
  await expect(link).toHaveAttribute('download', '');

  const response = await request.get(CV_PDF_PATH);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');

  // Chromium writes the page objects and the structure tree uncompressed, so they can be counted.
  const pdf = (await response.body()).toString('latin1');
  const pages = pdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pages, 'A4 pages').toBeGreaterThan(0);
  expect(pages, 'A4 pages').toBeLessThanOrEqual(6);
  expect(pdf, 'tagged (accessible) PDF').toContain('/StructTreeRoot');
  expect(pdf, 'contact links stay clickable').toMatch(/\/URI\s*\(https:\/\/www\.linkedin\.com\//);
});
