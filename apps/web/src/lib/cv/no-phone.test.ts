// @vitest-environment node
// content-nda rule / CLAUDE.md golden rule 5: no phone number anywhere in the CV source, the RAG
// sources or the CV test fixtures. A "phone-like" string is 9+ digits that are only separated by
// spaces, dots, hyphens, slashes or brackets, optionally after a "+". Dates such as `2016-06` or
// `2010–2014` (en dash) and ids such as `9967a5132` never reach 9 digits.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const webRoot = join(repoRoot, 'apps', 'web');

/** Directories scanned recursively. `data/raw/` is never read (it holds the phone number). */
const SCANNED = [
  { dir: join(webRoot, 'src', 'content'), recursive: true },
  { dir: join(webRoot, 'test-fixtures'), recursive: true },
  { dir: join(repoRoot, 'data'), recursive: false },
];
const SKIPPED_DIRS = new Set(['raw', 'node_modules', '.astro']);
const TEXT_FILE = /\.(md|mdx|ya?ml|json|ts)$/;

const PHONE_LIKE = /\+?\d(?:[\s./()-]{0,2}\d){8,}/g;

function listFiles(dir: string, recursive: boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return recursive && !SKIPPED_DIRS.has(entry.name) ? listFiles(path, recursive) : [];
    }
    return TEXT_FILE.test(entry.name) ? [path] : [];
  });
}

function phoneLikeStrings(text: string): string[] {
  return text.match(PHONE_LIKE) ?? [];
}

// No phone number may be written in the repo, not even a fake one (gitleaks), so test inputs
// are templates: every "N" becomes "0" at runtime.
const fill = (template: string): string => template.replaceAll('N', '0');

describe('phoneLikeStrings', () => {
  test.each(['+NN NNN NNN NNN', '+NNN (NN) NNN-NN-NN', 'NNN.NNN.NNN', 'NNNNNNNNNN'].map(fill))(
    'finds "%s"',
    (phone) => {
      expect(phoneLikeStrings(`Call ${phone} today`)).toHaveLength(1);
    },
  );

  test.each([
    'start: 2016-06',
    '2010–2014',
    'https://www.linkedin.com/in/ivan-vasiunin-9967a5132/',
    'revenue grew by 5%',
    'E.164 and RFC 3966',
  ])('ignores "%s"', (text) => {
    expect(phoneLikeStrings(text)).toEqual([]);
  });
});

describe('content sources', () => {
  const files = SCANNED.flatMap(({ dir, recursive }) => listFiles(dir, recursive));

  test('the scan covers the CV source and the RAG sources', () => {
    const scanned = files.map((file) => relative(repoRoot, file).replaceAll('\\', '/'));
    expect(scanned).toContain('apps/web/src/content/cv/profile.md');
    expect(scanned).toContain('data/experience-notes.md');
    expect(scanned.some((file) => file.startsWith('data/raw/'))).toBe(false);
  });

  test.each(files.map((file) => [relative(repoRoot, file), file]))(
    '%s has no phone-like strings',
    (_name, file) => {
      expect(phoneLikeStrings(readFileSync(file, 'utf8'))).toEqual([]);
    },
  );
});
