import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { findPhoneLike, PDF_OPTIONS, pdfOutputPath, resolveDistFile } from './build-pdf.mjs';

describe('resolveDistFile', () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'cv-pdf-dist-'));
  mkdirSync(path.join(dist, 'cv'));
  mkdirSync(path.join(dist, '_astro'));
  writeFileSync(path.join(dist, 'cv', 'index.html'), '<h1>CV</h1>');
  writeFileSync(path.join(dist, '_astro', 'cv.css'), 'h1{}');
  writeFileSync(path.join(dist, '_astro', 'a b.woff2'), '');

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  test('serves a directory index for a page path', () => {
    expect(resolveDistFile(dist, '/cv/')).toBe(path.join(dist, 'cv', 'index.html'));
    expect(resolveDistFile(dist, '/cv')).toBe(path.join(dist, 'cv', 'index.html'));
  });

  test('serves assets, including encoded names', () => {
    expect(resolveDistFile(dist, '/_astro/cv.css')).toBe(path.join(dist, '_astro', 'cv.css'));
    expect(resolveDistFile(dist, '/_astro/a%20b.woff2')).toBe(
      path.join(dist, '_astro', 'a b.woff2'),
    );
  });

  test('returns null for missing files and for paths outside dist', () => {
    expect(resolveDistFile(dist, '/missing.js')).toBeNull();
    expect(resolveDistFile(dist, '/')).toBeNull();
    expect(resolveDistFile(dist, '/../outside.txt')).toBeNull();
    expect(resolveDistFile(dist, '/%2e%2e/outside.txt')).toBeNull();
  });

  test('returns null for a malformed escape instead of throwing', () => {
    expect(resolveDistFile(dist, '/_astro/%zz.css')).toBeNull();
  });
});

// No phone number may be written in the repo, not even a fake one (CLAUDE.md golden rule 5,
// gitleaks), so test inputs are templates: every "N" becomes "0" at runtime.
const fill = (template: string): string => template.replaceAll('N', '0');

describe('findPhoneLike', () => {
  test('finds phone numbers in the text and tel: links', () => {
    const phone = fill('+NN NNN NNN NNN');
    const tel = fill('tel:+NNNNNNNNNNN');
    expect(findPhoneLike(`Call ${phone} today`, [])).toEqual([phone]);
    expect(findPhoneLike('', [tel])).toEqual([tel]);
  });

  test('ignores dates, years and profile ids', () => {
    expect(
      findPhoneLike('Nov 2024–Present\nJun 2016–Oct 2024\n2010 – 2014', [
        'https://www.linkedin.com/in/ivan-vasiunin-9967a5132/',
        'mailto:someone@example.com',
      ]),
    ).toEqual([]);
  });
});

describe('PDF output', () => {
  test('writes the PDF at its served path inside dist', () => {
    expect(pdfOutputPath('/site/dist', '/cv/ivan-vasiunin-cv.pdf')).toBe(
      path.join('/site/dist', 'cv', 'ivan-vasiunin-cv.pdf'),
    );
  });

  test('takes the page size from @page and produces a tagged PDF with an outline', () => {
    expect(PDF_OPTIONS).toMatchObject({ preferCSSPageSize: true, tagged: true, outline: true });
  });
});
