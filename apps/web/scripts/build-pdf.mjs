// @ts-check
// Build-time CV PDF (SPEC §2, §3.2 US-T4; ROADMAP 2.5). Runs after `astro build` (the `build` script):
// renders the built /cv in Playwright's Chromium with the print styles (always the Full view, light,
// ink on paper) and writes dist/cv/ivan-vasiunin-cv.pdf, which the "Download PDF" link serves.
//
//   pnpm run build                 astro build + this script
//   node scripts/build-pdf.mjs     after a build, PDF only
//
// No server and no port: every request goes to a fake origin that Playwright answers from dist/, so the
// PDF uses exactly the built HTML, CSS and self-hosted fonts and the build never touches the network.
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { CV_PAGE_PATH, CV_PDF_PATH } from '../src/lib/cv/pdf.ts';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(WEB_DIR, 'dist');
const ORIGIN = 'http://cv.pdf.invalid';

/**
 * Page size and margins come from `@page` in the print styles (styles/base.scss). Tagged: the PDF
 * keeps the HTML structure (headings, lists, links) for screen readers; the outline adds bookmarks
 * from the headings.
 * @type {NonNullable<Parameters<import('@playwright/test').Page['pdf']>[0]>}
 */
export const PDF_OPTIONS = {
  format: 'A4',
  preferCSSPageSize: true,
  printBackground: false,
  tagged: true,
  outline: true,
};

/**
 * The file in `dist` for a URL path: `/cv/` → `cv/index.html`, `/_astro/a.css` → `_astro/a.css`.
 * Returns null for paths that leave `dist` (`..`) or do not exist.
 * @param {string} dist
 * @param {string} pathname
 * @returns {string | null}
 */
export function resolveDistFile(dist, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // a malformed escape (`%zz`) names no file
  }
  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(dist, relative);
  if (candidate !== dist && !candidate.startsWith(dist + path.sep)) return null;
  const file =
    existsSync(candidate) && statSync(candidate).isDirectory()
      ? path.join(candidate, 'index.html')
      : candidate;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/**
 * Golden rule 5: no phone number anywhere. The same "phone-like" pattern as src/lib/cv/no-phone.test.ts:
 * 9+ digits separated only by spaces, dots, hyphens, slashes or brackets, optionally after a "+".
 */
const PHONE_LIKE = /\+?\d(?:[\s./()-]{0,2}\d){8,}/g;

/**
 * Phone-like strings in the printed text and link targets (`tel:` included). The PDF is checked through
 * the print DOM it is made from: the PDF's own text streams are compressed.
 * @param {string} text
 * @param {readonly string[]} hrefs
 * @returns {string[]}
 */
export function findPhoneLike(text, hrefs) {
  const found = [...(text.match(PHONE_LIKE) ?? [])];
  for (const href of hrefs) {
    if (/^tel:/i.test(href)) found.push(href);
    else found.push(...(href.match(PHONE_LIKE) ?? []));
  }
  return found;
}

/**
 * Where the PDF is written: the served path inside `dist`.
 * @param {string} dist
 * @param {string} pdfPath
 */
export function pdfOutputPath(dist, pdfPath) {
  return path.join(dist, ...pdfPath.split('/').filter(Boolean));
}

async function main() {
  if (!existsSync(path.join(DIST, 'cv', 'index.html'))) {
    throw new Error('dist/cv/index.html is missing: run `astro build` first.');
  }
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new Error(
      'The CV PDF needs Playwright Chromium. Install it once with:\n' +
        '  pnpm --dir apps/web exec playwright install --only-shell chromium',
      { cause: error },
    );
  }
  try {
    const context = await browser.newContext({ colorScheme: 'light', reducedMotion: 'reduce' });
    // Only the fake origin is answered; anything else (there should be nothing) is blocked.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const file = url.origin === ORIGIN ? resolveDistFile(DIST, url.pathname) : null;
      await (file ? route.fulfill({ path: file }) : route.abort('blockedbyclient'));
    });
    const page = await context.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.goto(`${ORIGIN}${CV_PAGE_PATH}`, { waitUntil: 'load' });
    // The serif loads when print layout first uses it; wait until every face is in.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const printed = await page.evaluate(() => ({
      text: document.body.innerText,
      hrefs: [...document.querySelectorAll('a[href]')].map(
        (link) => link.getAttribute('href') ?? '',
      ),
      title: document.title,
    }));
    const phones = findPhoneLike(`${printed.title}\n${printed.text}`, printed.hrefs);
    if (phones.length > 0) {
      throw new Error(`The printed CV contains phone-like strings: ${phones.join(', ')}`);
    }
    const output = pdfOutputPath(DIST, CV_PDF_PATH);
    await page.pdf({ ...PDF_OPTIONS, path: output });
    console.log(
      `CV PDF: ${path.relative(WEB_DIR, output)} (${String(Math.round(statSync(output).size / 1024))} KB)`,
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
