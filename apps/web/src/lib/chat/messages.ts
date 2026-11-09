// What the chat says when an answer fails (SPEC US-A6): one human-readable text per error code.
//
// The UI's own words instead of the server's `message`: one place for the wording, the same text
// for an error before the stream and during it, and nothing internal can reach the page.
import type { ErrorCode } from '../api/types';
import { MAX_QUESTION_CHARS } from './state';

export interface ErrorText {
  readonly title: string;
  /** What to do next; may include the delay of a rate limit. */
  readonly hint: string;
  /** Whether Retry can help (a limit or a too-long question will fail the same way again). */
  readonly retryable: boolean;
}

const seconds = (value: number): string => (value === 1 ? '1 second' : `${String(value)} seconds`);

export function errorText(code: ErrorCode, retryAfterS: number | null = null): ErrorText {
  switch (code) {
    case 'rate_limited':
      return {
        title: 'Too many questions in a short time.',
        hint:
          retryAfterS === null
            ? 'Wait a moment, then try again.'
            : `Try again in ${seconds(retryAfterS)}.`,
        retryable: true,
      };
    case 'input_too_long':
      return {
        title: 'This question is too long.',
        hint: `Shorten it to ${String(MAX_QUESTION_CHARS)} characters and send it again.`,
        retryable: false,
      };
    case 'session_limit':
      return {
        title: 'This conversation has reached its question limit.',
        hint: 'Reload the page to start a new one, or read the CV.',
        retryable: false,
      };
    case 'budget_exceeded':
      return {
        title: 'Elio has answered all the questions it can for today.',
        hint: 'Try again tomorrow, or read the CV.',
        retryable: false,
      };
    case 'upstream_unavailable':
      return {
        title: 'Elio cannot be reached right now.',
        hint: 'Check your connection, then try again in a moment.',
        retryable: true,
      };
    case 'timeout':
      return {
        title: 'The answer took too long.',
        hint: 'Try again; shorter questions are answered faster.',
        retryable: true,
      };
    case 'invalid_request':
    case 'not_found':
    case 'internal':
      return {
        title: 'Something went wrong on the site’s side.',
        hint: 'Try again in a moment.',
        retryable: true,
      };
    default: {
      const unknown: never = code;
      return unknown;
    }
  }
}
