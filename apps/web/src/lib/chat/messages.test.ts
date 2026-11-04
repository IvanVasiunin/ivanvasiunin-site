// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { ErrorCode } from '../api/types';
import { errorText } from './messages';

const CODES: readonly ErrorCode[] = [
  'invalid_request',
  'not_found',
  'input_too_long',
  'rate_limited',
  'session_limit',
  'budget_exceeded',
  'upstream_unavailable',
  'timeout',
  'internal',
];

describe('errorText', () => {
  it.each(CODES)('has a title and a hint for %s', (code) => {
    const text = errorText(code);

    expect(text.title).not.toBe('');
    expect(text.hint).not.toBe('');
  });

  it('says when to try again after a rate limit', () => {
    expect(errorText('rate_limited', 30).hint).toBe('Try again in 30 seconds.');
    expect(errorText('rate_limited', 1).hint).toBe('Try again in 1 second.');
    expect(errorText('rate_limited').hint).toBe('Wait a moment, then try again.');
  });

  it.each([
    ['rate_limited', true],
    ['upstream_unavailable', true],
    ['timeout', true],
    ['internal', true],
    ['input_too_long', false],
    ['session_limit', false],
    ['budget_exceeded', false],
  ] as const)('offers retry for %s: %s', (code, retryable) => {
    expect(errorText(code).retryable).toBe(retryable);
  });

  it('never shows internal wording', () => {
    for (const code of CODES) {
      const { title, hint } = errorText(code);
      expect(`${title} ${hint}`).not.toMatch(
        /exception|stack|traceback|HTTP \d{3}|null|undefined/i,
      );
    }
  });
});
