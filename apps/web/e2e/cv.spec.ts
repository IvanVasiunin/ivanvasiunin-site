import { expect, expectNoSeriousA11yViolations, test } from './fixtures';

// ROADMAP 2.3: the /cv page — semantic structure, contacts, JSON-LD `Person`, meta / OG (SPEC §3.2).

const SECTIONS = [
  'Summary',
  'Experience',
  'Projects',
  'Skills',
  'Education',
  'Certifications and courses',
  'Languages',
] as const;

test.describe('/cv', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cv');
  });

  test('has one h1 and a labelled region per CV section, in order', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ivan Vasiunin');

    const headings = page.getByRole('main').getByRole('heading', { level: 2 });
    await expect(headings).toHaveText([...SECTIONS]);
    for (const name of SECTIONS) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
  });

  test('lists jobs as an ordered timeline with machine-readable dates', async ({ page }) => {
    const experience = page.getByRole('region', { name: 'Experience' });
    const jobs = experience.getByRole('listitem').filter({ has: page.getByRole('article') });

    await expect(jobs.first().getByRole('heading', { level: 3 })).toHaveText('Brave Brains');
    await expect(jobs.first()).toContainText('Present');
    await expect(jobs.first().locator('time').first()).toHaveAttribute('datetime', '2025-10');
    expect(await experience.locator('ol').count()).toBeGreaterThan(0);
  });

  test('labels study projects as such', async ({ page }) => {
    const projects = page.getByRole('region', { name: 'Projects' });

    await expect(
      projects.getByRole('article', { name: 'Little Lemon — Meta Front-End capstone' }),
    ).toContainText('Study project');
    await expect(projects.getByRole('article', { name: 'CV with AI assistant' })).toContainText(
      'Personal project',
    );
    await expect(
      projects.getByRole('link', { name: 'Code on GitHub for NumbersValidator' }),
    ).toHaveAttribute('href', 'https://github.com/IvanVasiunin/NumbersValidator');
  });

  test('shows exactly the four public contacts', async ({ page }) => {
    const contacts = page.getByRole('list', { name: 'Contacts' }).getByRole('link');

    await expect(contacts).toHaveCount(4);
    const hrefs = await contacts.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    );
    expect(hrefs).toEqual([
      'mailto:ivanvasyunin@gmail.com',
      'https://t.me/IvanVasiunin',
      'https://github.com/IvanVasiunin',
      'https://www.linkedin.com/in/ivan-vasiunin-9967a5132/',
    ]);
    for (const link of await contacts.all()) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('embeds a JSON-LD Person without a phone number', async ({ page }) => {
    const json = await page.locator('script[type="application/ld+json"]').textContent();
    const person = JSON.parse(json ?? '{}') as Record<string, unknown>;

    expect(person).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Ivan Vasiunin',
      jobTitle: 'Frontend Developer',
      email: 'mailto:ivanvasyunin@gmail.com',
      url: 'https://ivanvasiunin.com/cv',
    });
    expect(person).not.toHaveProperty('telephone');
  });

  test('shows no phone-like digit runs in the text or the structured data', async ({ page }) => {
    // Visible text and JSON-LD; asset hashes and SVG coordinates in the markup are not content.
    const text = [
      await page.locator('body').innerText(),
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '',
    ].join(' ');

    expect(text.match(/\+?\d(?:[\s./()-]{0,2}\d){8,}/g) ?? []).toEqual([]);
  });

  test('has no serious a11y violations', async ({ page }) => {
    await expectNoSeriousA11yViolations(page);
  });
});

for (const [path, ogType, canonical, ogImage] of [
  ['/', 'website', 'https://ivanvasiunin.com/', '/og/home.jpg'],
  ['/cv', 'profile', 'https://ivanvasiunin.com/cv', '/og/cv.jpg'],
] as const) {
  test(`${path} has a canonical URL and Open Graph / Twitter tags`, async ({ page, request }) => {
    await page.goto(path);
    const head = page.locator('head');
    const title = await page.title();

    await expect(head.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
    await expect(head.locator('meta[property="og:type"]')).toHaveAttribute('content', ogType);
    await expect(head.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
    await expect(head.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
    await expect(head.locator('meta[property="og:description"]')).toHaveAttribute('content', /\S/);
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    );

    // The link-preview image: absolute, 1200 × 630, described, and served (scripts/og-images.mjs).
    const image = `https://ivanvasiunin.com${ogImage}`;
    await expect(head.locator('meta[property="og:image"]')).toHaveAttribute('content', image);
    await expect(head.locator('meta[name="twitter:image"]')).toHaveAttribute('content', image);
    await expect(head.locator('meta[property="og:image:width"]')).toHaveAttribute(
      'content',
      '1200',
    );
    await expect(head.locator('meta[property="og:image:height"]')).toHaveAttribute(
      'content',
      '630',
    );
    await expect(head.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /S/);
    const served = await request.get(ogImage);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toContain('image/jpeg');
  });
}

test('every page links its icons, and they are served', async ({ page, request }) => {
  await page.goto('/');
  const head = page.locator('head');
  const icons = [
    ['link[rel="icon"][type="image/svg+xml"]', '/favicon.svg', 'image/svg+xml'],
    ['link[rel="icon"][type="image/png"]', '/favicon-32.png', 'image/png'],
    ['link[rel="apple-touch-icon"]', '/apple-touch-icon.png', 'image/png'],
    ['link[rel="manifest"]', '/site.webmanifest', ''],
  ] as const;
  for (const [selector, href, type] of icons) {
    await expect(head.locator(selector)).toHaveAttribute('href', href);
    const response = await request.get(href);
    expect(response.status(), href).toBe(200);
    if (type !== '') expect(response.headers()['content-type'], href).toContain(type);
  }
  const manifest = (await (await request.get('/site.webmanifest')).json()) as {
    icons: { src: string }[];
  };
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});
