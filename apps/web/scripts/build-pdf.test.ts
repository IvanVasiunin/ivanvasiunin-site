import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { findPhoneLike, PDF_OPTIONS, pdfOutputPath, resumeFile } from './build-pdf.mjs';

describe('resumeFile', () => {
  test('serves the template and its two font files', () => {
    expect(resumeFile('/resume.html')?.endsWith(path.join('scripts', 'cv-resume.html'))).toBe(true);
    expect(resumeFile('/fonts/schibsted-grotesk-normal.woff2')).toMatch(
      /latin-wght-normal\.woff2$/,
    );
    expect(resumeFile('/fonts/schibsted-grotesk-italic.woff2')).toMatch(
      /latin-wght-italic\.woff2$/,
    );
  });

  test('blocks everything else', () => {
    expect(resumeFile('/')).toBeNull();
    expect(resumeFile('/cv/')).toBeNull();
    expect(resumeFile('/../package.json')).toBeNull();
    expect(resumeFile('/fonts/other.woff2')).toBeNull();
  });
});

describe('the CV template', () => {
  const html = readFileSync(path.join(import.meta.dirname, 'cv-resume.html'), 'utf8');

  test('has no phone number and no tel: link (golden rule 5)', () => {
    expect(
      findPhoneLike(
        html,
        [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1] ?? ''),
      ),
    ).toEqual([]);
  });

  test('loads nothing from the network: no scripts, no remote styles or fonts', () => {
    expect(html).not.toMatch(/<script|<link/i);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i);
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
