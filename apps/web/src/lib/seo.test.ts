import { describe, expect, test } from 'vitest';
import { canonicalUrl } from './seo';

const SITE = new URL('https://ivanvasiunin.com');

describe('canonicalUrl', () => {
  test.each([
    ['/', 'https://ivanvasiunin.com/'],
    ['/cv', 'https://ivanvasiunin.com/cv'],
    ['/cv/', 'https://ivanvasiunin.com/cv'],
    ['/cv//', 'https://ivanvasiunin.com/cv'],
  ])('%s → %s', (pathname, url) => {
    expect(canonicalUrl(pathname, SITE)).toBe(url);
  });
});
