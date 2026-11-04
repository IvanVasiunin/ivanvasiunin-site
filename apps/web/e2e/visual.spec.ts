import { expect, test } from './fixtures';

// Visual regression (docs/TESTING.md §1, §6; mobile-performance.md): key screens at 360 / 390 / 768 /
// 1024 / 1440 px and a landscape phone, light and dark. Runs only in
// the `visual-chromium` project. Baselines are per platform (`-win32` locally; Linux ones come with the
// CI e2e job, ROADMAP 1.8). Update only with Ivan's OK:
//   pnpm --dir apps/web run e2e --project=visual-chromium --update-snapshots

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/cv', name: 'cv' },
] as const;

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 }, // landscape phone: short viewport, safe areas at the sides
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

for (const { path, name } of PAGES) {
  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${name} at ${String(viewport.width)} px, ${colorScheme}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto(path);
        // The copyright year comes from the build date; pin it so the baseline survives New Year.
        await page
          .getByRole('contentinfo')
          .getByText(/©/)
          .evaluate((element) => {
            element.textContent = element.textContent.replace(/\d{4}/, '2026');
          });

        await expect(page).toHaveScreenshot(
          `${name}-${String(viewport.width)}-${colorScheme}.png`,
          {
            fullPage: true,
          },
        );
      });
    }
  }
}

// The CV on paper (TESTING.md §1, css-scss.md → Print): an A4-wide page (794 px at 96 dpi) in print
// media, in the dark theme on screen, which print must ignore (light, Full view). The PDF itself is
// checked in e2e/cv-print.spec.ts.
test('cv print version', async ({ page }) => {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/cv?view=brief');
  await page.emulateMedia({ media: 'print', colorScheme: 'dark', reducedMotion: 'reduce' });

  await expect(page).toHaveScreenshot('cv-print.png', { fullPage: true });
});
