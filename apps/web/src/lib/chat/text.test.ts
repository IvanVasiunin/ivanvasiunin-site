// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { markdownToPlainText } from './text';

describe('markdownToPlainText', () => {
  it('keeps link text and drops the URL', () => {
    expect(markdownToPlainText('More in the [CV](/cv#job-brainrocket).')).toBe('More in the CV.');
  });

  it('drops emphasis, code and list marks', () => {
    expect(markdownToPlainText('- **Homepage performance.** CSS `mask` in buttons')).toBe(
      'Homepage performance. CSS mask in buttons',
    );
  });

  it('drops heading and numbered-list markers', () => {
    expect(markdownToPlainText('## Skills\n\n1. TypeScript\n2) SCSS')).toBe(
      'Skills\nTypeScript\nSCSS',
    );
  });

  it('leaves plain text as it is', () => {
    expect(markdownToPlainText('Ivan works at BrainRocket.')).toBe('Ivan works at BrainRocket.');
  });
});
