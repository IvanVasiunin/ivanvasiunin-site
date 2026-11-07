import { describe, expect, it } from 'vitest';

import SHARED from '../../../../api/tests/api/masking_cases.json';
import { maskParts, maskText } from './mask';

// SHARED: the cases the server's masking (services/masking.py) passes too, so the demo shows what
// the server really keeps. Phone-shaped texts are templates, every "N" a "0" (gitleaks).

const zeros = (template: string): string => template.replaceAll('N', '0');

describe('maskText', () => {
  it.each(SHARED.cases as [string, string][])('masks %j as the server does', (text, masked) => {
    expect(maskText(zeros(text))).toBe(zeros(masked));
  });

  it('runs again on the same pattern without carrying state over', () => {
    expect(maskText('a@b.co')).toBe('[email]');
    expect(maskText('a@b.co')).toBe('[email]');
  });
});

describe('maskParts', () => {
  it('keeps the original of each masked piece, in order', () => {
    expect(maskParts('Mail a@b.co or www.x.org')).toEqual([
      { kind: 'text', text: 'Mail ' },
      { kind: 'email', text: 'a@b.co' },
      { kind: 'text', text: ' or ' },
      { kind: 'url', text: 'www.x.org' },
    ]);
  });

  it('returns nothing for an empty question', () => {
    expect(maskParts('')).toEqual([]);
  });
});
